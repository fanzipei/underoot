# Publishing timeout and checkpoint review — v0.10.5

The KDD 2027 report supplied by the user failed after the final narrative request timed out. The request wrapper labelled all retryable errors as validation failures, and completed hierarchical reductions were not cached. The UI therefore said “automatic correction” even when no model response had arrived, and another generation repeated successful reductions.

The old-path diagnostic reproduced the final-request timeout. The revised live test reused all chunk summaries and two completed reductions, then produced and validated 18 narrative sections in one real provider request taking 140,052 ms. The production final-request timeout had been 120,000 ms. A fresh 18-page Metropolis PDF compiled from that response without TeX errors, measured overflow or outside text. The test used private copies; existing paper and Slides files were not overwritten.

Changes:

- Chunk/reduction/composition requests use 120/150/240-second limits. AI requests now have a total wall-clock deadline as well as a socket inactivity timeout, so provider keepalives cannot extend the deadline indefinitely. Cancellation and the 20-minute whole-job limit remain.
- Transport retries are labelled request retries, not response corrections. They resend the original input without unnecessary repair instructions or a stale draft. Validation failures retain the bounded correction path. Per-step retries and the already-confirmed total call cap remain unchanged.
- Display actual request elapsed time and its threshold. Clear retry state on completed steps, including the final singleton reduction (17/17).
- Cache validated hierarchical summaries and final narrative separately by content, source/model scope and generation kind/count. Validate a narrative again on cache read. Existing chunk caches remain compatible. No schema migration.
- Omit duplicate narrative `text` when bullets already contain the same evidence. Do not loosen scientific provenance or length validation to mask a timeout.
- Retain at most 80 private failure metadata files, without prompts, provider responses or credentials, for later diagnosis.

Verification: 49 evidence checks, including transport classification and reduction/narrative resume; 124 studio integration checks, including bounded private failure diagnostics and a trickling provider deadline. Existing publishing unit, editorial, fitting and standalone suites also pass. Private live-test inputs, responses and PDFs stay outside Git.
