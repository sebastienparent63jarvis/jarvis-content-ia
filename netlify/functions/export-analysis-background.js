// EXPORT D'ANALYSE — BACKGROUND (jusqu'à 15 min). Rassemble pour chaque vidéo :
// stats (vues, démarrage, rétention, durée vue, abonnés, source de trafic), thème,
// date, le SCRIPT complet (matché par titre), et un DRAPEAU DIAGNOSTIC calculé par
// croisement. Produit un CSV stocké dans Blobs, téléchargeable via export-download.
//
// Corps : { startDate?, endDate? }  (défaut : 1er septembre → aujourd'hui)

import { getStore } from "@netlify/blobs";
import { getAccessToken } from "./_youtube-oauth.js";

function openStore(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
    throw e;
  }
}

async function setStatus(obj) {
  try { await openStore("jarvis-export").set("status", JSON.stringify({ ...obj, at: new Date().toISOString() })); }
  catch { /* ignore */ }
}

// Échappe un champ CSV (guillemets, virgules, retours ligne).
function csvCell(v) {
  const s = (v === null || v === undefined) ? "" : String(v);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export default async (req) => {
  let body; try { body = await req.json(); } catch { body = {}; }
  const startDate = body.startDate || "2026-09-01";
  const endDate = body.endDate || new Date().toISOString().slice(0, 10);

  await setStatus({ status: "running", step: "init" });

  try {
    const accessToken = await getAccessToken();

    // 1. Stats de base, TOUTES les vidéos de la période, en un appel.
    await setStatus({ status: "running", step: "stats de base" });
    const baseParams = new URLSearchParams({
      ids: "channel==MINE", startDate, endDate,
      metrics: "views,averageViewDuration,averageViewPercentage,subscribersGained",
      dimensions: "video", sort: "-views", maxResults: "200",
    });
    const baseRes = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${baseParams}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    const baseData = await baseRes.json();
    if (!baseRes.ok) {
      await setStatus({ status: "error", error: baseData.error?.message || "stats de base échouées" });
      return done();
    }
    const rows = baseData.rows || [];
    const videoIds = rows.map(r => r[0]);

    // 2. Titres + dates de publication (videos.list, 50 max par appel).
    await setStatus({ status: "running", step: "titres & dates" });
    const meta = {};
    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50);
      const vp = new URLSearchParams({ part: "snippet", id: chunk.join(",") });
      const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?${vp}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
      const vd = await vr.json();
      (vd.items || []).forEach(it => {
        meta[it.id] = { title: it.snippet?.title || "", publishedAt: it.snippet?.publishedAt || "" };
      });
    }

    // 3. Démarrage (rétention au tout début) par vidéo. Limité à 60 pour le temps.
    await setStatus({ status: "running", step: "rétention démarrage" });
    const startRet = {};
    for (const vid of videoIds.slice(0, 250)) {
      try {
        const rp = new URLSearchParams({
          ids: "channel==MINE", startDate, endDate,
          metrics: "audienceWatchRatio", dimensions: "elapsedVideoTimeRatio", filters: `video==${vid}`,
        });
        const rr = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${rp}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
        if (!rr.ok) continue;
        const rd = await rr.json();
        if (rd.rows && rd.rows.length) startRet[vid] = Math.round((rd.rows[0][1] || 0) * 100);
      } catch { /* ignore cette vidéo */ }
    }

    // 4. Source de trafic principale par vidéo (part des vues venant du feed Shorts).
    //    Un appel par vidéo → limité à 60 aussi.
    await setStatus({ status: "running", step: "sources de trafic" });
    const shortsShare = {};
    for (const vid of videoIds.slice(0, 250)) {
      try {
        const tp = new URLSearchParams({
          ids: "channel==MINE", startDate, endDate,
          metrics: "views", dimensions: "insightTrafficSourceType", filters: `video==${vid}`,
        });
        const tr = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${tp}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
        if (!tr.ok) continue;
        const td = await tr.json();
        const trows = td.rows || [];
        const total = trows.reduce((s, r) => s + (r[1] || 0), 0) || 1;
        const shorts = trows.find(r => r[0] === "SHORTS");
        shortsShare[vid] = shorts ? Math.round((shorts[1] / total) * 100) : 0;
      } catch { /* ignore */ }
    }

    // 5. Scripts archivés, indexés par titre (pour matcher).
    await setStatus({ status: "running", step: "scripts" });
    const scriptsByTitle = {};
    try {
      const js = openStore("jarvis-auto-jobs");
      const idx = (await js.get("_index", { type: "json" })) || [];
      for (const jobId of idx.slice(0, 400)) {
        const job = await js.get(jobId, { type: "json" }).catch(() => null);
        if (job?.script?.title) {
          const narration = Array.isArray(job.script.narration_segments)
            ? job.script.narration_segments.map(s => s.text).join(" ") : "";
          scriptsByTitle[job.script.title.trim()] = {
            theme: job.slot === "manuel" ? "manuel" : (job.script.category || ""),
            description: job.script.description || "",
            narration,
          };
        }
      }
    } catch { /* pas grave si pas de scripts */ }

    // 6. Assemble les lignes + DRAPEAU DIAGNOSTIC.
    await setStatus({ status: "running", step: "diagnostic" });
    const header = [
      "Titre", "Date publication", "Thème", "Vues", "Démarrage (%)", "Rétention moy (%)",
      "Durée vue (s)", "Abonnés gagnés", "Part feed Shorts (%)", "Diagnostic", "Script (narration)", "Description",
    ];
    const lines = [header.map(csvCell).join(",")];

    for (const r of rows) {
      const vid = r[0];
      const views = r[1] || 0;
      const avgDur = Math.round(r[2] || 0);
      const avgPct = Math.round((r[3] || 0) * 10) / 10;
      const subs = r[4] || 0;
      const title = (meta[vid]?.title || "").trim();
      const pub = meta[vid]?.publishedAt ? meta[vid].publishedAt.slice(0, 10) : "";
      const start = (vid in startRet) ? startRet[vid] : null;
      const shorts = (vid in shortsShare) ? shortsShare[vid] : null;
      const sc = scriptsByTitle[title] || null;
      const theme = sc?.theme || "";

      // DRAPEAU DIAGNOSTIC (croisement de signaux) :
      let diag;
      if (start !== null && start >= 90 && views < 150) {
        diag = "Bridage algo probable (bon démarrage, peu de vues)";
      } else if (start !== null && start < 70) {
        diag = "Hook faible (démarrage bas → les gens balaient tôt)";
      } else if (avgPct < 35 && views > 0) {
        diag = "Rétention faible (le contenu décroche en cours)";
      } else if (views >= 400) {
        diag = "Performance forte";
      } else if (start === null) {
        diag = "Données insuffisantes (trop peu de vues)";
      } else {
        diag = "Performance normale";
      }

      lines.push([
        title, pub, theme, views, start ?? "", avgPct, avgDur, subs, shorts ?? "", diag,
        sc?.narration || "(script non retrouvé)", sc?.description || "",
      ].map(csvCell).join(","));
    }

    const csv = "\uFEFF" + lines.join("\n"); // BOM pour Excel (accents corrects)

    // 7. Stocke le CSV.
    await openStore("jarvis-export").set("csv", csv);
    await setStatus({ status: "done", rows: rows.length, startDate, endDate });
    return done();
  } catch (e) {
    await setStatus({ status: "error", error: e.message });
    return done();
  }
};

function done() {
  return new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { "Content-Type": "application/json" } });
}
