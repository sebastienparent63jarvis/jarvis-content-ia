// MOTEUR DE PRODUCTION — UNE VIDÉO (background, jusqu'à 15 min). Option 2 : le
// cron déclenche UNE instance de cette fonction PAR vidéo (3 thèmes = 3 appels),
// pour que chaque vidéo ait son propre budget de 15 min → évolutif (volume ET
// contenu long). Trace chaque étape dans les logs.
//
// Corps : { theme: "geopolitique"|"societe"|"economie" }

import { runOneVideo, openStore } from "./_auto-core.js";

export default async (req) => {
  let body; try { body = await req.json(); } catch { body = {}; }
  const theme = ["geopolitique", "societe", "economie"].includes(body.theme) ? body.theme : "geopolitique";
  const runId = `one-${theme}-${Date.now()}`;
  const base = new URL(req.url).origin;

  console.log(`[produce-one] REÇU thème=${theme} runId=${runId}`);
  try { await openStore("jarvis-auto-runs").set(`last_one_${theme}`, JSON.stringify({ runId, status: "running", theme, startedAt: new Date().toISOString() })); }
  catch (e) { console.log(`[produce-one] warn store: ${e.message}`); }

  let result;
  try {
    result = await runOneVideo(theme, base);
  } catch (e) {
    console.log(`[produce-one] EXCEPTION globale thème=${theme}: ${e.message}`);
    result = { error: e.message };
  }

  try { await openStore("jarvis-auto-runs").set(`last_one_${theme}`, JSON.stringify({ runId, status: "done", theme, finishedAt: new Date().toISOString(), result })); }
  catch { /* ignore */ }

  console.log(`[produce-one] FIN thème=${theme} runId=${runId}`);
  return new Response(JSON.stringify({ accepted: true, runId, theme }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
};
