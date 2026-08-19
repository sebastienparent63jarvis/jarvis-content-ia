// Génère une MINIATURE (couverture) pour le Short : une image fixe 1080x1920,
// fond = une frame d'un clip Pexels de la vidéo, avec le MOT-CHOC du titre
// affiché en très gros. PAS de sous-titres. Sert la grille de chaîne, le
// partage et la conversion en abonnés (peu la découverte, qui vient du flux).
//
// Utilise Shotstack en mode image (output.format = "jpg").
// Variables : SHOTSTACK_API_KEY, SHOTSTACK_ENV ("stage" ou "v1").

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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

  const { bgImage, bgVideo, word } = body;
  const hookWord = (word || "").toString().toUpperCase().slice(0, 24);
  if (!hookWord) {
    return new Response(JSON.stringify({ error: "Mot-choc (word) manquant" }), { status: 400 });
  }

  // Fond : image de préférence, sinon on prend une frame d'un clip vidéo
  // (Shotstack sait extraire une frame d'une vidéo en asset image via trim).
  let bgAsset;
  if (bgImage) {
    bgAsset = { type: "image", src: bgImage };
  } else if (bgVideo) {
    // Une vidéo comme fond d'image : Shotstack prend la frame au temps 0.
    bgAsset = { type: "video", src: bgVideo, trim: 0 };
  } else {
    bgAsset = { type: "html", html: "<div></div>", background: "#0D1321", width: 1080, height: 1920 };
  }

  // Cartouche du mot-choc : très gros, centré, fort contraste, ombre marquée.
  const wordHtml = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:0 40px;box-sizing:border-box;"><p style="font-family:'Open Sans',sans-serif;color:#ffffff;font-size:190px;font-weight:800;text-align:center;line-height:1.05;margin:0;text-shadow:0 6px 30px rgba(0,0,0,0.95),0 2px 8px rgba(0,0,0,1);letter-spacing:-2px;">${escapeHtml(hookWord)}</p></div>`;

  // Léger voile sombre pour que le texte blanc ressorte sur n'importe quel fond.
  const overlayHtml = `<div style="width:100%;height:100%;background:linear-gradient(180deg,rgba(0,0,0,0.15) 0%,rgba(0,0,0,0.45) 60%,rgba(0,0,0,0.65) 100%);"></div>`;

  const timeline = {
    background: "#000000",
    tracks: [
      { clips: [{ asset: { type: "html", html: wordHtml, width: 1080, height: 1920 }, start: 0, length: 1 }] },
      { clips: [{ asset: { type: "html", html: overlayHtml, width: 1080, height: 1920 }, start: 0, length: 1 }] },
      { clips: [{ asset: bgAsset, start: 0, length: 1, fit: "cover" }] },
    ],
  };

  const payload = {
    timeline,
    output: {
      format: "jpg",
      size: { width: 1080, height: 1920 },
    },
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
    // Renvoie l'id de rendu : l'interface poll render-status comme pour la vidéo.
    return new Response(JSON.stringify({ id: data.response?.id }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec miniature: " + err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/generate-thumbnail",
};
