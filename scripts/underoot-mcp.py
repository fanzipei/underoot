#!/usr/bin/env python3
"""Local stdio MCP bridge for underoot. Python 3 standard library only.

Project-scoped credentials come from the environment, never from tool arguments.
Local file access is limited to the explicit --root experiment directory.
"""
import argparse
import base64
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

VERSION = "2025-11-25"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Redirect refused; project credentials are never forwarded to another URL")


class Bridge:
    def __init__(self, root):
        self.root = pathlib.Path(root).expanduser().resolve(strict=True)
        if not self.root.is_dir():
            raise ValueError("--root must name an existing experiment directory")
        self.url = os.environ.get("UNDEROOT_PROJECT_URL", "").rstrip("/")
        parsed = urllib.parse.urlsplit(self.url)
        if parsed.scheme not in ("http", "https") or parsed.username or parsed.password or parsed.query or parsed.fragment or not re.fullmatch(r"/api/agent/v1/projects/[A-Za-z0-9-]+", parsed.path):
            raise ValueError("UNDEROOT_PROJECT_URL must be a project API URL")
        self.mcp = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path.replace("/api/agent/v1/", "/api/mcp/v1/"), "", ""))
        key = os.environ.get("UNDEROOT_TOKEN_ENV", "UNDEROOT_API_TOKEN")
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError("Invalid token environment variable name")
        self.token = os.environ.get(key, "")
        if not re.fullmatch(r"uro_agent_[A-Za-z0-9_-]{43}", self.token):
            raise ValueError("Set the project token environment variable before launching Codex")
        self.opener = urllib.request.build_opener(NoRedirect())
        self.serial = 0
        self.initialized = False

    def request(self, url, body=None):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {"Authorization": "Bearer " + self.token, "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": VERSION}
        try:
            with self.opener.open(urllib.request.Request(url, data=data, headers=headers), timeout=150) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            try:
                value = json.loads(error.read())
                detail = value.get("error", "Request failed")
                if isinstance(detail, dict):
                    detail = detail.get("message", "Request failed")
            except (ValueError, UnicodeError):
                detail = "Request failed"
            raise RuntimeError("HTTP %s: %s" % (error.code, detail)) from None

    def rpc(self, method, params=None):
        self.serial += 1
        response = self.request(self.mcp, {"jsonrpc": "2.0", "id": self.serial, "method": method, **({"params": params} if params is not None else {})})
        if "error" in response:
            raise RuntimeError(response["error"].get("message", "MCP request failed"))
        return response["result"]

    def local(self, name, exists=True):
        if not isinstance(name, str) or not name:
            raise ValueError("local_path is required")
        candidate = (self.root / name).resolve(strict=exists)
        try:
            candidate.relative_to(self.root)
        except ValueError:
            raise ValueError("Local file must stay within the configured experiment directory") from None
        return candidate

    def tools(self):
        tools = self.rpc("tools/list")["tools"]
        writable = any(t["name"] == "upload_figure" for t in tools)
        if writable:
            tools.append({"name": "upload_local_figure", "description": "Upload an existing local experiment figure within the configured root, without putting base64 in the model context. hash:null creates only; replacement needs the server file hash.", "inputSchema": {"type": "object", "properties": {"local_path": {"type": "string"}, "path": {"type": "string"}, "hash": {"type": ["string", "null"]}, "message": {"type": "string"}}, "required": ["local_path", "path", "hash"], "additionalProperties": False}, "annotations": {"readOnlyHint": False, "destructiveHint": True, "openWorldHint": False}})
        tools.append({"name": "download_project_file", "description": "Download a project file to a NEW file within the experiment root. Existing local files are never overwritten.", "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}, "local_path": {"type": "string"}}, "required": ["path", "local_path"], "additionalProperties": False}, "annotations": {"readOnlyHint": False, "destructiveHint": False, "openWorldHint": False}})
        return {"tools": tools}

    def call(self, name, args):
        if name == "upload_local_figure":
            if not any(t["name"] == "upload_figure" for t in self.rpc("tools/list")["tools"]):
                raise ValueError("The current token and member role do not permit figure uploads")
            file = self.local(args["local_path"])
            if not file.is_file() or file.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".pdf", ".eps", ".svg") or file.stat().st_size > 8 * 1024 * 1024:
                raise ValueError("Choose a figure file no larger than 8 MB")
            if "hash" not in args:
                raise ValueError("hash is required: use null to create, or the current server file hash")
            if pathlib.PurePosixPath(args["path"]).suffix.lower() != file.suffix.lower():
                raise ValueError("Local and remote figure extensions must match")
            raw = file.read_bytes()
            value = {"path": args["path"], "hash": args["hash"], "encoding": "utf8" if file.suffix.lower() == ".svg" else "base64", "content": raw.decode("utf-8") if file.suffix.lower() == ".svg" else base64.b64encode(raw).decode("ascii")}
            result = self.request(self.url + "/changes", {"message": args.get("message", "MCP upload local experiment figure"), "files": [value]})
            return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}], "structuredContent": result}
        if name == "download_project_file":
            target = self.local(args["local_path"], exists=False)
            if target.exists():
                raise ValueError("Local target exists; choose a new filename")
            doc = self.request(self.url + "/file?" + urllib.parse.urlencode({"path": args["path"]}))
            data = base64.b64decode(doc["content"], validate=True) if doc["encoding"] == "base64" else doc["content"].encode("utf-8")
            target.parent.mkdir(parents=True, exist_ok=True)
            self.local(str(target), exists=False)
            with target.open("xb") as output:
                output.write(data)
            result = {"path": args["path"], "localPath": str(target), "hash": doc["hash"], "size": len(data)}
            return {"content": [{"type": "text", "text": json.dumps(result)}], "structuredContent": result}
        return self.rpc("tools/call", {"name": name, "arguments": args})

    def serve(self):
        while True:
            line = sys.stdin.buffer.readline(20 * 1024 * 1024 + 1)
            if not line:
                return
            ident = None
            try:
                if len(line) > 20 * 1024 * 1024:
                    print(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "MCP input exceeds 20 MB"}}), flush=True)
                    return
                message = json.loads(line)
                if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
                    raise ValueError("Expected one JSON-RPC 2.0 message per line")
                ident = message.get("id")
                if ident is None:
                    continue
                method, params = message.get("method"), message.get("params", {})
                if not isinstance(params, dict):
                    raise ValueError("MCP params must be an object")
                if method == "initialize":
                    self.request(self.url)  # Validate credentials without revealing them.
                    self.rpc("initialize", {"protocolVersion": VERSION, "capabilities": {}, "clientInfo": {"name": "underoot-local-bridge", "version": "1.0.0"}})
                    self.initialized = True
                    result = {"protocolVersion": VERSION, "capabilities": {"tools": {}}, "serverInfo": {"name": "underoot-local-bridge", "version": "1.0.0"}, "instructions": "Project-scoped paper editing. Read hashes, preserve author changes, upload_local_figure from the experiment root, then patch and compile. Never blindly retry 409 conflicts."}
                elif method == "ping":
                    result = {}
                elif method == "tools/list":
                    if not self.initialized:
                        raise ValueError("Initialize the MCP connection first")
                    result = self.tools()
                elif method == "tools/call":
                    if not self.initialized:
                        raise ValueError("Initialize the MCP connection first")
                    try:
                        result = self.call(params["name"], params.get("arguments", {}))
                    except (ValueError, RuntimeError, OSError, KeyError, TypeError) as error:
                        result = {"isError": True, "content": [{"type": "text", "text": str(error)}]}
                elif method in ("resources/list", "resources/templates/list", "prompts/list"):
                    result = {"resources": []} if method == "resources/list" else {"resourceTemplates": []} if method == "resources/templates/list" else {"prompts": []}
                else:
                    print(json.dumps({"jsonrpc": "2.0", "id": ident, "error": {"code": -32601, "message": "Method not found"}}), flush=True)
                    continue
                print(json.dumps({"jsonrpc": "2.0", "id": ident, "result": result}, ensure_ascii=False), flush=True)
            except (ValueError, RuntimeError, OSError, KeyError, TypeError) as error:
                print(json.dumps({"jsonrpc": "2.0", "id": ident, "error": {"code": -32603, "message": str(error)}}), flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Explicit local experiment directory")
    try:
        Bridge(parser.parse_args().root).serve()
    except (ValueError, RuntimeError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
