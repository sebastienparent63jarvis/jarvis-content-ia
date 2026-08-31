// PIPELINE AUTONOME — fonction PROGRAMMÉE (cron). Elle vérifie qu'on est bien au
// créneau voulu en heure de Paris (absorbe été/hiver), puis lance la production
// via le cœur partagé. Non testable par URL (Netlify renvoie 403) — utiliser
// auto-pipeline-test pour les essais manuels.

import { parisNow, runScriptStep } from "./_auto-core.js";

// Créneau visé, en heure de Paris (on démarre avec UN seul créneau : 8h30).
const SLOT = { hour: 8, min: 30 };
const TOLERANCE_MIN = 20;

export default async () => {
  const { h, m } = parisNow();
  const withinSlot = Math.abs((h * 60 + m) - (SLOT.hour * 60 + SLOT.min)) <= TOLERANCE_MIN;
  if (!withinSlot) {
    return new Response(JSON.stringify({ skipped: true, parisTime: `${h}:${String(m).padStart(2, "0")}` }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  const result = await runScriptStep(SLOT);
  return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
};

// Cron LARGE (toutes les 15 min sur 6h-8h UTC) ; la fonction filtre l'heure de
// Paris exacte. 6h-8h UTC couvre 8h30 Paris été (UTC+2) comme hiver (UTC+1).
export const config = { schedule: "0,15,30,45 6-8 * * *" };
