// Génère les images de marque (masque d'intro + écran de fin) en PNG via resvg,
// les héberge dans Blobs, et renvoie leurs URLs. ISOLÉE dans sa propre fonction :
// si resvg (module natif) plante ou est lent, ça n'affecte QUE cette étape —
// l'assemblage vidéo reste léger et robuste. Le front l'appelle avant
// l'assemblage et passe les URLs à assemble-video.

import { maskSvg, outroSvg } from "./_mask-svg.js";
import { storeImagePng } from "./store-image.js";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400 });
  }

  const { title, category, word } = body;
  const host = req.headers.get("host");

  try {
    // Import paresseux du moteur natif : une erreur de chargement est captée ici.
    const { svgToPng } = await import("./_mask-render.js");

    let introMaskUrl = null;
    let outroImgUrl = null;

    if (title) {
      const svg = maskSvg({ title, category, hookWord: word });
      const pngB64 = svgToPng(svg, 1080).toString("base64");
      introMaskUrl = await storeImagePng(pngB64, host);
    }
    const oPngB64 = svgToPng(outroSvg(), 1080).toString("base64");
    outroImgUrl = await storeImagePng(oPngB64, host);

    return new Response(JSON.stringify({ introMaskUrl, outroImgUrl }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Échec (resvg indisponible, stockage KO…) : on renvoie une erreur claire.
    // Le front pourra assembler la vidéo SANS intro/outro plutôt que d'échouer.
    return new Response(JSON.stringify({ error: "Génération images de marque échouée: " + err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/generate-brand-images" };
