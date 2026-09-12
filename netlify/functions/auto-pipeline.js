// PRODUCTION QUOTIDIENNE — CRON (limite 30 s). Option 2 : le cron ne produit pas
// lui-même. Il déclenche UNE background function PAR vidéo (géo, société, éco) et
// ATTEND le 202 de chacune (confirmation que Netlify a bien accepté l'invocation
// — c'est ce qui manquait au fire-and-forget qui ne partait jamais). Chaque
// background a ensuite ses 15 min propres pour produire. Le cron, lui, ne fait
// que 3 déclenchements rapides → tient largement dans ses 30 s.

import { parisMinutes, alreadyRanToday, markRanToday, DAILY_PLAN } from "./_auto-core.js";

const TASK = "daily-production";
const TARGET_MIN = 5 * 60; // 5h Paris

export default async () => {
  if (await alreadyRanToday(TASK)) {
    console.log("[cron] skip : déjà produit aujourd'hui");
    return json({ skipped: "déjà produit aujourd'hui" });
  }
  if (parisMinutes() < TARGET_MIN) {
    console.log(`[cron] skip : avant 5h Paris (${parisMinutes()} min)`);
    return json({ skipped: "avant 5h Paris" });
  }

  // Marque AVANT de déclencher (évite qu'un 2e passage du cron relance un doublon).
  await markRanToday(TASK);

  const base = (process.env.SITE_URL || process.env.URL || "https://jarviscontenuia.netlify.app").replace(/\/$/, "");
  const triggered = [];

  // Déclenche UNE background par thème, en ATTENDANT le 202 de chacune.
  for (const plan of DAILY_PLAN) {
    try {
      const r = await fetch(`${base}/.netlify/functions/auto-produce-one-background`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: plan.key }),
      });
      console.log(`[cron] déclenché thème=${plan.key} → HTTP ${r.status}`);
      triggered.push({ theme: plan.key, status: r.status });
    } catch (e) {
      console.log(`[cron] ÉCHEC déclenchement thème=${plan.key} : ${e.message}`);
      triggered.push({ theme: plan.key, error: e.message });
    }
  }

  return json({ triggered });
};

function json(obj) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });
}

// Fenêtre large le matin (3h-7h UTC) ; garde anti-doublon = 1 production/jour.
export const config = { schedule: "0,15,30,45 3-7 * * *" };
