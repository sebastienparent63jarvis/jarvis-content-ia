// Additif (pilote long-format) — relit le manifeste de la génération voix+timestamps.
// GET /api/pilote-tts-result            -> dernier run ("last")
// GET /api/pilote-tts-result?runId=...  -> un run précis
// GET /api/pilote-tts-result?meta=1     -> manifeste SANS les tableaux de mots (léger)

import { getStore } from "@netlify/blobs";

function store(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
    throw e;
  }
}

// Découpe les mots horodatés en lignes de sous-titres (<= maxChars, coupe aux
// ponctuations fortes). Renvoie [{t,s,e}] : texte, début, fin (relatifs au segment).
function chunkWords(words, maxChars = 42) {
  const lines = [];
  let cur = [], len = 0;
  const strong = /[.,;:!?]$/;
  const flush = () => {
    if (!cur.length) return;
    lines.push({ t: cur.map((w) => w.w).join(" "), s: cur[0].start, e: cur[cur.length - 1].end });
    cur = []; len = 0;
  };
  for (const w of words) {
    const add = (len ? 1 : 0) + w.w.length;
    if (len && len + add > maxChars) flush();
    cur.push(w); len += add;
    if (strong.test(w.w) && len >= 16) flush();
  }
  flush();
  return lines;
}

export default async (req) => {
  const u = new URL(req.url);
  const runId = u.searchParams.get("runId");
  const meta = u.searchParams.get("meta");
  const subs = u.searchParams.get("subs");
  try {
    const s = store("jarvis-pilote-tts");
    const rec = await s.get(runId || "last", { type: "json" });
    if (!rec) return json({ status: "none" });
    if (subs && rec.manifest) {
      const segs = rec.manifest.map((m) => ({
        id: m.id, url: m.url, duration: m.duration,
        lines: m.words ? chunkWords(m.words) : [], error: m.error,
      }));
      return json({ status: rec.status, count: segs.length, segs });
    }
    if (meta && rec.manifest) {
      rec.manifest = rec.manifest.map((m) => ({ id: m.id, url: m.url, duration: m.duration, nbWords: m.words ? m.words.length : 0, error: m.error }));
    }
    return json(rec);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const config = { path: "/api/pilote-tts-result" };
