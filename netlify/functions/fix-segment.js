// Fiabilité pédagogique — Régénération propre d'un segment fautif.
// Prend un segment dont le fact-check a signalé un problème, et le réécrit
// correctement : factuellement juste, en respectant le style oral, la longueur
// (1-2 phrases brèves), et les règles voix off (nombres en lettres, pas de
// symboles, pas d'homographes ambigus).
//
// La clé API reste côté serveur (ANTHROPIC_API_KEY).

const SEGMENT_SYSTEM_PROMPT = `Tu es JARVIS, moteur éditorial pour une chaîne YouTube Shorts française d'éducation financière accessible.

On te donne UN segment de narration qui contient une erreur factuelle, le problème identifié, et le contexte (titre + segments voisins). Réécris UNIQUEMENT ce segment pour qu'il soit :
- FACTUELLEMENT CORRECT (corrige l'erreur signalée)
- Cohérent avec le ton pédagogique, chaleureux et accessible du reste
- COURT : une à deux phrases brèves (12 à 20 mots), lisible en sous-titre mobile
- Écrit pour la voix off : nombres et pourcentages EN TOUTES LETTRES, aucun symbole (€, %, $, k), pas d'homographe verbe/nom ambigu
- Fluide avec les segments voisins (transition naturelle)

Si l'erreur portait sur un chiffre incertain ou daté, préfère une formulation prudente et vraie ("aux alentours de", "en général", "renseigne-toi sur le plafond en vigueur") plutôt qu'un chiffre que tu ne peux pas garantir.

Réponds UNIQUEMENT en JSON valide, structure exacte :
{
  "text": "le segment réécrit, factuellement correct",
  "visual_keywords": ["keyword1", "keyword2"],
  "duration_estimate_sec": 5
}`;

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400 });
  }

  const { title, segmentText, problem, suggestion, prevText, nextText, keywords } = body;
  if (!segmentText || !problem) {
    return new Response(JSON.stringify({ error: "segmentText ou problem manquant" }), { status: 400 });
  }

  const userPrompt = `Titre de la vidéo : ${title || "(non précisé)"}

Segment précédent : ${prevText || "(aucun — c'est le début)"}
SEGMENT À CORRIGER : ${segmentText}
Segment suivant : ${nextText || "(aucun — c'est la fin)"}

Mots-clés visuels actuels : ${(keywords || []).join(", ") || "(aucun)"}

Problème factuel identifié : ${problem}
Correction suggérée (à intégrer proprement, pas forcément mot pour mot) : ${suggestion || "(aucune)"}

Réécris le segment au format JSON demandé.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: SEGMENT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "Erreur API Anthropic" }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!text) {
      return new Response(JSON.stringify({ error: "Réponse vide" }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }

    let segment;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      segment = JSON.parse(clean);
    } catch {
      return new Response(JSON.stringify({ error: "Réponse non conforme au format JSON", raw: text }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ segment }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec régénération segment: " + err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/fix-segment",
};
