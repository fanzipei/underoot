---
name: underoot-paper-publishing
description: Turn a LaTeX paper project into source-grounded research slides or a single-sheet academic poster through five editorial and layout reviews. Use for narrative rewriting, figure/equation placement, long-paper chunking, confirmed template selection, and real PDF quality checks; not just applying a theme to extracted paragraphs.
---

# Paper → research talk / poster

Produce a research communication artifact with a clear argument, visible evidence and readable layout. A copied paragraph inside a Beamer theme is only a draft. Read [the editorial rubric](references/editorial-rubric.md) before composing or reviewing content.

For outline approval, continued conversational editing, and real conference design examples, read [the conference casebook](references/conference-casebook.md). In the app, first create and edit a persistent outline; generate only after the author confirms the saved outline. Once generated, continue on the same project using reviewed, source-grounded block edits. Preserve unrelated TeX and manual changes; never resolve an editing conflict by silently rebuilding the project.

Find the paper's real entry point, included sources, bibliography and assets. Keep the original project intact and create a separate output directory/project. In underoot prefer **更多 → 生成 LaTeX Slides / 学术 Poster**: preview the whole-paper split plan, confirm the style/size/length, and choose AI narrative rewriting or the clearly labelled local structured draft. Respect the user's existing style choice. Outside the UI, confirm meaningful unresolved audience, duration/size and style choices together; do not repeatedly ask for choices already supplied.

Built-in choices: Slides `academic`, `minimal`, `contrast`, `sidebar`, `conference`, `clean`, `classic-talk`, `large-title`, in 16:9 or 4:3. Posters `classic`, `modern`, `compact`, `bold`, `gallery`, `editorial`, `dark`, `blueprint`, A0 portrait/landscape, 2/3 columns. PDF-imported personal templates provide approximate visual style, not recovered TeX or permission to copy logos. Check contrast and hierarchy after applying a style.

## Inventory and long papers

```bash
node scripts/chunk-paper.mjs --root <paper> --main main.tex --out plan.json
```

Commands are relative to this skill directory. The helper recursively expands project-local inputs, checks cycles/traversal and splits the entire source into transport blocks ≤16,000 characters (up to 4 million expanded characters). Read and account for every chunk, especially late results and limitations. Keep chunk IDs and source locations in notes; never fit a context window by keeping only the beginning. `plan.json` contains manuscript text: keep it private.

For model-assisted work, summarize each block with exact findings, conditions, uncertainties and citations; combine groups of at most eight recursively. Separate evidence summaries from presentation writing. The host requests explicit consent to its displayed call budget; do not obtain keys, retry paid calls or add undisclosed model calls. Do the five reviews below with the available reasoning/tools; five reviews do not require five extra API calls.

## Five rounds — generate, inspect, revise

Record a finding, concrete revision and result for each round; do not manufacture five “passed” labels from one inspection.

1. **Evidence and scope.** Identify the research question, concrete gap, method, strongest measured results, baselines/units/conditions, limitations, figures, tables and useful formulas. Verify them against source. Distinguish unsupported claims from missing evidence; never fill gaps with invented experiments/references.
2. **Narrative.** The poster/deck is self-contained: its audience has no paper open. State methods and findings directly, never copy “Figure~[fig:framework] summarizes …”, paper section references or pointers to omitted figures. Use unnumbered descriptive captions for displayed images; keep manuscript labels only in private source notes. The shared copy guard removes navigation-only sentences, preserving their source notes and reporting the omission; review the outline for missing substance rather than inventing a replacement. Write an audience-appropriate argument: why the problem matters → what is missing → what changes → evidence → boundary → take-home message. Rewrite into short, spoken-language points and grounded claim/question titles. One slide communicates one idea; a poster has a top-level message and a few blocks. Give methods and limitations visible space. Put secondary details in source-linked speaker notes, not silently in the trash.
3. **Visual evidence.** Place each chosen figure/table next to the claim it supports. Preserve its caption, units, baseline and uncertainty; do not infer image content from a filename. Preserve portable source formulas as math, not mangled plain text. Keep unsupported macros/table structures in source notes and explicitly flag needed adaptation. Prefer a source-derived schematic/annotated result over decorative graphics; do not fabricate plots.
4. **Format and layout.** Keep complete author/institution declarations and their indices; center the author/institution group on the full canvas, independently of side logos/QR. Confirm uploaded or existing official logos rather than inventing/downloading an institutional mark. Reserve a project-code area; the app encodes a supplied HTTPS URL locally. Use generous panel padding, consistent heading rules, and body-sized list indents.  Budget words, lines and visual area before rendering. Slides: usually ≤3 short bullets, roughly 40 words, readable body type; separate method, result and detail frames when necessary. Posters: balanced *contiguous* columns preserving reading order, prominent results, hierarchy, legible body/captions, exactly one sheet. Shorten content or change layout before shrinking fonts. Preserve full titles/captions in notes when a shorter display form is needed.
5. **Compile, look, correct.** Use actual box-height measurements, not word count alone: try balanced columns, readable typography, larger figures and a bottom take-home panel where appropriate. For posters, align panel borders to fill the body area and distribute remaining space inside paragraphs/lists/visual groups; keep headings anchored. Record natural-content occupancy separately from border coverage. Keep the best valid candidate and rebuild its PDF if a later trial fails.  Compile the actual generated entry point, audit the resulting PDF and render pages. Inspect every page at a representative viewing size, including the final slide, figure-heavy frames and all poster columns. Check missing glyphs, overflows, crop, density, order, title/footer collisions, contrast, scientific consistency and takeaway. Revise and recompile failures. Report unresolved issues and checks not run; compilation alone is not visual or scientific approval.

## Standalone builder and real PDF checks

Use the shared planner/renderer without a database or model dependency:

```bash
node scripts/build-publication.mjs --root <paper> --main main.tex --kind slides --style minimal --count 12 --out <new-output>
```

This default is explicitly a **local structured draft**. For the rewritten narrative, first create a reviewed `outline.json`: `{"sections":[{"title":"grounded claim","takeaway":"one short message","bullets":["evidence with condition"],"sourceIds":["c0001"]}]}`. Map all source chunk IDs to appropriate topics; this mapping proves provenance, not semantic completeness. Run the builder with `--outline outline.json`. Review `publishing-plan.json` and `speaker-notes.md`; all unshown detail and warnings remain available.

Add `--compile --audit --render` when XeLaTeX and Poppler are installed (`--engine <path>` selects XeLaTeX). The output directory must be new/empty; use another directory for the next revision. The builder copies referenced assets, never edits the paper, and writes PDF audit results plus page previews. Alternatively:

```bash
python scripts/audit-publication.py --pdf <artifact.pdf> --kind poster --log <artifact.log> --out pdf-audit.json --render-dir previews
```

The audit measures actual pages, text bounds and TeX overflow; it does not claim to have looked at the rendered images. View the previews yourself. In underoot, the backend performs native compile/bounds checks when available and records when they are unavailable; browser WASM XeLaTeX is an alternative compiler, followed by the same exported-PDF checks.

Deliver the editable TeX/assets, PDF, source-linked notes, five-round findings and remaining caveats. State which semantic, compilation and visual checks actually ran. On cancellation, lost access, model error or compilation failure, retain the original and the reviewable draft; stop with the concrete issue instead of presenting it as finished.


## Underoot 0.9 layout workflow

The app runs bounded compile/measure trials and panel-alignment verification (up to eight recorded rounds, with additional verification when restoring a rejected trial). This is local deterministic layout work, with no extra model calls. Sparse source content may still require a source-grounded rewrite; never pad a poster with invented claims. Retain readable sizes and consistent hierarchy instead of merely filling a rectangle.

Read author metadata from the complete title block, including ACM declarations after `\begin{document}`, ICML author lists, IEEE blocks and inline NeurIPS affiliations. Auto-populate all source-backed names and affiliation indices; ask only for genuinely missing information. Before generation, allow the author to review the extracted identity panel, select/upload up to six PNG/JPEG/PDF institution marks, and optionally supply a project HTTPS URL or leave the QR area reserved. Authors are centered at 44 pt and institutions at 34 pt on A0 by default; long lists use bounded smaller variants. A dark template preserves contrast and QR quiet zones. At the readable 32 pt lower bound, reduce excessive leading to 37 pt and remeasure before rejecting a dense poster; never publish a known failed compilation or multi-sheet poster as a completed output. The host selects the closest failing trial by measured overflow rather than retaining the first failure on an equal issue count.

For existing v0.8/v0.9 outline-backed outputs, use **保存署名并自动重排当前项目**. The host stages a snapshot, checks the main-file hash again before applying, preserves the project ID/history, and writes a new reflow report. If manual TeX differs from the generated baseline or fitting fails, retain the current project and explain the conflict. Older outputs without persistent outlines remain manually editable.

Shared helpers `fit-layout.mjs` and `compile-measured.mjs` also drive the standalone builder. The builder saves `layout-iterations.json`; QR generation and logo-upload UI are app features. Standalone runs reserve the QR area; use the app for QR/logo setup or manually supply and verify these assets in the TeX. Do not describe a placeholder as a working QR code.


Generated CTeX posters/slides require a Unicode font engine. Underoot latexmk detects CTeX/fontspec in the main preamble and uses XeLaTeX; explicit pdfLaTeX returns an actionable incompatibility message. Check the actual project compiler as well as the fitting compiler, and reproduce the reported project in an isolated copy. Preserve any existing package-option repair preamble when repairing an approved output; reject unrelated manual differences and retain before/after history.
