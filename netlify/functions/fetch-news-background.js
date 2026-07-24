// Recherche d'actualité — BACKGROUND FUNCTION (plan Netlify payant).
// Le suffixe "-background" indique à Netlify de l'exécuter en arrière-plan
// (jusqu'à 15 min, pas de timeout 10s). Elle répond 202 immédiatement, puis
// travaille et STOCKE son résultat dans Blobs sous un jobId que l'interface
// vient récupérer par polling (via news-result).

import { getStore } from "@netlify/blobs";

function openStore() {
  try {
    return getStore({ name: "jarvis-news", consistency: "strong" });
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) {
      return getStore({ name: "jarvis-news", siteID, token, consistency: "strong" });
    }
    throw e;
  }
}

const NEWS_SYSTEM_PROMPT = `Tu es un chercheur d'actualité pour une chaîne YouTube Shorts de finance personnelle et d'économie du quotidien.

Ta mission : à partir de l'actualité RÉCENTE (utilise la recherche web), identifie des sujets qui peuvent devenir des Shorts percutants reliant un événement d'actualité à l'argent, l'économie ou le portefeuille du spectateur.

Registre : économie, consommation, prix, énergie, immobilier, impôts, société, saisonnier, et événements géopolitiques SOUS L'ANGLE DE LEURS CONSÉQUENCES ÉCONOMIQUES (ex: un conflit → prix du pétrole → ton plein d'essence). L'angle est toujours "qu'est-ce que ça change pour TON argent".

Pour chaque sujet, un angle finance concret et un titre à vocabulaire fort (percutant, mais tenable).

Réponds UNIQUEMENT en JSON valide :
{
  "topics": [
    { "actu": "l'événement en une phrase", "angle_finance": "l'angle finance perso concret", "titre_propose": "titre YouTube percutant à vocabulaire fort" }
  ]
}
5 sujets, du plus percutant au moins percutant.`;

export default async (req, context) => {
  // Une background function reçoit le body, répond 202, et continue.
  let body = {};
  try { body = await req.json(); } catch { body = {}; }

  const jobId = body.jobId;
  const hint = body.hint ? `\n\nOriente la recherche autour de : ${body.hint}` : "";

  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId manquant" }), { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Fonction interne qui fait le travail et stocke le résultat.
  const run = async () => {
    let store;
    try { store = openStore(); } catch (e) {
      return; // sans store, impossible de communiquer le résultat
    }

    if (!apiKey) {
      await store.set(jobId, JSON.stringify({ status: "error", error: "ANTHROPIC_API_KEY non configurée" }));
      return;
    }

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
          system: NEWS_SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Quels sont les sujets d'actualité récents les plus exploitables aujourd'hui pour un Short finance percutant ?${hint}` }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        await store.set(jobId, JSON.stringify({ status: "error", error: data.error?.message || "Erreur API" }));
        return;
      }

      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      let parsed;
      try {
        parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch {
        await store.set(jobId, JSON.stringify({ status: "error", error: "Réponse non conforme au JSON" }));
        return;
      }

      await store.set(jobId, JSON.stringify({ status: "done", topics: parsed.topics || [] }));
    } catch (err) {
      await store.set(jobId, JSON.stringify({ status: "error", error: err.message }));
    }
  };

  // Marque le job comme "en cours" immédiatement, puis lance le travail.
  try {
    const store = openStore();
    await store.set(jobId, JSON.stringify({ status: "pending" }));
  } catch { /* si Blobs échoue ici, le run tentera à nouveau */ }

  // En background function, on peut awaiter le travail : Netlify laisse tourner.
  await run();

  return new Response(JSON.stringify({ accepted: true, jobId }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
};
