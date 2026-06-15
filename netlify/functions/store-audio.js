// Phase 4a — Hébergement de l'audio dans Netlify Blobs.
// Reçoit l'audio (base64) généré par ElevenLabs, le stocke dans un store
// persistant, et renvoie une URL publique que Shotstack pourra télécharger
// pour l'assemblage vidéo.
//
// Cette même infrastructure (Netlify Blobs) servira aussi à la mémoire
// anti-répétition des sujets et aux réglages persistants (Phase 6).

import { getStore } from "@netlify/blobs";

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

  // Clé unique pour ce fichier audio (réutilise celle fournie ou en génère une).
  const blobKey = key || `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;

  try {
    const store = getStore({ name: "jarvis-audio", consistency: "strong" });

    // Décode le base64 en binaire avant stockage.
    const buffer = Buffer.from(audio_base64, "base64");
    await store.set(blobKey, buffer, {
      metadata: { contentType: "audio/mpeg", createdAt: new Date().toISOString() },
    });

    // URL publique servie par notre fonction de lecture (serve-audio).
    const host = req.headers.get("host");
    const proto = host && host.includes("localhost") ? "http" : "https";
    const publicUrl = `${proto}://${host}/api/serve-audio?key=${encodeURIComponent(blobKey)}`;

    return new Response(
      JSON.stringify({ key: blobKey, url: publicUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec stockage audio: " + err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/store-audio",
};
