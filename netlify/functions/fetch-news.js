// Recherche d'actualité — trouve des sujets d'actu récents (éco, société,
// saisonnier, géopolitique à impact économique) et en tire des angles
// exploitables pour une chaîne de finance personnelle.
// Isolée de la génération de script pour maîtriser le temps d'exécution
// (la recherche web est l'étape lente).

const NEWS_SYSTEM_PROMPT = `Tu es un chercheur d'actualité pour une chaîne YouTube Shorts de finance personnelle et d'économie du quotidien.

Ta mission : à partir de l'actualité RÉCENTE (utilise la recherche web), identifie des sujets qui peuvent devenir des Shorts percutants reliant un événement d'actualité à l'argent, l'économie ou le portefeuille du spectateur.

Registre autorisé et recherché : économie, consommation, prix, énergie, immobilier, impôts, société, saisonnier, et événements géopolitiques SOUS L'ANGLE DE LEURS CONSÉQUENCES ÉCONOMIQUES (ex: un conflit → prix du pétrole → ton plein d'essence). L'angle est toujours "qu'est-ce que ça change pour TON argent".

Pour chaque sujet, propose un angle finance concret et un titre à vocabulaire fort (percutant, émotionnel, mais tenable par le contenu).

Réponds UNIQUEMENT en JSON valide :
{
  "topics": [
    {
      "actu": "l'événement d'actualité en une phrase",
      "angle_finance": "l'angle finance perso concret qui en découle",
      "titre_propose": "un titre YouTube percutant à vocabulaire fort"
    }
  ]
}

Propose 5 sujets variés, classés du plus percutant au moins percutant.`;

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
    body = {};
  }

  const hint = (body && body.hint) ? `\n\nOriente la recherche autour de : ${body.hint}` : "";

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
      return new Response(JSON.stringify({ error: data.error?.message || "Erreur API", raw: data }), {
        status: res.status, headers: { "Content-Type": "application/json" },
      });
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!text) {
      return new Response(JSON.stringify({ error: "Réponse vide de la recherche" }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }

    let parsed;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      return new Response(JSON.stringify({ error: "Réponse actu non conforme au JSON", raw: text.slice(0, 300) }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ topics: parsed.topics || [] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec recherche actu: " + err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/fetch-news",
};
