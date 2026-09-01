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
    const usedIds = new Set(); // évite de réutiliser le même clip dans une vidéo

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const keywords = Array.isArray(seg.visual_keywords) ? seg.visual_keywords : [];
      const query = keywords.join(" ") || (keywords[0] || "");

      let clip = null;
      let usedQuery = query;

      // Tentatives : requête complète → chaque mot-clé séparément. PAS de
      // fallback "bureau/ville" générique (source de la répétition). En dernier
      // recours seulement, un plan d'ambiance neutre lié à l'actu.
      const attempts = [query, ...keywords, "world news broadcast", "documentary aerial city"].filter(Boolean);

      for (const attempt of attempts) {
        // per_page plus large (15) pour avoir un vrai choix et diversifier.
        const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(attempt)}&orientation=portrait&per_page=15`;
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
        // On filtre les clips déjà utilisés dans cette vidéo pour ne pas répéter.
        const fresh = videos.filter((v) => !usedIds.has(v.id));
        const pool = fresh.length > 0 ? fresh : videos;
        if (pool.length > 0) {
          // Choix aléatoire dans un pool large (jusqu'à 15) → vraie diversité.
          const chosen = pool[Math.floor(Math.random() * pool.length)];
          const file = pickBestVideoFile(chosen.video_files);
          if (file) {
            usedIds.add(chosen.id);
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
