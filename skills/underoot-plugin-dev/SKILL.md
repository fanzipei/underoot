---
name: underoot-plugin-dev
description: Create, modify, package, or validate underoot Extension API v1 plugins, including AI research tools and ZIP-installable sandbox interfaces. Use for underoot plugin development, not for installing unrelated Codex plugins.
---

# underoot plugin development

Build a portable ZIP plugin for the user's research workflow. Read [the API contract](references/plugin-api.md) before choosing capabilities. Use [the starter](assets/starter/) for a new plugin; adapt its ID, commands, UI, and permissions to the requested feature.

Find the underoot repository from the active workspace (`package.json` has `name: underoot`). Its `examples/plugins/` contains working offline and model-assisted examples; `extensions/plugin.schema.json` and `server/extension-packages.js` define the manifest and authoritative packaging checks.

Keep these platform boundaries intact:

- Third-party plugins are HTML/JS/CSS running in an opaque-origin iframe. Use `/extensions/sdk.js` and `window.underoot`; do not rely on Node, parent DOM access, cookies, localStorage, CDNs, or direct network requests.
- Declare only the capabilities the feature uses. IDs use `publisher.name`, command IDs start with the full plugin ID, and `underoot.*` is reserved for bundled extensions. Use `apiVersion: 1` and a new semantic version when updating an installed ZIP.
- Use the host's model service through `underoot.complete`. Do not embed API keys or create a competing credential UI. The host prompts the author before each model invocation.
- Propose exact, previewable edits with `underoot.propose`; the author accepts them in the host. Do not claim an advisory suggestion or ungrounded replacement has already changed the manuscript. Preserve LaTeX, citations, numerical claims, and source paths; avoid invented references.
- For explicit document editing tools, declare `documents.read` / `documents.write`; host confirmation and hash checks are required for every save. Use `documents.convert` for local Pandoc conversion and save results to a new file. A conversion is potentially lossy; never overwrite the source automatically. See the bundled `underoot.markdown` plugin and its portable `research.markdown` ZIP example.
- Store per-user plugin preferences through `underoot.storage`. Package all UI assets locally and keep secrets, `.env`, `node_modules`, and symlinks out of the ZIP.

Validate a publishing directory with `node scripts/pack-extension.mjs <directory> --check`, then build with `--out <path.zip>`. Run the produced ZIP through the same server validator used by installation. If the repository is unavailable, use the reference manifest contract and report that server validation remains unverified.

Test observable behavior in a disposable underoot instance: command contribution, sandbox startup, one real SDK operation, permission denial, and suggested changes remaining unapplied until the author accepts them. Use a mock model for protocol tests unless real API use is authorized. Do not install test plugins into a live shared instance merely to validate packaging.

Deliver the source directory, installable ZIP, declared permissions, and test results. Point to the host's **插件中心 → 检查清单和权限 → 确认安装** flow. Creating a plugin does not itself authorize publishing it to GitHub, installing it for other users, or transmitting manuscripts to a model service.
