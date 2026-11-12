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
