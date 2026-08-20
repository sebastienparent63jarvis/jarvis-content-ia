// Module partagé : identité de marque Actu Crue.
// Génère le HTML du masque (badge AC + catégorie + titre) utilisé à la fois
// pour la miniature de couverture ET l'écran d'intro de la vidéo, afin que les
// deux soient rigoureusement cohérents.

export const BRAND = {
  purple: "#7D4698",     // violet Tor officiel
  purpleLight: "#b085d0",
  ink: "#0E1016",
  white: "#ffffff",
};

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ─── PIÈCES SÉPARÉES pour Shotstack ──────────────────────────────────────────
// Shotstack ne respecte PAS le position:absolute interne d'un gros bloc HTML :
// tout s'empile au centre. La méthode fiable (celle des sous-titres) est de
// découper en plusieurs clips, chacun positionné par les propriétés natives
// Shotstack (position + offset). Ces builders renvoient des blocs compacts
// centrés dans leur propre toile.

// Voile dégradé plein cadre (assombrit le bas pour lisibilité du titre).
export function brandGradientHtml() {
  return `<div style="width:100%;height:100%;background:linear-gradient(180deg,rgba(10,14,22,0.42) 0%,rgba(10,14,22,0) 26%,rgba(10,14,22,0) 55%,rgba(10,14,22,0.96) 100%);"></div>`;
}

// Badge "AC · ACTU CRUE" — bloc compact, aligné à gauche dans sa toile.
// Placé par Shotstack en haut-gauche via position/offset.
export function brandBadgeHtml() {
  const B = BRAND;
  return `<div style="display:flex;align-items:center;justify-content:flex-start;width:100%;height:100%;font-family:'Inter','Open Sans',sans-serif;">
    <span style="display:inline-block;background:${B.purple};color:${B.white};font-family:'Space Grotesk','Open Sans',sans-serif;font-weight:700;font-size:40px;letter-spacing:-1px;padding:6px 18px;border-radius:10px;">AC</span>
    <span style="display:inline-block;margin-left:24px;color:${B.white};font-weight:800;font-size:34px;letter-spacing:0.14em;">ACTU CRUE</span>
  </div>`;
}

// Bandeau bas : pastille catégorie + titre. Bloc compact aligné en bas-gauche.
export function brandBandHtml({ title, category, hookWord }) {
  const B = BRAND;
  let headHtml = esc(title || "");
  if (hookWord) {
    const hw = esc(hookWord);
    const re = new RegExp("(" + hw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i");
    headHtml = headHtml.replace(re, `<b style="color:${B.purpleLight}">$1</b>`);
  }
  let catLabel = (category || "").toString().trim();
  if (catLabel.length > 28) catLabel = catLabel.slice(0, 28).replace(/[\s,(]+\S*$/, "") + "…";
  const catHtml = catLabel
    ? `<span style="display:inline-block;color:${B.white};background:${B.purple};font-size:30px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;padding:10px 22px;border-radius:9px;margin-bottom:24px;font-family:'Inter','Open Sans',sans-serif;">${esc(catLabel)}</span>`
    : "";
  const tlen = (title || "").length;
  const titleSize = tlen > 60 ? 66 : tlen > 45 ? 76 : 88;
  return `<div style="display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;width:100%;height:100%;font-family:'Inter','Open Sans',sans-serif;">
    ${catHtml}
    <div style="color:${B.white};font-weight:900;font-size:${titleSize}px;line-height:1.03;letter-spacing:-0.02em;">${headHtml}</div>
  </div>`;
}

// Masque de marque plein cadre 1080x1920. Fond transparent : on le superpose
// sur l'image/vidéo. `title` = titre court, `category` = rubrique, `hookWord`
// = mot du titre à colorer en violet clair (optionnel).
export function brandMaskHtml({ title, category, hookWord }) {
  const B = BRAND;
  let headHtml = esc(title || "");
  // Colore le mot-choc en violet clair s'il apparaît dans le titre.
  if (hookWord) {
    const hw = esc(hookWord);
    const re = new RegExp("(" + hw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i");
    headHtml = headHtml.replace(re, `<b style="color:${B.purpleLight}">$1</b>`);
  }
  // Sécurité : si la catégorie est trop longue (le modèle a parfois mis une
  // phrase), on la tronque pour la pastille (max ~28 caractères).
  let catLabel = (category || "").toString().trim();
  if (catLabel.length > 28) catLabel = catLabel.slice(0, 28).replace(/[\s,(]+\S*$/, "") + "…";

  const catHtml = catLabel
    ? `<span style="display:inline-block;color:${B.white};background:${B.purple};font-size:30px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;padding:10px 22px;border-radius:9px;margin-bottom:28px;font-family:'Inter','Open Sans',sans-serif;">${esc(catLabel)}</span>`
    : "";

  // Taille du titre adaptative : plus le titre est long, plus on réduit, pour
  // qu'il reste dans le bandeau bas et ne remonte pas au centre.
  const tlen = (title || "").length;
  const titleSize = tlen > 60 ? 66 : tlen > 45 ? 76 : 88;

  return `<div style="position:relative;width:1080px;height:1920px;font-family:'Inter','Open Sans',sans-serif;">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,14,22,0.42) 0%,rgba(10,14,22,0) 26%,rgba(10,14,22,0) 40%,rgba(10,14,22,0.96) 100%);"></div>
    <div style="position:absolute;top:54px;left:54px;">
      <span style="display:inline-block;vertical-align:middle;background:${B.purple};color:${B.white};font-family:'Space Grotesk','Open Sans',sans-serif;font-weight:700;font-size:40px;letter-spacing:-1px;padding:6px 18px;border-radius:10px;">AC</span>
      <span style="display:inline-block;vertical-align:middle;margin-left:22px;color:${B.white};font-weight:800;font-size:34px;letter-spacing:0.14em;">ACTU CRUE</span>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;padding:0 58px 66px;">
      ${catHtml}
      <div style="color:${B.white};font-weight:900;font-size:${titleSize}px;line-height:1.03;letter-spacing:-0.02em;">${headHtml}</div>
    </div>
  </div>`;
}

// Écran de fin animé (logo). Comme Shotstack ne lit pas nos MP4 locaux, on
// reconstruit l'écran de fin comme un plan de marque : tampon AC plein + nom.
// (L'animation fine du logo reste le fichier fourni pour montage manuel ; ici
// on garantit au minimum un outro de marque cohérent, ajouté automatiquement.)
export function brandOutroHtml() {
  const B = BRAND;
  return `<div style="display:flex;align-items:center;justify-content:center;width:1080px;height:1920px;background:${B.purple};">
    <div style="text-align:center;">
      <div style="font-family:'Anton','Open Sans',sans-serif;font-size:300px;color:${B.white};line-height:0.8;letter-spacing:-12px;">AC</div>
      <div style="width:120px;height:8px;background:${B.white};margin:22px auto 0;border-radius:4px;"></div>
      <div style="font-family:'Space Grotesk','Open Sans',sans-serif;font-weight:700;font-size:52px;letter-spacing:12px;color:${B.white};margin-top:24px;">ACTU CRUE</div>
    </div>
  </div>`;
}

export { esc };
