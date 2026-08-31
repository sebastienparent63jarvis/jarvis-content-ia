// Cœur PARTAGÉ de la production autonome. Contient la logique (créneau, sujet,
// script, calcul de la date de publication J+1) sans être lui-même une fonction
// programmée — pour qu'on puisse le déclencher à la fois par le cron ET par une
// fonction de test normale (les fonctions "scheduled" de Netlify renvoient 403
// si on les ouvre par URL, donc impossibles à tester au navigateur).

import { getStore } from "@netlify/blobs";
import { SHORTS_SYSTEM_PROMPT, buildUserPrompt, extractScript } from "./_script-core.js";

// Heure de Paris courante (gère UTC+1/UTC+2 automatiquement via Intl).
export function parisNow() {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === "hour").value, 10);
  const m = parseInt(parts.find(p => p.type === "minute").value, 10);
  return { h, m };
}

export function openStore(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
    throw e;
  }
}

// Décalage (minutes) de l'heure de Paris par rapport à UTC pour une date donnée.
function parisOffsetMinutes(date) {
  const tzStr = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" })
    .formatToParts(date).find(p => p.type === "timeZoneName")?.value || "GMT+1";
  const m = tzStr.match(/GMT([+-]\d+)/);
  return m ? parseInt(m[1], 10) * 60 : 60;
}

// Publication le LENDEMAIN à hh:mm heure de Paris, renvoyée en ISO (UTC).
export function computePublishNextDay(hour, min) {
  const now = new Date();
  const parisDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, mo, d] = parisDateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1, hour, min));
  const offsetMin = parisOffsetMinutes(next);
  next.setUTCMinutes(next.getUTCMinutes() - offsetMin);
  return next.toISOString();
}

// Produit le SCRIPT du jour et range un job. `slot` = { hour, min }.
// Renvoie { ok, jobId, title, publishAt } ou { error }.
export async function runScriptStep(slot) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "ANTHROPIC_API_KEY manquante" };

  // Anti-doublon : titres récents.
  let recentTopics = [];
  try {
    const histStore = openStore("jarvis-scripts");
    const idx = (await histStore.get("_index", { type: "json" })) || [];
    for (const id of idx.slice(0, 15)) {
      const it = await histStore.get(id, { type: "json" });
      if (it?.script?.title) recentTopics.push(it.script.title);
    }
  } catch { /* historique vide, pas grave */ }

  // Génère le script (le modèle choisit le sujet d'actu du jour).
  const userPrompt = buildUserPrompt({ recentTopics });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, system: SHORTS_SYSTEM_PROMPT, messages: [{ role: "user", content: userPrompt }] }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error?.message || "Erreur API script" };
  const textPart = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  let script;
  try { script = extractScript(textPart); }
  catch { return { error: "Script non conforme (JSON)" }; }

  // Range le job.
  const jobStore = openStore("jarvis-auto-jobs");
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const publishAt = computePublishNextDay(slot.hour, slot.min);
  const job = {
    id: jobId, status: "script_done", createdAt: new Date().toISOString(),
    slot: `${slot.hour}:${String(slot.min).padStart(2, "0")}`, publishAt, script,
  };
  await jobStore.set(jobId, JSON.stringify(job));
  const jIdx = (await jobStore.get("_index", { type: "json" })) || [];
  jIdx.unshift(jobId);
  await jobStore.set("_index", JSON.stringify(jIdx));

  return { ok: true, step: "script_done", jobId, title: script.title, publishAt };
}
