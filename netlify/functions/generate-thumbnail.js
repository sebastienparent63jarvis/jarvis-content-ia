// Génère la MINIATURE (couverture) via HCTI (rendu Chrome distant, pixel-parfait).
// Le fond (image Pexels) est intégré dans le HTML ; HCTI compose tout et renvoie
// une URL d'image PNG. Nécessite HCTI_USER_ID / HCTI_API_KEY.

import { maskHtml, renderViaHcti } from "./_mask-html.js";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400 });
  }

  const { bgImage, title, category, word } = body;
  const hookWord = (word || "").toString();
  const titleText = (title || hookWord || "").toString();
  if (!titleText) {
    return new Response(JSON.stringify({ error: "Titre manquant pour la miniature" }), { status: 400 });
  }

  try {
    const html = maskHtml({ title: titleText, category, hookWord, bgUrl: bgImage || null });
    const url = await renderViaHcti(html);
    return new Response(JSON.stringify({ url }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec miniature: " + err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/generate-thumbnail" };
