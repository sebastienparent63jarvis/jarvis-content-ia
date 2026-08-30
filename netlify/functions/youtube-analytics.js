// Récupère les statistiques par vidéo depuis une date donnée, via l'API YouTube
// Analytics. Renvoie, par vidéo : titre, vues, durée moyenne vue (s), rétention
// moyenne (%), abonnés gagnés. Nécessite le scope yt-analytics.readonly
// (l'utilisateur doit s'être reconnecté après l'ajout du scope).

import { getAccessToken, getMyChannel, hasOAuthConfig } from "./_youtube-oauth.js";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }
  if (!hasOAuthConfig()) {
    return new Response(JSON.stringify({ error: "OAuth non configuré" }), { status: 500 });
  }
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const startDate = body.startDate || "2026-08-21"; // par défaut : le batch demandé
  const endDate = body.endDate || new Date().toISOString().slice(0, 10);

  try {
    const accessToken = await getAccessToken();
    const channel = await getMyChannel(accessToken);
    if (!channel) throw new Error("Chaîne introuvable");

    // 1. Requête Analytics : métriques par vidéo, triées par vues décroissantes.
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: "views,averageViewDuration,averageViewPercentage,subscribersGained",
      dimensions: "video",
      sort: "-views",
      maxResults: "50",
    });
    const anRes = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    const anData = await anRes.json();
    if (!anRes.ok) {
      // Erreur fréquente : scope manquant (403) → l'utilisateur doit se reconnecter.
      const msg = anData.error?.message || `HTTP ${anRes.status}`;
      const needReconnect = anRes.status === 403 || /scope|insufficient|permission/i.test(msg);
      return new Response(JSON.stringify({ error: msg, needReconnect }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const rows = anData.rows || [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ channel: channel.title, startDate, endDate, videos: [] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Récupère les titres des vidéos (Analytics ne renvoie que les IDs).
    const videoIds = rows.map(r => r[0]);
    const titles = {};
    // videos.list accepte jusqu'à 50 ids par appel.
    const vidParams = new URLSearchParams({ part: "snippet,contentDetails", id: videoIds.join(",") });
    const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${vidParams.toString()}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    const vData = await vRes.json();
    (vData.items || []).forEach(it => {
      titles[it.id] = { title: it.snippet?.title || "(sans titre)", duration: it.contentDetails?.duration || null };
    });

    // 3. Assemble le résultat lisible.
    const videos = rows.map(r => ({
      videoId: r[0],
      title: titles[r[0]]?.title || r[0],
      views: r[1],
      avgViewDurationSec: Math.round(r[2]),
      avgViewPercentage: Math.round(r[3] * 10) / 10,
      subscribersGained: r[4],
    }));

    // 4. Agrégats globaux du batch.
    const totalViews = videos.reduce((s, v) => s + v.views, 0);
    const totalSubs = videos.reduce((s, v) => s + v.subscribersGained, 0);
    const avgRetention = videos.length
      ? Math.round((videos.reduce((s, v) => s + v.avgViewPercentage, 0) / videos.length) * 10) / 10
      : 0;

    return new Response(JSON.stringify({
      channel: channel.title, startDate, endDate,
      videos,
      summary: { count: videos.length, totalViews, totalSubs, avgRetention },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const needReconnect = e.message === "TOKEN_EXPIRE" || e.message === "NON_CONNECTE";
    return new Response(JSON.stringify({ error: e.message, needReconnect }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/youtube-analytics" };
