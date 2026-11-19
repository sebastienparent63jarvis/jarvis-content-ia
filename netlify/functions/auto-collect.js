// COLLECTE PROGRAMMÉE (cron) — Temps B automatique. Toutes les 5 minutes, elle
// récupère les vidéos dont le montage Shotstack est terminé, les range dans la
// file "À valider" et envoie le mail. Fonctionne pour TOUTES les productions
// (mode rapide manuel ET pipeline autonome). Plus aucun déclenchement à la main.
//
// Base URL : les fonctions scheduled n'ont pas d'origine publique fiable dans
// req.url, donc on lit l'URL du site depuis les variables d'environnement
// Netlify (URL / DEPLOY_PRIME_URL sont fournies automatiquement par Netlify).

import { runCollectStep, openStore } from "./_auto-core.js";

function siteBase() {
  // Variables fournies par Netlify au build/run. On privilégie l'URL de prod.
  return (
    process.env.SITE_URL ||
    process.env.URL ||
    process.env.DEPLOY_URL ||
    "https://jarviscontenuia.netlify.app"
  ).replace(/\/$/, "");
}

export default async () => {
  const runId = `cron-collect-${Date.now()}`;
  const base = siteBase();
  let result;
  try { result = await runCollectStep(base); }
  catch (e) { result = { error: e.message }; }
  try {
    await openStore("jarvis-auto-runs").set("last_collect", JSON.stringify({
      runId, status: "done", cron: true, finishedAt: new Date().toISOString(), result,
    }));
  } catch { /* ignore */ }
  return new Response(JSON.stringify({ ok: true, runId, result }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};

// Toutes les 5 minutes.
export const config = { schedule: "*/5 * * * *" };
