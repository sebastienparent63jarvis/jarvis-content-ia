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
export async function runScriptStep(slot, opts = {}) {
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

  // Génère le script. En manuel, un sujet/thème peut être IMPOSÉ (opts.topic).
  // Sinon (autonome), le modèle choisit lui-même le sujet d'actu du jour.
  const userPrompt = buildUserPrompt({
    recentTopics,
    topic: opts.topic || undefined,
    newsTheme: opts.newsTheme || undefined,
  });
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

  // Range le job. publishAt : soit imposé (opts.publishAt), soit J+1 au créneau.
  const jobStore = openStore("jarvis-auto-jobs");
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const publishAt = opts.publishAt || computePublishNextDay(slot.hour, slot.min);
  const job = {
    id: jobId, status: "script_done", createdAt: new Date().toISOString(),
    slot: opts.topic ? "manuel" : `${slot.hour}:${String(slot.min).padStart(2, "0")}`, publishAt, script,
  };
  await jobStore.set(jobId, JSON.stringify(job));
  const jIdx = (await jobStore.get("_index", { type: "json" })) || [];
  jIdx.unshift(jobId);
  await jobStore.set("_index", JSON.stringify(jIdx));

  return { ok: true, step: "script_done", jobId, title: script.title, publishAt };
}

// TEMPS A : à partir d'un job "script_done", enchaîne voix (par segment) →
// visuels Pexels → images de marque (HCTI) → LANCEMENT du montage Shotstack.
// Réutilise les endpoints existants (logique testée) via HTTP interne. Le montage
// étant asynchrone, on stocke le render_id ; le Temps B récupérera la vidéo finie.
// `base` = origine du site (ex https://xxx.netlify.app), pour les appels internes.
export async function runProductionStep(jobId, base) {
  const jobStore = openStore("jarvis-auto-jobs");
  const job = await jobStore.get(jobId, { type: "json" });
  if (!job) return { error: "job introuvable" };
  const script = job.script;
  const segments = script.narration_segments || [];
  if (segments.length === 0) return { error: "script sans segments" };

  const post = async (path, body) => {
    const r = await fetch(`${base}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const txt = await r.text();
    let d; try { d = JSON.parse(txt); } catch { throw new Error(`${path} → réponse non JSON (${r.status})`); }
    if (!r.ok) throw new Error(`${path} → ${d.error || r.status}`);
    return d;
  };

  try {
    // 1. VOIX segment par segment (durées réelles pour la synchro).
    const audioSegments = [];
    for (let i = 0; i < segments.length; i++) {
      const a = await post("/api/generate-audio", { text: segments[i].text });
      // Héberge le segment audio (URL publique pour Shotstack).
      const h = await post("/api/store-audio", { audio_base64: a.audio_base64 });
      audioSegments.push({ index: i, url: h.url, duration: estimateDurationFromChars(segments[i].text) });
    }

    // 2. VISUELS Pexels.
    const vis = await post("/api/fetch-visuals", { segments });
    const clips = vis.clips || [];
    const firstPreview = clips.find(c => c.clip && c.clip.preview);

    // 3. IMAGES DE MARQUE (intro incrustée sur 1re image Pexels + outro).
    let introMaskUrl = null, outroImgUrl = null;
    try {
      const bi = await post("/api/generate-brand-images", {
        title: script.title, category: script.category, word: script.thumbnail_word,
        bgImage: firstPreview ? firstPreview.clip.preview : undefined,
      });
      introMaskUrl = bi.introMaskUrl; outroImgUrl = bi.outroImgUrl;
    } catch { /* on continue sans intro/outro plutôt que bloquer */ }

    // 4. LANCE le montage Shotstack (asynchrone → on récupère un render_id).
    const asm = await post("/api/assemble-video", {
      audioSegments, segments, clips,
      title: script.title, category: script.category, word: script.thumbnail_word,
      introMaskUrl, outroImgUrl,
    });
    const renderId = asm.render_id;
    if (!renderId) throw new Error("assemble-video n'a pas renvoyé de render_id");

    // 5. Met à jour le job : montage lancé, en attente du rendu (Temps B).
    job.status = "rendering";
    job.renderId = renderId;
    job.renderEnv = asm.env || "stage";
    job.audioSegments = audioSegments;
    job.updatedAt = new Date().toISOString();
    await jobStore.set(jobId, JSON.stringify(job));

    return { ok: true, step: "rendering", jobId, renderId, title: script.title };
  } catch (e) {
    job.status = "error"; job.error = e.message; job.updatedAt = new Date().toISOString();
    await jobStore.set(jobId, JSON.stringify(job));
    return { error: e.message, jobId };
  }
}

// Estimation de durée (s) d'un segment à partir du nb de caractères (~15 c/s FR).
function estimateDurationFromChars(text) {
  return Math.max(1.5, Math.round(((text || "").length / 15) * 10) / 10);
}

// TEMPS B : parcourt les jobs "rendering", vérifie si leur montage Shotstack est
// terminé ; pour chaque vidéo prête, la range dans la file de VALIDATION et
// envoie le MAIL de notification. Renvoie un résumé de ce qui a été traité.
export async function runCollectStep(base) {
  const jobStore = openStore("jarvis-auto-jobs");
  const idx = (await jobStore.get("_index", { type: "json" })) || [];
  const env = process.env.SHOTSTACK_ENV || "stage";
  const apiKey = process.env.SHOTSTACK_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL || null;

  const processed = [];
  for (const jobId of idx.slice(0, 30)) {
    let job;
    try { job = await jobStore.get(jobId, { type: "json" }); } catch { continue; }
    if (!job || job.status !== "rendering" || !job.renderId) continue;

    // Vérifie l'état du rendu Shotstack.
    let videoUrl = null;
    try {
      const r = await fetch(`https://api.shotstack.io/${env}/render/${job.renderId}`, {
        headers: { "x-api-key": apiKey },
      });
      const d = await r.json();
      const st = d.response?.status;
      if (st === "done") videoUrl = d.response?.url;
      else if (st === "failed") {
        job.status = "error"; job.error = "montage Shotstack échoué";
        await jobStore.set(jobId, JSON.stringify(job));
        processed.push({ jobId, result: "render_failed" });
        continue;
      } else {
        // encore en cours (queued/rendering) → on laisse pour le prochain passage
        continue;
      }
    } catch (e) {
      continue; // on retentera au prochain passage
    }

    if (!videoUrl) continue;

    // Range dans la file de validation.
    try {
      await fetch(`${base}/api/validation-queue`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          item: {
            title: job.script?.title || "Actu Crue",
            description: job.script?.description || "",
            videoUrl,
            publishAt: job.publishAt,
            slot: job.slot,
            sourceJobId: jobId,
          },
        }),
      });
    } catch (e) {
      processed.push({ jobId, result: "queue_error: " + e.message });
      continue;
    }

    // Marque le job comme terminé (mis en file).
    job.status = "queued_for_validation";
    job.videoUrl = videoUrl;
    job.updatedAt = new Date().toISOString();
    await jobStore.set(jobId, JSON.stringify(job));

    // Envoie le mail de notification (si une adresse est configurée).
    if (notifyEmail) {
      try {
        const publishStr = job.publishAt
          ? new Date(job.publishAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })
          : "à définir";
        await fetch(`${base}/api/send-email`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: notifyEmail,
            subject: `Actu Crue — vidéo à valider : ${job.script?.title || ""}`.slice(0, 120),
            html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
              <h2 style="color:#7D4698">Ta vidéo du jour est prête</h2>
              <p style="font-size:16px;font-weight:600">${escapeHtmlLite(job.script?.title || "")}</p>
              <p style="color:#555;line-height:1.6">Elle t'attend dans l'onglet <b>À valider</b> de l'app. Publie-la (privé + planifié pour le ${publishStr}) ou rejette-la.</p>
              <p><a href="${base}/" style="display:inline-block;background:#7D4698;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Ouvrir Actu Crue →</a></p>
            </div>`,
          }),
        });
      } catch { /* mail best-effort */ }
    }

    processed.push({ jobId, result: "queued", title: job.script?.title, videoUrl });
  }

  return { ok: true, processedCount: processed.length, processed, notifyEmail: !!notifyEmail };
}

function escapeHtmlLite(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
