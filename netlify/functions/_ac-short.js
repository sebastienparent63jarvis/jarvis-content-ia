// MODÈLE ACTU CRUE — production d'un SHORT vertical (1080×1920).
// Additif : appelé par runProductionStep quand le modèle "actucrue" est activé
// (store jarvis-config, clé "shorts-model"). En cas d'échec, l'appelant retombe
// sur l'ancien montage : un créneau n'est jamais perdu.
//
// Recette (cf. claude/regles-or-visuels-pipeline.md) :
//  - voix ElevenLabs AVEC timestamps → sous-titres en blocs calés au mot ;
//  - un visuel par segment, choisi par la nature de la phrase (planificateur IA) :
//      P = vraie photo identifiée (Wikidata/Commons)   ~30 %
//      V = vidéo d'illustration Pexels verticale       ~35 %
//      D = carton chiffré / date / nom (plein écran)   ~25 %
//      C = carte animée maison (bibliothèque)          ~10 %
//  - photos et vidéos DANS le cadre du plateau ; cartons et cartes en PLEIN ÉCRAN.
import { getStore } from "@netlify/blobs";
import { resolveEntity, commonsFileInfo } from "./_image-sourcing.js";

export const MAP_LIBRARY = {
  "etats-unis": "ÉTATS-UNIS", "washington": "WASHINGTON", "new-york": "NEW YORK", "chine": "CHINE", "pekin": "PÉKIN",
  "taiwan": "TAÏWAN", "russie": "RUSSIE", "moscou": "MOSCOU", "ukraine": "UKRAINE", "kiev": "KIEV", "israel": "ISRAËL",
  "gaza": "GAZA", "iran": "IRAN", "teheran": "TÉHÉRAN", "ormuz": "DÉTROIT D'ORMUZ", "france": "FRANCE", "paris": "PARIS",
  "bruxelles": "BRUXELLES", "allemagne": "ALLEMAGNE", "royaume-uni": "ROYAUME-UNI", "inde": "INDE", "japon": "JAPON",
  "coree-du-nord": "CORÉE DU NORD", "arabie-saoudite": "ARABIE SAOUDITE", "venezuela": "VENEZUELA", "groenland": "GROENLAND",
  "singapour": "SINGAPOUR", "turquie": "TURQUIE", "bresil": "BRÉSIL", "afrique-du-sud": "AFRIQUE DU SUD", "mexique": "MEXIQUE",
  "europe": "EUROPE", "moyen-orient": "MOYEN-ORIENT", "afrique": "AFRIQUE",
};

function store(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
    throw e;
  }
}

export async function getShortsModel() {
  try { const v = await store("jarvis-config").get("shorts-model"); return v || "legacy"; } catch { return "legacy"; }
}
export async function setShortsModel(v) { await store("jarvis-config").set("shorts-model", v); return v; }

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- 1. Voix avec timestamps ----------
function normalizeForTTS(t) {
  t = String(t || "");
  t = t.replace(/(\d+)[.,](\d+)\s*k\b/gi, (_, a, b) => `${a} mille ${b} cent`).replace(/(\d+)\s*k\b/gi, (_, a) => `${a} mille`);
  t = t.replace(/(\d[\d\s.,]*)\s*€/g, (_, n) => `${n.trim()} euros`).replace(/€/g, " euros");
  t = t.replace(/(\d[\d\s.,]*)\s*%/g, (_, n) => `${n.trim()} pour cent`).replace(/%/g, " pour cent");
  t = t.replace(/\$\s*(\d[\d\s.,]*)/g, (_, n) => `${n.trim()} dollars`).replace(/(\d[\d\s.,]*)\s*\$/g, (_, n) => `${n.trim()} dollars`).replace(/\$/g, " dollars");
  return t.replace(/\s{2,}/g, " ").trim();
}
function wordsFromAlignment(al) {
  const ch = al?.characters, st = al?.character_start_times_seconds, en = al?.character_end_times_seconds;
  if (!Array.isArray(ch)) return [];
  const words = []; let cur = "", s = null, e = null;
  const flush = () => { if (cur.trim()) words.push({ w: cur, s, e }); cur = ""; s = null; e = null; };
  for (let i = 0; i < ch.length; i++) { if (/\s/.test(ch[i])) { flush(); continue; } if (s === null) s = st[i]; e = en[i]; cur += ch[i]; }
  flush(); return words;
}
async function ttsSegment(text, key, base) {
  const apiKey = process.env.ELEVENLABS_API_KEY, voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error("ElevenLabs non configuré");
  let r, tries = 0;
  do {
    r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: "POST", headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({ text: normalizeForTTS(text), model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (r.status === 429) await new Promise((z) => setTimeout(z, 3000));
  } while (r.status === 429 && ++tries < 4);
  if (!r.ok) throw new Error("ElevenLabs " + r.status);
  const d = await r.json();
  await store("jarvis-audio").set(key, Buffer.from(d.audio_base64, "base64"), { metadata: { contentType: "audio/mpeg", createdAt: new Date().toISOString() } });
  const al = d.alignment || d.normalized_alignment || {};
  const ends = al.character_end_times_seconds || [];
  return { url: `${base}/api/serve-audio?key=${encodeURIComponent(key)}`, words: wordsFromAlignment(al), duration: ends.length ? ends[ends.length - 1] : 3 };
}

// ---------- 2. Planificateur éditorial ----------
const PLANNER = `Tu es le monteur de la chaîne Actu Crue. On te donne les segments de voix d'un short d'actualité.
Pour CHAQUE segment, choisis UN visuel, selon ce que dit la phrase :
- "P" (vraie photo) : SEULEMENT si le segment nomme une personnalité publique, une entreprise, une institution ou un lieu précis. Champs : entity (nom officiel complet), entity_type ("person"|"org"|"place"), role (fonction courte en français, ex "Président des États-Unis"), context (2-3 mots EN ANGLAIS attendus dans sa description Wikidata, ex ["president","united states"]).
- "V" (vidéo d'illustration) : une action ou une idée. Champ query : 2-4 mots ANGLAIS, CONCRETS et FILMABLES, au sens LITTÉRAL (jamais de métaphore visuelle). Jamais une personne précise.
- "D" (carton animé) : un chiffre, un pourcentage, un montant, une date clé, ou une formule choc présente dans la phrase. Champs : kicker (contexte en MAJUSCULES, ≤ 32 caractères), big (≤ 12 caractères, en chiffres : "−13 %", "490 MDS $", "12 NOV"), sub (≤ 45 caractères). N'invente AUCUN chiffre : uniquement ceux du segment.
- "C" (carte animée) : un lieu ou un rapport de force géographique. Champ map : UNE clé parmi [${Object.keys(MAP_LIBRARY).join(", ")}]. Champs label (MAJUSCULES ≤ 18) et sub (MAJUSCULES ≤ 28).
Répartition visée sur l'ensemble : ~30 % P, ~35 % V, ~25 % D, ~10 % C (au moins une carte si un lieu de la liste est en jeu). Pas plus de 3 visuels du même type d'affilée. La pertinence prime sur le ratio.
Réponds UNIQUEMENT par un tableau JSON, un objet par segment, dans l'ordre : [{"i":0,"type":"V","query":"..."}, ...]`;

async function planVisuals(script) {
  const segs = script.narration_segments.map((s, i) => `${i}. ${s.text}`).join("\n");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, system: PLANNER, messages: [{ role: "user", content: `Titre : ${script.title}\nSegments :\n${segs}` }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error("planificateur : " + (d.error?.message || r.status));
  const txt = (d.content || []).map((b) => b.text || "").join("");
  const arr = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1));
  return script.narration_segments.map((s, i) => arr.find((x) => x.i === i) || { i, type: "V", query: (s.visual_keywords || ["world news"]).join(" ") });
}

// ---------- 3. Résolution des visuels ----------
async function resolvePhoto(p, base) {
  const ent = await resolveEntity({ name: p.entity, type: p.entity_type || "person", context: p.context || [] }, []);
  if (!ent || !ent.verified) return null;
  const file = ent.portrait || (ent.type === "org" ? ent.logo : null) || (ent.type === "place" ? ent.flag : null);
  if (!file) return null;
  const [info] = await commonsFileInfo(["File:" + file]);
  if (!info || !info.url) return null;
  const u = info.url.replace("https://thumb.wikimedia.org/", "https://upload.wikimedia.org/");
  return { src: `${base}/api/img?u=${encodeURIComponent(u)}`, w: info.w, h: info.h, author: info.author, license: info.license };
}
async function pexelsPortrait(query, minDur, used) {
  const key = process.env.PEXELS_API_KEY; if (!key) return null;
  for (const q of [query, query.split(" ").slice(0, 2).join(" ")]) {
    const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=12`, { headers: { Authorization: key } });
    if (!r.ok) continue;
    const d = await r.json();
    for (const v of d.videos || []) {
      if (used.has(v.id) || v.duration < minDur) continue;
      const files = (v.video_files || []).filter((f) => f.file_type === "video/mp4" && f.height >= f.width && f.width >= 720).sort((a, b) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080));
      if (files[0]) { used.add(v.id); return { src: files[0].link, dur: v.duration }; }
    }
  }
  return null;
}

// ---------- 4. Habillage (HTML Shotstack) ----------
const FONT = "font-family:'Inter',Arial,sans-serif";
const fullCard = (inner) => `<div style="width:1080px;height:1920px;background:#0e1015;${FONT};text-align:center">${inner}</div>`;
function dataHtml(b) {
  const size = (b.big || "").length > 9 ? 150 : 210;
  return fullCard(`<div style="padding-top:560px;color:#99a2b1;font-size:44px;font-weight:800;letter-spacing:5px;padding-left:60px;padding-right:60px">${esc(b.kicker)}</div><div style="color:#f5a524;font-size:${size}px;font-weight:900;margin-top:24px;line-height:1">${esc(b.big)}</div><div style="color:#edeef0;font-size:54px;font-weight:700;margin-top:34px;padding:0 70px">${esc(b.sub)}</div>`);
}
const nameHtml = (n, r) => `<div style="width:960px;height:200px;${FONT}"><div style="display:inline-block;background:rgba(12,14,19,.9);border-left:12px solid #f5a524;border-radius:14px;padding:18px 30px;text-align:left"><div style="color:#f5a524;font-weight:900;font-size:48px;letter-spacing:1px">${esc(n.toUpperCase())}</div><div style="color:#edeef0;font-weight:700;font-size:34px;margin-top:4px">${esc(r)}</div></div></div>`;
const mapLabel = (l, s) => `<div style="width:1080px;height:300px;${FONT};text-align:center"><div style="color:#f5a524;font-weight:900;font-size:86px;letter-spacing:4px">${esc(l)}</div><div style="color:#cfe0f5;font-weight:800;font-size:42px;letter-spacing:4px;margin-top:8px">${esc(s)}</div></div>`;
const subHtml = (t) => `<div style="width:980px;height:300px;display:flex;align-items:center;justify-content:center;${FONT}"><p style="margin:0;padding:20px 34px;background:rgba(12,14,19,.84);border-radius:22px;color:#edeef0;font-weight:800;font-size:56px;line-height:1.18;text-align:center">${esc(t)}</p></div>`;
const tagHtml = (c) => `<div style="width:520px;height:120px;${FONT};text-align:right"><span style="display:inline-block;background:#f5a524;color:#111;font-weight:900;font-size:34px;letter-spacing:3px;padding:12px 26px;border-radius:10px">${esc((c || "ACTU").toUpperCase())}</span></div>`;
function hookHtml(title, word) {
  let t = esc(title); if (word) { const w = esc(word); const i = t.toLowerCase().indexOf(w.toLowerCase()); if (i >= 0) t = t.slice(0, i) + `<span style="color:#f5a524">${t.slice(i, i + w.length)}</span>` + t.slice(i + w.length); }
  return fullCard(`<div style="padding-top:640px;padding-left:70px;padding-right:70px;color:#edeef0;font-size:96px;font-weight:900;line-height:1.08">${t}</div>`);
}

// blocs de sous-titres (≤ 48 caractères, coupure en fin de phrase)
function subtitleBlocks(words, offset) {
  const out = []; let cur = null;
  for (const w of words) {
    if (!cur) cur = { t: w.w, s: w.s, e: w.e };
    else if ((cur.t + " " + w.w).length <= 48) { cur.t += " " + w.w; cur.e = w.e; }
    else { out.push(cur); cur = { t: w.w, s: w.s, e: w.e }; }
    if (/[.?!]$/.test(w.w) && cur.t.length > 18) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.map((b) => ({ ...b, s: b.s + offset, e: b.e + offset }));
}

// ---------- 5. Orchestration ----------
export async function runProductionStepAC(jobId, base) {
  const jobStore = store("jarvis-auto-jobs");
  const job = await jobStore.get(jobId, { type: "json" });
  if (!job) throw new Error("job introuvable");
  const script = job.script; const segs = script.narration_segments || [];
  if (!segs.length) throw new Error("script sans segments");

  // voix
  const voice = [];
  for (let i = 0; i < segs.length; i++) voice.push(await ttsSegment(segs[i].text, `ac-${jobId}-${i}.mp3`, base));
  // plan + résolution
  const plan = await planVisuals(script);
  const used = new Set(); const credits = [];
  const GAP = 0.12; let t = 0; const timing = voice.map((v) => { const a = t; t += v.duration + GAP; return { a, len: v.duration + GAP }; });
  const total = t;
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    if (p.type === "P") { const ph = await resolvePhoto(p, base).catch(() => null); if (ph) { p.photo = ph; credits.push(ph.author); } else { p.type = "D"; p.kicker = (p.role || "").toUpperCase(); p.big = ""; p.sub = ""; p.nameCard = true; } }
    if (p.type === "V") { const v = await pexelsPortrait(p.query || "world news", timing[i].len, used).catch(() => null); if (v) p.video = v; else { p.type = "D"; p.kicker = (script.category || "ACTU").toUpperCase(); p.big = script.thumbnail_word || ""; p.sub = ""; } }
    if (p.type === "C" && !MAP_LIBRARY[p.map]) { p.type = "D"; p.kicker = "CARTE"; p.big = p.label || ""; }
  }

  // pistes
  const cardY = 0.0625; // centre du cadre (y=840) par rapport au centre de l'écran
  const vis = [], matte = [], over = [], names = [];
  plan.forEach((p, i) => {
    const { a, len } = timing[i];
    if (p.type === "V") {
      vis.push({ asset: { type: "video", src: p.video.src, volume: 0 }, start: a, length: len, fit: "cover", offset: { y: cardY } });
      matte.push({ asset: { type: "image", src: `${base}/actu-assets/ac-short/matte_v.png` }, start: a, length: len });
    } else if (p.type === "P") {
      const { w, h } = p.photo; const s0 = Math.min(1080 / w, 1920 / h), s1 = Math.min(960 / w, 1080 / h);
      vis.push({ asset: { type: "image", src: p.photo.src }, start: a, length: len, fit: "contain", scale: +(s1 / s0).toFixed(4), offset: { y: cardY } });
      matte.push({ asset: { type: "image", src: `${base}/actu-assets/ac-short/matte_v.png` }, start: a, length: len });
      if (p.entity_type === "person" || !p.entity_type) names.push({ asset: { type: "html", html: nameHtml(p.entity, p.role || ""), width: 960, height: 200 }, start: a, length: Math.min(3, len), position: "center", offset: { y: -0.17 }, transition: { in: "fade", out: "fade" } });
    } else if (p.type === "C") {
      vis.push({ asset: { type: "video", src: `${base}/actu-assets/maps-v/${p.map}.mp4`, volume: 0 }, start: a, length: len, fit: "cover" });
      over.push({ asset: { type: "html", html: mapLabel(p.label || MAP_LIBRARY[p.map], p.sub || ""), width: 1080, height: 300 }, start: a + Math.min(1.7, len * 0.5), length: Math.max(0.6, len - Math.min(1.7, len * 0.5)), position: "center", offset: { y: 0.03 }, transition: { in: "fade" } });
    } else {
      vis.push({ asset: { type: "html", html: p.nameCard ? fullCard(`<div style="padding-top:640px;color:#99a2b1;font-size:44px;font-weight:800;letter-spacing:4px">${esc(p.kicker)}</div><div style="color:#f5a524;font-size:110px;font-weight:900;margin-top:24px;padding:0 50px">${esc((p.entity || "").toUpperCase())}</div>`) : dataHtml(p), width: 1080, height: 1920 }, start: a, length: len, transition: { in: "fade" } });
    }
  });
  const subs = voice.flatMap((v, i) => subtitleBlocks(v.words, timing[i].a)).map((b, k, arr) => {
    const end = k + 1 < arr.length ? Math.min(arr[k + 1].s - 0.03, b.e + 0.6) : b.e + 0.6;
    return { asset: { type: "html", html: subHtml(b.t), width: 980, height: 300 }, start: +b.s.toFixed(3), length: +Math.max(0.4, end - b.s).toFixed(3), position: "center", offset: { y: -0.32 } };
  });
  const audio = voice.map((v, i) => ({ asset: { type: "audio", src: v.url }, start: timing[i].a, length: v.duration + 0.1 }));
  const HOOK = 1.4, OUTRO = 2.5;
  const hook = [{ asset: { type: "html", html: hookHtml(script.title, script.thumbnail_word), width: 1080, height: 1920 }, start: 0, length: HOOK, transition: { out: "slideLeft" } }];
  const outro = [{ asset: { type: "html", html: fullCard(`<div style="padding-top:700px;color:#edeef0;font-size:70px;font-weight:900;line-height:1.15">L'actualité,<br><span style="color:#f5a524">vérifiée.</span></div><div style="color:#99a2b1;font-size:44px;font-weight:800;letter-spacing:3px;margin-top:40px">ABONNE-TOI · ACTU CRUE</div>`), width: 1080, height: 1920 }, start: total, length: OUTRO, transition: { in: "fade" } }];
  const brand = { asset: { type: "image", src: `${base}/actu-assets/ac-short/brand_v.png` }, start: 0, length: total + OUTRO };
  const tag = { asset: { type: "html", html: tagHtml(script.category), width: 520, height: 120 }, start: 0, length: total, position: "topRight", offset: { x: -0.04, y: -0.065 } };

  const edit = {
    timeline: { background: "#090a0d", fonts: [{ src: "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf" }],
      tracks: [{ clips: hook }, { clips: [brand] }, { clips: [tag] }, { clips: subs }, { clips: names.length ? names : [{ asset: { type: "html", html: "<div></div>", width: 10, height: 10 }, start: 0, length: 0.1 }] }, { clips: over.length ? over : [{ asset: { type: "html", html: "<div></div>", width: 10, height: 10 }, start: 0, length: 0.1 }] }, { clips: matte.length ? matte : [{ asset: { type: "html", html: "<div></div>", width: 10, height: 10 }, start: 0, length: 0.1 }] }, { clips: vis.concat(outro) }, { clips: audio }] },
    output: { format: "mp4", size: { width: 1080, height: 1920 }, fps: 30 },
  };
  const env = process.env.SHOTSTACK_ENV || "stage";
  const r = await fetch(`https://api.shotstack.io/${env}/render`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.SHOTSTACK_API_KEY }, body: JSON.stringify(edit) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.response?.id) throw new Error("Shotstack : " + (d.message || r.status) + " " + JSON.stringify(d.response?.error || d.errors || "").slice(0, 300));

  const counts = plan.reduce((o, p) => (o[p.type] = (o[p.type] || 0) + 1, o), {});
  job.status = "rendering"; job.renderId = d.response.id; job.renderEnv = env; job.model = "actucrue";
  job.audioSegments = voice.map((v, i) => ({ index: i, url: v.url, duration: v.duration }));
  job.visualPlan = plan.map((p) => ({ type: p.type, entity: p.entity, query: p.query, map: p.map, big: p.big }));
  job.visualCounts = counts; job.photoCredits = [...new Set(credits.filter(Boolean))];
  job.updatedAt = new Date().toISOString();
  await jobStore.set(jobId, JSON.stringify(job));
  return { ok: true, step: "rendering", jobId, renderId: d.response.id, title: script.title, model: "actucrue", counts };
}
