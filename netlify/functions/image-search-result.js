// Additif — lit le résultat d'un sourcing d'images.
// GET /api/image-search-result?runId=...           -> résultat complet
// GET /api/image-search-result?runId=...&light=1   -> entités + stats seulement
import { getStore } from "@netlify/blobs";

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
  const u = new URL(req.url);
  const runId = u.searchParams.get("runId");
  if (!runId) return new Response(JSON.stringify({ error: "runId requis" }), { status: 400, headers: { "Content-Type": "application/json" } });
  const r = await store("jarvis-image-search").get(runId, { type: "json" });
  if (!r) return new Response(JSON.stringify({ status: "unknown" }), { status: 404, headers: { "Content-Type": "application/json" } });
  if (u.searchParams.get("light")) delete r.candidates;
  return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
};
