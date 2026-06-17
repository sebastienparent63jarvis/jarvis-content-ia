// Calage voix/sous-titres — Génération audio SEGMENT PAR SEGMENT.
// Au lieu d'un seul fichier audio pour tout le script (timing estimé), on
// génère un audio par segment, on mesure sa durée RÉELLE, puis on stocke
// chaque morceau. La timeline Shotstack pourra ainsi caler chaque sous-titre
// exactement sur la durée réelle de sa narration. Fini le décalage.
//
// Variables d'environnement : ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
// + Netlify Blobs pour stocker les segments audio.

import { getStore } from "@netlify/blobs";
import { parseBuffer } from "music-metadata";

function openStore() {
  try {
    return getStore({ name: "jarvis-audio", consistency: "strong" });
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) {
      return getStore({ name: "jarvis-audio", siteID, token, consistency: "strong" });
    }
    throw e;
  }
}

// Réutilise la normalisation TTS (symboles + homographes) du fichier
// generate-audio. Dupliquée ici pour rester autonome.
function normalizeForTTS(input) {
  let t = input;
  const homographs = [
    [/\btu param[èe]tres\b/gi, "tu programmes"],
    [/\bje param[èe]tre\b/gi, "je programme"],
  ];
  for (const [re, rep] of homographs) t = t.replace(re, rep);
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

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ELEVENLABS_API_KEY non configurée" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400 });
  }

  const { segments, voiceId: reqVoice } = body;
  if (!Array.isArray(segments) || segments.length === 0) {
    return new Response(JSON.stringify({ error: "segments manquants" }), { status: 400 });
  }

  const voiceId = reqVoice || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const host = req.headers.get("host");
  const proto = host && host.includes("localhost") ? "http" : "https";

  // Garde-fou : longueur totale raisonnable
  const totalChars = segments.reduce((sum, s) => sum + (s.text || "").length, 0);
  if (totalChars > 2000) {
    return new Response(
      JSON.stringify({ error: `Texte total trop long (${totalChars} car., max 2000).` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const store = openStore();
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const results = [];

    for (let i = 0; i < segments.length; i++) {
      const text = normalizeForTTS(segments[i].text || "");
      if (!text) {
        results.push({ index: i, error: "segment vide" });
        continue;
      }

      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.6, similarity_boost: 0.75 },
        }),
      });

      if (!ttsRes.ok) {
        let detail = "";
        try { detail = JSON.stringify(await ttsRes.json()); } catch { detail = await ttsRes.text(); }
        return new Response(
          JSON.stringify({ error: `Erreur ElevenLabs segment ${i} (${ttsRes.status}): ${detail}` }),
          { status: ttsRes.status, headers: { "Content-Type": "application/json" } }
        );
      }

      const arrayBuf = await ttsRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      // Mesure la durée RÉELLE du segment audio.
      let duration = null;
      try {
        const meta = await parseBuffer(buffer, { mimeType: "audio/mpeg" });
        duration = meta.format.duration || null;
      } catch { duration = null; }

      // Stocke le segment audio dans Blobs.
      const key = `seg-${batchId}-${i}.mp3`;
      await store.set(key, buffer, { metadata: { contentType: "audio/mpeg" } });
      const url = `${proto}://${host}/api/serve-audio?key=${encodeURIComponent(key)}`;

      results.push({
        index: i,
        url,
        key,
        duration, // secondes réelles (ou null si mesure impossible)
        chars: text.length,
      });
    }

    const totalDuration = results.reduce((s, r) => s + (r.duration || 0), 0);

    return new Response(
      JSON.stringify({ batchId, segments: results, totalDuration }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec génération audio segmentée: " + err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/generate-audio-segments",
};
