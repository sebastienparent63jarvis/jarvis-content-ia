// Héberge une image PNG (base64) dans Netlify Blobs et renvoie une URL publique
// que Shotstack peut télécharger (utilisé pour le calque masque de l'intro).

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

export async function storeImagePng(base64, host) {
  const blobKey = `mask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const store = openStore();
  const buffer = Buffer.from(base64, "base64");
  await store.set(blobKey, buffer, { metadata: { contentType: "image/png" } });
  const proto = host && host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}/api/serve-image?key=${encodeURIComponent(blobKey)}`;
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }
  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400 });
  }
  const { image_base64 } = body;
  if (!image_base64) {
    return new Response(JSON.stringify({ error: "image_base64 manquant" }), { status: 400 });
  }
  try {
    const url = await storeImagePng(image_base64, req.headers.get("host"));
    return new Response(JSON.stringify({ url }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec stockage image: " + err.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/store-image" };
