// TEST du Temps B : récupère les vidéos dont le montage est fini, les range dans
// la file de validation et envoie le mail. Background (pas de limite 10s).
// Déclenchable par URL pour tester ; le pendant programmé est auto-collect.js.

import { runCollectStep, openStore } from "./_auto-core.js";

export default async (req) => {
  const runId = `collect-${Date.now()}`;
  const base = new URL(req.url).origin;
  let result;
  try { result = await runCollectStep(base); }
  catch (e) { result = { error: e.message }; }
  try {
    const store = openStore("jarvis-auto-runs");
    await store.set("last_collect", JSON.stringify({ runId, status: "done", finishedAt: new Date().toISOString(), result }));
  } catch { /* ignore */ }
  return new Response(JSON.stringify({ accepted: true, runId }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
};
