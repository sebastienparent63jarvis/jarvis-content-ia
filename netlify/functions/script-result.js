// Récupère le résultat d'une génération de script lancée en background.
// L'interface interroge cette fonction (polling) jusqu'à status "done"/"error".

import { getStore } from "@netlify/blobs";

function openStore() {
  try {
    return getStore({ name: "jarvis-scriptjobs", consistency: "strong" });
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) {
      return getStore({ name: "jarvis-scriptjobs", siteID, token, consistency: "strong" });
    }
    throw e;
  }
}

export default async (req, context) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId manquant" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const store = openStore();
    let record = null;
    try { record = await store.get(jobId, { type: "json" }); } catch { record = null; }

    if (!record) {
      return new Response(JSON.stringify({ status: "pending" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(record), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", error: err.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/script-result",
};
