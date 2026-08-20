// Génère la MINIATURE (couverture) du Short au format de marque Actu Crue.
// Approche SVG pixel-parfait (resvg), SANS Shotstack : on récupère l'image de
// preview du clip Pexels, on compose le masque Actu Crue (badge + catégorie +
// titre, mot-choc en violet) par-dessus, et on renvoie le PNG final en base64.
// Rendu identique au design validé, léger et robuste.

import { maskSvg } from "./_mask-svg.js";
import { svgToPng, compositeMaskOverImage } from "./_mask-render.js";

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
    const svg = maskSvg({ title: titleText, category, hookWord });

    let png;
    if (bgImage) {
      // Récupère l'image de fond (preview du clip Pexels) et compose le masque.
      const resp = await fetch(bgImage);
      if (!resp.ok) throw new Error("Impossible de récupérer l'image de fond");
      const bgBuf = Buffer.from(await resp.arrayBuffer());
      png = compositeMaskOverImage(svg, bgBuf, 1080, 1920);
    } else {
      // Pas de fond : masque sur fond violet uni.
      const solid = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1920" fill="#7D4698"/></svg>`;
      const solidPng = svgToPng(solid, 1080);
      png = compositeMaskOverImage(svg, solidPng, 1080, 1920);
    }

    const base64 = png.toString("base64");
    return new Response(JSON.stringify({ image_base64: base64, mime: "image/png" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec miniature: " + err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/generate-thumbnail" };
