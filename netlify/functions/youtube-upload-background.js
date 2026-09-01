// Publie une vidéo de la file de validation SUR YOUTUBE, entièrement CÔTÉ SERVEUR
// (background, pas de limite 10s). Le serveur télécharge la vidéo depuis Shotstack
// (pas de CORS côté serveur, contrairement au navigateur) puis fait l'upload
// resumable vers YouTube en privé + planifié. Marque ensuite l'item "approved".
//
// Corps : { id }  (id de l'item dans la file de validation)
// Statut lisible via youtube-upload-status (clé = id).

import { getStore } from "@netlify/blobs";
import { getAccessToken } from "./_youtube-oauth.js";

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
  try { await openStore("jarvis-upload-status").set(id, JSON.stringify({ id, ...obj, at: new Date().toISOString() })); }
  catch { /* ignore */ }
}

export default async (req) => {
  const base = new URL(req.url).origin;
  let body; try { body = await req.json(); } catch { body = {}; }
  const id = body.id;
  const publishAtOverride = body.publishAtOverride || null;
  if (!id) {
    return new Response(JSON.stringify({ error: "id manquant" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  await setStatus(id, { status: "running", step: "start" });

  // Récupère l'item de la file.
  let item;
  try {
    const q = openStore("jarvis-validation-queue");
    item = await q.get(id, { type: "json" });
  } catch (e) {
    await setStatus(id, { status: "error", error: "file inaccessible: " + e.message });
    return accepted(id);
  }
  if (!item || !item.videoUrl) {
    await setStatus(id, { status: "error", error: "item ou vidéo introuvable" });
    return accepted(id);
  }

  try {
    // 1. Jeton d'accès (serveur).
    await setStatus(id, { status: "running", step: "auth" });
    const accessToken = await getAccessToken();

    // 2. Télécharge la vidéo depuis Shotstack (aucun CORS côté serveur).
    await setStatus(id, { status: "running", step: "download" });
    const vidResp = await fetch(item.videoUrl);
    if (!vidResp.ok) throw new Error("téléchargement vidéo: HTTP " + vidResp.status);
    const videoBuf = Buffer.from(await vidResp.arrayBuffer());

    // 3. Métadonnées (privé + planifié).
    const publishAtIso = (publishAtOverride || item.publishAt) ? new Date(publishAtOverride || item.publishAt).toISOString() : null;
    const metadata = {
      snippet: { title: (item.title || "Actu Crue").slice(0, 100), description: item.description || "", categoryId: "25" },
      status: { privacyStatus: "private", selfDeclaredMadeForKids: false, ...(publishAtIso ? { publishAt: publishAtIso } : {}) },
    };

    // 4. Upload resumable — init.
    await setStatus(id, { status: "running", step: "upload_init" });
    const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Upload-Content-Type": "video/mp4" },
      body: JSON.stringify(metadata),
    });
    if (!initRes.ok) throw new Error("init upload: " + (await initRes.text()).slice(0, 200));
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) throw new Error("pas d'URL d'upload renvoyée");

    // 5. Upload des octets.
    await setStatus(id, { status: "running", step: "upload_bytes" });
    const upRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: videoBuf });
    const upData = await upRes.json();
    if (!upRes.ok) throw new Error("upload: " + (upData.error?.message || upRes.status));
    const videoId = upData.id;

    // 6. Marque l'item validé dans la file.
    try {
      await fetch(`${base}/api/validation-queue`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", id, decision: "approved" }),
      });
    } catch { /* non bloquant */ }

    await setStatus(id, { status: "done", videoId, publishAt: publishAtIso });
    return accepted(id);
  } catch (e) {
    await setStatus(id, { status: "error", error: e.message });
    return accepted(id);
  }
};

function accepted(id) {
  return new Response(JSON.stringify({ accepted: true, id }), { status: 202, headers: { "Content-Type": "application/json" } });
}
