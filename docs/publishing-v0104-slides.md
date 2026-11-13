# Slides composition review — v0.10.4

This release changes slide composition, not the source paper. Default target: 18 pages including the cover, normally 15–20; shorter papers need not be padded. Poster fitting stays independent.

## Five review passes

1. **Evidence and length.** The existing KDD example had 59 PDF pages because complete table panels became a supplement. Select core figures, one representative page per comparison and at most four table pages. Retain omitted pages and original values in the private editorial archive. The guarded compaction preview has 17 pages, including its cover.
2. **Headings and copy.** Long sentence headings and generic “Source visual evidence” titles obscured the topic. Use short topical titles, measure their actual native-theme width and move long claims into body text. Keep the full paper title as a cover subtitle. Figure captions are optional; substantive explanations belong beside/below the image.
3. **Comparisons and references.** Related work now has a source-supported comparison table and a concise MLA-style bibliography entry. Wide benchmark tables show the same primary metric across settings, with original cells, baselines and uncertainty; do not compute new averages or omit source conditions.
4. **Graphic readability.** Square/moderate-aspect figures use a large image beside the finding; wide grids use the available body width and measured remaining height. Clear inherited auto-shrunk height bounds when compacting old decks. An overflowing page no longer shrinks every other figure. Keep mature Beamer theme font sizes; do not fill whitespace with larger fonts.
5. **Compile and inspect.** Compiled the actual saved KDD content into a 17-page preview, rendered every page and inspected three contact sheets, main result table, related-work citation, dose-response plot and unseen-location grid. No TeX errors, measured overflow or out-of-page text. Generic real-PDF cases cover Metropolis, default and Berkeley slides plus two poster styles. These checks establish layout bounds and inspected readability, not an independent scientific peer review.

## Compatibility and privacy

Freeze renderer v6 for canonical-document comparison; new output uses v7. Chat accepts `精简为18页` (15–20). Reflow checks the stored version and current TeX, snapshots the old layout and refuses to overwrite manual/concurrent edits. No paid model call was needed for this review: existing saved AI-authored content was reused. Private paper files, figures, author details and generated PDFs are excluded from Git.

Tests: publishing unit 39, editorial 33, fitting 16, standalone 36, evidence 46; integration and native-PDF results are recorded in the release verification logs.
