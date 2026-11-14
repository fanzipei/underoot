#!/usr/bin/env python3
"""underoot project Agent API client (Python 3 standard library only).

Set UNDEROOT_PROJECT_URL and UNDEROOT_API_TOKEN. Never commit a token.
Writes always require an explicit version hash or --create.
"""
import argparse
import base64
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("API redirected; refusing to forward the project token. Check UNDEROOT_PROJECT_URL.")


class Client:
    def __init__(self, timeout=90):
        self.url = os.environ.get("UNDEROOT_PROJECT_URL", "").rstrip("/")
        self.token = os.environ.get("UNDEROOT_API_TOKEN", "")
        parsed = urllib.parse.urlsplit(self.url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or "/api/agent/v1/projects/" not in parsed.path:
            raise ValueError("Set UNDEROOT_PROJECT_URL to the project API URL shown in underoot.")
        if not self.token.startswith("uro_agent_") or any(c.isspace() for c in self.token):
            raise ValueError("Set UNDEROOT_API_TOKEN to a project-scoped token.")
        self.timeout = timeout
        self.opener = urllib.request.build_opener(NoRedirect())

    def call(self, suffix="", body=None, raw=False):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(self.url + suffix, data=data, headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json", "User-Agent": "underoot-agent/1"})
        try:
            with self.opener.open(req, timeout=self.timeout) as response:
                payload = response.read()
                return payload if raw else json.loads(payload)
        except urllib.error.HTTPError as error:
            try:
                detail = json.loads(error.read()).get("error", "Request failed")
            except (ValueError, UnicodeDecodeError):
                detail = "Request failed"
            raise RuntimeError("HTTP %s: %s" % (error.code, detail)) from None

    def read(self, path):
        return self.call("/file?" + urllib.parse.urlencode({"path": path}))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--timeout", type=int, default=90)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("info")
    sub.add_parser("list")
    read = sub.add_parser("read")
    read.add_argument("path")
    read.add_argument("--out", help="Also save decoded content locally; stdout retains metadata only")
    write = sub.add_parser("write")
    write.add_argument("path")
    write.add_argument("--file", required=True, help="Local UTF-8 text or figure file")
    version = write.add_mutually_exclusive_group(required=True)
    version.add_argument("--hash", help="SHA-256 from a previous read/list")
    version.add_argument("--create", action="store_true", help="Create only; never overwrite an existing path")
    write.add_argument("--message", default="Update report from experiment")
    patch = sub.add_parser("patch")
    patch.add_argument("path")
    patch.add_argument("--before-file", required=True, help="Exact unique old text")
    patch.add_argument("--after-file", required=True, help="Replacement UTF-8 text")
    patch.add_argument("--hash", help="Optional additional expected version check")
    patch.add_argument("--message", default="Patch report from experiment")
    batch = sub.add_parser("batch")
    batch.add_argument("--file", required=True, help='JSON {"message":"...","files":[{"path":"...","content":"...","encoding":"utf8","hash":"..."}]}')
    compile_ = sub.add_parser("compile")
    compile_.add_argument("--engine", default="xelatex")
    compile_.add_argument("--main")
    pdf = sub.add_parser("pdf")
    pdf.add_argument("--file", help="Server PDF filename, default main output")
    pdf.add_argument("--out", required=True)
    args = parser.parse_args()
    client = Client(args.timeout)
    if args.command == "info":
        result = client.call()
    elif args.command == "list":
        result = client.call("/files")
    elif args.command == "read":
        result = client.read(args.path)
        if args.out:
            data = base64.b64decode(result["content"]) if result["encoding"] == "base64" else result["content"].encode("utf-8")
            pathlib.Path(args.out).write_bytes(data)
            del result["content"]
            result["localFile"] = args.out
    elif args.command == "write":
        data = pathlib.Path(args.file).read_bytes()
        binary = pathlib.PurePosixPath(args.path).suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".pdf", ".eps")
        content = base64.b64encode(data).decode("ascii") if binary else data.decode("utf-8")
        result = client.call("/changes", {"message": args.message, "files": [{"path": args.path, "content": content, "encoding": "base64" if binary else "utf8", "hash": None if args.create else args.hash}]})
    elif args.command == "patch":
        doc = client.read(args.path)
        if doc["encoding"] != "utf8":
            raise ValueError("patch only accepts UTF-8 text")
        if args.hash and args.hash != doc["hash"]:
            raise ValueError("File version changed; read and merge before retrying")
        before = pathlib.Path(args.before_file).read_text(encoding="utf-8")
        after = pathlib.Path(args.after_file).read_text(encoding="utf-8")
        if not before or doc["content"].count(before) != 1:
            raise ValueError("Old text must match exactly once; no file was changed")
        result = client.call("/changes", {"message": args.message, "files": [{"path": args.path, "content": doc["content"].replace(before, after, 1), "encoding": "utf8", "hash": doc["hash"]}]})
    elif args.command == "batch":
        result = client.call("/changes", json.loads(pathlib.Path(args.file).read_text(encoding="utf-8")))
    elif args.command == "compile":
        body = {"engine": args.engine}
        if args.main:
            body["mainFile"] = args.main
        result = client.call("/compile", body)
    else:
        suffix = "/pdf" + ("?" + urllib.parse.urlencode({"file": args.file}) if args.file else "")
        pathlib.Path(args.out).write_bytes(client.call(suffix, raw=True))
        result = {"localFile": args.out}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if args.command == "compile" and not result.get("ok") else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, OSError, KeyError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
