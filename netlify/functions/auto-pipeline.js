// PRODUCTION GROUPÉE QUOTIDIENNE (cron). IMPORTANT : ce cron est une fonction
// programmée CLASSIQUE, limitée à ~15 s. Il ne DOIT PAS produire lui-même (la
// production prend plusieurs minutes → coupure 499). Son seul rôle : vérifier le
// garde anti-doublon puis DÉCLENCHER la background function qui, elle, a jusqu'à
// 15 min pour produire. Le cron rend la main tout de suite.

import { parisMinutes, alreadyRanToday, markRanToday } from "./_auto-core.js";

const TASK = "daily-production";
const TARGET_MIN = 5 * 60; // 5h Paris

export default async () => {
  if (await alreadyRanToday(TASK)) {
    return new Response(JSON.stringify({ skipped: "déjà produit aujourd'hui" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  if (parisMinutes() < TARGET_MIN) {
    return new Response(JSON.stringify({ skipped: "avant 5h Paris" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // Marque AVANT de déclencher (évite qu'un 2e passage du cron relance un doublon).
  await markRanToday(TASK);

  const base = (process.env.SITE_URL || process.env.URL || "https://jarviscontenuia.netlify.app").replace(/\/$/, "");

  // Déclenche la production en BACKGROUND (sans attendre la fin → pas de 499).
  // On n'attend PAS la réponse : fire-and-forget.
  try {
    fetch(`${base}/.netlify/functions/auto-produce-background`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }).catch(() => {});
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ triggered: true, note: "production lancée en background" }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};

// Fenêtre large le matin (3h-7h UTC) ; le garde anti-doublon assure 1 seule
// production par jour, au premier passage après 5h Paris.
export const config = { schedule: "0,15,30,45 3-7 * * *" };
