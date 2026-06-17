// Phase 4 — Assemblage vidéo via Shotstack.
// Construit une "recette" de montage (timeline JSON) à partir de :
//   - l'URL de la voix off (hébergée via store-audio)
//   - les clips vidéo Pexels (un par segment)
//   - les sous-titres (texte de chaque segment)
// puis lance le rendu sur le cloud Shotstack et renvoie l'ID de rendu.
//
// Variable d'environnement requise :
//   SHOTSTACK_API_KEY : ta clé API Shotstack
//   SHOTSTACK_ENV : "stage" (gratuit, avec watermark) ou "v1" (production payante)

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "SHOTSTACK_API_KEY non configurée sur Netlify (Site settings > Environment variables)" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const env = process.env.SHOTSTACK_ENV || "stage"; // stage = gratuit avec watermark

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400 });
  }

  const { audioUrl, audioSegments, segments, clips } = body;
  // audioSegments (préféré): [{ index, url, duration }, ...] — durées RÉELLES
  // audioUrl (ancien mode): un seul fichier, timing estimé (fallback)
  // segments: [{ text, duration_estimate_sec }, ...]
  // clips: [{ segment_index, clip: { link } }, ...]

  const hasRealAudio = Array.isArray(audioSegments) && audioSegments.length > 0;

  if (!audioUrl && !hasRealAudio) {
    return new Response(JSON.stringify({ error: "Audio manquant (génère d'abord la voix off)" }), { status: 400 });
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    return new Response(JSON.stringify({ error: "segments manquants" }), { status: 400 });
  }

  // Map des durées réelles et URLs par index de segment (si dispo).
  const realByIndex = {};
  if (hasRealAudio) {
    audioSegments.forEach((a) => { realByIndex[a.index] = a; });
  }

  // Construit la timeline : chaque segment occupe une tranche de temps,
  // avec son clip vidéo en fond et son sous-titre par-dessus.
  const clipByIndex = {};
  (clips || []).forEach((c) => { if (c.clip && c.clip.link) clipByIndex[c.segment_index] = c.clip.link; });

  let cursor = 0;
  const videoClips = [];
  const captionClips = [];
  const audioClips = [];

  segments.forEach((seg, i) => {
    // Durée RÉELLE si on l'a mesurée, sinon estimation (avec marge de 0.15s
    // de respiration entre segments pour un rendu naturel).
    const real = realByIndex[i];
    const dur = real && real.duration
      ? real.duration + 0.15
      : Math.max(2, seg.duration_estimate_sec || 5);
    const videoLink = clipByIndex[i];

    // Place l'audio du segment exactement sur sa tranche.
    if (real && real.url) {
      audioClips.push({
        asset: { type: "audio", src: real.url },
        start: cursor,
        length: dur,
      });
    }

    if (videoLink) {
      videoClips.push({
        asset: { type: "video", src: videoLink, volume: 0 },
        start: cursor,
        length: dur,
        fit: "cover",
        // Léger zoom progressif pour donner du mouvement (effet Ken Burns).
        effect: "zoomIn",
      });
    } else {
      // Pas de clip : fond uni sombre de secours.
      videoClips.push({
        asset: { type: "html", html: "<div></div>", background: "#0D1321", width: 1080, height: 1920 },
        start: cursor,
        length: dur,
      });
    }

    // Sous-titre : cartouche foncé semi-transparent + texte blanc pur,
    // calé EXACTEMENT sur la durée réelle de la narration du segment.
    captionClips.push({
      asset: {
        type: "html",
        html: `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;"><p style="font-family:'Open Sans',sans-serif;color:#ffffff;font-size:52px;font-weight:800;text-align:center;line-height:1.35;margin:0;padding:28px 36px;background:rgba(8,12,20,0.78);border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,0.5);">${escapeHtml(seg.text)}</p></div>`,
        width: 1000,
        height: 700,
      },
      start: cursor,
      length: dur,
      position: "bottom",
      offset: { y: 0.10 },
      transition: { in: "fade", out: "fade" },
    });

    cursor += dur;
  });

  const totalDuration = cursor;

  // Piste audio : soit les segments calés (mode réel), soit l'audio global (fallback).
  const audioTrack = hasRealAudio
    ? { clips: audioClips }
    : { clips: [{ asset: { type: "audio", src: audioUrl }, start: 0, length: totalDuration }] };

  const timeline = {
    background: "#000000",
    tracks: [
      { clips: captionClips }, // piste du dessus = sous-titres
      { clips: videoClips },   // piste du milieu = vidéo de fond
      audioTrack,              // piste du dessous = voix off
    ],
  };

  const payload = {
    timeline,
    output: {
      format: "mp4",
      size: { width: 1080, height: 1920 }, // format vertical Shorts 9:16
      fps: 30,
    },
  };

  try {
    const renderRes = await fetch(`https://api.shotstack.io/${env}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await renderRes.json();

    if (!renderRes.ok) {
      return new Response(
        JSON.stringify({ error: data.message || "Erreur Shotstack", raw: data }),
        { status: renderRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ render_id: data.response?.id, env, total_duration: totalDuration }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec connexion Shotstack: " + err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const config = {
  path: "/api/assemble-video",
};
