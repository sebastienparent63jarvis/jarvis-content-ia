// Applique une miniature à une vidéo YouTube, ENTIÈREMENT côté serveur :
// récupère l'image (HCTI) et appelle thumbnails/set, sans passer par le
// navigateur (pas de CORS). Renvoie l'erreur BRUTE de YouTube en cas d'échec,
// pour qu'on sache enfin la vraie raison.

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
  const { videoId, thumbUrl } = body;
  if (!videoId || !thumbUrl) {
    return new Response(JSON.stringify({ error: "videoId ou thumbUrl manquant" }), { status: 400 });
  }

  try {
    // 1. Jeton d'accès (serveur)
    const accessToken = await getAccessToken();

    // 2. Récupère l'image miniature
    const imgResp = await fetch(thumbUrl);
    if (!imgResp.ok) throw new Error("Image miniature inaccessible (HTTP " + imgResp.status + ")");
    const imgBuf = Buffer.from(await imgResp.arrayBuffer());
    const contentType = imgResp.headers.get("content-type") || "image/png";
    const sizeKo = Math.round(imgBuf.length / 1024);

    // 3. Envoie à YouTube (thumbnails/set)
    const setResp = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": contentType },
        body: imgBuf,
      }
    );
    const raw = await setResp.text();
    if (!setResp.ok) {
      // On renvoie l'erreur BRUTE de YouTube (status + corps) pour diagnostic.
      return new Response(JSON.stringify({
        ok: false,
        status: setResp.status,
        youtube_error: raw.slice(0, 600),
        thumb_size_ko: sizeKo,
        content_type: contentType,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, thumb_size_ko: sizeKo }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/youtube-set-thumbnail" };
