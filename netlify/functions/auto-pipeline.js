// PIPELINE AUTONOME — fonction programmée (cron). Étape 1 du cœur : à l'heure
// prévue (en heure de Paris, calculée dynamiquement pour gérer été/hiver), elle
// lance la production d'une vidéo. Ici on démarre par : choisir un sujet + créer
// le script, et ranger un "job" en cours dans Blobs. Les étapes suivantes (voix,
// visuels, montage) seront chaînées ensuite, puis la vidéo ira dans la file de
// validation avec envoi du mail.
//
// IMPORTANT fuseau : Netlify exécute les crons en UTC. On ne peut pas y mettre
// "l'heure de Paris". On programme donc le cron à un horaire UTC, et la fonction
// VÉRIFIE elle-même qu'on est bien à l'heure de Paris voulue (SLOT_PARIS_HOUR:MIN)
// avant d'agir — ce contrôle absorbe le passage été/hiver automatiquement.

import { getStore } from "@netlify/blobs";
import { SHORTS_SYSTEM_PROMPT, buildUserPrompt, extractScript } from "./_script-core.js";

// --- Créneau visé, en heure de Paris (on démarre avec UN seul créneau) ---
const SLOT_PARIS_HOUR = 8;
const SLOT_PARIS_MIN = 30;
const SLOT_TOLERANCE_MIN = 20; // marge : le cron peut tourner un peu avant/après

// Heure de Paris courante (gère UTC+1/UTC+2 automatiquement via Intl).
function parisNow() {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === "hour").value, 10);
  const m = parseInt(parts.find(p => p.type === "minute").value, 10);
  return { h, m };
}

function openStore(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
    throw e;
  }
}

export default async (req) => {
  // 1. Contrôle du créneau (heure de Paris).
  const { h, m } = parisNow();
  const nowMin = h * 60 + m;
  const slotMin = SLOT_PARIS_HOUR * 60 + SLOT_PARIS_MIN;
  const withinSlot = Math.abs(nowMin - slotMin) <= SLOT_TOLERANCE_MIN;

  // Permet un déclenchement manuel de test via ?force=1 (bypasse le contrôle d'heure).
  const url = new URL(req.url);
  const forced = url.searchParams.get("force") === "1";

  if (!withinSlot && !forced) {
    return new Response(JSON.stringify({ skipped: true, parisTime: `${h}:${String(m).padStart(2, "0")}`, reason: "hors créneau" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY manquante" }), { status: 500 });
  }

  try {
    // 2. Anti-doublon : on récupère les titres récents pour ne pas répéter.
    let recentTopics = [];
    try {
      const histStore = openStore("jarvis-scripts");
      const idx = (await histStore.get("_index", { type: "json" })) || [];
      for (const id of idx.slice(0, 15)) {
        const it = await histStore.get(id, { type: "json" });
        if (it?.script?.title) recentTopics.push(it.script.title);
      }
    } catch { /* pas grave si l'historique est vide */ }

    // 3. Génère le script (le modèle choisit lui-même le sujet d'actu du jour).
    const userPrompt = buildUserPrompt({ recentTopics });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: SHORTS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Erreur API script");
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const script = extractScript(text);

    // 4. Range un JOB en cours dans Blobs (les étapes suivantes le reprendront).
    const jobStore = openStore("jarvis-auto-jobs");
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const publishAt = computePublishNextDay();
    const job = {
      id: jobId, status: "script_done", createdAt: new Date().toISOString(),
      slot: `${SLOT_PARIS_HOUR}:${String(SLOT_PARIS_MIN).padStart(2, "0")}`,
      publishAt, script,
    };
    await jobStore.set(jobId, JSON.stringify(job));
    const jIdx = (await jobStore.get("_index", { type: "json" })) || [];
    jIdx.unshift(jobId);
    await jobStore.set("_index", JSON.stringify(jIdx));

    return new Response(JSON.stringify({ ok: true, step: "script_done", jobId, title: script.title, publishAt }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
};

// Publication le LENDEMAIN à la même heure de créneau (heure de Paris), en ISO.
function computePublishNextDay() {
  const now = new Date();
  // On construit une date à J+1 à SLOT_PARIS_HOUR:MIN heure de Paris.
  // Astuce : on formate en Europe/Paris pour récupérer la date du jour, +1 jour.
  const parisDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, mo, d] = parisDateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1, SLOT_PARIS_HOUR, SLOT_PARIS_MIN));
  // Correction du décalage Paris : on soustrait l'offset de Paris à cette date.
  const offsetMin = parisOffsetMinutes(next);
  next.setUTCMinutes(next.getUTCMinutes() - offsetMin);
  return next.toISOString();
}

// Décalage (minutes) de l'heure de Paris par rapport à UTC pour une date donnée.
function parisOffsetMinutes(date) {
  const tzStr = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" })
    .formatToParts(date).find(p => p.type === "timeZoneName")?.value || "GMT+1";
  const m = tzStr.match(/GMT([+-]\d+)/);
  return m ? parseInt(m[1], 10) * 60 : 60;
}

// Programme le cron LARGE (toutes les 15 min autour des créneaux possibles) ;
// la fonction filtre elle-même l'heure de Paris exacte. Pour l'instant, un seul
// créneau visé (8h30 Paris) : on couvre 6h-8h UTC pour absorber été/hiver.
export const config = {
  schedule: "0,15,30,45 6-8 * * *",
};
