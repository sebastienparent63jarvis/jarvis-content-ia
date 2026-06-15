// Phase 4 — Vérification du statut d'un rendu Shotstack.
// Le rendu est asynchrone : on interroge cette fonction jusqu'à obtenir
// le statut "done" et l'URL du MP4 final.

export default async (req, context) => {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "SHOTSTACK_API_KEY non configurée" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const env = process.env.SHOTSTACK_ENV || "stage";
  const url = new URL(req.url);
  const renderId = url.searchParams.get("id");

  if (!renderId) {
    return new Response(JSON.stringify({ error: "Paramètre 'id' manquant" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(`https://api.shotstack.io/${env}/render/${renderId}`, {
      headers: { "x-api-key": apiKey },
    });
    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.message || "Erreur Shotstack" }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const status = data.response?.status; // queued | fetching | rendering | saving | done | failed
    const videoUrl = data.response?.url || null;

    return new Response(
      JSON.stringify({ status, url: videoUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec vérification statut: " + err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/render-status",
};
