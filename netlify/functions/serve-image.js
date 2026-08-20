// Sert une image PNG stockée dans Blobs (calque masque de l'intro vidéo).

import { getStore } from "@netlify/blobs";

function openStore() {
  try {
    return getStore({ name: "jarvis-images", consistency: "strong" });
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) {
      return getStore({ name: "jarvis-images", siteID, token, consistency: "strong" });
    }
    throw e;
  }
}

export default async (req, context) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return new Response(JSON.stringify({ error: "Paramètre 'key' manquant" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const store = openStore();
    const data = await store.get(key, { type: "arrayBuffer" });
    if (!data) {
      return new Response(JSON.stringify({ error: "Image introuvable" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec lecture image: " + err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/serve-image" };
