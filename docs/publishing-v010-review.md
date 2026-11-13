# Paper publishing 0.10 review

Reviewed on 2026-11-13. These are editorial, implementation and PDF checks, not model training. Private manuscript text, author details and experimental values are excluded from this repository.

## Real references

The inspected [ICML 2025 Emergent Misalignment talk, page 13](https://icml.cc/media/icml-2025/Slides/47209_bYNS7l9.pdf) gives paired plots most of the page and leaves deliberate whitespace. [ICLR 2025 Brain-tuning, page 4](https://iclr.cc/media/iclr-2025/Slides/30063.pdf) uses an architecture diagram and a short explanation. These support evidence-led slides, not occupancy targets.

The single-sheet [ICLR 2025 SID poster](https://iclr.cc/media/iclr-2025/Slides/28166.pdf) combines institutional identity, method graphics and original experimental tables. The [ICLR 2025 I-Con poster](https://iclr.cc/media/iclr-2025/Slides/29352.pdf) gives different amounts of space to its main idea, architecture and quantitative results, with a separate QR. Their composition is a reference, not a claim that a regular column template matches a bespoke conference design.

## Five review rounds

1. **Evidence inventory.** The previous narrow table parser missed wide primary and transfer comparisons; repeated source inclusions duplicated evidence. Added bounded grouped-header parsing, literal macro normalization, exact evidence deduplication and identifier-preserving table panels. Every numeric cell survives in the slide supplement. Unknown value macros are refused rather than becoming empty cells.
2. **Narrative and independence.** Transport chunks incorrectly drove local image placement and some pages retained manuscript pointers. Added semantic role/affinity placement, source-caption titles for figure-only slides and independent display copy. Source notes retain original wording, identifiers and omitted details. Local drafts put mechanisms before results and conclusions last.
3. **Scientific comparisons.** Truncating tables could omit the proposed method or show only in-domain references on a transfer page. Main summaries retain the proposed method, source-reported strongest baselines where metric direction is explicit, off-diagonal transfer examples and a source-provided average. No averages or results are invented. Summaries are labelled selected comparisons; complete slide appendix panels preserve the original table.
4. **Typography and composition.** Removed slide font enlargement driven by empty space. Defaults are title 22 pt, body 16 pt, tables/diagrams 12 pt, captions 10 pt; overload uses a deck-wide 14–16 pt body fallback or splits pages. Model instructions request short single-idea points, usually 8–18 words, preserving conditions and uncertainty. Core images get dedicated pages. Posters separately retain large physical print text, measured columns, centered identity, optional supplied logos/QR and aligned panel borders. Theme-specific frame padding is measured and corrected before final strict checks.
5. **Interaction and rendered checks.** Removed mandatory outline/style forms. One click creates the internal source-linked draft and output; plain chat selects and revises a block, compiles it and supports local undo. Existing project/history/manual-edit conflict guards remain. Added separate self-contained Slides and Poster skills. Verified the one-click → PDF → chat → scoped vector-diagram edit flow in an isolated browser test using a local mock model.

## Validation and limits

- Pure checks: 38 publishing, 33 editorial, 15 fit, 36 standalone-copy and 22 evidence assertions passed.
- Native layout regression: four actual XeLaTeX/PDF cases passed, covering two slide styles and two poster styles. Slides preserve whitespace; posters have aligned panel borders.
- Publishing studio integration: 110 assertions passed, including one-click jobs, source preservation, chat edits, undo, legacy reflow and manual-edit conflicts.
- Publishing integration: 113 assertions passed, including native compilation across all sixteen built-in slide/poster styles. Dependency audit reported zero vulnerabilities.
- A private long-paper diagnostic compiled to a 53-page slide draft, including detailed comparison supplements, and a single-sheet poster. Both passed PDF bounds/overflow checks. Representative small-font figure pages and the whole poster were rendered and inspected; earlier full-deck contact sheets were also inspected. A local extraction draft remains more verbose than an authored conference talk.

No paid model/provider evaluation was performed: integration tests used a local mock; the private manuscript CLI used its explicitly labelled local structured draft mode. Short-copy prompts do not guarantee good scientific summarization. Unsupported mathematical/configuration tables and fine raster chart labels still require review. Figure captions and source summaries do not replace inspecting the actual visual. Logo assets and project URLs must come from the user/source; missing identity assets are never fabricated. Old generated projects are preserved during deployment; chat reflow upgrades them when requested.
