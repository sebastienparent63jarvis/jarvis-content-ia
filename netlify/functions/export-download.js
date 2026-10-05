// Télécharge le CSV d'analyse généré par export-analysis-background.
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
    const csv = await openStore().get("csv");
    if (!csv) return new Response("Aucun export disponible. Génère-le d'abord.", { status: 404 });
    const filename = `actucrue-analyse-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return new Response("Erreur: " + e.message, { status: 500 });
  }
};

export const config = { path: "/api/export-download" };
