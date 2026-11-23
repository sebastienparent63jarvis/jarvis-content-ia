// Additif — lance un sourcing d'images libres (tâche de fond, jusqu'à 15 min).
// POST /api/image-search-background  body: { runId?, topic, context, entities, keywords, minWidth? }
// Résultat : /api/image-search-result?runId=...
import { getStore } from "@netlify/blobs";
import { sourceImages } from "./_image-sourcing.js";

function store(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
    throw e;
  }
}

export default async (req) => {
  const body = await req.json().catch(() => ({}));
  const runId = body.runId || "img-" + Date.now();
  const st = store("jarvis-image-search");
  await st.setJSON(runId, { runId, status: "running", startedAt: new Date().toISOString() });
  try {
    const res = await sourceImages(body);
    await st.setJSON(runId, { runId, status: "done", finishedAt: new Date().toISOString(), ...res });
  } catch (e) {
    await st.setJSON(runId, { runId, status: "failed", error: String(e && e.stack || e) });
  }
};
