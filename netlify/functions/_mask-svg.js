// Masque Actu Crue en SVG pur — rendu pixel-parfait via resvg (sans navigateur).
// Utilisé pour la miniature ET l'intro vidéo, pour un design identique au modèle
// validé. Le SVG est ensuite converti en PNG par _mask-render.js.

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

// Découpe un titre en lignes qui tiennent dans la largeur, en estimant la
// largeur des caractères (approx. pour la police Inter 900). On coupe aux mots.
function wrapTitle(title, maxCharsPerLine) {
  const words = title.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (test.length > maxCharsPerLine && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Construit les <tspan> d'une ligne en colorant le mot-choc en violet clair.
function lineToSpans(line, hookWord) {
  if (!hookWord) return esc(line);
  const idx = line.toLowerCase().indexOf(hookWord.toLowerCase());
  if (idx === -1) return esc(line);
  const before = line.slice(0, idx);
  const match = line.slice(idx, idx + hookWord.length);
  const after = line.slice(idx + hookWord.length);
  return `${esc(before)}<tspan fill="${BRAND.purpleLight}">${esc(match)}</tspan>${esc(after)}`;
}

// Génère le SVG du masque. transparent=true → fond transparent (pour superposer
// sur une vidéo en intro). transparent=false → même chose, le fond vient de
// l'image passée en dessous par le moteur de rendu.
export function maskSvg({ title, category, hookWord }, { width = 1080, height = 1920 } = {}) {
  const B = BRAND;

  // Catégorie : tronquée si trop longue.
  let catLabel = (category || "").toString().trim().toUpperCase();
  if (catLabel.length > 30) catLabel = catLabel.slice(0, 30).replace(/[\s,(]+\S*$/, "") + "…";
  const catW = Math.min(900, 60 + catLabel.length * 17); // largeur pastille approx.

  // Titre : taille adaptative + wrap.
  const tlen = (title || "").length;
  const titleSize = tlen > 60 ? 66 : tlen > 45 ? 76 : 88;
  const maxChars = Math.floor((width - 116) / (titleSize * 0.52)); // approx largeur car.
  const lines = wrapTitle(title || "", maxChars);
  const lineHeight = titleSize * 1.06;

  // Position verticale du bloc bas : on part du bas et on remonte.
  const bottomPad = 80;
  const titleBlockH = lines.length * lineHeight;
  const catGap = 28;
  const catH = 58;
  const firstTitleY = height - bottomPad - titleBlockH + titleSize; // baseline 1re ligne
  const catY = firstTitleY - titleSize - catGap - catH + 44; // baseline texte catégorie
  const catRectY = firstTitleY - titleSize - catGap - catH;

  const titleTspans = lines.map((ln, i) =>
    `<text x="58" y="${firstTitleY + i * lineHeight}" font-family="Inter" font-size="${titleSize}" font-weight="900" fill="${B.white}" letter-spacing="-1">${lineToSpans(ln, hookWord)}</text>`
  ).join("\n  ");

  const catBlock = catLabel
    ? `<rect x="58" y="${catRectY}" width="${catW}" height="${catH}" rx="9" fill="${B.purple}"/>
  <text x="80" y="${catY}" font-family="Inter" font-size="30" font-weight="800" letter-spacing="1.5" fill="${B.white}">${esc(catLabel)}</text>`
    : "";

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0A0E16" stop-opacity="0.42"/>
      <stop offset="26%" stop-color="#0A0E16" stop-opacity="0"/>
      <stop offset="52%" stop-color="#0A0E16" stop-opacity="0"/>
      <stop offset="100%" stop-color="#0A0E16" stop-opacity="0.96"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#veil)"/>
  <rect x="54" y="54" width="104" height="62" rx="12" fill="${B.purple}"/>
  <text x="106" y="98" font-family="Space Grotesk" font-size="42" font-weight="700" fill="${B.white}" text-anchor="middle">AC</text>
  <text x="180" y="97" font-family="Inter" font-size="34" font-weight="800" letter-spacing="4" fill="${B.white}">ACTU CRUE</text>
  ${catBlock}
  ${titleTspans}
</svg>`;
}

// SVG de l'écran de fin (outro) : fond violet plein + tampon AC + nom.
export function outroSvg({ width = 1080, height = 1920 } = {}) {
  const B = BRAND;
  const cx = width / 2;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${B.purple}"/>
  <text x="${cx}" y="${height/2 - 20}" font-family="Anton" font-size="300" fill="${B.white}" text-anchor="middle" letter-spacing="-12">AC</text>
  <rect x="${cx - 60}" y="${height/2 + 40}" width="120" height="8" rx="4" fill="${B.white}"/>
  <text x="${cx}" y="${height/2 + 150}" font-family="Space Grotesk" font-size="52" font-weight="700" fill="${B.white}" text-anchor="middle" letter-spacing="12">ACTU CRUE</text>
</svg>`;
}
