// Génère les images de marque via HCTI et renvoie leurs URLs.
// - INTRO : variable (titre + image du jour) → générée à chaque fois.
// - OUTRO : STRICTEMENT identique à chaque vidéo → générée UNE SEULE FOIS puis
//   mise en cache dans Blobs (clé "outro-url"). Économise une image HCTI par
//   vidéo. Pour forcer une régénération (si tu changes le design de l'outro),
//   appeler avec { refreshOutro: true }.

import { maskHtml, outroHtml, renderViaHcti } from "./_mask-html.js";
import { getStore } from "@netlify/blobs";

function openStore() {
  try { return getStore({ name: "jarvis-brand-cache", consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name: "jarvis-brand-cache", siteID, token, consistency: "strong" });
    throw e;
  }
}

// Renvoie l'URL de l'outro : depuis le cache si dispo, sinon la génère et la cache.
async function getOutroUrl(refresh) {
  let store = null;
  try { store = openStore(); } catch { store = null; }

  if (store && !refresh) {
    try {
      const cached = await store.get("outro-url");
      if (cached) return cached;
    } catch { /* pas de cache encore */ }
  }

  const url = await renderViaHcti(outroHtml());
  if (store) { try { await store.set("outro-url", url); } catch { /* best effort */ } }
  return url;
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400 });
  }

  const { title, category, word, bgImage, refreshOutro } = body;

  try {
    // INTRO : variable → générée à chaque fois (titre + image du jour).
    let introMaskUrl = null;
    if (title) {
      const html = maskHtml({ title, category, hookWord: word, bgUrl: bgImage || null });
      introMaskUrl = await renderViaHcti(html);
    }

    // OUTRO : identique → mise en cache (1 seule génération HCTI au total).
    const outroImgUrl = await getOutroUrl(!!refreshOutro);

    return new Response(JSON.stringify({ introMaskUrl, outroImgUrl }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Génération images de marque échouée: " + err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/generate-brand-images" };
