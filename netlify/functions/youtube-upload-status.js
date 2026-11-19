// Lit le statut d'un upload YouTube côté serveur (par id d'item).
import { getStore } from "@netlify/blobs";

function openStore(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
    throw e;
  }
}

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ error: "id manquant" }), { status: 400, headers: { "Content-Type": "application/json" } });
  try {
    const s = await openStore("jarvis-upload-status").get(id, { type: "json" });
    return new Response(JSON.stringify(s || { status: "none" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/youtube-upload-status" };
