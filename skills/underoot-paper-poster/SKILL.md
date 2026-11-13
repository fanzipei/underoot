---
name: underoot-paper-poster
description: Create and iteratively refine a single-sheet academic poster from a LaTeX paper, using a coherent canvas, core figures and experimental tables, complete author affiliations, readable panels and actual compile/render checks. Use for posters, not sequential slide decks.
---

# Paper → single-sheet research poster

Use one-click generation in underoot, then chat beside the PDF. Keep a source-linked internal outline without requiring a content-confirmation form. Preserve original projects and history, extract all authors/institutions from the complete title block and keep their indices. Never invent logos; use authorized assets. Reserve or locally generate a code/project QR when appropriate.

Read [the inspected conference posters](references/conference-examples.md) before composing. Learn the whole-canvas reading flow and evidence hierarchy. Do not transfer a slide deck's whitespace or font policy blindly to a poster. Do not copy other researchers' claims, branding or images.

Inventory the full source and select the core architecture figure, strongest quantitative plots and primary result table(s). Use the source's actual table values and uncertainty. Give those assets the prime canvas area; background prose should not crowd them out. Associate visuals by explicit source IDs/path and semantic relevance, not the first shared chunk. Record omitted/unportable assets and why. Complex table structures need explicit adaptation, not flattened tokens or guessed numbers. Repeat identifiers on cropped metric panels and do not conceal unshown columns.

The poster is independent of the paper: write direct supported messages and descriptive unnumbered captions, never orphan Figure/Section pointers. Put conditions next to results. Use a clear overview → mechanism → evidence → limits/take-home reading flow, balanced contiguous columns and coherent panel padding. Center the complete author/unit group on the full canvas independently of side logos/QR.

Use measured panel heights to fit exactly one page. Keep readable A0 body type (at least 32 pt in the host); tighten excessive leading before reducing size. Let panel borders align to the canvas and distribute spare space naturally within paragraphs, lists and visual groups. Report natural-content occupancy separately from border coverage. Never invent filler text to make a panel tall, or declare a two-page/failed PDF a finished poster.

Five reviews must have distinct recorded findings and revisions:

1. Compare source inventory and selected assets; recover the primary experimental evidence and complete identity.
2. Rewrite the 30-second overview and longer reading route; remove paper-navigation prose.
3. Pair each figure/table with the correct nearby claim and condition; preserve numeric and diagram semantics.
4. Compile/measure, balance columns, adjust figures and typography, then align panels; retain the best valid trial rather than the first failing trial.
5. Inspect the rendered whole sheet and zoom into all result tables, captions and identity. Compare to the references, repair errors and record unresolved differences. Mechanical audits do not certify scientific correctness or polished design.

Standalone, from this skill directory:

```bash
node scripts/generate.mjs --root <paper> --main main.tex --style gallery --orientation landscape --columns 3 --count 6 --out <new-directory> --outline <reviewed-outline.json> --compile --audit --render
```

Without `--outline`, the output is a labelled local structured draft. The package includes the shared safe planner, table parser, renderer and PDF audit helpers. Keep private source notes private. In-app chat changes only the requested content, identity or layout, retains project IDs and before/after history, and protects unrelated manual edits. Do not ask users to re-enter author information already present in source.

A finished artifact needs an authored, source-grounded outline (written by the agent or the configured consented model). Local extraction is for an explicitly labelled draft/diagnostic, not a substitute for editorial judgment. Record five review findings in the output ledger; repeated reviews are not model training. When this tool-maintenance task authorizes it, turn reproducible failures into regression fixtures rather than claiming unmeasured “self-evolution”.
