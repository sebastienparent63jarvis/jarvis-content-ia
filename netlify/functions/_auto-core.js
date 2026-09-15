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

// MODE MANUEL : prochain créneau (8h30 / 12h30 / 19h30) encore disponible
// AUJOURD'HUI en heure de Paris. Renvoie l'ISO du créneau, ou null s'il n'y a
// plus de créneau aujourd'hui (après 19h30) → l'utilisateur choisira la date.
export function computeNextSlotToday() {
  const SLOTS = [{ h: 8, m: 30 }, { h: 12, m: 30 }, { h: 19, m: 30 }];
  const { h, m } = parisNow();
  const nowMin = h * 60 + m;
  // On garde une petite marge (2 min) pour éviter de viser un créneau qui vient
  // juste de passer et serait déjà "dans le passé" pour YouTube.
  const slot = SLOTS.find(s => (s.h * 60 + s.m) > nowMin + 2);
  if (!slot) return null; // plus de créneau aujourd'hui

  const now = new Date();
  const parisDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, mo, d] = parisDateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, mo - 1, d, slot.h, slot.m));
  const offsetMin = parisOffsetMinutes(target);
  target.setUTCMinutes(target.getUTCMinutes() - offsetMin);
  return target.toISOString();
}

// Créneau PRÉCIS aujourd'hui (heure de Paris) en ISO. Renvoie {iso, passed}.
// passed=true si l'heure est déjà dépassée (marge 3 min) — utile pour décaler
// une vidéo validée trop tard vers le créneau suivant.
export function computeSlotToday(hour, min) {
  const now = new Date();
  const parisDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, mo, d] = parisDateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, mo - 1, d, hour, min));
  const offsetMin = parisOffsetMinutes(target);
  target.setUTCMinutes(target.getUTCMinutes() - offsetMin);
  const passed = target.getTime() <= Date.now() + 3 * 60 * 1000;
  return { iso: target.toISOString(), passed };
}

// Produit le SCRIPT du jour et range un job. `slot` = { hour, min }.
// Renvoie { ok, jobId, title, publishAt } ou { error }.
export async function runScriptStep(slot, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "ANTHROPIC_API_KEY manquante" };

  // Anti-doublon : titres récents (élargi à 30 pour l'autonome).
  let recentTopics = [];
  try {
    const histStore = openStore("jarvis-scripts");
    const idx = (await histStore.get("_index", { type: "json" })) || [];
    for (const id of idx.slice(0, 30)) {
      const it = await histStore.get(id, { type: "json" });
      if (it?.script?.title) recentTopics.push(it.script.title);
    }
  } catch { /* historique vide, pas grave */ }

  // Génère le script. En manuel, un sujet/thème peut être IMPOSÉ (opts.topic).
  // Sinon (autonome), le modèle choisit lui-même, MAIS dans le méta-thème imposé
  // du créneau (opts.themeHint) et guidé par ce qui performe (opts.learningHint).
  let userPrompt = buildUserPrompt({
    recentTopics,
    topic: opts.topic || undefined,
    newsTheme: opts.newsTheme || undefined,
  });
  if (opts.themeHint) userPrompt += "\n\n" + opts.themeHint;
  if (opts.learningHint) userPrompt += "\n\n" + opts.learningHint;

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

  // Range le job. publishAt : si la clé est explicitement fournie dans opts (même
  // null), on la respecte ; sinon (autonome), on planifie J+1 au créneau.
  const jobStore = openStore("jarvis-auto-jobs");
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const publishAt = ("publishAt" in opts) ? opts.publishAt : computePublishNextDay(slot.hour, slot.min);
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
    // 1. VOIX : séquentiel par vidéo (1 appel à la fois). En Option 2, jusqu'à 3
    // vidéos tournent EN PARALLÈLE (une background chacune) ; avec 1 appel voix
    // concurrent par vidéo, on a au pire 3 appels ElevenLabs simultanés — sous la
    // limite de 5. Chaque vidéo ayant désormais 15 min propres, la lenteur du
    // séquentiel n'est plus un problème (c'était le cas quand tout tenait dans une
    // seule fonction). Robuste contre le 429.
    const audioSegments = [];
    for (let i = 0; i < segments.length; i++) {
      const a = await post("/api/generate-audio", { text: segments[i].text });
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

    // Mail par vidéo : DÉSACTIVÉ par défaut (on préfère un récap unique à 7h via
    // auto-notify). Réactivable en mettant PER_VIDEO_EMAIL=1 dans Netlify.
    const perVideoEmail = process.env.PER_VIDEO_EMAIL === "1";
    if (notifyEmail && perVideoEmail) {
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

// ─── AUTONOME : méta-thèmes par créneau + boucle d'auto-amélioration ─────────

// Définition des méta-thèmes imposés (un par créneau).
export const THEMES = {
  geopolitique: {
    label: "Géopolitique internationale",
    instruction: "MÉTA-THÈME IMPOSÉ POUR CETTE VIDÉO : GÉOPOLITIQUE INTERNATIONALE (tensions entre États, conflits, diplomatie, équilibres de puissance mondiaux). Le sujet DOIT relever de ce thème.",
  },
  societe: {
    label: "Société & vie politique",
    instruction: `MÉTA-THÈME IMPOSÉ POUR CETTE VIDÉO : SOCIÉTÉ & VIE POLITIQUE (débats de société, politique intérieure, grandes tendances sociales, décisions publiques qui touchent le quotidien). Le sujet DOIT relever de ce thème.

RÈGLES ÉDITORIALES STRICTES POUR CE THÈME (pour éviter le bridage de distribution par YouTube sur les sujets sensibles) :
- ANGLE FACTUEL ET CONSTRUCTIF, jamais "révélation d'une manipulation cachée". Explique un fait de société et ce qu'il change concrètement, sans sous-entendre qu'une vérité est dissimulée au spectateur.
- VOCABULAIRE INTERDIT (déclenche la modération) : "manipulation", "manipuler", "on te ment", "ce qu'on te cache", "insidieux", "mécanisme caché", "vérité qu'on te cache", "les médias mentent", "sans que tu t'en aperçoives", "un mensonge répété", "ta seule vraie liberté", "réveille-toi", "ils ne veulent pas que tu saches". Ces tournures font passer la vidéo pour du contenu complotiste.
- SUJETS À ÉVITER absolument : le déroulé d'une élection à venir (qui va gagner, qui est favorisé), la critique frontale des médias ou de leur "agenda", les théories sur le contrôle de l'opinion. Ce sont les sujets les plus bridés.
- SUJETS À PRIVILÉGIER : phénomènes de société larges et universels (éducation, santé publique, travail, logement, environnement du quotidien, évolutions démographiques, modes de vie, nouvelles lois concrètes et leurs effets pratiques). Ces sujets sont riches, engageants ET librement distribués.
- Reste incarné et percutant, mais par la CLARTÉ et l'ENJEU RÉEL, jamais par le soupçon ou la dénonciation d'un complot.`,
  },
  economie: {
    label: "Économie",
    instruction: "MÉTA-THÈME IMPOSÉ POUR CETTE VIDÉO : ÉCONOMIE (marchés, entreprises, prix, pouvoir d'achat, décisions économiques et leurs effets concrets). Le sujet DOIT relever de ce thème.",
  },
};

// Rotation FIXE des thèmes par créneau horaire (heure de Paris).
export const SLOT_THEMES = {
  "8:30": "geopolitique",
  "12:30": "societe",
  "19:30": "economie",
};

// RECHERCHE WEB RÉELLE d'un sujet d'actualité FRAIS pour un thème donné. C'est le
// garde-fou anti-invention : le pipeline auto ne doit JAMAIS inventer un fait
// (ex. "la BCE baisse ses taux" alors qu'elle les a haussés). On oblige le modèle
// à chercher sur le web un événement DATÉ de moins de 7 jours, et à renvoyer le
// fait vérifié + sa date + sa source. Renvoie { topic, factue, date, source } ou
// { error }.
export async function findFreshTopic(themeKey) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "ANTHROPIC_API_KEY manquante" };
  const theme = THEMES[themeKey] || THEMES.geopolitique;

  const today = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full" }).format(new Date());
  const sys = `Tu es un chercheur d'actualité pour une chaîne YouTube. Tu utilises la recherche web pour trouver UN événement d'actualité RÉEL et RÉCENT.

RÈGLES ABSOLUES :
- L'événement doit relever du thème imposé : ${theme.label}.
- L'événement doit dater de MOINS DE 7 JOURS (nous sommes le ${today}). Si tu ne trouves rien d'aussi récent, dis-le, n'invente RIEN.
- INTERDICTION FORMELLE d'inventer, de supposer ou d'extrapoler un fait. Chaque chiffre, chaque décision, chaque événement doit venir DIRECTEMENT d'une source web que tu as consultée. Si un fait n'est pas confirmé par ta recherche, ne l'affirme pas.
- Vérifie le SENS des décisions (ex : une banque centrale qui "hausse" vs "baisse" ses taux — ne te fie pas à une tendance passée, lis la source réelle).

Réponds UNIQUEMENT en JSON, sans texte autour :
{ "trouve": true/false, "titre_evenement": "l'événement en une phrase factuelle", "faits_verifies": "les faits clés vérifiés (chiffres, décisions, acteurs) tels que trouvés dans les sources", "date_evenement": "AAAA-MM-JJ", "source": "nom du média/source" }
Si rien de moins de 7 jours : { "trouve": false }.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: sys,
        messages: [{ role: "user", content: `Trouve un événement d'actualité réel, du thème "${theme.label}", datant de moins de 7 jours. Cherche sur le web, vérifie, puis réponds en JSON.` }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || "Erreur API recherche" };
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    let clean = text.replace(/```json|```/g, "").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    if (s !== -1 && e !== -1 && e > s) clean = clean.slice(s, e + 1);
    let parsed;
    try { parsed = JSON.parse(clean); } catch { return { error: "réponse recherche non JSON" }; }

    if (!parsed.trouve) return { error: "aucun événement de moins de 7 jours trouvé pour ce thème" };

    // Vérifie la fraîcheur côté code aussi (ceinture + bretelles).
    if (parsed.date_evenement) {
      const evDate = new Date(parsed.date_evenement).getTime();
      const septDays = 8 * 24 * 60 * 60 * 1000; // 8 jours de marge
      if (!isNaN(evDate) && (Date.now() - evDate) > septDays) {
        return { error: `événement trop ancien (${parsed.date_evenement})` };
      }
    }
    return {
      topic: parsed.titre_evenement,
      faits: parsed.faits_verifies || "",
      date: parsed.date_evenement || "",
      source: parsed.source || "",
    };
  } catch (e) {
    return { error: e.message };
  }
}

// Construit le "learning hint" : lit les analytics récents et en tire des
// enseignements de FORME (pas de sujet), pour cibler de mieux en mieux SANS se
// répéter. On apprend les QUALITÉS des vidéos gagnantes, jamais leur sujet.
export async function buildLearningHint(base) {
  try {
    const r = await fetch(`${base}/api/youtube-analytics`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: last30DaysISO() }),
    });
    const d = await r.json();
    if (!d.videos || d.videos.length < 4) return null; // pas assez de recul

    const sorted = [...d.videos].sort((a, b) => b.views - a.views);
    const top = sorted.slice(0, 5).map(v => v.title);
    const flop = sorted.slice(-5).map(v => v.title);

    return `APPRENTISSAGE (données réelles de la chaîne — guide de FORME, PAS de sujet) :
- Ces vidéos ont le MIEUX marché récemment : ${top.map(t => `"${t}"`).join(", ")}. Analyse ce qui les rend fortes (type d'enjeu, angle, formulation) et reproduis ces QUALITÉS — mais sur un sujet NOUVEAU et DIFFÉRENT.
- Ces vidéos ont le MOINS marché : ${flop.map(t => `"${t}"`).join(", ")}. Évite ces registres/angles.
- INTERDICTION ABSOLUE de refaire un sujet proche de ceux déjà listés (dans "sujets déjà traités"). Cible la même EXIGENCE de qualité, jamais le même sujet. Varie les régions, les acteurs, les angles.`;
  } catch {
    return null; // si l'analytics échoue, on continue sans (non bloquant)
  }
}

function last30DaysISO() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// Orchestre un créneau autonome complet : thème imposé + apprentissage, puis
// script → production. `slot` = {hour,min}, `themeKey` ∈ THEMES.
// publishAtIso = date de publication planifiée (le créneau du jour).
export async function runAutonomousSlot(slot, themeKey, base, publishAtIso) {
  const theme = THEMES[themeKey] || THEMES.geopolitique;

  // ÉTAPE ANTI-INVENTION : on cherche d'abord un vrai événement récent (<7j) sur
  // le web. Sans ça, le modèle inventerait un fait plausible mais faux.
  const fresh = await findFreshTopic(themeKey);
  if (fresh.error) {
    console.log(`[autoSlot] pas de sujet frais pour ${themeKey} : ${fresh.error}`);
    return { step: "recherche", error: "Aucun sujet d'actualité vérifié (<7j) trouvé : " + fresh.error };
  }
  console.log(`[autoSlot] sujet vérifié (${fresh.date}, ${fresh.source}) : ${fresh.topic}`);

  // Consigne stricte anti-invention passée au générateur de script.
  const factsHint = `SUJET IMPOSÉ (événement réel vérifié par recherche web, daté du ${fresh.date}, source : ${fresh.source}) : ${fresh.topic}
FAITS VÉRIFIÉS À RESPECTER SCRUPULEUSEMENT (n'en invente aucun autre, ne modifie aucun chiffre, ne change pas le SENS d'une décision) : ${fresh.faits}
INTERDICTION ABSOLUE d'ajouter un chiffre, une date ou un fait qui ne figure pas ci-dessus. Si tu as besoin d'un détail non fourni, reste général plutôt que d'inventer.`;

  const learningHint = await buildLearningHint(base);
  const s = await runScriptStep(slot, {
    topic: fresh.topic,
    newsTheme: fresh.topic,
    themeHint: theme.instruction + "\n\n" + factsHint,
    learningHint: learningHint || undefined,
    ...(publishAtIso !== undefined ? { publishAt: publishAtIso } : {}),
  });
  if (!s.ok) return { step: "script", ...s };
  const p = await runProductionStep(s.jobId, base);
  return { step: "production", script: s, production: p, theme: theme.label, sourceEvent: fresh.topic, sourceDate: fresh.date };
}

// PLAN QUOTIDIEN : quel thème et quel créneau pour chaque vidéo du jour.
export const DAILY_PLAN = [
  { key: "geopolitique", slot: { hour: 8, min: 30 } },
  { key: "societe", slot: { hour: 12, min: 30 } },
  { key: "economie", slot: { hour: 19, min: 30 } },
];

// Produit UNE SEULE vidéo (un thème). Utilisé par l'Option 2 : une background
// function par vidéo, chacune avec ses 15 min. Trace chaque étape via console.log
// (visible dans les logs Netlify de la fonction).
export async function runOneVideo(themeKey, base) {
  const entry = DAILY_PLAN.find(p => p.key === themeKey) || DAILY_PLAN[0];
  const { iso } = computeSlotToday(entry.slot.hour, entry.slot.min);
  const slotLabel = `${entry.slot.hour}:${String(entry.slot.min).padStart(2, "0")}`;
  console.log(`[runOneVideo] DÉBUT thème=${themeKey} créneau=${slotLabel} publishAt=${iso}`);
  try {
    const r = await runAutonomousSlot(entry.slot, themeKey, base, iso);
    if (r.production?.ok) {
      console.log(`[runOneVideo] OK thème=${themeKey} → rendering, renderId=${r.production.renderId}`);
    } else {
      console.log(`[runOneVideo] ÉCHEC production thème=${themeKey} → ${r.production?.error || r.error || "inconnu"}`);
    }
    return { theme: themeKey, slot: slotLabel, ...r };
  } catch (e) {
    console.log(`[runOneVideo] EXCEPTION thème=${themeKey} → ${e.message}`);
    return { theme: themeKey, slot: slotLabel, error: e.message };
  }
}

// PRODUCTION GROUPÉE : les 3 vidéos du jour (géo 8h30, société 12h30, éco 19h30),
// chacune planifiée pour SON créneau AUJOURD'HUI. Lancée tôt le matin (~5h) par
// le cron, pour que tout soit prêt à valider avant 7h.
export async function runDailyBatch(base) {
  const plan = [
    { slot: { hour: 8, min: 30 }, theme: "geopolitique" },
    { slot: { hour: 12, min: 30 }, theme: "societe" },
    { slot: { hour: 19, min: 30 }, theme: "economie" },
  ];
  const results = [];
  for (const p of plan) {
    const { iso } = computeSlotToday(p.slot.hour, p.slot.min);
    try {
      const r = await runAutonomousSlot(p.slot, p.theme, base, iso);
      results.push({ theme: p.theme, slot: `${p.slot.hour}:${String(p.slot.min).padStart(2, "0")}`, ...r });
    } catch (e) {
      results.push({ theme: p.theme, error: e.message });
    }
  }
  return { ok: true, produced: results.length, results };
}


// ─── GARDE ANTI-DOUBLON quotidien ────────────────────────────────────────────
// Permet à un cron de tourner large (fenêtre horaire ample) tout en n'exécutant
// sa tâche qu'UNE fois par jour. Évite le double filtre fragile (fenêtre UTC +
// tolérance Paris) qui ratait les créneaux. On mémorise la date Paris du dernier
// run réussi par tâche ; si c'est déjà aujourd'hui, on skip.

function parisDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Renvoie true si la tâche `taskId` a DÉJÀ tourné aujourd'hui (heure de Paris).
export async function alreadyRanToday(taskId) {
  try {
    const store = openStore("jarvis-cron-guard");
    const last = await store.get(taskId);
    return last === parisDateKey();
  } catch { return false; }
}

// Marque la tâche `taskId` comme ayant tourné aujourd'hui.
export async function markRanToday(taskId) {
  try {
    const store = openStore("jarvis-cron-guard");
    await store.set(taskId, parisDateKey());
  } catch { /* best effort */ }
}

// Heure de Paris courante en minutes depuis minuit (pour les fenêtres larges).
export function parisMinutes() {
  const { h, m } = parisNow();
  return h * 60 + m;
}
