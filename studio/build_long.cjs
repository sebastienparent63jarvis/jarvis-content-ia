// STUDIO ACTU CRUE — montage d'un FORMAT LONG (16:9) selon le modèle validé le 23/11/2026.
// Usage : node studio/build_long.cjs <slug> [--v=1] [--edit-only] [--only=3,8]
// Entrées (studio/productions/<slug>/) :
//   production.json  {title, description, category, chapters:{segId:"TITRE"}, people:{key:{name,role}}, publishAt}
//   subs.json        {order:[segId...], segs:[{id,url,duration,lines:[{t,s,e}]}]}   (cf. tts_to_subs.cjs)
//   beats.json       [[segId, ligne, "P"|"V"|"D"|"C", spec], ...]                    (cf. RUNBOOK)
//   pexels.json      [[id, durée, url_mp4], ...] dans l'ordre des temps "V"
//   pool.json        [{id, file, w, h, by, lic, person?}]  (file relatif au dossier de production)
// Sorties : public/productions/<slug>/v<N>/… + public/productions/<slug>/edit.json
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const REPO = path.resolve(__dirname, '..'); const TPL = path.join(__dirname, 'templates');
const slug = process.argv[2]; if (!slug) { console.error('usage: node studio/build_long.cjs <slug>'); process.exit(1); }
const arg = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const V = arg('v') || '1'; const ONLY_EDIT = process.argv.includes('--edit-only');
const ONLY = arg('only') ? arg('only').split(',').map(Number) : null;
const PD = path.join(__dirname, 'productions', slug);
const OUT = path.join(REPO, 'public/productions', slug, 'v' + V); const REL = `productions/${slug}/v${V}/`;
for (const d of ['plates', 'anim', 'subs', 'names', 'chap']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const J = (f) => JSON.parse(fs.readFileSync(path.join(PD, f), 'utf8'));
const prod = J('production.json'), subs = J('subs.json'), B = J('beats.json'), PX = J('pexels.json'), pool = J('pool.json');
const P = {}; pool.forEach((p) => P[p.id] = p);
const b64 = (p, t) => `data:${t};base64,` + fs.readFileSync(p).toString('base64');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- timeline voix ----------
const PRE = 2.0, GAP = 0.55, HOLD = 1.6, ENDTAIL = 6.0;
const CHAP = {}; subs.order.filter((id) => (prod.chapters || {})[id] !== undefined).forEach((id, i) => CHAP[id] = i + 1); // numérotés dans l'ordre de diffusion
const segById = {}; subs.segs.forEach((s) => segById[s.id] = s);
let t = PRE; const seg = [], st = {};
for (const id of subs.order) { if (CHAP[id]) t += HOLD; const s = segById[id]; st[id] = t; seg.push({ id, start: +t.toFixed(3), dur: s.duration, url: s.url }); t += s.duration + GAP; }
const voiceEnd = +(t - GAP).toFixed(3);
const ws = (id) => st[id] - (CHAP[id] ? HOLD : 0);

// ---------- sous-titres : blocs de phrase tenus ----------
const blocks = [];
for (const sg of seg) {
  let cur = null; const push = () => { if (cur) blocks.push(cur); cur = null; };
  for (const ln of segById[sg.id].lines) {
    const a = sg.start + ln.s, e = sg.start + ln.e;
    if (!cur) cur = { text: ln.t, s: a, e };
    else if ((cur.text + ' ' + ln.t).length <= 90) { cur.text += ' ' + ln.t; cur.e = e; }
    else { push(); cur = { text: ln.t, s: a, e }; }
    if (/[.?!]$/.test(ln.t) && cur.text.length >= 28) push();
  }
  push();
}
blocks.forEach((b, i) => { const nx = blocks[i + 1]; let end = b.e + 0.6; if (nx) end = Math.min(end, nx.s - 0.04); if (end - b.s < 1.2 && nx) end = Math.min(nx.s - 0.04, b.s + 1.2); b.end = +end.toFixed(3); b.s = +b.s.toFixed(3); b.file = 'b' + String(i).padStart(3, '0') + '.png'; });

// ---------- temps -> plans ----------
const beats = B.map((b, k) => { const first = k === 0 || B[k - 1][0] !== b[0]; const a = k === 0 ? 0 : first ? ws(b[0]) : st[b[0]] + segById[b[0]].lines[b[1]].s; return { seg: b[0], line: b[1], type: b[2], spec: b[3], a: +a.toFixed(3) }; });
beats.forEach((b, k) => b.len = +((k + 1 < beats.length ? beats[k + 1].a : voiceEnd) - b.a).toFixed(3));
let vi = 0; beats.forEach((b, k) => { if (b.type === 'V') b.px = PX[vi++]; if ((b.type === 'D' || b.type === 'C') && !b.spec.file) b.anim = 'a' + String(k).padStart(3, '0') + '.mp4'; });

const vis = [], matte = [], names = []; const lastCard = {};
for (const b of beats) {
  if (b.type === 'P') {
    vis.push({ asset: { type: 'image', src: REL + 'plates/' + b.spec + '.jpg' }, start: b.a, length: b.len });
    const who = P[b.spec].person;
    if (who && prod.people?.[who] && (lastCard[who] === undefined || b.a - lastCard[who] >= 90)) { lastCard[who] = b.a; names.push({ asset: { type: 'image', src: REL + 'names/' + who + '.png' }, start: b.a, length: +Math.min(3.6, b.len).toFixed(3), transition: { in: 'fade', out: 'fade' } }); }
  } else if (b.type === 'V') {
    const trim = Math.max(0, Math.min(1.5, b.px[1] - b.len - 0.3));
    vis.push({ asset: { type: 'video', src: b.px[2], trim: +trim.toFixed(2), volume: 0 }, start: b.a, length: b.len, scale: 0.599, offset: { x: 0, y: 0.045 } });
    matte.push({ asset: { type: 'image', src: 'actu-assets/tests/matte_card.png' }, start: b.a, length: b.len });
  } else {
    vis.push({ asset: { type: 'video', src: b.spec.file || (REL + 'anim/' + b.anim), volume: 0 }, start: b.a, length: b.len, fit: 'cover' });
  }
}
vis.push({ asset: { type: 'video', src: 'actu-assets/endcard.mp4' }, start: voiceEnd, length: ENDTAIL, transition: { in: 'fade' } });
const subClips = blocks.map((b) => ({ asset: { type: 'image', src: REL + 'subs/' + b.file }, start: b.s, length: +(b.end - b.s).toFixed(3) }));
const ov = seg.filter((s) => CHAP[s.id]).map((s) => ({ asset: { type: 'image', src: REL + 'chap/c' + CHAP[s.id] + '.png' }, start: +(s.start - HOLD).toFixed(3), length: 3.0, transition: { in: 'fade', out: 'fade' } }));
const last = seg[seg.length - 1];
ov.push({ asset: { type: 'image', src: REL + 'credits.png' }, start: +(last.start + 1).toFixed(3), length: Math.min(8, last.dur), transition: { in: 'fade', out: 'fade' } });
const audio = seg.map((sg) => ({ asset: { type: 'audio', src: sg.url }, start: sg.start, length: +(sg.dur + 0.25).toFixed(3) }));
const brand = { asset: { type: 'image', src: REL + 'brand.png' }, start: 0, length: voiceEnd };
const tracks = [{ clips: [brand] }, { clips: ov }, { clips: names }, { clips: subClips }, { clips: matte }, { clips: vis }, { clips: audio }].filter((x) => x.clips.length);
const EDIT = { timeline: { background: '#090a0d', tracks }, output: { format: 'mp4', size: { width: 1920, height: 1080 }, fps: 25 } };

// ---------- contrôles ----------
const errs = [];
for (let i = 0; i + 1 < vis.length; i++) if (Math.abs(vis[i].start + vis[i].length - vis[i + 1].start) > 0.01) errs.push('trou ' + i);
for (const b of beats) { if (b.len < 1.4) errs.push('plan court ' + b.seg + '.' + b.line); if (b.type === 'V' && (!b.px || b.px[1] < b.len)) errs.push('vidéo absente/courte ' + b.seg + '.' + b.line); if (b.type === 'P' && !P[b.spec]) errs.push('photo inconnue ' + b.spec); }
if (vi !== PX.length) errs.push(`pexels.json : ${PX.length} vidéos pour ${vi} temps V`);
const cnt = {}, dur = {}; beats.forEach((b) => { cnt[b.type] = (cnt[b.type] || 0) + 1; dur[b.type] = (dur[b.type] || 0) + b.len; });

(async () => {
  if (!ONLY_EDIT) {
    const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
    const RESET = '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>';
    const WRAP = (c) => `${RESET}<div style="width:1920px;height:1080px;position:relative;font-family:Arial,'Liberation Sans',sans-serif">${c}</div>`;
    const shot = async (html, file) => { await pg.setContent(html, { waitUntil: 'load' }); await pg.screenshot({ path: file, omitBackground: true }); };
    const BUG = b64(path.join(TPL, 'bug.png'), 'image/png'), PLUME = b64(path.join(TPL, 'plume_sig.png'), 'image/png'), GLOBE = b64(path.join(TPL, 'globe_sig.png'), 'image/png');
    // plateaux photo
    for (const id of [...new Set(beats.filter((b) => b.type === 'P').map((b) => b.spec))]) {
      const p = P[id]; const src = b64(path.resolve(PD, p.file), 'image/jpeg');
      const maxW = 1150, maxH = 700; let cw = maxW, ch = Math.round(maxW * p.h / p.w); if (ch > maxH) { ch = maxH; cw = Math.round(maxH * p.w / p.h); }
      await pg.setContent(`${RESET}<div style="width:1920px;height:1080px;position:relative;background:radial-gradient(120% 120% at 50% 0%,#15171c,#090a0d 72%);overflow:hidden"><img src="${src}" style="position:absolute;inset:-80px;width:calc(100% + 160px);height:calc(100% + 160px);object-fit:cover;filter:blur(52px) brightness(.34) saturate(1.1);opacity:.42"/><img src="${PLUME}" style="position:absolute;left:60px;top:50%;transform:translateY(-50%);height:800px;opacity:.4"/><img src="${GLOBE}" style="position:absolute;right:40px;top:50%;transform:translateY(-50%);height:620px;opacity:.4"/><div style="position:absolute;left:50%;top:45.5%;transform:translate(-50%,-50%);width:${cw}px;height:${ch}px;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,.18);box-shadow:0 28px 80px rgba(0,0,0,.65);background:#fff"><img src="${src}" style="width:100%;height:100%;object-fit:cover"/></div></div>`, { waitUntil: 'load' });
      await pg.screenshot({ path: path.join(OUT, 'plates', id + '.jpg'), type: 'jpeg', quality: 86 });
    }
    // habillage : marque, sous-titres, cartons noms, chapitres
    await shot(WRAP(`<img src="${BUG}" style="position:absolute;top:40px;left:54px;height:92px"/><div style="position:absolute;top:62px;right:60px;background:#f5a524;color:#111;font-weight:800;font-size:26px;letter-spacing:2px;padding:10px 22px;border-radius:8px">${esc(prod.category || 'ACTU')}</div><div style="position:absolute;left:0;right:0;bottom:0;height:8px;background:linear-gradient(90deg,#f5a524,#c67f12)"></div>`), path.join(OUT, 'brand.png'));
    const SUB = 'position:absolute;left:50%;bottom:66px;transform:translateX(-50%);width:max-content;max-width:1400px;padding:18px 40px;text-align:center;color:#edeef0;font-weight:700;font-size:44px;line-height:1.2;background:linear-gradient(180deg,rgba(20,22,28,.74),rgba(10,12,17,.86));border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:0 16px 44px rgba(0,0,0,.5)';
    for (const b of blocks) await shot(WRAP(`<div style="${SUB}">${esc(b.text)}</div>`), path.join(OUT, 'subs', b.file));
    for (const [k, n] of Object.entries(prod.people || {})) await shot(WRAP(`<div style="position:absolute;left:120px;top:700px;display:flex;background:linear-gradient(180deg,rgba(20,22,28,.80),rgba(10,12,17,.90));border:1px solid rgba(255,255,255,.14);border-radius:14px;overflow:hidden"><div style="width:8px;background:#f5a524"></div><div style="padding:16px 26px"><div style="color:#f5a524;font-weight:800;font-size:34px;letter-spacing:1.5px">${esc(n.name.toUpperCase())}</div><div style="color:#edeef0;font-weight:600;font-size:26px;margin-top:4px">${esc(n.role)}</div></div></div>`), path.join(OUT, 'names', k + '.png'));
    for (const [id, title] of Object.entries(prod.chapters || {})) await shot(WRAP(`<div style="position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);text-align:center;padding:34px 70px;background:linear-gradient(180deg,rgba(20,22,28,.86),rgba(10,12,17,.94));border:1px solid rgba(245,165,36,.5);border-radius:20px"><div style="color:#f5a524;font-weight:800;font-size:34px;letter-spacing:8px">CHAPITRE ${CHAP[id]}</div><div style="color:#edeef0;font-weight:900;font-size:76px;margin-top:10px">${esc(title)}</div></div>`), path.join(OUT, 'chap', 'c' + CHAP[id] + '.png'));
    // animations maison
    const FR = path.join(require('os').tmpdir(), 'ac-frames-' + slug);
    for (const [k, b] of beats.entries()) {
      if (!b.anim || (ONLY && !ONLY.includes(k))) continue;
      const spec = { ...b.spec, dur: b.len };
      let page = 'anim.html';
      if (b.type === 'C') { spec.t = spec.arc ? 'arc' : 'map'; if (spec.arc && !spec.hot) spec.hot = ['China', 'United States of America']; }
      if (spec.t === 'chart') page = 'datacard_fs.html';
      fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
      await pg.goto('file://' + path.join(TPL, page) + '?k=' + k + '#' + encodeURIComponent(JSON.stringify(spec)));
      await pg.waitForFunction('window.__ready===true', { timeout: 10000 });
      const N = Math.ceil((b.len + 0.2) * 25);
      for (let i = 0; i < N; i++) { await pg.evaluate((x) => window.render(x), i / 25); await pg.screenshot({ path: path.join(FR, 'f' + String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92 }); }
      cp.execSync(`ffmpeg -y -loglevel error -framerate 25 -i ${FR}/f%04d.jpg -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p ${path.join(OUT, 'anim', b.anim)}`);
      process.stdout.write(b.anim + ' ');
    }
    const authors = [...new Set(beats.filter((b) => b.type === 'P').map((b) => (P[b.spec].by || '').trim()).filter(Boolean))].join(' · ');
    await pg.setContent(WRAP(`<div style="position:absolute;left:50%;top:150px;transform:translateX(-50%);width:1640px;padding:22px 40px;box-sizing:border-box;text-align:center;color:#edeef0;font-size:24px;line-height:1.45;background:linear-gradient(180deg,rgba(20,22,28,.84),rgba(10,12,17,.92));border:1px solid rgba(255,255,255,.14);border-radius:16px"><b style="color:#f5a524;font-size:28px;display:block;margin-bottom:10px;letter-spacing:1px">SOURCES — Photos : Wikimedia Commons, Flickr (CC BY / CC BY-SA / CC0) · Vidéos : Pexels</b>${esc(authors)}</div>`));
    await pg.screenshot({ path: path.join(OUT, 'credits.png'), omitBackground: true });
    await br.close();
  }
  fs.writeFileSync(path.join(REPO, 'public/productions', slug, 'edit.json'), JSON.stringify(EDIT));
  const tot = beats.reduce((s, b) => s + b.len, 0);
  console.log('\n' + JSON.stringify({ slug, duree_min: ((voiceEnd + ENDTAIL) / 60).toFixed(2), plans: beats.length, repartition_plans: cnt, repartition_temps: Object.fromEntries(Object.entries(dur).map(([k, v]) => [k, Math.round(100 * v / tot) + '%'])), erreurs: errs }, null, 1));
})().catch((e) => { console.error('ERR', e.stack); process.exit(1); });
