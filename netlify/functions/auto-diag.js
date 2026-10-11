// DIAGNOSTIC complet de la production autonome (Option 2). Lit les VRAIES clés
// écrites par auto-produce-one-background (last_one_<theme>) + l'état du cron
// (garde anti-doublon) + la file de validation. Tout en une URL, lisible au
// téléphone. Lecture seule.
import { getStore } from "@netlify/blobs";

function open(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
    throw e;
  }
}

export default async () => {
  const out = { now: new Date().toISOString(), production: {}, cronGuard: {}, validation: {} };

  // 1. Statut de chaque thème (dernière production individuelle).
  try {
    const runs = open("jarvis-auto-runs");
    for (const theme of ["geopolitique", "societe", "economie"]) {
      const v = await runs.get(`last_one_${theme}`, { type: "json" });
      out.production[theme] = v || "(jamais produit)";
    }
  } catch (e) { out.production.error = e.message; }

  // 2. Garde anti-doublon : la valeur stockée est la date (clé Paris) du dernier
  //    passage. Si elle == aujourd'hui, le cron a bien tourné ce matin.
  try {
    const guard = open("jarvis-cron-guard");
    out.cronGuard.daily_production = (await guard.get("daily-production")) || "(jamais)";
    out.cronGuard.daily_notify = (await guard.get("daily-notify")) || "(jamais)";
    out.cronGuard.parisToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  } catch (e) { out.cronGuard.error = e.message; }

  // 3. File de validation : combien de vidéos en attente ?
  try {
    const vq = open("jarvis-validation-queue");
    const idx = (await vq.get("_index", { type: "json" })) || [];
    out.validation.pending = idx.length;
    out.validation.ids = idx.slice(0, 10);
  } catch (e) { out.validation.error = e.message; }

  return new Response(JSON.stringify(out, null, 2), {
    status: 200, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};

export const config = { path: "/api/auto-diag" };
