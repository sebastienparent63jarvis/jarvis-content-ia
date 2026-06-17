// Phase 4a — Lecture publique de l'audio stocké dans Netlify Blobs.
// Sert le fichier MP3 avec le bon Content-Type pour que Shotstack (ou un
// lecteur navigateur) puisse le télécharger via une URL stable.

import { getStore } from "@netlify/blobs";

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
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return new Response(JSON.stringify({ error: "Paramètre 'key' manquant" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const store = openStore();
    const data = await store.get(key, { type: "arrayBuffer" });

    if (!data) {
      return new Response(JSON.stringify({ error: "Audio introuvable" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec lecture audio: " + err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/serve-audio",
};
