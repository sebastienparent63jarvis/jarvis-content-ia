// PRODUCTION GROUPÉE QUOTIDIENNE (cron ~5h Paris). Produit les 3 vidéos du jour
// (géopolitique 8h30, société 12h30, économie 19h30), chacune planifiée pour son
// créneau du JOUR MÊME. Tout est prêt à valider avant 7h. La collecte
// (auto-collect) récupère les vidéos montées → « À valider ». La notification
// récap est envoyée séparément à 7h par auto-notify.

import { parisNow, runDailyBatch, openStore } from "./_auto-core.js";

// Créneau de production : ~5h heure de Paris.
const PROD = { hour: 5, min: 0 };
const TOLERANCE_MIN = 25;

export default async () => {
  const { h, m } = parisNow();
  const withinSlot = Math.abs((h * 60 + m) - (PROD.hour * 60 + PROD.min)) <= TOLERANCE_MIN;
  if (!withinSlot) {
    return new Response(JSON.stringify({ skipped: true, parisTime: `${h}:${String(m).padStart(2, "0")}` }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  const base = (process.env.SITE_URL || process.env.URL || "https://jarviscontenuia.netlify.app").replace(/\/$/, "");
  const result = await runDailyBatch(base);
  try {
    await openStore("jarvis-auto-runs").set("last_batch", JSON.stringify({ status: "done", finishedAt: new Date().toISOString(), result }));
  } catch { /* ignore */ }
  return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
};

// Cron autour de 5h Paris : 3h-4h UTC (couvre été UTC+2 et hiver UTC+1).
export const config = { schedule: "0,15,30,45 3-4 * * *" };
