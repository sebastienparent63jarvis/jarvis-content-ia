// Convertit un SVG de masque en PNG, avec les polices de marque chargées pour
// un rendu fidèle. Peut aussi composer le masque par-dessus une image de fond
// (pour la miniature). Léger : resvg (~4 Mo) + polices (~1 Mo), aucun navigateur.

import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, "assets");

// Charge les fichiers de police une seule fois.
let FONT_BUFFERS = null;
function fontBuffers() {
  if (FONT_BUFFERS) return FONT_BUFFERS;
  const files = ["Inter.ttf", "SpaceGrotesk.ttf", "Anton.ttf"];
  FONT_BUFFERS = files.map((f) => {
    try { return readFileSync(join(FONT_DIR, f)); } catch { return null; }
  }).filter(Boolean);
  return FONT_BUFFERS;
}

// Rend un SVG en PNG (Buffer). width = largeur cible.
export function svgToPng(svg, width = 1080) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: {
      loadSystemFonts: false,
      fontBuffers: fontBuffers(),
    },
  });
  return resvg.render().asPng();
}

// Compose le masque (PNG transparent) par-dessus une image de fond déjà en PNG.
// Utilise resvg via un SVG qui référence les deux images en base64.
export function compositeMaskOverImage(maskSvg, bgPngBuffer, width = 1080, height = 1920) {
  const bgB64 = bgPngBuffer.toString("base64");
  // On enrobe : fond en <image>, puis le contenu du masque par-dessus.
  // On extrait le contenu interne du SVG masque (sans la balise racine).
  const inner = maskSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const combined = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image href="data:image/png;base64,${bgB64}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
  ${inner}
</svg>`;
  return svgToPng(combined, width);
}
