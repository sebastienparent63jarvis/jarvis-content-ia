// TEST du pipeline autonome en BACKGROUND (suffixe -background = pas de limite
// de 10s). Répond 202 immédiatement, exécute la production (qui inclut l'appel
// lent au modèle), et STOCKE le résultat dans Blobs. On lit ensuite le résultat
// via auto-pipeline-status.

import { runScriptStep, openStore } from "./_auto-core.js";

const SLOT = { hour: 8, min: 30 };

export default async (req) => {
  // Marque un statut "en cours" lisible tout de suite.
  let runId = `run-${Date.now()}`;
  try {
    const store = openStore("jarvis-auto-runs");
    await store.set("last", JSON.stringify({ runId, status: "running", startedAt: new Date().toISOString() }));
  } catch { /* on continue même si le marquage échoue */ }

  // Exécute la production (peut prendre 20-40s : OK en background).
  let result;
  try {
    result = await runScriptStep(SLOT);
  } catch (e) {
    result = { error: e.message };
  }

  // Stocke le résultat final, lisible par auto-pipeline-status.
  try {
    const store = openStore("jarvis-auto-runs");
    await store.set("last", JSON.stringify({ runId, status: "done", finishedAt: new Date().toISOString(), result }));
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ accepted: true, runId }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
};
