// Génère la MINIATURE (couverture) du Short au format de marque Actu Crue :
// fond = frame d'un clip Pexels de la vidéo, masque violet Tor par-dessus
// (badge AC + rubrique + titre), SANS sous-titres. Cohérent avec l'intro vidéo.
//
// Utilise Shotstack en mode image (output.format = "jpg").
// Variables : SHOTSTACK_API_KEY, SHOTSTACK_ENV ("stage" ou "v1").

import { brandGradientHtml, brandBadgeHtml, brandBandHtml } from "./_brand.js";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.SHOTSTACK_API_KEY;
  const env = process.env.SHOTSTACK_ENV || "stage";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "SHOTSTACK_API_KEY non configurée" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400 });
  }

  // On accepte le titre, la catégorie et le mot-choc (fournis par le script).
  const { bgImage, bgVideo, title, category, word } = body;
  const hookWord = (word || "").toString();
  const titleText = (title || hookWord || "").toString();
  if (!titleText) {
    return new Response(JSON.stringify({ error: "Titre manquant pour la miniature" }), { status: 400 });
  }

  // Fond : image, sinon frame d'un clip vidéo, sinon violet uni.
  let bgAsset;
  if (bgImage) {
    bgAsset = { type: "image", src: bgImage };
  } else if (bgVideo) {
    bgAsset = { type: "video", src: bgVideo, trim: 0 };
  } else {
    bgAsset = { type: "html", html: `<div style="width:100%;height:100%;background:#7D4698;"></div>`, width: 1080, height: 1920 };
  }

  // Chaque pièce du masque est un clip séparé, positionné par Shotstack
  // (position + offset) — c'est la seule méthode fiable, Shotstack ignore le
  // position:absolute interne d'un gros bloc HTML.
  const L = { start: 0, length: 1 };
  const timeline = {
    background: "#000000",
    fonts: [
      { src: "https://github.com/google/fonts/raw/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf" },
      { src: "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf" },
    ],
    tracks: [
      // Badge haut-gauche
      { clips: [{ asset: { type: "html", html: brandBadgeHtml(), width: 620, height: 70 },
        ...L, position: "topLeft", offset: { x: 0.03, y: -0.02 } }] },
      // Bandeau bas (catégorie + titre)
      { clips: [{ asset: { type: "html", html: brandBandHtml({ title: titleText, category, hookWord }), width: 964, height: 620 },
        ...L, position: "bottomLeft", offset: { x: 0.045, y: 0.03 } }] },
      // Voile dégradé plein cadre
      { clips: [{ asset: { type: "html", html: brandGradientHtml(), width: 1080, height: 1920 }, ...L }] },
      // Fond (image/vidéo Pexels)
      { clips: [{ asset: bgAsset, ...L, fit: "cover" }] },
    ],
  };

  const payload = {
    timeline,
    output: { format: "jpg", size: { width: 1080, height: 1920 } },
  };

  try {
    const res = await fetch(`https://api.shotstack.io/${env}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.message || "Erreur Shotstack", raw: data }), {
        status: res.status, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: data.response?.id }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec miniature: " + err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/generate-thumbnail" };
