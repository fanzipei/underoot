import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const file = process.argv[2];
const data = new Uint8Array(fs.readFileSync(path.resolve(file)));
const doc = await pdfjs.getDocument({
  data,
  useSystemFonts: true,
  standardFontDataUrl: path.resolve('public/assets/standard_fonts') + '/',
  cMapUrl: path.resolve('public/assets/cmaps') + '/',
  cMapPacked: true,
}).promise;
const page = await doc.getPage(1);
const ops = await page.getOperatorList();
const seen = new Set();
for (let i = 0; i < ops.fnArray.length; i++) {
  if (ops.fnArray[i] !== pdfjs.OPS.setFont) continue;
  const id = ops.argsArray[i][0];
  if (seen.has(id)) continue;
  seen.add(id);
  const f = page.commonObjs.get(id);
  console.log(JSON.stringify({
    id,
    name: f?.name,
    loadedName: f?.loadedName,
    fallbackName: f?.fallbackName,
    isType3Font: f?.isType3Font,
    systemFontInfo: f?.systemFontInfo,
    cssFontInfo: f?.cssFontInfo,
    attached: !!f?.attached,
    dictKeys: f ? Object.keys(f).slice(0, 18) : [],
  }));
}
const text = await page.getTextContent();
console.log('TEXT:', text.items.map((x) => x.str).join('').slice(0, 500));
await doc.destroy();
