// Additif (pilote long-format) — génère la voix off AVEC timestamps au mot.
// Pour chaque segment : appelle ElevenLabs /with-timestamps, stocke le MP3 dans
// le store Blobs existant "jarvis-audio" (servi par /api/serve-audio), convertit
// l'alignement caractère en timings de mots, et écrit un MANIFESTE dans le store
// "jarvis-pilote-tts" (clés : <runId> et "last"). Fonction BACKGROUND (jusqu'à
// 15 min) : renvoie 202 immédiatement. N'altère aucune fonction du pipeline.
//
// POST { segments:[{id,text}], voiceId }  -> 202 { accepted, runId }

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

// Normalisation TTS (reprise de generate-audio.js : nombres, €, %, $, k).
function normalizeForTTS(input) {
  let t = input;
  t = t.replace(/(\d+)[.,](\d+)\s*k\b/gi, (_, a, b) => `${a} mille ${b} cent`);
  t = t.replace(/(\d+)\s*k\b/gi, (_, a) => `${a} mille`);
  t = t.replace(/(\d[\d\s.,]*)\s*€/g, (_, n) => `${n.trim()} euros`);
  t = t.replace(/€/g, " euros");
  t = t.replace(/(\d[\d\s.,]*)\s*%/g, (_, n) => `${n.trim()} pour cent`);
  t = t.replace(/%/g, " pour cent");
  t = t.replace(/\$\s*(\d[\d\s.,]*)/g, (_, n) => `${n.trim()} dollars`);
  t = t.replace(/(\d[\d\s.,]*)\s*\$/g, (_, n) => `${n.trim()} dollars`);
  t = t.replace(/\$/g, " dollars");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t;
}

// Reconstruit des mots {w,start,end} à partir de l'alignement caractère ElevenLabs.
function wordsFromAlignment(al) {
  const chars = al && al.characters;
  const st = al && al.character_start_times_seconds;
  const en = al && al.character_end_times_seconds;
  if (!Array.isArray(chars) || !Array.isArray(st) || !Array.isArray(en)) return [];
  const words = [];
  let cur = "", start = null, end = null;
  const flush = () => { if (cur.trim()) words.push({ w: cur, start, end }); cur = ""; start = null; end = null; };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === " " || c === "\n" || c === "\t") { flush(); continue; }
    if (start === null) start = st[i];
    end = en[i];
    cur += c;
  }
  flush();
  return words;
}

export default async (req) => {
  let body = {};
  try { body = await req.json(); } catch {}
  const segments = Array.isArray(body.segments) ? body.segments : [];
  const voiceId = body.voiceId || process.env.ELEVENLABS_VOICE_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const runId = `tts-${Date.now()}`;

  const outStore = store("jarvis-pilote-tts");
  // Marqueur "en cours" immédiat (le background peut durer une minute ou deux).
  try { await outStore.set("last", JSON.stringify({ runId, status: "running", startedAt: new Date().toISOString(), manifest: [] })); } catch {}

  if (!apiKey || !voiceId || segments.length === 0) {
    const err = { runId, status: "error", error: !apiKey ? "ELEVENLABS_API_KEY manquante" : !voiceId ? "voiceId manquant" : "segments vide" };
    try { await outStore.set("last", JSON.stringify(err)); } catch {}
    return new Response(JSON.stringify(err), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const host = req.headers.get("host");
  const proto = host && host.includes("localhost") ? "http" : "https";
  const audioStore = store("jarvis-audio");
  const manifest = [];

  for (const seg of segments) {
    try {
      const text = normalizeForTTS(String(seg.text || ""));
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (!r.ok) {
        const detail = await r.text();
        manifest.push({ id: seg.id, error: `ElevenLabs ${r.status}: ${detail.slice(0, 200)}` });
        continue;
      }
      const d = await r.json();
      const buf = Buffer.from(d.audio_base64, "base64");
      const prefix = String(body.prefix || "pilote-nvidia").replace(/[^a-z0-9-]/gi, "").slice(0, 60) || "pilote-nvidia";
      const key = `${prefix}-${seg.id}.mp3`;
      await audioStore.set(key, buf, { metadata: { contentType: "audio/mpeg", createdAt: new Date().toISOString() } });
      const url = `${proto}://${host}/api/serve-audio?key=${encodeURIComponent(key)}`;
      const al = d.alignment || d.normalized_alignment || {};
      const words = wordsFromAlignment(al);
      const ends = al.character_end_times_seconds;
      const duration = Array.isArray(ends) && ends.length ? ends[ends.length - 1] : (words.length ? words[words.length - 1].end : 0);
      manifest.push({ id: seg.id, text: seg.text, url, duration, words });
      // Sauvegarde incrémentale (permet de suivre l'avancée via "last").
      try { await outStore.set("last", JSON.stringify({ runId, status: "running", manifest })); } catch {}
    } catch (e) {
      manifest.push({ id: seg.id, error: e.message });
    }
  }

  const done = { runId, status: "done", finishedAt: new Date().toISOString(), count: manifest.length, manifest };
  try { await outStore.set(runId, JSON.stringify(done)); } catch {}
  try { await outStore.set("last", JSON.stringify(done)); } catch {}
  return new Response(JSON.stringify({ accepted: true, runId, count: manifest.length }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
};

export const config = { path: "/api/pilote-tts-run" };
