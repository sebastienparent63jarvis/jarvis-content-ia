// Convertit le résultat de /api/pilote-tts-result?runId=… (voix + mots horodatés)
// en subs.json pour build_long.js. Usage : node studio/tts_to_subs.cjs <slug> <tts.json> [ordre,des,ids]
const fs = require('fs'); const path = require('path');
const [slug, file, order] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(file, 'utf8')); const man = r.manifest || r;
function chunk(words, max = 42) { const out = []; let cur = [], len = 0; const flush = () => { if (cur.length) out.push({ t: cur.map((w) => w.w).join(' '), s: cur[0].start, e: cur[cur.length - 1].end }); cur = []; len = 0; };
  for (const w of words) { const add = (len ? 1 : 0) + w.w.length; if (len && len + add > max) flush(); cur.push(w); len += add; if (/[.,;:!?]$/.test(w.w) && len >= 16) flush(); } flush(); return out; }
const bad = man.filter((m) => m.error); if (bad.length) { console.error('Segments en erreur :', bad.map((b) => b.id + ' ' + b.error)); process.exit(1); }
const segs = man.map((m) => ({ id: m.id, url: m.url, duration: m.duration, lines: chunk(m.words) }));
const out = { order: order ? order.split(',') : segs.map((s) => s.id), segs };
fs.writeFileSync(path.join(__dirname, 'productions', slug, 'subs.json'), JSON.stringify(out));
console.log('subs.json :', segs.length, 'segments,', segs.reduce((a, s) => a + s.duration, 0).toFixed(1), 's de voix');
