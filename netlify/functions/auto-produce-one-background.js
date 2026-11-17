// MOTEUR DE PRODUCTION — UNE VIDÉO (background, jusqu'à 15 min). Option 2 : le
// cron déclenche UNE instance de cette fonction PAR créneau (5 créneaux/jour),
// pour que chaque vidéo ait son propre budget de 15 min → évolutif (volume ET
// contenu long). Trace chaque étape dans les logs.
//
// Corps : { id, theme, hour, min }
//   id    : identifiant UNIQUE du créneau (ex "geo-midi") → clé de statut dédiée,
//           indispensable quand plusieurs créneaux partagent le même thème.
//   theme : "geopolitique" | "societe" | "economie"
//   hour/min : créneau de publication explicite (évite le télescopage des thèmes).

import { runOneVideo, openStore } from "./_auto-core.js";

export default async (req) => {
  let body; try { body = await req.json(); } catch { body = {}; }
  const theme = ["geopolitique", "societe", "economie"].includes(body.theme) ? body.theme : "geopolitique";
  const id = (body.id || theme).toString().slice(0, 40);
  const slot = (body.hour != null && body.min != null) ? { hour: body.hour, min: body.min } : undefined;
  const rank = Number.isFinite(body.rank) ? body.rank : 0;
  const runId = `one-${id}-${Date.now()}`;
  const base = new URL(req.url).origin;
  const key = `last_one_${id}`;

  console.log(`[produce-one] REÇU id=${id} thème=${theme} runId=${runId}`);
  try { await openStore("jarvis-auto-runs").set(key, JSON.stringify({ runId, id, status: "running", theme, startedAt: new Date().toISOString() })); }
  catch (e) { console.log(`[produce-one] warn store: ${e.message}`); }

  let result;
  try {
    result = await runOneVideo(theme, base, slot, rank);
  } catch (e) {
    console.log(`[produce-one] EXCEPTION globale id=${id}: ${e.message}`);
    result = { error: e.message };
  }

  try { await openStore("jarvis-auto-runs").set(key, JSON.stringify({ runId, id, status: "done", theme, finishedAt: new Date().toISOString(), result })); }
  catch { /* ignore */ }

  console.log(`[produce-one] FIN id=${id} runId=${runId}`);
  return new Response(JSON.stringify({ accepted: true, runId, id, theme }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
};
