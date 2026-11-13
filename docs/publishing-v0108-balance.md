# Slides balance review — v0.10.8

The reported dose-response page used a 30% finding column, bolded the entire paragraph and aligned text at the top of a large plot. Frame bodies were top-aligned, with a conservative three-baseline height reserve. This left both a tall narrow paragraph and too much unused space near the bottom.

## Five review passes

1. **Hierarchy and line length.** Widen the normal finding column to 40%, keep a 4% gutter and a dominant image. Use the native regular body font for visual findings instead of bolding an entire paragraph. Scientific copy, table values and image assets remain unchanged.
2. **Vertical composition.** Center the image and explanation relative to each other. Center sparse body groups inside the Beamer frame rather than forcing them against its top. Preserve calm whitespace and the template's font sizes.
3. **Density adaptation.** Measure notes in their actual native font. Wider 44% or 48% text columns handle longer findings/points. Excessively tall notes use a full-width stacked composition. No silent truncation, new claims or font shrinking.
4. **Actual body height.** Expand the graphic height allowance while retaining footer clearance. An initial one-and-a-half-baseline reserve produced approximately 4-point overfull frame boxes in the real manuscript; a two-baseline reserve removed them. Fit and render all 18 KDD pages, including the reported dose-response page, framework, ablation, wide venue grids, numeric tables and text-only boundaries. Inspect three final contact sheets.
5. **Compatibility and regression.** Freeze renderer v7 and upgrade through renderer v8. Ignore only inert whitespace separators between marked frames during canonical reflow comparison, so prior chat deletion does not cause a false manual-edit conflict. Exact block text and all other TeX remain protected. Integration tests cover v7 upgrade and reflow after a chat deletion.

Verification: 143 studio integration checks; six actual PDF cases (three native slide themes, a dense-finding variant and two poster layouts). PDF checks measure finding-column width, one-line frame titles, evidence image size, sparse text vertical position, overflow and outside text. Publishing unit 39, editorial 33, fitting 16, standalone 36 and evidence 49 checks pass. The real KDD preview remains 18 pages with no TeX errors, measured overflow or out-of-page text. No paid model calls were needed; existing authored content was reused. Poster composition is unchanged.

Private manuscript files and generated figures/PDFs stay outside Git. Reflow snapshots the old version and refuses to overwrite substantive manual or concurrent edits.
