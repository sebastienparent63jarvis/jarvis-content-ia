// Fiabilité pédagogique — Vérification factuelle d'un script avant production.
// Un second passage Claude relit le script d'éducation financière et signale
// toute affirmation inexacte, trompeuse, ou imprécise. C'est le garde-fou qui
// protège la crédibilité de la chaîne : aucune vidéo ne devrait être produite
// sur la base d'un script contenant une erreur factuelle.
//
// La clé API reste côté serveur (ANTHROPIC_API_KEY).

const FACTCHECK_SYSTEM_PROMPT = `Tu es un vérificateur factuel rigoureux, spécialisé en finances personnelles, économie et fiscalité, pour des contenus d'éducation financière grand public en français.

On te donne le script d'un Short YouTube éducatif. Ta mission : détecter toute affirmation qui serait FACTUELLEMENT FAUSSE, TROMPEUSE, IMPRÉCISE ou DATÉE.

Sois particulièrement vigilant sur :
- Les chiffres, taux, seuils, plafonds (fiscalité, livrets, rendements) qui changent dans le temps ou varient selon les pays
- Les généralisations abusives ("toujours", "jamais", "garanti") sur des sujets d'investissement
- Les affirmations qui pourraient passer pour un conseil financier personnalisé (à éviter dans un contenu éducatif général)
- Les mécanismes financiers expliqués de façon inexacte ou simplifiée au point d'être faux
- Tout ce qui dépend d'un pays précis sans le préciser (les règles fiscales françaises ne valent pas ailleurs)

Tu n'es pas là pour réécrire le style ou juger l'angle éditorial — UNIQUEMENT l'exactitude factuelle.

Tu travailles SANS accès à internet : tu te bases sur tes connaissances. Pour les chiffres susceptibles d'avoir changé récemment (taux de livrets, plafonds fiscaux, seuils annuels), signale-les en sévérité "moyen". Mais ta "suggestion" de correction ne doit PAS être une formule molle pleine de précautions — elle doit rester affirmative et percutante, en s'appuyant sur le concept stable plutôt que sur le chiffre fragile (ex: "il existe un plafond, le dépasser ne rapporte rien" plutôt que "renseigne-toi sur le plafond en vigueur").

Réponds UNIQUEMENT en JSON valide, structure exacte :
{
  "verdict": "ok" | "corrections_needed",
  "confidence": "high" | "medium" | "low",
  "issues": [
    {
      "segment_index": 0,
      "quote": "l'extrait problématique",
      "problem": "ce qui ne va pas factuellement",
      "severity": "critique" | "moyen" | "mineur",
      "suggestion": "reformulation factuellement correcte proposée"
    }
  ],
  "summary": "synthèse en une phrase de l'état factuel du script"
}

Si aucune erreur : verdict "ok", issues vide. Sois exigeant mais juste : ne signale pas une simplification pédagogique légitime comme une erreur, seulement ce qui est réellement inexact ou trompeur.`;

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée sur Netlify" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400 });
  }

  const { script } = body;
  if (!script || !Array.isArray(script.narration_segments)) {
    return new Response(JSON.stringify({ error: "Script invalide ou segments manquants" }), { status: 400 });
  }

  // On numérote les segments pour que le vérificateur puisse pointer précisément.
  const numbered = script.narration_segments
    .map((s, i) => `[${i}] ${s.text}`)
    .join("\n");

  const userPrompt = `Titre : ${script.title}\n\nScript à vérifier (segments numérotés) :\n${numbered}\n\nVérifie l'exactitude factuelle et réponds au format JSON demandé.`;

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
        max_tokens: 1500,
        system: FACTCHECK_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "Erreur API Anthropic", raw: data }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Réponse vide du vérificateur", raw: data }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    let report;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      report = JSON.parse(clean);
    } catch {
      return new Response(
        JSON.stringify({ error: "Rapport de vérification non conforme au format JSON", raw: text }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ report }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec vérification: " + err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/fact-check",
};
