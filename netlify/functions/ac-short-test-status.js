import { getStore } from "@netlify/blobs";
export default async () => {
  let st; try { st = getStore({ name: "jarvis-config", consistency: "strong" }); } catch { st = getStore({ name: "jarvis-config", siteID: process.env.NETLIFY_SITE_ID || process.env.SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN, consistency: "strong" }); }
  const v = await st.get("ac-test-last", { type: "json" });
  return new Response(JSON.stringify(v || {}), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
};
export const config = { path: "/api/ac-short-test-status" };
