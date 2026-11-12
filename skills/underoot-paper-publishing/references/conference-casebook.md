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

## Content confirmation and continued editing

1. Summarize the entire source once, retain provenance and private source notes, and produce a persistent editable outline. Do not create the derived project yet.
2. Let the author edit claim titles, takeaways, evidence, asset selection, order and per-block layout. Preview the hierarchy. Label a schematic preview distinctly from the actual compiled PDF.
3. Generate from the saved, explicitly confirmed outline, not from a second unconstrained model rewrite. Keep the original source snapshot.
4. Continue in the existing generated project. Send only the selected block, bounded source evidence and recent discussion to the model. Show the proposal before applying it; accept/reject is an author decision.
5. Preserve stable block IDs in generated TeX. Replace only the accepted block; keep unrelated source bytes and assets. Check the file hash and outline revision after asynchronous work. On conflict, retain manual edits and ask for a new proposal. Record accepted edits in project history.
6. Recompile after substantive changes. Check actual pages and visual composition. Local bounded editing reduces model context; it does not independently verify all scientific claims or automatically judge figure semantics.


## Panel typography and alignment (0.9)

[MIT Biological Engineering Communication Lab — Research Poster: Design](https://mitcommlab.mit.edu/be/commkit/research-poster-design/) emphasizes readable type, restrained formatting, clear text hierarchy, figures and deliberate line breaks/list structure. We apply those principles through a default sans-serif poster body (while retaining an explicitly selected serif editorial style), aligned inset text, colored heading rules and readable list indentation. This is our implementation choice, not a copied MIT template or use of MIT branding.

The user's requested full-panel layout is an additional constraint: fill the poster's body with aligned module borders, then adjust actual content sizes and internal spacing. Keep header and image captions close to their content groups. Natural content occupancy and panel-box coverage must be reported as separate metrics; a 100% border coverage value is not proof of dense content or good scientific communication.
