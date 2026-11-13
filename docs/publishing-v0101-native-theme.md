# Native Beamer theme review — 0.10.1

The former renderer selected a Beamer theme, then overrode its title/body/author/caption sizes, colors, title page, bullet marks and paragraph spacing. That defeated the selected theme's proportions. Sparse-page fitting also carried an absolute body-font setting.

Slides now default to [Metropolis](https://ctan.org/pkg/beamertheme-metropolis), using the theme's fonts, palette, title page, headings, lists, spacing and footer. All built-in slide styles use their original Beamer theme appearance. Tables and editable diagrams use semantic `\small`; captions use the theme's caption font. Overloaded pages split or adjust their image instead of changing text sizes. Uploaded custom palettes remain explicit customizations.

Metropolis 1.2's title page requests a `\paperheight` minipage inside a shorter Beamer frame. The renderer patches that dimension to `\textheight` without changing the theme's typography. Logos appear as institution content; the zero-height native titlegraphic box is not used, because it creates overflow warnings. Poster QR/identity layout is unaffected.

TeX Live packages: `beamertheme-metropolis`, `fira`, `pgfopts`. On Linux, make the installed Fira OpenType fonts visible to fontconfig (for example, a dedicated symlink below `~/.local/share/fonts/`, then `fc-cache -f`). Without fontconfig visibility Metropolis warns and uses a fallback; the actual test PDF embedded Fira Sans Regular and Light. XeLaTeX and Fandol continue to support Chinese.

The native renderer is version 6. Version 5 is frozen to preserve comparisons against existing generated TeX and manual-edit guards. Existing projects change only when requested. Send `风格：metropolis` in publishing chat to switch, or `重新排版` to retain the selected theme and upgrade the renderer. A regression also caught and fixed a job-options merge that had overwritten a requested new style with the previous style.

Validation: pure publishing/editorial/layout/evidence checks; five actual layout PDFs (Metropolis, default, Berkeley and two poster styles); a private long-paper Metropolis deck (53 pages including comparison supplements) passed compilation and bounds checks. Its title, prose, table and figure pages were rendered and inspected. This validates template integration and layout, not AI editorial quality. No paid AI evaluation was performed.

A separate Chinese title/author fixture also passed XeLaTeX/PDF checks (17 pages), preserving Fandol glyphs alongside the native theme fonts.

## Asset-specific findings

Following the author's request, figure/table pages pair the evidence with a brief original-source finding, comparison conclusion or innovation support. Label-linked prose and up to two following sentences in the same paragraph are candidates; floats/captions are excluded, other asset references end the context, duplicate text is removed, conditions are not clipped. The existing AI narrative call may supply a bounded `assetInsights` record with an existing asset and intersecting source IDs. No per-page paid calls are added. Native typography places the message above a table or below a full-width figure without a rigid finding box.

Chat `补充图表结论` fills only blank evidence pages from the saved source, retains authored copy and creates a before/after version through guarded reflow. Tests cover explicit source binding, unrelated-asset rejection, intact qualifiers, no extra narrative calls and preservation of existing conclusions. A local-extraction manuscript draft still has some evidence-only pages: adjacent source text is not always a short defensible conclusion. Configured AI may condense longer discussion; neither source-ID validation nor a bounds check certifies the scientific truth of generated copy.

Final regression results: 39 publishing unit, 33 editorial, 15 fit, 36 standalone and 29 evidence assertions; five native layout cases and 113 publishing-studio assertions passed, including upgrading v5 output and explicitly enriching its previously empty table conclusion. Full integration covers all seventeen built-in styles. The private source was read-only throughout, and deployment does not rewrite existing generated projects.
