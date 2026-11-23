// Cœur du sourcing d'images libres — générique, pour TOUS les sujets Actu Crue.
// Sources (toutes gratuites, licences réutilisables commercialement) :
//   1. Wikidata  : identité vérifiée des entités -> portrait (P18), logo (P154),
//                  drapeau (P41), catégorie Commons (P373).
//   2. Commons   : fichiers des catégories des entités (pertinents par construction)
//   3. Commons   : recherche plein texte par mots-clés du script
//   4. Openverse : agrégateur CC (Flickr, musées, agences publiques…)
// Garde-fous : licences blanches uniquement (CC0 / domaine public / CC BY / CC BY-SA),
// taille minimale, liste noire de titres, identité des personnes vérifiée par le
// contexte (sinon carton nom), familles anti-doublon (même auteur + même jour /
// même série), score de pertinence.

const UA = "ActuCrue/1.0 (https://commons.wikimedia.org/wiki/User:Actu_Crue)";
const H = { "User-Agent": UA, "Accept": "application/json" };
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const WD = "https://www.wikidata.org/w/api.php";

async function getJSON(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: H });
      if (r.ok) return await r.json();
      if (r.status === 429) await new Promise((s) => setTimeout(s, 1500));
    } catch (e) { /* retry */ }
  }
  return null;
}
const qs = (o) => Object.entries(o).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
const strip = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const norm = (s) => strip(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// ---------- licences ----------
export function licenseOk(lic) {
  const l = norm(lic);
  if (!l) return false;
  if (/\bnc\b|\bnd\b|non-?commercial|no ?deriv|fair use|copyright|all rights/.test(l)) return false;
  return /^(cc0|cc-zero|pdm|public domain|pd\b|pd-|cc by(-sa)?\b|cc-by(-sa)?|attribution|by(-sa)? [0-9])/.test(l) || /^cc by/.test(l) || l === "by" || l === "by-sa";
}

// ---------- liste noire de titres ----------
const BAD = /(coat of arms|blason|signature|autograph|stamp|timbre|banknote|seal of|\bicon\b|pictogram|diagram|chart of|graph of|screenshot of wikipedia|\.pdf|\.djvu|book page|page \d+|scan of|cover of|svg$|locator|location map|relief map|\bmap\b|carte de|flag of|logo)/i;
function titleAllowed(title, kind) {
  if (kind === "logo" || kind === "flag" || kind === "map") return true;
  return !BAD.test(title);
}

// ---------- 1. Wikidata : résolution d'entités ----------
const CREATIVE = new Set(["Q5398426", "Q11424", "Q7725634", "Q482994", "Q134556", "Q1259759", "Q21191270", "Q7889", "Q14660", "Q186516", "Q4167410"]);
// entity: {name, type:'person'|'org'|'place'|'thing', context?:[mots]}
export async function resolveEntity(ent, globalContext = []) {
    const found = [];
  for (const lang of ["fr", "en"]) {
    const j = await getJSON(WD + "?" + qs({ action: "wbsearchentities", search: ent.name, language: lang, uselang: lang, type: "item", limit: 7, format: "json" }));
    for (const s of (j?.search || [])) if (!found.find((f) => f.id === s.id)) found.push({ id: s.id, label: s.label, desc: s.description || "" });
  }
  if (!found.length) return { ...ent, verified: false, reason: "introuvable" };
  const ids = found.map((f) => f.id).join("|");
  const ej = await getJSON(WD + "?" + qs({ action: "wbgetentities", ids, props: "claims|descriptions|labels", languages: "fr|en", format: "json" }));
  const P = (e, p) => (e?.claims?.[p] || []).map((c) => c.mainsnak?.datavalue?.value).filter(Boolean);
  let best = null, bestScore = -1e9;
  // contexte d'identité : celui de l'entité s'il est fourni (plus strict), sinon le global
  const idCtx = (ent.context && ent.context.length ? ent.context : globalContext).map(norm).filter(Boolean);
  for (const f of found) {
    const e = ej?.entities?.[f.id]; if (!e) continue;
    const isHuman = P(e, "P31").some((v) => v.id === "Q5");
    if (ent.type === "person" && !isHuman) continue;
    if (ent.type !== "person" && isHuman) continue;
    // garde-fous de type : une œuvre (série, film, album…) n'est jamais une org ni un lieu
    if (P(e, "P31").some((v) => CREATIVE.has(v.id))) continue;
    if (ent.type === "place" && !P(e, "P625").length) continue;               // un lieu a des coordonnées
    if (ent.type === "org" && !["P856", "P159", "P452", "P749"].some((p) => P(e, p).length)) continue; // une org a site/siège/secteur/maison mère
    const desc = norm([e.descriptions?.fr?.value, e.descriptions?.en?.value].join(" "));
    const label = norm(e.labels?.fr?.value || e.labels?.en?.value || f.label);
    const nClaims = Object.values(e.claims || {}).reduce((n, a) => n + a.length, 0);
    const ctxHit = idCtx.filter((c) => desc.includes(c)).length;
    let score = (label === norm(ent.name) ? 5 : 0) + Math.log10(nClaims + 1) * 3;
    if (ent.type === "person") score += ctxHit * 6;
    if (score > bestScore) { bestScore = score; best = { e, f, ctxHit, desc }; }
  }
  if (!best) return { ...ent, verified: false, reason: "aucune entité du bon type" };
  const e = best.e;
  // identité : une personne n'est validée QUE si sa description recoupe le contexte
  const verified = ent.type === "person" ? best.ctxHit > 0 : true;
  return {
    ...ent, qid: best.f.id, label: best.f.label, description: best.desc, verified,
    reason: verified ? "ok" : "homonyme possible : description sans lien avec le sujet",
    portrait: verified ? P(e, "P18")[0] || null : null,
    logo: P(e, "P154")[0] || null,
    flag: P(e, "P41")[0] || null,
    commonsCategory: P(e, "P373")[0] || null,
  };
}

// ---------- 2/3. Commons ----------
async function commonsInfo(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const j = await getJSON(COMMONS + "?" + qs({ action: "query", prop: "imageinfo", iiprop: "url|size|sha1|mime|extmetadata", iiurlwidth: 1600, titles: chunk.join("|"), format: "json", origin: "*" }));
    for (const p of Object.values(j?.query?.pages || {})) {
      const ii = p.imageinfo?.[0]; if (!ii) continue;
      const m = ii.extmetadata || {};
      out.push({
        title: p.title, w: ii.width, h: ii.height, sha1: ii.sha1, mime: ii.mime,
        url: (ii.thumburl || ii.url).replace("https://thumb.wikimedia.org/", "https://upload.wikimedia.org/").replace(/[?&]utm_[^#]*$/, ""), full: ii.url, landing: ii.descriptionurl,
        license: strip(m.LicenseShortName?.value), author: strip(m.Artist?.value).slice(0, 80),
        date: strip(m.DateTimeOriginal?.value || m.DateTime?.value).slice(0, 10),
        desc: strip(m.ImageDescription?.value).slice(0, 200),
        cats: strip(m.Categories?.value).slice(0, 400),
      });
    }
  }
  return out;
}
async function categoryFiles(cat, limit = 60, depth = 1) {
  const files = [];
  const walk = async (c, d) => {
    const j = await getJSON(COMMONS + "?" + qs({ action: "query", list: "categorymembers", cmtitle: "Category:" + c, cmtype: d > 0 ? "file|subcat" : "file", cmlimit: 100, format: "json", origin: "*" }));
    const mem = j?.query?.categorymembers || [];
    for (const m of mem) if (m.ns === 6) files.push(m.title);
    if (d > 0) for (const s of mem.filter((m) => m.ns === 14).slice(0, 6)) { if (files.length >= limit) break; await walk(s.title.replace(/^Category:/, ""), d - 1); }
  };
  await walk(cat, depth);
  return files.slice(0, limit);
}
async function commonsSearch(q, limit = 25) {
  const j = await getJSON(COMMONS + "?" + qs({ action: "query", list: "search", srnamespace: 6, srlimit: limit, srsearch: q + " filetype:bitmap", format: "json", origin: "*" }));
  return (j?.query?.search || []).map((s) => s.title);
}

// ---------- 4. Openverse ----------
async function openverse(q, limit = 20) {
  const j = await getJSON("https://api.openverse.org/v1/images/?" + qs({ q, license_type: "commercial,modification", page_size: limit, mature: "false" }));
  return (j?.results || []).map((r) => ({
    title: r.title || q, w: r.width || 0, h: r.height || 0, sha1: "ov-" + r.id, mime: "image/" + (r.filetype || "jpeg"),
    url: r.url, full: r.url, landing: r.foreign_landing_url,
    license: ("CC " + (r.license || "").toUpperCase() + " " + (r.license_version || "")).replace(/^CC (CC0|PDM)/, "$1").trim(),
    author: (r.creator || "").slice(0, 80), date: "", desc: (r.tags || []).map((t) => t.name).slice(0, 10).join(", "),
    cats: "", source: r.source || r.provider,
  }));
}

// ---------- familles anti-doublon ----------
export function familyKey(c) {
  const a = norm(c.author).replace(/[^a-z0-9]/g, "").slice(0, 24);
  const stem = norm(c.title).replace(/^file:/, "").replace(/\(.*?\)|[0-9_\-.]+|jpe?g|png|webp|tiff?/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");
  return a && c.date ? a + "|" + c.date : a + "|" + stem;
}

// ---------- orchestrateur ----------
// req: { topic, context:[mots], entities:[{name,type,context?}], keywords:[...], minWidth? }
export async function sourceImages(req) {
  const t0 = Date.now();
  const context = req.context || [];
  const minW = req.minWidth || 900;
  const ents = await pool(req.entities || [], 4, (e) => resolveEntity(e, context));
  const cand = new Map();
  const add = (c, meta) => {
    const k = c.sha1 || c.url; if (!k || !c.url) return;
    const kind = meta.kind || "photo";
    if (!licenseOk(c.license)) return;
    if (!titleAllowed(c.title, kind)) return;
    if (kind === "photo" && (Math.min(c.w, c.h) < minW * 0.6 || Math.max(c.w, c.h) < minW)) return;
    if (/svg/.test(c.mime) && !["logo", "flag", "map"].includes(kind)) return;
    const prev = cand.get(k);
    if (prev) { prev.score = Math.max(prev.score, meta.score); prev.queries.push(meta.q); return; }
    cand.set(k, { ...c, kind, entity: meta.entity || null, queries: [meta.q], score: meta.score, family: familyKey(c) });
  };
  // entités : portrait / logo / drapeau + catégorie Commons
  const direct = [];
  for (const e of ents) {
    if (e.portrait) direct.push(["File:" + e.portrait, { kind: "portrait", entity: e.name, q: "wikidata:" + e.qid, score: 100 }]);
    if (e.logo && e.type === "org") direct.push(["File:" + e.logo, { kind: "logo", entity: e.name, q: "wikidata:" + e.qid, score: 60 }]);
    if (e.flag && e.type === "place") direct.push(["File:" + e.flag, { kind: "flag", entity: e.name, q: "wikidata:" + e.qid, score: 60 }]);
  }
  const dInfo = await commonsInfo(direct.map((d) => d[0]));
  for (const [t, meta] of direct) { const c = dInfo.find((x) => x.title === t.replace(/_/g, " ")); if (c) add(c, meta); }
  // catégories d'entités (personnes non vérifiées exclues : risque d'homonyme)
  const catJobs = ents.filter((e) => e.commonsCategory && e.verified).map((e) => e);
  await pool(catJobs, 3, async (e) => {
    const titles = await categoryFiles(e.commonsCategory, e.type === "person" ? 30 : 60, e.type === "person" ? 0 : 1);
    const info = await commonsInfo(titles);
    for (const c of info) add(c, { kind: e.type === "person" ? "person" : "photo", entity: e.name, q: "cat:" + e.commonsCategory, score: e.type === "person" ? 70 : 50 });
  });
  // mots-clés : Commons + Openverse
  const kw = req.keywords || [];
  await pool(kw, 3, async (k) => {
    const titles = await commonsSearch(k, 25);
    const info = await commonsInfo(titles);
    const kn = norm(k).split(" ").filter((w) => w.length > 2);
    for (const c of info) {
      const hay = norm(c.title + " " + c.desc + " " + c.cats);
      const hit = kn.filter((w) => hay.includes(w)).length / Math.max(1, kn.length);
      if (hit < 0.5) continue; // pertinence : la majorité des mots doit figurer
      add(c, { kind: "photo", q: "commons:" + k, score: 20 + Math.round(hit * 20) });
    }
    for (const c of await openverse(k, 20)) {
      const hay = norm(c.title + " " + c.desc);
      const hit = kn.filter((w) => hay.includes(w)).length / Math.max(1, kn.length);
      if (hit < 0.5) continue;
      add(c, { kind: "photo", q: "openverse:" + k, score: 15 + Math.round(hit * 20) });
    }
  });
  const list = [...cand.values()].sort((a, b) => b.score - a.score);
  const families = new Set(list.map((c) => c.family));
  return {
    topic: req.topic || null, tookMs: Date.now() - t0,
    entities: ents, stats: { candidates: list.length, families: families.size, bySource: list.reduce((o, c) => { const s = c.queries[0].split(":")[0]; o[s] = (o[s] || 0) + 1; return o; }, {}) },
    candidates: list,
  };
}
