// MOTEUR DE PRODUCTION QUOTIDIENNE — BACKGROUND (suffixe -background = jusqu'à
// 15 min, contrairement au cron limité à 15 s). Déclenché par auto-pipeline (le
// cron) à ~5h. Produit les 3 vidéos du jour (géo + société + éco). La collecte
// (auto-collect) les récupère ensuite → « À valider ».

import { runDailyBatch, openStore } from "./_auto-core.js";

export default async (req) => {
  const runId = `produce-${Date.now()}`;
  const base = new URL(req.url).origin;

  try { await openStore("jarvis-auto-runs").set("last_batch", JSON.stringify({ runId, status: "running", startedAt: new Date().toISOString() })); }
  catch { /* ignore */ }

  let result;
  try { result = await runDailyBatch(base); }
  catch (e) { result = { error: e.message }; }

  try { await openStore("jarvis-auto-runs").set("last_batch", JSON.stringify({ runId, status: "done", finishedAt: new Date().toISOString(), result })); }
  catch { /* ignore */ }

  return new Response(JSON.stringify({ accepted: true, runId }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
};
