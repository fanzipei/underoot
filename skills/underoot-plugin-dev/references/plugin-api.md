# underoot Extension API v1

underoot is a locally deployable platform for vibe research, collaborative discussion and versioned manuscripts. Core owns authentication, project permissions, CRDT documents, comments, version history, credential storage and edit acceptance. Optional extensions contribute research tools. The bundled `underoot.assistant`, `underoot.discovery` and `underoot.publishing` extensions provide model review, cross-project discovery and paper-derived publishing tools, respectively. Their server code lives under `extensions/builtin/`; bundled activation modules register commands through the same contribution registry.

Third-party ZIPs use an isolated HTML iframe. They do not execute on the server and cannot register a privileged builtin handler. An administrator installs/enables/disables/uninstalls them for the local instance; each operation still checks the invoking user's project access.

## Package contract

The ZIP root contains `underoot-plugin.json` and its HTML entry. One enclosing top-level folder is also accepted. A minimal manifest:

```json
{
  "id": "my-lab.claim-checker",
  "name": "Claim checker",
  "version": "1.0.0",
  "apiVersion": 1,
  "runtime": "iframe",
  "entry": "index.html",
  "description": "Review the author's selected claim.",
  "author": "My Lab",
  "license": "MIT",
  "permissions": ["selection.read", "ai.invoke", "suggestions.propose"],
  "contributes": {
    "commands": [{
      "id": "my-lab.claim-checker.review",
      "title": "Check selected claim",
      "when": "editor"
    }]
  }
}
```

`id` matches `^[a-z][a-z0-9-]{1,39}\.[a-z][a-z0-9.-]{1,79}$`; `underoot.*` is reserved. `version` uses `major.minor.patch` with an optional prerelease suffix. `apiVersion` is integer 1. The command ID starts with the plugin ID and contains letters, digits, hyphens or dots; 1–12 unique commands are accepted. `when` is `editor`, `workspace`, or `all`. Workspace commands have no current project, so project-scoped SDK calls are unavailable there. The manifest `runtime` is `iframe`; third-party `handler` fields are rejected.

Limits: compressed ZIP ≤10 MB, at most 200 entries, individual file ≤2 MB, expanded total ≤15 MB. Allowed file types: `.html`, `.js`, `.mjs`, `.css`, `.json`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.md`, `.txt`, `.woff`, `.woff2`. Paths must be relative and ≤180 characters, without backslashes, drive letters, `..`, hidden segments, duplicate case-insensitive paths, or symbolic links. Bundle dependencies into the publishing directory; do not ship `node_modules`, credentials, source maps or executable server binaries.

Build and verify with:

```bash
node scripts/pack-extension.mjs examples/plugins/selection-notes --check
node scripts/pack-extension.mjs <publishing-directory> --out <plugin.zip>
```

The packer uses the installation validator, not a second approximation. Bump the version before updating an installed package. Administrator inspection reports the normalized manifest, permissions and package digest; installation requires explicit confirmation of that exact digest. Permission changes are reviewed again. The normal ZIP download can be shared with another underoot instance; each instance decides whether to install it.

## Runtime and lifecycle

The host loads the entry in a draggable/resizable, non-modal window with `sandbox="allow-scripts"`. It omits same-origin, top-navigation, popups, downloads and form capabilities. The plugin's CSP disables direct networking, nested frames, external assets, eval and object embedding. Communicate with the parent only through the SDK:

```html
<script src="/extensions/sdk.js"></script>
<script src="plugin.js"></script>
```

The SDK initializes automatically. `await underoot.ready` yields the host context; `underoot.context` contains `{apiVersion, command, project}`. `project` is `{id,name,role}` or null. Do not depend on URL fragment internals, raw postMessage formats or host DOM selectors; those are transport details, not developer APIs. Use `textContent` to render user/model text. Clearing the plugin window or navigating away disposes its bridge.

The bridge verifies the sending iframe and channel, fixes the plugin ID and current project, and forwards requests through authenticated host APIs. The server rechecks enabled state, declared capabilities, membership and role every time. Plugin code never receives the user's session cookie or model secret. The host retains control over project changes and acceptance.

Plugin source assets are served as installed application code, not private manuscript storage. Never put secrets or private datasets into the ZIP. The sandbox is a constrained web runtime, not a guarantee that arbitrary uploaded code is trustworthy; review the source and declared permissions before installation.

## SDK methods

All methods are asynchronous; failures reject with `Error.message`. At most three requests are handled concurrently per window. Calls need the permissions below:

| Method | Permission | Result / notes |
| --- | --- | --- |
| `getProject()` | `project.read` | `{id,name,mainFile,role,files:[{path,content}],truncated}`; current project's `.tex` / `.bib`, at most 100,000 characters |
| `getSelection()` | `selection.read` | `{path,from,to,text}`; current source selection, text capped at 20,000 characters; empty text if no selection |
| `getPdfSelection()` | `pdf.read` | `{page,rect,text,image}`; user must first circle a PDF area and hand it to the assistant; normalized rect and PNG data URL |
| `complete({instruction,input,images?})` | `ai.invoke` | `{text}`; prompts the author before each call; uses administrator-configured model, never exposes the key |
| `propose(suggestion)` | `suggestions.propose` | `{id,requiresReview:true}`; stores a proposal, does not mutate source |
| `getComments()` | `comments.read` | `{comments:[...]}` for the current project |
| `addComment({path,from,to,body})` | `comments.write` | `{comment}`; valid source range and nonempty body ≤8,000 characters |
| `storage.get(key)` | `storage` | JSON value or null; scoped to plugin and user |
| `storage.set(key,value)` | `storage` | `{ok:true}`; key ≤100 characters, JSON value ≤64,000 characters, ≤64 keys per plugin/user |
| `notify(message)` | none | Bounded host toast prefixed with the plugin's name |
| `documents.list()` | `documents.read` | `{files:[path]}`; Markdown / TeX files in the current project |
| `documents.read(path)` | `documents.read` | `{path,content,hash}`; at most 150 KB |
| `documents.write({path,content,hash})` | `documents.write` | Author confirmation for each save; owner/editor only; null hash creates a new file, an existing SHA-256 hash replaces only that exact version; snapshots and CRDT sync preserved |
| `documents.convert({from,content})` | `documents.convert` | `from` is `markdown` or `tex`; returns `{content,extension,warnings}` via sandboxed local Pandoc; does not save or overwrite anything |
| `templates.list()` | `publishing.templates.read` | Current user's personal Slides / Poster style tokens |
| `templates.register(template)` | `publishing.templates.write` | Host confirmation for each style registration; returns saved personal template, at most 40/user |
| `templates.extractPdf({kind,name})` | `publishing.templates.extract` | Host opens PDF picker and local analysis UI; returns confirmed style tokens only; no raw PDF, image, model call or manuscript access |

Templates contain safe fields: `kind` (`slides` / `poster`), `name`, `description`, hex `accent` / `background`, `font` (`sans` / `serif`), `header` (`plain` / `rule` / `band`), `density` (`comfortable` / `compact`), `ratio` (`169` / `43`), `orientation`, `columns` (2/3), `titleScale` (1.3–3.5). The host normalizes values and computes contrasting foreground. It does not accept arbitrary LaTeX, CSS, file paths or code. PDF extraction requires host Poppler and is an approximate visual template; original graphics, logos and macros are not recovered. `underoot.templates` must be enabled for registration/extraction. See `examples/plugins/template-pack`.

Read-only members cannot invoke models, add comments or propose edits; reviewers may propose and discuss but cannot apply changes. AI calls are limited to one per plugin/user per 10 seconds. `images` accepts at most two PNG/JPEG base64 data URLs, each ≤2.5 million characters, total request ≤3.2 million characters; the configured model must have vision enabled. Ordinary arguments are limited to 200,000 characters. Keep scientific prompts smaller and state uncertainty rather than fabricate a source.

`propose` accepts:

```js
const selection = await underoot.getSelection();
await underoot.propose({
  title: "Clarify the scope of this conclusion",
  detail: "The experiment supports the tested datasets; avoid implying universal validity.",
  category: "consistency",
  path: selection.path,
  from: selection.from,
  before: selection.text,
  after: null
});
```

`path` must refer to an existing `.tex` or `.bib` file. `before` must exactly match source at `from` (or occur uniquely) before a replacement is offered. `after` is a replacement string or null for advisory-only feedback. Allowed common categories: `language`, `writing`, `citation`, `figure`, `consistency`. The host records plugin attribution and the source hash; changed source prevents a stale patch from applying. The author reviews the before/after diff and explicitly accepts or rejects it. Acceptance is snapshot-protected. An advisory accepted without a replacement still requires manual work.

For model-backed analysis, request data only after a visible user action, call `complete`, parse/validate its output, and submit grounded proposals. Bibliographic suggestions should link to independently retrieved DOI metadata or be framed as search directions; a model-generated DOI is not verified evidence. Plugin-specific per-user settings should be migrated with a schema/version key when the plugin version changes.

## Installation and trust boundaries

Use the plugin center to upload the ZIP, inspect its manifest and permissions, and confirm installation. Administrators may disable bundled features without deleting project data. Third-party packages can be updated with a new version or uninstalled; uninstall removes their code and plugin settings while preserving existing manuscript suggestions and comments. Disabling a feature is enforced in its backend routes, not merely hidden in the UI.

The initial plugin ABI is a web SDK. VS Code extensions, Node/Python server plugins, arbitrary shell execution, npm installation inside the server, unrestricted network permissions, registries, signing and automatic updates are not supported in v1. Existing builtins are trusted repository code; uploaded packages cannot impersonate them. Use an isolated instance and synthetic manuscripts when testing a new plugin, including negative capability tests and stale-edit handling.

## Visual table editing example

`examples/plugins/tables` packages `research.tables`, the portable counterpart to the bundled `underoot.tables`. It uses only selection.read and documents.read/write. Shared source is `src/plugins/table-model.js` and `src/plugins/tables.js`, bundled by the normal build. Keep exact source ranges for cell-only patches; do not flatten macros, caption/label, spans or unrelated manuscript text. Style reconstruction is explicit and limited to supported structures; unsupported cross-row/nested/custom columns must fail without changing the source. Preserve document hashes, host save confirmation and history. Read fresh TeX when reopening or regaining focus with no draft; never silently replace a dirty draft. Preview math locally with trust disabled, and disclose required TeX packages rather than silently modifying the preamble.

The host table gutter can launch a selection with an optional `kind: "table"` result from `getSelection()`. Resolve its quoted text against the freshly read document and reject missing/ambiguous matches. Do not silently fall back to the first table. Gutter DOM belongs to trusted host code; this does not grant uploaded plugins access to the parent editor DOM or bypass document hash/save confirmation checks.
