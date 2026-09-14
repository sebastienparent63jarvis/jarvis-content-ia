// Liste les scripts archivés (jobs de production) avec leur titre et leur script
// complet, du plus récent au plus ancien. Sert à retrouver le texte d'une vidéo
// déjà produite (les scripts sont conservés dans le store jarvis-auto-jobs).
// Accès : /api/scripts-archive  (GET, lecture seule).

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
  try {
    const store = openStore("jarvis-auto-jobs");
    const idx = (await store.get("_index", { type: "json" })) || [];

    const out = [];
    for (const jobId of idx.slice(0, 60)) { // 60 derniers, largement suffisant
      let job;
      try { job = await store.get(jobId, { type: "json" }); } catch { continue; }
      if (!job || !job.script) continue;
      const s = job.script;
      // Reconstitue la narration complète depuis les segments.
      const narration = Array.isArray(s.narration_segments)
        ? s.narration_segments.map(seg => seg.text).join("\n")
        : "";
      out.push({
        date: job.createdAt || null,
        title: s.title || "(sans titre)",
        category: s.category || null,
        description: s.description || "",
        narration,
      });
    }

    // Réponse en texte lisible (plus simple à parcourir qu'un JSON brut).
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#0B0710;color:#F3EEF8;}
    h1{color:#b085d0;font-size:20px;} .job{background:#1C1228;border:1px solid rgba(180,140,210,0.2);border-radius:12px;padding:16px;margin-bottom:16px;}
    .t{font-size:16px;font-weight:700;color:#fff;margin-bottom:4px;} .d{font-size:12px;color:#9A8CA8;margin-bottom:10px;}
    .lbl{font-size:11px;color:#7D4698;text-transform:uppercase;letter-spacing:0.06em;margin:10px 0 4px;}
    .txt{white-space:pre-wrap;font-size:13px;line-height:1.5;color:#ddd;}</style></head><body>
    <h1>Scripts archivés (${out.length})</h1>`;
    for (const j of out) {
      const dateStr = j.date ? new Date(j.date).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "";
      html += `<div class="job"><div class="t">${escapeHtml(j.title)}</div><div class="d">${dateStr}${j.category ? " · " + escapeHtml(j.category) : ""}</div>
        <div class="lbl">Narration</div><div class="txt">${escapeHtml(j.narration)}</div>
        ${j.description ? `<div class="lbl">Description</div><div class="txt">${escapeHtml(j.description)}</div>` : ""}
      </div>`;
    }
    html += `</body></html>`;

    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (e) {
    return new Response("Erreur: " + e.message, { status: 500 });
  }
};

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const config = { path: "/api/scripts-archive" };
