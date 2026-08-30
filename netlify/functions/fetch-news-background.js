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

const NEWS_SYSTEM_PROMPT = `Tu es un chercheur d'actualité pour ACTU CRUE, une chaîne YouTube qui décrypte l'actualité mondiale et ce qu'elle change concrètement pour le spectateur.

Ta mission : à partir de l'actualité RÉCENTE (utilise la recherche web), identifie les sujets les plus importants et intéressants du moment dans le monde, qui peuvent devenir des vidéos expliquant EN QUOI ça concerne le spectateur.

Champ éditorial : géopolitique internationale, économie et marchés, business et grandes entreprises, avancées technologiques (IA, énergie), science et santé à fort impact, grandes tendances de société.

DIVERSITÉ DES ANGLES — impératif : la conséquence concrète pour le spectateur ne doit PAS toujours être financière. Fais VARIER l'angle d'un sujet à l'autre entre : la vie quotidienne, le travail et les métiers, les choix à anticiper, le futur proche, la santé, la compréhension du monde (pourquoi on va en entendre parler), ET parfois seulement l'argent. Sur 5 propositions, PAS PLUS DE DEUX ne doivent avoir un angle argent/prix/pouvoir d'achat. Choisis l'angle le plus juste pour chaque sujet, pas le plus dramatique.

DIVERSITÉ DES SUJETS — impératif : les 5 propositions doivent couvrir des DOMAINES DIFFÉRENTS. Pas plus d'UN sujet par grande thématique (ex : ne propose pas 3 sujets climat/catastrophe/assurance qui sont au fond le même sujet). Vise un éventail : par ex. un sujet géopolitique, un économique, un tech/science, un société, un santé. Même si la requête oriente vers un thème, élargis autour pour offrir un vrai choix.

VOCABULAIRE — INTERDICTION FORMELLE : le mot "saigner" (saigne, saignée) est BANNI, zéro tolérance. Les mots "EXPLOSER", "FLAMBER", "s'effondre", "désastre", "vide ton compte" : UN SEUL maximum sur les 5 propositions, et jamais en majuscules hurlantes. Ces formules à répétition ont fait CHUTER la rétention sur les données réelles de la chaîne. L'accroche vient de la curiosité, du contraste, de l'enjeu réel — jamais de l'hyperbole sanglante. Varie les procédés d'un titre à l'autre.

PRIORITÉ AUX SUJETS QUI RETIENNENT — leçon des données réelles : les vidéos les plus performantes (rétention 55-78%) portaient sur la GÉOPOLITIQUE CONCRÈTE et les JEUX DE POUVOIR (tensions entre États, bras de fer entre dirigeants, décisions qui rebattent les cartes mondiales, affrontements d'intérêts). Les sujets ABSTRAITS/SCOLAIRES (définitions, mécanismes financiers, "c'est quoi X") ont fait la pire rétention (15-35%). Donne donc la priorité aux sujets géopolitiques, de pouvoir et de conflit concret, avec un enjeu clair pour le spectateur.

Privilégie les sujets à la fois IMPORTANTS et à conséquence réelle pour les gens. Évite l'actu anecdotique.

Réponds UNIQUEMENT en JSON valide :
{
  "topics": [
    { "actu": "l'événement mondial en une phrase", "angle_finance": "la conséquence concrète pour le spectateur (PAS forcément financière — varie)", "titre_propose": "titre YouTube accrocheur mais crédible, sans hyperbole systématique" }
  ]
}
5 sujets, d'angles et de domaines VARIÉS, du plus fort au moins fort.

CRITIQUE : ta réponse finale doit être UNIQUEMENT l'objet JSON, sans aucun texte avant ni après, sans phrase d'introduction, sans commentaire. Commence directement par { et termine par }. Fais tes recherches web d'abord, puis ne réponds que le JSON.`;

export default async (req, context) => {
  // Une background function reçoit le body, répond 202, et continue.
  let body = {};
  try { body = await req.json(); } catch { body = {}; }

  const jobId = body.jobId;

  // Mots-clés de l'utilisateur : CONTRAIGNANTS (le sujet DOIT porter dessus).
  const hint = body.hint && body.hint.trim()
    ? `\n\nCONTRAINTE FORTE — SUJET IMPOSÉ : tous les sujets proposés doivent porter DIRECTEMENT sur : "${body.hint.trim()}". C'est le cœur de la demande, pas une simple orientation. Si tu proposes des sujets connexes, ils doivent rester clairement rattachés à ce thème. N'ignore JAMAIS cette contrainte.`
    : "";

  // Angle éditorial imposé (choisi par l'utilisateur dans l'interface).
  const ANGLES = {
    finance: "l'impact FINANCIER concret (prix, pouvoir d'achat, épargne, factures, coûts)",
    environnement: "l'angle ENVIRONNEMENT / CLIMAT et ses effets concrets sur la vie des gens",
    geopolitique: "l'angle GÉOPOLITIQUE / CONFLITS et ce que ça implique pour le spectateur",
    tech: "l'angle TECH / SCIENCE / SANTÉ et ce que ça change concrètement",
  };
  const angleBlock = (body.angle && ANGLES[body.angle])
    ? `\n\nANGLE IMPOSÉ : TOUS les sujets doivent être traités sous ${ANGLES[body.angle]}. C'est l'angle exigé par l'utilisateur — applique-le à chaque sujet sans exception.`
    : "";

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
          messages: [{ role: "user", content: `Quels sont les sujets d'actualité récents les plus intéressants et exploitables aujourd'hui pour une vidéo Actu Crue ?${hint}${angleBlock}` }],
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
