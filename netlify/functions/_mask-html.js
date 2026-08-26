// Masque Actu Crue en HTML/CSS, rendu pixel-parfait par HTML/CSS to Image (HCTI)
// — un vrai Chrome distant. Remplace resvg (module natif fragile sur Netlify).
// Nécessite les variables HCTI_USER_ID et HCTI_API_KEY (créées sur
// htmlcsstoimage.com, offre gratuite 50 images/mois).

export const BRAND = {
  purple: "#7D4698",
  purpleLight: "#b085d0",
  white: "#ffffff",
};

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Construit le HTML complet du masque 1080x1920. Si bgUrl est fourni, il sert de
// fond (miniature) ; sinon fond transparent (intro vidéo superposée).
export function maskHtml({ title, category, hookWord, bgUrl }) {
  const B = BRAND;
  const rawTitle = (title || "").toString();
  let head = esc(rawTitle);

  // Colorise UN mot-clé de référence en violet clair. On tente dans l'ordre :
  // 1) le hookWord fourni s'il apparaît dans le titre ; 2) un nombre/montant
  // (ex "100$", "3,5%", "40") ; 3) le mot le plus long du titre (>4 lettres).
  // Ainsi la colorisation marche même si le thumbnail_word n'est pas dans le titre.
  const colorOne = (pattern) => {
    try {
      const re = new RegExp("(" + pattern + ")", "i");
      if (re.test(head)) { head = head.replace(re, `<b>$1</b>`); return true; }
    } catch { /* ignore */ }
    return false;
  };
  const escRe = (s) => esc(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let done = false;
  if (hookWord && hookWord.toString().trim()) {
    done = colorOne(escRe(hookWord.toString().trim()));
  }
  if (!done) {
    // nombre éventuellement suivi de € $ % ou précédé, ex "100$", "3,5 %", "12 €"
    done = colorOne("\\d[\\d\\s.,]*\\s?(?:%|€|\\$|euros?)?");
  }
  if (!done) {
    // mot le plus long du titre (hors petits mots)
    const words = rawTitle.split(/\s+/).filter(w => w.replace(/[^\wÀ-ÿ]/g, "").length > 4);
    if (words.length) {
      const longest = words.sort((a, b) => b.length - a.length)[0];
      colorOne(escRe(longest));
    }
  }

  let catLabel = (category || "").toString().trim();
  if (catLabel.length > 30) catLabel = catLabel.slice(0, 30).replace(/[\s,(]+\S*$/, "") + "…";
  const catHtml = catLabel
    ? `<span class="cat">${esc(catLabel)}</span>` : "";

  const tlen = (title || "").length;
  const titleSize = tlen > 60 ? 66 : tlen > 45 ? 76 : 88;

  const bgLayer = bgUrl
    ? `<img class="bg" src="${esc(bgUrl)}"/>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:1080px;height:1920px;overflow:hidden;font-family:'Inter',sans-serif;background:${bgUrl ? "#000" : "transparent"} !important;}
    .frame{position:relative;width:1080px;height:1920px;background:${bgUrl ? "#000" : "transparent"};}
    .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
    .veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,14,22,0.42) 0%,rgba(10,14,22,0) 26%,rgba(10,14,22,0) 52%,rgba(10,14,22,0.96) 100%);}
    .badge{position:absolute;top:54px;left:54px;display:flex;align-items:center;}
    .badge .ac{background:${B.purple};color:${B.white};font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:42px;letter-spacing:-1px;padding:8px 20px;border-radius:12px;}
    .badge .nm{color:${B.white};font-weight:800;font-size:34px;letter-spacing:0.14em;margin-left:24px;}
    .band{position:absolute;left:0;right:0;bottom:0;padding:0 58px 80px;}
    .cat{display:inline-block;color:${B.white};background:${B.purple};font-size:30px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;padding:10px 22px;border-radius:9px;margin-bottom:28px;}
    .title{color:${B.white};font-weight:900;font-size:${titleSize}px;line-height:1.03;letter-spacing:-0.02em;}
    .title b{color:${B.purpleLight};font-weight:900;}
  </style></head><body>
    <div class="frame">
      ${bgLayer}
      <div class="veil"></div>
      <div class="badge"><span class="ac">AC</span><span class="nm">ACTU CRUE</span></div>
      <div class="band">${catHtml}<div class="title">${head}</div></div>
    </div>
  </body></html>`;
}

// Variante MINIATURE 16:9 (1280x720) pour la couverture YouTube (hors fil Shorts).
// Mise en page horizontale : badge haut-gauche, titre bas-gauche sur ~2/3 de la
// largeur pour laisser respirer l'image à droite.
export function maskHtml169({ title, category, hookWord, bgUrl }) {
  const B = BRAND;
  const rawTitle = (title || "").toString();
  let head = esc(rawTitle);
  const colorOne = (pattern) => {
    try {
      const re = new RegExp("(" + pattern + ")", "i");
      if (re.test(head)) { head = head.replace(re, `<b>$1</b>`); return true; }
    } catch { /* ignore */ }
    return false;
  };
  const escRe = (s) => esc(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let done = false;
  if (hookWord && hookWord.toString().trim()) done = colorOne(escRe(hookWord.toString().trim()));
  if (!done) done = colorOne("\\d[\\d\\s.,]*\\s?(?:%|€|\\$|euros?)?");
  if (!done) {
    const words = rawTitle.split(/\s+/).filter(w => w.replace(/[^\wÀ-ÿ]/g, "").length > 4);
    if (words.length) colorOne(escRe(words.sort((a, b) => b.length - a.length)[0]));
  }

  let catLabel = (category || "").toString().trim();
  if (catLabel.length > 34) catLabel = catLabel.slice(0, 34).replace(/[\s,(]+\S*$/, "") + "…";
  const catHtml = catLabel ? `<span class="cat">${esc(catLabel)}</span>` : "";

  const tlen = rawTitle.length;
  const titleSize = tlen > 55 ? 60 : tlen > 38 ? 72 : 84;
  const bgLayer = bgUrl ? `<img class="bg" src="${esc(bgUrl)}"/>` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:1280px;height:720px;overflow:hidden;font-family:'Inter',sans-serif;background:#000 !important;}
    .frame{position:relative;width:1280px;height:720px;background:#000;}
    .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
    .veil{position:absolute;inset:0;background:linear-gradient(115deg,rgba(10,14,22,0.92) 0%,rgba(10,14,22,0.72) 38%,rgba(10,14,22,0.15) 70%,rgba(10,14,22,0) 100%);}
    .badge{position:absolute;top:44px;left:48px;display:flex;align-items:center;}
    .badge .ac{background:${B.purple};color:${B.white};font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:38px;letter-spacing:-1px;padding:7px 18px;border-radius:11px;}
    .badge .nm{color:${B.white};font-weight:800;font-size:30px;letter-spacing:0.14em;margin-left:20px;}
    .band{position:absolute;left:48px;bottom:52px;width:72%;}
    .cat{display:inline-block;color:${B.white};background:${B.purple};font-size:26px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;padding:8px 18px;border-radius:8px;margin-bottom:22px;}
    .title{color:${B.white};font-weight:900;font-size:${titleSize}px;line-height:1.04;letter-spacing:-0.02em;text-shadow:0 2px 16px rgba(0,0,0,0.5);}
    .title b{color:${B.purpleLight};font-weight:900;}
  </style></head><body>
    <div class="frame">
      ${bgLayer}
      <div class="veil"></div>
      <div class="badge"><span class="ac">AC</span><span class="nm">ACTU CRUE</span></div>
      <div class="band">${catHtml}<div class="title">${head}</div></div>
    </div>
  </body></html>`;
}

// HTML de l'écran de fin (outro) : fond violet plein + tampon AC + nom.
export function outroHtml() {
  const B = BRAND;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:1080px;height:1920px;overflow:hidden;}
    .frame{width:1080px;height:1920px;background:${B.purple};display:flex;align-items:center;justify-content:center;}
    .in{text-align:center;}
    .ac{font-family:'Anton',sans-serif;font-size:300px;color:${B.white};line-height:0.8;letter-spacing:-12px;}
    .rule{width:120px;height:8px;background:${B.white};margin:22px auto 0;border-radius:4px;}
    .tag{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:52px;letter-spacing:12px;color:${B.white};margin-top:24px;}
  </style></head><body>
    <div class="frame"><div class="in"><div class="ac">AC</div><div class="rule"></div><div class="tag">ACTU CRUE</div></div></div>
  </body></html>`;
}

// Appelle HCTI pour transformer le HTML en image. Renvoie l'URL PNG.
export async function renderViaHcti(html, { transparent = false, width = 1080, height = 1920 } = {}) {
  const userId = process.env.HCTI_USER_ID;
  const apiKey = process.env.HCTI_API_KEY;
  if (!userId || !apiKey) {
    throw new Error("HCTI_USER_ID / HCTI_API_KEY non configurés sur Netlify");
  }
  const auth = Buffer.from(`${userId}:${apiKey}`).toString("base64");
  const payload = {
    html,
    google_fonts: "Inter:wght@600;800;900|Space Grotesk:wght@700|Anton",
    viewport_width: width,
    viewport_height: height,
    device_scale: 1,
  };
  // Pour l'intro : fond transparent (le masque se superpose à la vidéo).
  if (transparent) payload.transparent = true;

  const res = await fetch("https://hcti.io/v1/image", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Basic ${auth}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error("HCTI: " + (data.message || data.error || `HTTP ${res.status}`));
  }
  // On force le format PNG (supporte la transparence).
  return data.url + ".png";
}
