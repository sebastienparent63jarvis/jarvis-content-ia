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

const NEWS_SYSTEM_PROMPT = `Tu es un chercheur d'actualité pour ACTU CRUE, une chaîne YouTube qui décrypte l'actualité mondiale et ses retombées concrètes pour le spectateur.

Ta mission : à partir de l'actualité RÉCENTE (utilise la recherche web), identifie les sujets les plus importants et percutants du moment dans le monde, qui peuvent devenir des vidéos expliquant EN QUOI ça concerne le spectateur.

Champ éditorial : géopolitique internationale, économie et marchés financiers mondiaux, business et grandes entreprises, avancées technologiques (IA, énergie), science et santé à fort impact, grandes tendances de société. Le fil rouge : un événement mondial IMPORTANT → ses retombées concrètes pour le spectateur (son argent, son travail, ses prix, son avenir, sa vie quotidienne). Exemple : un conflit → prix du pétrole → ton plein ; une percée IA → ton emploi ; une décision de banque centrale → ton crédit.

Privilégie les sujets à la fois IMPORTANTS (qui comptent vraiment dans le monde) et à FORTE RETOMBÉE concrète pour les gens. Évite l'actu anecdotique sans impact.

Pour chaque sujet, un angle "retombées concrètes" et un titre à vocabulaire fort (percutant, mais tenable).

Réponds UNIQUEMENT en JSON valide :
{
  "topics": [
    { "actu": "l'événement mondial en une phrase", "angle_finance": "la retombée concrète pour le spectateur", "titre_propose": "titre YouTube percutant à vocabulaire fort" }
  ]
}
5 sujets, du plus percutant au moins percutant.

CRITIQUE : ta réponse finale doit être UNIQUEMENT l'objet JSON, sans aucun texte avant ni après, sans phrase d'introduction, sans commentaire. Commence directement par { et termine par }. Fais tes recherches web d'abord, puis ne réponds que le JSON.`;

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
        // La recherche web fait souvent précéder/suivre le JSON de texte.
        // On extrait le premier objet JSON complet du texte.
        let clean = text.replace(/```json|```/g, "").trim();
        const start = clean.indexOf("{");
        const end = clean.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
          clean = clean.slice(start, end + 1);
        }
        parsed = JSON.parse(clean);
      } catch {
        await store.set(jobId, JSON.stringify({ status: "error", error: "Réponse non conforme au JSON", raw: text.slice(0, 400) }));
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
