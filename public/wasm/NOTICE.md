# Browser TeX runtime

These third-party assets retain their upstream licenses. The application's MIT
license does not replace the engine and TeX component licenses.

- `pdftex/swiftlatexpdftex.js` and `.wasm`: SwiftLaTeX `v20022022`,
  source commit `912068d6f746a58c210eec69053ef72e2ed60b4c`.
  Release: https://github.com/SwiftLaTeX/SwiftLaTeX/releases/tag/v20022022
  Corresponding source: https://github.com/SwiftLaTeX/SwiftLaTeX/tree/912068d6f746a58c210eec69053ef72e2ed60b4c/pdftex.wasm
  Upstream root license is preserved in `pdftex/UPSTREAM-LICENSE.txt`; engine
  source files also carry individual EPL / GPL / TeX notices. The sole worker
  patch changes the default resource endpoint to `/api/wasm/texlive/`, keeping
  manuscripts and package requests on the local service.
- `pdftex/swiftlatexpdftex.fmt`: engine-compatible LaTeX2e 2020 format from
  https://github.com/SwiftLaTeX/Texlive-Ondemand/blob/cc2146e220658f5ee0f8643355252ae0995fbc98/swiftlatexpdftex.fmt
  LaTeX source: https://github.com/latex3/latex2e/tree/release-2020-02-02
- `texlive-runtime.zip`: frozen basic packages latex, l3backend, amsmath,
  amsfonts, tools, graphics, graphics-def, xcolor, cm and bibtex, including
  package metadata and embedded notices, from the historic distribution:
  https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/2019/tlnet-final/archive/
  plus l3backend's 2020 archive. Additional frozen 2019 paper packages and
  EC/CM-Super fonts are listed with archive SHA-256 hashes in
  `additional-packages.json`; `scripts/extend-tex-runtime.py` reproduces this
  extension. Their notices/metadata remain in the bundle. `pdftex.map` combines
  the AMS and CM-Super T1/TS1 font maps.
  Matching `.source.tar.xz` archives at that location contain package sources.
  TeX Live license information: https://tug.org/texlive/copying.html

`npm run build` extracts the frozen archive and generates an index. Compiling
does not download third-party packages or execute native TeX on the server.
The bundle supports basic pdfLaTeX, mathematics and multi-file projects. Modern
conference classes, CJK system fonts, XeTeX/LuaTeX and extra packages should use
an appropriate server compiler. No shell-escape is offered.

## Modern browser engine (underoot 0.6)

`scripts/install-modern-tex.mjs` downloads the pinned TeXlyre-BusyTeX build
`46ebb6216a5c1fe63dd1dc885831d1a8cef2dc86` (TeX Live 2026) and verifies each
asset's fixed size and SHA-256 against the release digests. Generated assets
live in `tl2026-46ebb621/`, outside Git. Normal startup after installation works
without GitHub access. Basic runtime assets total approximately 128 MB and are
cached by the browser; on-demand packages/fonts are proxied and cached by the
instance, not compiled there. Legacy SwiftLaTeX assets remain for regression.

Source and corresponding build instructions:
https://github.com/TeXlyre/texlyre-busytex-build/tree/46ebb6216a5c1fe63dd1dc885831d1a8cef2dc86
Release:
https://github.com/TeXlyre/texlyre-busytex-build/releases/tag/build_wasm_46ebb6216a5c1fe63dd1dc885831d1a8cef2dc86_31802832436_1
TeXlyre modifications are AGPL-3.0, Copyright (c) 2026 Fares Abawi;
the original BusyTeX is MIT licensed. The AGPL text is preserved in
`TEXLYRE-LICENSE.txt`; the engine stays in its own Worker. The upstream engine
and pipeline assets are unmodified. `modern-worker.js` only reports resource
progress to the host; shell escape is disabled, with no external shell handlers.

TeX component/font licenses remain applicable. Missing resources come from the
upstream TeX Live 2026 package service https://texlive2026.texlyre.org, over HTTPS,
using format and basename only. No manuscript bodies or credentials are sent
there. Local cached files record SHA-256 for corruption detection; the service's
individual files are not upstream-signed or guaranteed immutable. Bump the
runtime/cache version deliberately when migrating distributions.
