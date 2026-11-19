// Phase 4a — Hébergement de l'audio dans Netlify Blobs.
// Reçoit l'audio (base64) généré par ElevenLabs, le stocke dans un store
// persistant, et renvoie une URL publique que Shotstack pourra télécharger
// pour l'assemblage vidéo.

import { getStore } from "@netlify/blobs";

// Initialise le store de façon robuste : tente l'auto-configuration (runtime
// Netlify v2), et en cas d'échec, passe explicitement siteID + token via les
// variables d'environnement automatiques de Netlify.
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

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400 });
  }

  const { audio_base64, key } = body;
  if (!audio_base64) {
    return new Response(JSON.stringify({ error: "Champ 'audio_base64' manquant" }), { status: 400 });
  }

  const blobKey = key || `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;

  try {
    const store = openStore();
    const buffer = Buffer.from(audio_base64, "base64");
    await store.set(blobKey, buffer, {
      metadata: { contentType: "audio/mpeg", createdAt: new Date().toISOString() },
    });

    const host = req.headers.get("host");
    const proto = host && host.includes("localhost") ? "http" : "https";
    const publicUrl = `${proto}://${host}/api/serve-audio?key=${encodeURIComponent(blobKey)}`;

    return new Response(
      JSON.stringify({ key: blobKey, url: publicUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Échec stockage audio (Blobs): " + err.message + " — vérifie que Netlify Blobs est activé sur le site." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = {
  path: "/api/store-audio",
};
