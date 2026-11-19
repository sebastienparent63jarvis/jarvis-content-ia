// TEST de la PRODUCTION GROUPÉE quotidienne (background, sans limite 10s).
// Produit les 3 vidéos du jour (géo + société + éco) comme le cron de 5h, mais
// à la demande pour tester. Résultat lisible via auto-pipeline-status (clé last_batch).

import { runDailyBatch, openStore } from "./_auto-core.js";

export default async (req) => {
  const runId = `batchtest-${Date.now()}`;
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
