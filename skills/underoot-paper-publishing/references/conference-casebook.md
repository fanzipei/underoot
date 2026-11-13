# Real conference references — inspected 2026-11-12

These are official-hosted research artifacts, not stock templates. Observations below are our design analysis, not claims that every conference uses this style. Do not copy university/conference logos, figures or research claims into another author's output.

| Artifact | What we inspected | Transferable design decision |
|---|---|---|
| [ICML 2025 UNIFEWS slides](https://icml.cc/media/icml-2025/Slides/45740.pdf) | Evaluation slide, page 8: two short claims above three aligned evidence plots, consistent axes/labels and ample whitespace. | Put the result plot in the main visual area. Keep the claim and experimental condition beside it; prefer a visual-dominant layout over half a page of text. |
| [ICLR 2025 SID poster](https://iclr.cc/media/iclr-2025/Slides/28166.pdf) | The official `/Slides/` URL is actually a **single-sheet poster**: title/affiliations, three-column reading flow, method diagrams, qualitative examples, numeric tables and results plots. | File path does not establish artifact type. Preserve method and evidence as distinct blocks. Keep captions, comparison conditions and units near their visual. The dense abstract is not a target to imitate blindly. |
| [NeurIPS 2025 Paper2Poster slides](https://neurips.cc/media/neurips-2025/Slides/121461.pdf) | Page 4: pipeline stages followed by a substantial process diagram; keywords carry the hierarchy. | Plan text–visual pairs before rendering. Separate semantic review from layout/compile checks. A working PDF is not proof that the poster communicates the paper. |
| [ICLR-hosted ASTrA slides](https://iclr.cc/media/iclr-2025/Slides/29209.pdf) | Page 6: a question title, three visual gap groups and one synthesized explanation. The slide contains mixed year labeling, so do not infer its year solely from the URL. | A comparison or gap page should group related evidence, not repeat the same bullet template. Use a statement layout for a supported take-home message. |

[Paper2Poster author project](https://paper2poster.github.io/) provides author-designed versus generated examples and describes structured assets, semantic pairing, layout and rendered feedback. Its own generated teaser is not a human-designed poster reference. Our implementation adopts these design principles; it does not implement or claim their full VLM feedback system or benchmark scores.

Physical sizes are venue-specific. [ICML 2025 instructions](https://icml.cc/Conferences/2025/PosterInstructions) suggest several landscape sizes for the main conference and impose a different portrait limit for workshops. Underoot's A0 options are general presets, **not a guarantee of venue compliance**. Check the current event's instructions before printing.

## One-click generation and continued chat (updated 2026-11-13)

The current user preference supersedes the older explicit-outline-confirmation workbench. The menu starts generation in one action; the host retains a persistent internal outline, source snapshot, evidence inventory and declared model-call budget. Continue editing through chat, with block-level CAS, history and undo. Do not silently regenerate a whole project to adjust one page. A failed native check retains the internal draft so chat can resolve it without exposing a form. Older generated layouts can be upgraded with “重新排版”, subject to manual-edit protection.

Slides and posters now have separate skills and visual criteria. See the sibling skill references for newly inspected ICML/ICLR examples and the repo iteration ledger for actual findings. The older examples above remain useful evidence, not a requirement to copy conference logos, density or style.
