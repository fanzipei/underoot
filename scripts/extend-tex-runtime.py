"""Maintainer tool: extend the frozen WASM TeX tree from historic TeX Live.

Run with Python 3; normal builds and compilation never download packages.
Package archive SHA-256 hashes are recorded beside the runtime for provenance.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'wasm'
BASE = 'https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/2019/tlnet-final/archive/'
PACKAGES = '''ec cm-super graphics-cfg geometry iftex amscls booktabs enumitem float
fancyhdr setspace titlesec caption multirow natbib cite url hyperref oberdiek
intcalc bitset bigintcalc etexcmds infwarerr kvdefinekeys kvoptions kvsetkeys
ltxcmds pdfescape pdftexcmds refcount rerunfilecheck stringenc uniquecounter
gettitlestring hycolor auxhook atbegshi atveryend letltxmacro etoolbox
environ trimspaces listings fancyvrb upquote textcase csquotes microtype'''.split()

def download(name):
    url = BASE + name + '.tar.xz'
    raw = urllib.request.urlopen(url, timeout=60).read()
    files = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:xz') as archive:
        for entry in archive.getmembers():
            if not entry.isfile():
                continue
            rel = Path(entry.name)
            if rel.is_absolute() or '..' in rel.parts or '\\' in entry.name:
                raise ValueError('Unsafe archive path')
            files[entry.name] = archive.extractfile(entry).read()
    return name, url, hashlib.sha256(raw).hexdigest(), files

with zipfile.ZipFile(ROOT / 'texlive-runtime.zip') as archive:
    entries = {name: archive.read(name) for name in archive.namelist()}
provenance = []
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for name, url, digest, files in pool.map(download, PACKAGES):
        entries.update(files)
        provenance.append({'package': name, 'url': url, 'sha256': digest})
        print(name, len(files), flush=True)
with zipfile.ZipFile(ROOT / 'texlive-runtime.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    # Scalable EC/TS1 fonts are needed by LaTeX 2020's default text symbols.
    base_map = 'pdftex.map'
    map_names = [name for name in entries if name.endswith(('cm-super-t1.map', 'cm-super-ts1.map'))]
    if map_names:
        original = entries.get(base_map, b'').split(b'\n% underoot cm-super maps\n')[0]
        entries[base_map] = original + b'\n% underoot cm-super maps\n' + b'\n'.join(entries[name] for name in sorted(map_names))
    for name, content in sorted(entries.items()):
        info = zipfile.ZipInfo(name, (2020, 4, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, content)
(ROOT / 'additional-packages.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
