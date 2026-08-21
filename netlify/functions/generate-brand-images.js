// Génère les images de marque (masque d'intro transparent + écran de fin) via
// HCTI, et renvoie leurs URLs (HCTI les héberge — pas besoin de Blobs).
// Ces URLs sont ensuite données à Shotstack comme calques image.

import { maskHtml, outroHtml, renderViaHcti } from "./_mask-html.js";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400 });
  }

  const { title, category, word, bgImage } = body;

  try {
    let introMaskUrl = null;
    if (title) {
      // Intro = masque incrusté SUR la première image Pexels (opaque, comme la
      // miniature). Plus de problème de transparence : l'intro est une image
      // pleine qui s'affiche puis balaie pour révéler la vidéo.
      const html = maskHtml({ title, category, hookWord: word, bgUrl: bgImage || null });
      introMaskUrl = await renderViaHcti(html);
    }
    const outroImgUrl = await renderViaHcti(outroHtml());

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
