// PRODUCTION GROUPÉE QUOTIDIENNE. Produit les 3 vidéos du jour (géo 8h30,
// société 12h30, éco 19h30), planifiées pour le JOUR MÊME.
//
// FIABILITÉ : au lieu d'un double filtre fragile (fenêtre UTC + tolérance Paris)
// qui ratait le créneau, on utilise un GARDE ANTI-DOUBLON. Le cron tourne sur une
// large fenêtre le matin ; dès qu'il passe APRÈS 5h (heure de Paris) et que la
// production n'a pas déjà eu lieu aujourd'hui, il produit — une seule fois.

import { parisMinutes, runDailyBatch, openStore, alreadyRanToday, markRanToday } from "./_auto-core.js";

const TASK = "daily-production";
const TARGET_MIN = 5 * 60; // 5h00 Paris : on produit dès qu'on est à/après cette heure

export default async () => {
  // Déjà produit aujourd'hui ? On sort.
  if (await alreadyRanToday(TASK)) {
    return new Response(JSON.stringify({ skipped: "déjà produit aujourd'hui" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  // Pas encore l'heure (avant 5h Paris) ? On attend le prochain passage du cron.
  if (parisMinutes() < TARGET_MIN) {
    return new Response(JSON.stringify({ skipped: "avant 5h Paris" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // On marque AVANT de produire, pour éviter qu'un second passage du cron pendant
  // la production (qui dure quelques minutes) ne relance un doublon.
  await markRanToday(TASK);

  const base = (process.env.SITE_URL || process.env.URL || "https://jarviscontenuia.netlify.app").replace(/\/$/, "");
  const result = await runDailyBatch(base);
  try {
    await openStore("jarvis-auto-runs").set("last_batch", JSON.stringify({ status: "done", finishedAt: new Date().toISOString(), result }));
  } catch { /* ignore */ }
  return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
};

// Fenêtre LARGE le matin (toutes les 15 min de 3h à 7h UTC), pour être sûr de
// couvrir 5h Paris quelle que soit la saison. Le garde anti-doublon fait que la
// production n'a lieu qu'une fois, au premier passage après 5h Paris.
export const config = { schedule: "0,15,30,45 3-7 * * *" };
