// MULTI-PLATEFORME (background) — publie une vidéo validée sur Instagram,
// Facebook et TikTok via Upload-Post, en complément de YouTube (géré ailleurs).
// - Instagram + Facebook : publication planifiée sur l'heure du créneau (publishAt).
// - TikTok : en BROUILLON pour l'instant (l'utilisateur fait le tap final).
// - Légendes + hashtags ADAPTÉS par plateforme (ton plus jeune sur TikTok).
// - Déclaration contenu IA (is_aigc) pour rester conforme.
//
// Corps : { id, publishAtOverride? }  (id de l'item dans la file de validation)

import { getStore } from "@netlify/blobs";

function openStore(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
    throw e;
  }
}

async function setStatus(id, obj) {
  try { await openStore("jarvis-crosspost-status").set(id, JSON.stringify({ ...obj, at: new Date().toISOString() })); }
  catch { /* ignore */ }
}

// Génère des légendes adaptées par plateforme (hashtags inline, ton par réseau).
async function buildCaptions({ title, description }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const fallback = {
    instagram: `${title}`,
    tiktok: `${title}`,
    facebook: description || title,
  };
  if (!apiKey) return fallback;
  const sys = `Tu adaptes la légende d'une vidéo d'actualité (chaîne "Actu Crue") pour 3 réseaux. Reste FACTUEL et civil — aucun vocabulaire complotiste ("on te cache", "manipulation"...), aucune promesse trompeuse.
Règles par plateforme :
- instagram : accroche nette + 4 à 6 hashtags pertinents en fin. Ton informé, dynamique.
- tiktok : ton PLUS JEUNE, percutant, rythme court ; 3 à 5 hashtags dont des hashtags TikTok d'actu (#sinformer #actu #pourtoi si pertinent). Accroche qui donne envie de rester.
- facebook : phrase un peu plus posée/explicative, 2 à 3 hashtags max.
Chaque légende < 300 caractères. Réponds UNIQUEMENT en JSON : { "instagram": "...", "tiktok": "...", "facebook": "..." }`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 700, system: sys,
        messages: [{ role: "user", content: `Titre : ${title}\nDescription : ${description || "(aucune)"}` }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return fallback;
    let text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    text = text.replace(/```json|```/g, "").trim();
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
    const p = JSON.parse(text);
    return { instagram: p.instagram || fallback.instagram, tiktok: p.tiktok || fallback.tiktok, facebook: p.facebook || fallback.facebook };
  } catch { return fallback; }
}

export default async (req) => {
  let body; try { body = await req.json(); } catch { body = {}; }
  const id = body.id;
  if (!id) return json({ error: "id manquant" }, 400);

  // INTERRUPTEUR DE SÉCURITÉ : tant que CROSSPOST_ENABLED n'est pas "true",
  // le multi-plateforme ne fait RIEN → retour automatique au YouTube seul.
  // Permet de désactiver instantanément (1 variable Netlify) sans redéploiement.
  if (process.env.CROSSPOST_ENABLED !== "true") {
    await setStatus(id, { status: "disabled", note: "CROSSPOST_ENABLED != true → YouTube seul" });
    return json({ accepted: true, disabled: true }, 202);
  }

  const apiKey = process.env.UPLOAD_POST_API_KEY;
  const user = process.env.UPLOAD_POST_USER;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;
  if (!apiKey || !user) {
    await setStatus(id, { status: "error", error: "UPLOAD_POST_API_KEY ou UPLOAD_POST_USER manquant (config Netlify)" });
    return json({ error: "config manquante" }, 202);
  }

  // Récupère l'item validé (vidéo + métadonnées).
  let item;
  try { item = await openStore("jarvis-validation-queue").get(id, { type: "json" }); }
  catch (e) { await setStatus(id, { status: "error", error: "lecture item: " + e.message }); return json({ accepted: true }, 202); }
  if (!item || !item.videoUrl) { await setStatus(id, { status: "error", error: "item ou vidéo introuvable" }); return json({ accepted: true }, 202); }

  await setStatus(id, { status: "running", title: item.title });

  // Date de publication planifiée (IG/FB) : override, sinon celle de l'item.
  const chosen = body.publishAtOverride || item.publishAt || null;
  let scheduledIso = null;
  if (chosen) { const t = new Date(chosen).getTime(); if (!isNaN(t) && t > Date.now()) scheduledIso = new Date(t).toISOString(); }

  const caps = await buildCaptions({ title: item.title || "Actu Crue", description: item.description || "" });

  // Construit la requête multipart Upload-Post.
  const form = new FormData();
  form.append("user", user);
  form.append("video", item.videoUrl); // URL acceptée (pas besoin de re-télécharger)
  form.append("platform[]", "instagram");
  form.append("platform[]", "facebook");
  form.append("platform[]", "tiktok");
  form.append("title", (item.title || "Actu Crue").slice(0, 150));
  form.append("instagram_title", caps.instagram.slice(0, 2000));
  form.append("tiktok_title", caps.tiktok.slice(0, 2000));
  form.append("facebook_description", caps.facebook.slice(0, 2000));
  if (fbPageId) form.append("facebook_page_id", fbPageId);
  // TikTok en BROUILLON pour l'instant (tap final manuel).
  form.append("tiktok_upload_to_draft", "true");
  // Déclaration contenu généré par IA (conformité TikTok/Meta).
  form.append("is_aigc", "true");
  // Planification IG/FB sur l'heure du créneau, si future.
  if (scheduledIso) form.append("scheduled_date", scheduledIso);

  try {
    const res = await fetch("https://api.upload-post.com/api/upload", {
      method: "POST",
      headers: { "Authorization": `Apikey ${apiKey}`, "Idempotency-Key": `crosspost-${id}` },
      body: form,
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
    if (!res.ok) {
      await setStatus(id, { status: "error", http: res.status, error: data.error || data.message || text.slice(0, 300) });
    } else {
      await setStatus(id, { status: "done", result: data, tiktok: "brouillon (tap final manuel)", scheduled: scheduledIso });
    }
  } catch (e) {
    await setStatus(id, { status: "error", error: e.message });
  }

  return json({ accepted: true, id }, 202);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
