// État de la génération de l'export d'analyse.
import { getStore } from "@netlify/blobs";

function openStore() {
  try { return getStore({ name: "jarvis-export", consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name: "jarvis-export", siteID, token, consistency: "strong" });
    throw e;
  }
}

export default async () => {
  try {
    const s = await openStore().get("status", { type: "json" });
    return new Response(JSON.stringify(s || { status: "none" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/export-status" };
