// TEST du pipeline autonome COMPLET (Temps A) en BACKGROUND (pas de limite 10s).
// Enchaîne : script → voix → visuels → images de marque → lancement montage.
// Répond 202 tout de suite, stocke l'avancement dans Blobs (lisible via
// auto-pipeline-status).

import { runScriptStep, runProductionStep, openStore } from "./_auto-core.js";

const SLOT = { hour: 8, min: 30 };

export default async (req) => {
  const runId = `run-${Date.now()}`;
  const base = new URL(req.url).origin; // https://<site> pour les appels internes
  const mark = async (obj) => {
    try {
      const store = openStore("jarvis-auto-runs");
      await store.set("last", JSON.stringify({ runId, ...obj }));
    } catch { /* ignore */ }
  };

  await mark({ status: "running", step: "script", startedAt: new Date().toISOString() });

  // 1. Script
  const s = await runScriptStep(SLOT);
  if (!s.ok) { await mark({ status: "done", result: s }); return accepted(runId); }
  await mark({ status: "running", step: "production", jobId: s.jobId, title: s.title });

  // 2. Production (voix + visuels + marque + lancement montage)
  const p = await runProductionStep(s.jobId, base);
  await mark({ status: "done", finishedAt: new Date().toISOString(), result: { script: s, production: p } });

  return accepted(runId);
};

function accepted(runId) {
  return new Response(JSON.stringify({ accepted: true, runId }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
}
