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

  // 3. File de validation : combien de vidéos VRAIMENT en attente (status pending) ?
  try {
    const vq = open("jarvis-validation-queue");
    const idx = (await vq.get("_index", { type: "json" })) || [];
    out.validation.indexLength = idx.length;
    let pending = 0, decided = 0;
    for (const id of idx.slice(0, 200)) {
      const it = await vq.get(id, { type: "json" }).catch(() => null);
      if (!it) continue;
      if (it.status === "pending") pending++; else decided++;
    }
    out.validation.pending = pending;
    out.validation.decided = decided;
  } catch (e) { out.validation.error = e.message; }

  // 4. JOBS récents + état réel du montage Shotstack (le maillon suspect :
  //    une vidéo "rendering" qui ne passe jamais "done" n'arrive jamais en file).
  try {
    const jobs = open("jarvis-auto-jobs");
    const jidx = (await jobs.get("_index", { type: "json" })) || [];
    const env = process.env.SHOTSTACK_ENV || "stage";
    const apiKey = process.env.SHOTSTACK_API_KEY;
    out.jobs = [];
    for (const jid of jidx.slice(0, 8)) {
      const job = await jobs.get(jid, { type: "json" }).catch(() => null);
      if (!job) continue;
      const row = { title: job.script?.title || "?", status: job.status, renderId: job.renderId || null, createdAt: job.createdAt, jobError: job.error || null };
      // Pour TOUT job ayant un renderId (y compris "error"), on demande à Shotstack
      // le détail : statut réel + message d'erreur exact (la cause du blocage).
      if (job.renderId && apiKey) {
        try {
          const r = await fetch(`https://api.shotstack.io/${env}/render/${job.renderId}`, { headers: { "x-api-key": apiKey } });
          const d = await r.json();
          row.shotstack = d.response?.status || `http ${r.status}`;
          if (d.response?.error) row.shotstackError = d.response.error;
          if (d.response?.data?.error) row.shotstackDataError = d.response.data.error;
          if (d.message && !d.response) row.shotstackMsg = d.message;
        } catch (e) { row.shotstack = "appel échoué: " + e.message; }
      }
      out.jobs.push(row);
    }
    out.shotstackEnv = env;
  } catch (e) { out.jobs = { error: e.message }; }

  return new Response(JSON.stringify(out, null, 2), {
    status: 200, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};

export const config = { path: "/api/auto-diag" };
