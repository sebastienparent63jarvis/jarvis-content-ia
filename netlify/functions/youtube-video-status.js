// Interroge l'état de TRAITEMENT d'une vidéo YouTube (processingDetails).
// Sert à attendre que YouTube ait fini de traiter la vidéo avant de poser la
// miniature (cause possible du rejet : miniature posée trop tôt, écartée quand
// le traitement se termine et réinitialise les métadonnées).

import { getAccessToken, hasOAuthConfig } from "./_youtube-oauth.js";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }
  if (!hasOAuthConfig()) {
    return new Response(JSON.stringify({ error: "OAuth non configuré" }), { status: 500 });
  }
  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400 });
  }
  const { videoId } = body;
  if (!videoId) {
    return new Response(JSON.stringify({ error: "videoId manquant" }), { status: 400 });
  }
  try {
    const accessToken = await getAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=processingDetails,status&id=${encodeURIComponent(videoId)}`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Lecture statut échouée");
    const item = (data.items || [])[0];
    const processingStatus = item?.processingDetails?.processingStatus || "unknown"; // processing | succeeded | failed | terminated
    const uploadStatus = item?.status?.uploadStatus || "unknown"; // uploaded | processed | failed
    return new Response(JSON.stringify({ processingStatus, uploadStatus }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/youtube-video-status" };
