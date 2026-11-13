# Native Beamer theme review — 0.10.1

The former renderer selected a Beamer theme, then overrode its title/body/author/caption sizes, colors, title page, bullet marks and paragraph spacing. That defeated the selected theme's proportions. Sparse-page fitting also carried an absolute body-font setting.

Slides now default to [Metropolis](https://ctan.org/pkg/beamertheme-metropolis), using the theme's fonts, palette, title page, headings, lists, spacing and footer. All built-in slide styles use their original Beamer theme appearance. Tables and editable diagrams use semantic `\small`; captions use the theme's caption font. Overloaded pages split or adjust their image instead of changing text sizes. Uploaded custom palettes remain explicit customizations.

Metropolis 1.2's title page requests a `\paperheight` minipage inside a shorter Beamer frame. The renderer patches that dimension to `\textheight` without changing the theme's typography. Logos appear as institution content; the zero-height native titlegraphic box is not used, because it creates overflow warnings. Poster QR/identity layout is unaffected.

TeX Live packages: `beamertheme-metropolis`, `fira`, `pgfopts`. On Linux, make the installed Fira OpenType fonts visible to fontconfig (for example, a dedicated symlink below `~/.local/share/fonts/`, then `fc-cache -f`). Without fontconfig visibility Metropolis warns and uses a fallback; the actual test PDF embedded Fira Sans Regular and Light. XeLaTeX and Fandol continue to support Chinese.

The native renderer is version 6. Version 5 is frozen to preserve comparisons against existing generated TeX and manual-edit guards. Existing projects change only when requested. Send `风格：metropolis` in publishing chat to switch, or `重新排版` to retain the selected theme and upgrade the renderer. A regression also caught and fixed a job-options merge that had overwritten a requested new style with the previous style.

Validation: pure publishing/editorial/layout/evidence checks; five actual layout PDFs (Metropolis, default, Berkeley and two poster styles); a private long-paper Metropolis deck (53 pages including comparison supplements) passed compilation and bounds checks. Its title, prose, table and figure pages were rendered and inspected. This validates template integration and layout, not AI editorial quality. No paid AI evaluation was performed.

A separate Chinese title/author fixture also passed XeLaTeX/PDF checks (17 pages), preserving Fandol glyphs alongside the native theme fonts.
