// Phase 3 — Récupération des visuels via l'API Pexels.
// Pour chaque segment de narration, on cherche un clip vidéo vertical
// correspondant aux mots-clés. Renvoie une liste de clips prêts pour
// l'assemblage (Phase 4).
//
// Variable d'environnement requise sur Netlify :
//   PEXELS_API_KEY : ta clé API Pexels (gratuite sur pexels.com/api)

// Sélectionne le meilleur fichier vidéo d'un résultat Pexels :
// on privilégie l'orientation portrait (9:16) et une résolution raisonnable
// (HD, pas 4K pour limiter le poids et accélérer l'assemblage).
function pickBestVideoFile(videoFiles) {
  if (!Array.isArray(videoFiles) || videoFiles.length === 0) return null;

  const portrait = videoFiles.filter(
    (f) => f.height && f.width && f.height >= f.width
  );
  const pool = portrait.length > 0 ? portrait : videoFiles;

  // Cherche une résolution proche de 1080p de hauteur, sinon la plus grande
  // sous 2000px (évite la 4K).
  const sorted = [...pool].sort((a, b) => (a.height || 0) - (b.height || 0));
  const hd = sorted.find((f) => (f.height || 0) >= 1080 && (f.height || 0) <= 2000);
  return (hd || sorted[sorted.length - 1] || null);
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "PEXELS_API_KEY non configurée sur Netlify (Site settings > Environment variables)" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400 });
  }

  const { segments } = body; // [{ text, visual_keywords: [...] }, ...]
  if (!Array.isArray(segments) || segments.length === 0) {
    return new Response(JSON.stringify({ error: "Champ 'segments' manquant ou vide" }), { status: 400 });
  }

  try {
    const results = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const keywords = Array.isArray(seg.visual_keywords) ? seg.visual_keywords : [];
      const query = keywords.join(" ") || "finance money";

      let clip = null;
      let usedQuery = query;

      // On tente la requête complète, puis on dégrade vers le premier mot-clé
      // si aucun résultat, pour maximiser les chances de trouver un visuel.
      // Le dernier recours reste dans un registre pro (pas de cliché finance).
      const proFallbacks = ["modern office professional", "business workspace cinematic", "city skyline business"];
      const lastResort = proFallbacks[Math.floor(Math.random() * proFallbacks.length)];
      const attempts = [query, keywords[0], lastResort].filter(Boolean);

      for (const attempt of attempts) {
        const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(attempt)}&orientation=portrait&per_page=5`;
        const res = await fetch(url, { headers: { Authorization: apiKey } });

        if (!res.ok) {
          if (res.status === 429) {
            return new Response(
              JSON.stringify({ error: "Limite de requêtes Pexels atteinte (429). Réessaie dans quelques minutes." }),
              { status: 429, headers: { "Content-Type": "application/json" } }
            );
          }
          continue;
        }

        const data = await res.json();
        const videos = data.videos || [];
        if (videos.length > 0) {
          // Prend une vidéo au hasard parmi les premiers résultats pour éviter
          // que tous les Shorts utilisent exactement le même clip.
          const chosen = videos[Math.floor(Math.random() * Math.min(videos.length, 5))];
          const file = pickBestVideoFile(chosen.video_files);
          if (file) {
            clip = {
              pexels_id: chosen.id,
              duration: chosen.duration,
              width: file.width,
              height: file.height,
              link: file.link,
              preview: chosen.image,
              author: chosen.user?.name || "Pexels",
            };
            usedQuery = attempt;
            break;
          }
        }
      }

      results.push({
        segment_index: i,
        text: seg.text,
        query: usedQuery,
        clip, // peut être null si rien trouvé
      });
    }

    const missing = results.filter((r) => !r.clip).length;

    return new Response(
      JSON.stringify({ clips: results, total: results.length, missing }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec de connexion à Pexels: " + err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/fetch-visuals",
};
