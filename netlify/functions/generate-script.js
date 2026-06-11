// Phase 1 — Moteur de script pour YouTube Shorts.
// Génère un script structuré (audio + visuels + métadonnées) prêt pour les
// phases suivantes (TTS, stock footage, assemblage vidéo).
//
// La clé API reste côté serveur (ANTHROPIC_API_KEY).

const SHORTS_SYSTEM_PROMPT = `Tu es JARVIS, moteur éditorial autonome pour une chaîne YouTube Shorts française dans la niche Finance Personnelle x IA.

Format cible : Shorts de 45 à 60 secondes, vertical (9:16).

Pour CHAQUE script, applique ces règles :
1. Hook (0-3s) : phrase choc, chiffre ou question qui arrête le scroll
2. Corps (3-45s) : 1 idée actionnable, claire, en français courant — pas de jargon
3. CTA final (45-55s) : incitation à s'abonner ou commenter, naturelle (pas insistante)
4. Le texte de narration doit être écrit pour être lu à voix haute (phrases courtes, rythme oral)
5. Pour chaque segment, propose 2-3 mots-clés en ANGLAIS pour rechercher des visuels libres de droits (banques d'images en anglais)

Réponds UNIQUEMENT en JSON valide, structure exacte :
{
  "title": "Titre YouTube optimisé CTR (max 60 caractères)",
  "description": "Description YouTube avec 3-5 hashtags pertinents",
  "narration_segments": [
    { "text": "texte à lire pour ce segment", "duration_estimate_sec": 5, "visual_keywords": ["keyword1", "keyword2"] }
  ],
  "total_duration_estimate_sec": 50,
  "rationale": "Pourquoi ce sujet/angle a été choisi, basé sur la data niche",
  "best_post_window": "matin | midi | soir"
}`;

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée sur Netlify (Site settings > Environment variables)" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400 });
  }

  const { topic, slot } = body;

  const userPrompt = topic
    ? `Sujet imposé : ${topic}${slot ? `\nCréneau de publication visé : ${slot}` : ""}\n\nGénère le script Shorts complet au format JSON demandé.`
    : `Aucun sujet imposé. Choisis toi-même un angle pertinent pour aujourd'hui dans la niche Finance Personnelle x IA, en t'appuyant sur les tendances actuelles.${slot ? `\nCréneau de publication visé : ${slot}` : ""}\n\nGénère le script Shorts complet au format JSON demandé.`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: SHORTS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "Erreur API Anthropic", raw: data }), {
        status: anthropicRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Réponse vide de Claude (aucun bloc texte)", raw: data }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    let script;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      script = JSON.parse(clean);
    } catch {
      return new Response(
        JSON.stringify({ error: "Réponse IA non conforme au format JSON attendu", raw: text }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ script }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec de connexion à Anthropic: " + err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/generate-script",
};