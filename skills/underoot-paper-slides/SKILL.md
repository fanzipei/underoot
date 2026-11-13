---
name: underoot-paper-slides
description: Create and iteratively refine a self-contained research talk from a LaTeX paper, prioritizing core figures and result tables, consistent typography, deliberate whitespace and source-grounded editable vector diagrams. Use for slides, not single-sheet posters.
---

# Paper → research talk

Use one-click generation in underoot; keep the internal outline for provenance, not as a mandatory form. Continue through chat beside the PDF. Respect existing AI consent/settings, disclose the whole-paper call budget and retain the original paper. User instructions supersede older outline-confirmation workflows.

Before choosing a composition, read [the inspected conference examples](references/conference-examples.md). Learn hierarchy, evidence and rhythm; do not copy a paper's claims, logos or identity. A talk must make sense without the paper open. Never leave manuscript Figure/Section labels in public copy.

Build a claim-to-evidence inventory across the complete source: main architecture/method diagram, primary comparison tables, quantitative plots, ablations and limitations. Prefer original core visuals over decorative images. Each selected visual must have an appropriate local claim and condition, not merely share a large transport chunk. Select explicit source paths/table IDs when composing. Keep skipped evidence and reasons in the private notes. The default talk is 15–20 pages including the cover (target 18). Select representative comparisons and, for grouped benchmarks, one consistent primary metric across settings. Keep complete values in private project notes/archive; append a full table supplement only when explicitly requested. Preserve baselines, units and uncertainty.

Use concise topical frame titles on one line, usually 2–6 words. Move a longer claim into the first body line; keep the original title in notes. Figure/table captions are optional; use at most one short line, and put substantive explanations in body text. Keep the full paper title as cover subtitle when needed. Use one idea and usually 1–3 short points per slide. Prefer a mature theme's native typography, colors, spacing, lists and title page; underoot defaults to Metropolis. Do not override point sizes for titles, body, author, captions or tables. Use semantic roles such as the theme's caption font and `\small` for dense tables/diagrams. Keep the same roles throughout the deck. Split overloaded pages instead of changing font sizes. Whitespace is intentional. Inspect actual chart labels for legibility, since a theme cannot repair tiny labels inside a source image.

Figure/table pages should also carry one or two short source-grounded lines: a finding, comparison conclusion, or support for the work's innovation. Prefer explicit nearby source discussion over a generic chapter claim or a repeated caption. The host extracts sentences linked by the asset label and can compress them in the existing AI narrative call; preserve conditions and never infer trends from unseen pixels. Give each core figure enough space for labels to be readable. Square/portrait composites may use a large graphic beside a short finding; wide time-series grids should use the body width. Measure remaining height after text rather than imposing a fixed half-height graphic. Measure finding height at the native body font: widen the text column for longer notes and fall back to a full-width explanation when a narrow column would become too tall. Vertically align adjacent text/graphics around their centers; center sparse body groups within the frame, retaining footer clearance and calm whitespace. Do not bold an entire multi-line visual explanation. Place the short message naturally beside/below the visual using native theme text. If reliable evidence is absent, disclose that omission rather than manufacturing a conclusion. Existing blank evidence pages can be enriched through chat with `补充图表结论`; keep authored conclusions and all history.

Aim for an appropriate original image/table on each substantive page. For a method with no usable source figure, use a 2–4-node editable TikZ diagram only when its steps and arrows are supported by the source. Do not fabricate architecture, numbers or plots to meet a visual quota. If no truthful visual is available, keep a concise text page and report that limitation.

For related work, prefer a source-supported comparison table and concise MLA/APA/ACM reference text from the project bibliography; never invent missing authors, years or papers.

Perform five distinct reviews, recording an observed problem, revision and result for each:

1. Compare the full-source evidence inventory to the selected figures/tables; recover missing main results.
2. Read slide titles as a spoken argument; separate question, mechanism, experiment and boundary.
3. Match every visual to its local claim; verify all table values and diagram arrows against source.
4. Check repeated font tiers and restrained density across the deck; leave calm whitespace, remove redundant prose and split overloaded pages.
5. Compile the actual output, render every page, inspect representative method/result/table pages and compare them to the references. Correct failures and disclose remaining semantic/visual gaps. Automated bounds checks alone do not establish scientific or visual quality.

Standalone, from this skill directory:

```bash
node scripts/generate.mjs --root <paper> --main main.tex --style metropolis --out <new-directory> --outline <reviewed-outline.json> --compile --audit --render
```

`--outline` is optional; without it the builder is explicitly a local structured draft. The package includes its own copy of the shared source-safe planner, table parser, renderer and audit scripts. Source notes contain private manuscript text: do not publish them. In-app chat edits only the requested block, retains unrelated TeX, uses bounded source context and supports undo through retained history; do not regenerate the whole project to revise one slide.

A finished artifact needs an authored, source-grounded outline (written by the agent or the configured consented model). Local extraction is for an explicitly labelled draft/diagnostic, not a substitute for editorial judgment. Record five review findings in the output ledger; repeated reviews are not model training. When this tool-maintenance task authorizes it, turn reproducible failures into regression fixtures rather than claiming unmeasured “self-evolution”.
