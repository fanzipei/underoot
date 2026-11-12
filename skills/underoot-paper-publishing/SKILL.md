---
name: underoot-paper-publishing
description: Split long underoot LaTeX papers into traceable chunks and produce slides or academic posters with confirmed style choices. Use for paper-to-slides/poster conversion, especially manuscripts exceeding model context limits.
---

# underoot paper publishing

Use the same planner as the underoot publishing extension:

```bash
node skills/underoot-paper-publishing/scripts/chunk-paper.mjs --root <paper-directory> --main main.tex --out plan.json
```

For an installed skill, the command is relative to this skill's directory: `scripts/chunk-paper.mjs`. This helper has no database or model dependency. It recursively expands project-local inputs, detects cycles, and splits all expanded source by sections, paragraphs and lines into blocks of at most 16,000 characters. Oversized blocks continue in another chunk; they are transport fragments, not separately compilable TeX. `from/to` ranges and the digest allow exact coverage checks. It never edits the paper. Protect `plan.json` as manuscript content; it contains source text.

In underoot, prefer **更多 → 生成 LaTeX Slides / 生成学术 Poster**. The UI shows the split plan and asks the author to choose and confirm style, size/orientation, and density before starting. If operating outside that UI, present the same concrete choices and estimated model-call count before generation. A prior style choice remains valid unless the author changes it; do not repeatedly ask.

- Slides: academic (Madrid), minimal, contrast, sidebar (Berkeley), conference (Copenhagen), clean (Boadilla), classic-talk (Warsaw), or large-title (Pittsburgh); 16:9 or 4:3; target content-frame count.
- Poster: classic, modern, compact, bold, gallery, editorial, dark, or blueprint; A0 portrait or landscape; two or three columns and target block count.
- Personal templates may be imported from a reference PDF in the host template library or registered by a plugin. PDF extraction is local Poppler analysis of at most the first three pages, not a model call or recovery of original LaTeX. Preview the approximate palette, typography and layout, then let the author confirm before saving. Never copy source logos/images automatically or execute macros from a template JSON.
- Default to local extraction without sending source to a model. AI mode uses the configured host service only after explicit consent to the plan's maximum number of calls. Do not obtain or print keys.

Process **every** chunk, including late sections and limitations. In AI mode, summarize each chunk to bounded, source-grounded JSON; recursively combine batches of at most eight summaries, then form the final narrative. Keep chunk IDs through each stage, and use the manifest to check coverage. Never pass only the beginning of a long paper, remove scientific sections to fit a context window, or invent figures, references, numerical results or conclusions. Local extraction is an editable excerpt, not a validated academic abstract.

Render the confirmed style using deterministic LaTeX templates. Generate a separate derived project from the immutable source snapshot, carrying original assets and a publishing report with chunk coverage. Keep the original paper and its branches intact. Check compilation and inspect density/overflow; shorten presentation summaries or increase pages/columns when needed, while retaining all chunk notes. Formulae, complex macros and citation formatting may need author review.

On cancellation, revoked access, model error or timeout, stop the job and retain the original. Do not silently switch AI mode, style, or retry paid calls. Reopen the UI to inspect an active job; a service restart interrupts in-memory jobs and requires a new explicit start.
