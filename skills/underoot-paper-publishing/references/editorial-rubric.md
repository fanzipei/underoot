# Editorial decisions and failure checks

Use these criteria while writing, then use generated artifacts as evidence. A numeric source-ID coverage score cannot establish that the conclusions or visuals are correct.

| Round | Observable evidence | Common failure | Corrective action |
| --- | --- | --- | --- |
| 1. Source | Claim → source section/chunk; exact values, units, baseline and scope | Abstract-only summary; dropped late limitation; fabricated comparison | Read remaining chunks; keep uncertainty; remove unsupported claims |
| 2. Story | Titles form a coherent argument without reading body text | Table-of-contents deck; paragraphs pasted verbatim; every sentence bold | Write one idea per slide; distinguish the contribution from background; use descriptive titles when a stronger claim is unsupported |
| 3. Visual | Figure/table caption and associated claim agree | All images in an appendix; wrong file with same basename; recreated plot without data | Resolve exact paths first; place beside source-linked evidence; retain real units/conditions; flag image interpretation not performed |
| 4. Layout | Readable preview; clear order; reasonable word/line budget | Overflow hidden by allowframebreaks/shrink; tiny poster text; column balancing scrambles order | Split content, preserve order, use source notes; adjust column geometry; keep poster one sheet |
| 5. Artifact | Compiled PDF, audit JSON, rendered page review and remaining issues | “No TeX error” asserted as “good design”; poster content on page 2 | Count actual pages, inspect text bounds and rendered pages, recompile fixes; distinguish automated audit from visual/scientific review |

Slides should function as spoken explanation: concise points, intentional transitions and enough evidence to support the takeaway. Avoid generic “Introduction/Results” titles when an accurate informative title is possible, but never replace a cautious source statement with a stronger conclusion. A short talk can omit implementation detail from the display while retaining it in speaker notes; explicitly disclose that not every source detail is shown.

Posters should support both a 30-second overview and a longer discussion. Put the research question and primary finding where they can be found immediately. Use a contiguous reading order, keep conditions next to key numbers, make the main result visual prominent and retain limitations. Do not fill whitespace with irrelevant paragraphs or invented claims. For sparse sources, choose a simpler, more spacious composition; for dense sources, prioritize evidence and archive secondary detail rather than produce multiple sheets unintentionally.

Preserve math semantically. The shared helper transfers a conservative subset of self-contained equation syntax; it does not resolve custom macros automatically. For complex equations, copy the required definitions after reviewing them, or show a source-derived crop with an editable/source reference. Never turn `\frac` / `\sum` into a prose string and call that a formula. Tables require header/value/condition preservation; if a complex table is not ported, add a clear source-linked adaptation task rather than paste flattened tabular tokens.

Keep numerical comparisons honest: percentage *points* differ from relative percent; a best run differs from mean over seeds; missing error bars are not zero uncertainty. Citations must come from the project's bibliography or independently verified records. Image consistency cannot be established by filenames/captions alone; inspect the image or disclose the limitation.

The built-in host performs five deterministic content/layout passes, optional model narrative rewriting and actual compilation/bounds checks when tools exist. Its `review.json` explicitly leaves visual inspection unverified. An agent using this skill is responsible for viewing and revising the final rendered artifacts before claiming visual quality.
