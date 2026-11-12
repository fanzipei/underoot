import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ROOT } from './paths.js';
import { requireAuth } from './auth.js';
export const wasmRouter = express.Router();
const runtime = path.join(ROOT, 'public/wasm');
let index;
wasmRouter.use(requireAuth);
wasmRouter.get('/texlive/pdftex/:format/:name', (req, res) => {
 const name = req.params.name;
 if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,140}$/.test(name) || !/^\d+$/.test(req.params.format)) return res.status(404).end();
 if (!index) index = JSON.parse(fs.readFileSync(path.join(runtime, 'texlive-index.json'), 'utf8'));
 const extension = { 3: '.tfm', 26: '.tex', 6: '.bib', 7: '.bst' }[req.params.format] || '';
 const rel = name === 'swiftlatexpdftex.fmt' ? 'pdftex/swiftlatexpdftex.fmt' : index[name] || index[name + extension];
 if (!rel) return res.status(404).end();
 res.set('fileid', name).set('Cache-Control', 'private, max-age=86400').sendFile(path.join(runtime, rel));
});
