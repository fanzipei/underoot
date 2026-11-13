# Summary compression 0.10.3

The former correction request supplied an error and the original source, but not the previous response. A stateless model could restart its synopsis and repeat the same excessive length. The original instruction also advertised the tolerance ceiling alongside the desired target.

The target remains 1800 characters. The acceptance and private-cache ceiling is now a shared 5000-character policy, so a 3878-character summary is accepted without a corrective model call. The initial instruction asks for compact evidence rather than advertising the ceiling as a writing goal.

Length errors carry structured length metadata. Corrective calls carry the full previous response when the complete payload fits 32000 characters, alongside unchanged original input and explicit compression instructions. Targets descend to 1600 and 1200 characters, with the required percentage reduction and a keep/remove checklist. Critical values, units, baseline attribution, conditions, uncertainty and limitations stay; repeated background, setup, titles, generic praise and duplicate claims go. This is an editing request, not a request to write another expansive synopsis.

If a response would exceed the bounded corrective-input budget, it is omitted as a whole and the model is explicitly told to regenerate from the intact original input. No manuscript text or candidate conclusion is silently truncated. Normal reduction and composition input budgets, the two corrections per step, three extra corrections per job and declared request upper bound remain unchanged.

Synthetic regressions cover exact acceptance of the reported 3878-character case without an extra call, full previous-response and source transport, decreasing compression targets, bounded corrections and reuse of a 3878-character validated chunk from the private cache. One call to the configured provider also compressed a synthetic 6479-character draft to 475 characters, retaining the four tested values (87.1, 80.2, 6.9, 84.0). This is a compression check, not a full-paper editorial evaluation or a guarantee that every future qualifier is preserved.
