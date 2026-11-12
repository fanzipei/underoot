---
name: underoot-paper-publishing
description: Turn a LaTeX paper project into source-grounded research slides or a single-sheet academic poster through five editorial and layout reviews. Use for narrative rewriting, figure/equation placement, long-paper chunking, confirmed template selection, and real PDF quality checks; not just applying a theme to extracted paragraphs.
---

# Paper → research talk / poster

Produce a research communication artifact with a clear argument, visible evidence and readable layout. A copied paragraph inside a Beamer theme is only a draft. Read [the editorial rubric](references/editorial-rubric.md) before composing or reviewing content.

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
2. **Narrative.** Write an audience-appropriate argument: why the problem matters → what is missing → what changes → evidence → boundary → take-home message. Rewrite into short, spoken-language points and grounded claim/question titles. One slide communicates one idea; a poster has a top-level message and a few blocks. Give methods and limitations visible space. Put secondary details in source-linked speaker notes, not silently in the trash.
3. **Visual evidence.** Place each chosen figure/table next to the claim it supports. Preserve its caption, units, baseline and uncertainty; do not infer image content from a filename. Preserve portable source formulas as math, not mangled plain text. Keep unsupported macros/table structures in source notes and explicitly flag needed adaptation. Prefer a source-derived schematic/annotated result over decorative graphics; do not fabricate plots.
4. **Format and layout.** Budget words, lines and visual area before rendering. Slides: usually ≤3 short bullets, roughly 40 words, readable body type; separate method, result and detail frames when necessary. Posters: balanced *contiguous* columns preserving reading order, prominent results, hierarchy, legible body/captions, exactly one sheet. Shorten content or change layout before shrinking fonts. Preserve full titles/captions in notes when a shorter display form is needed.
5. **Compile, look, correct.** Compile the actual generated entry point, audit the resulting PDF and render pages. Inspect every page at a representative viewing size, including the final slide, figure-heavy frames and all poster columns. Check missing glyphs, overflows, crop, density, order, title/footer collisions, contrast, scientific consistency and takeaway. Revise and recompile failures. Report unresolved issues and checks not run; compilation alone is not visual or scientific approval.

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
