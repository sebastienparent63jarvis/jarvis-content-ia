// PIPELINE MANUEL ACCÉLÉRÉ (Interprétation A) : depuis un sujet choisi par
// l'utilisateur, lance la chaîne COMPLÈTE en background (script → voix → visuels
// → marque → montage), puis la collecte rangera la vidéo dans "À valider" + mail.
// L'utilisateur ne reste pas devant l'écran.
//
// Corps : { topic, angle } (angle optionnel, comme la recherche d'actu)

import { runScriptStep, runProductionStep, openStore } from "./_auto-core.js";

export default async (req) => {
  const runId = `manual-${Date.now()}`;
  const base = new URL(req.url).origin;
  let body; try { body = await req.json(); } catch { body = {}; }
  const topic = (body.topic || "").trim();

  const mark = async (obj) => {
    try { await openStore("jarvis-auto-runs").set("last_manual", JSON.stringify({ runId, ...obj })); }
    catch { /* ignore */ }
  };

  if (!topic) {
    await mark({ status: "done", result: { error: "Sujet manquant" } });
    return accepted(runId);
  }

  await mark({ status: "running", step: "script", topic });

  // 1. Script à partir du sujet imposé. Pas de créneau (publication : à définir
  //    par l'utilisateur au moment de valider, ou J+1 par défaut).
  const s = await runScriptStep({ hour: 8, min: 30 }, { topic, newsTheme: topic });
  if (!s.ok) { await mark({ status: "done", result: s }); return accepted(runId); }

  await mark({ status: "running", step: "production", jobId: s.jobId, title: s.title });

  // 2. Production complète (voix + visuels + marque + lancement montage).
  const p = await runProductionStep(s.jobId, base);
  await mark({ status: "done", finishedAt: new Date().toISOString(), result: { script: s, production: p } });

  return accepted(runId);
};

function accepted(runId) {
  return new Response(JSON.stringify({ accepted: true, runId }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
}
