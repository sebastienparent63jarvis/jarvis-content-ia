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

  const { audioUrl, audioSegments, segments, clips, title, category, word, introMaskUrl, outroImgUrl } = body;
  // introMaskUrl / outroImgUrl : images de marque déjà générées par
  // generate-brand-images (isolé). Peuvent être null → vidéo sans intro/outro.

  const hasRealAudio = Array.isArray(audioSegments) && audioSegments.length > 0;

  if (!audioUrl && !hasRealAudio) {
    return new Response(JSON.stringify({ error: "Audio manquant (génère d'abord la voix off)" }), { status: 400 });
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    return new Response(JSON.stringify({ error: "segments manquants" }), { status: 400 });
  }

  try {
  // Map des durées réelles et URLs par index de segment (si dispo).
  const realByIndex = {};
  if (hasRealAudio) {
    audioSegments.forEach((a) => { realByIndex[a.index] = a; });
  }

  // Construit la timeline : chaque segment occupe une tranche de temps,
  // avec son clip vidéo en fond et son sous-titre par-dessus.
  const clipByIndex = {};
  (clips || []).forEach((c) => { if (c.clip && c.clip.link) clipByIndex[c.segment_index] = c.clip.link; });

  const INTRO_DUR = 3;   // durée de l'intro (masque) — le contenu commence après
  const hookWord = (word || "").toString().trim();

  // Échappe une regex et colore le mot-clé de référence dans un sous-titre,
  // AVEC parcimonie (seulement le hookWord), pour matcher le titre du masque.
  const colorizeCaption = (text) => {
    const safe = escapeHtml(text);
    if (!hookWord) return safe;
    const hw = hookWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      return safe.replace(new RegExp("(" + escapeHtml(hookWord).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i"),
        '<span style="color:#b085d0">$1</span>');
    } catch { return safe; }
  };

  let cursor = 0;
  const videoClips = [];
  const captionClips = [];
  const audioClips = [];

  // Fond vidéo pendant l'intro (0→INTRO_DUR) : le premier clip, muet, pour que
  // le masque ne soit pas sur du noir. Le masque se superpose par-dessus.
  const firstLink = clipByIndex[0];
  if (firstLink) {
    videoClips.push({
      asset: { type: "video", src: firstLink, volume: 0 },
      start: 0, length: INTRO_DUR, fit: "cover", effect: "zoomIn",
    });
  }

  segments.forEach((seg, i) => {
    const real = realByIndex[i];
    const dur = real && real.duration
      ? real.duration + 0.15
      : Math.max(2, seg.duration_estimate_sec || 5);
    const videoLink = clipByIndex[i];
    // Tout le contenu est décalé APRÈS l'intro pour ne jamais chevaucher le masque.
    const at = cursor + INTRO_DUR;

    if (real && real.url) {
      audioClips.push({ asset: { type: "audio", src: real.url }, start: at, length: dur });
    }

    if (videoLink) {
      videoClips.push({
        asset: { type: "video", src: videoLink, volume: 0 },
        start: at, length: dur, fit: "cover", effect: "zoomIn",
      });
    } else {
      videoClips.push({
        asset: { type: "html", html: "<div></div>", background: "#0D1321", width: 1080, height: 1920 },
        start: at, length: dur,
      });
    }

    // Sous-titre : même identité que le titre du masque (Inter 900, blanc, mot-clé
    // en violet clair), sur un cartouche sombre discret pour rester lisible sur la
    // vidéo. Calé EXACTEMENT sur la durée réelle du segment audio.
    captionClips.push({
      asset: {
        type: "html",
        html: `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;"><p style="font-family:'Inter','Open Sans',sans-serif;color:#ffffff;font-size:54px;font-weight:900;letter-spacing:-0.02em;text-align:center;line-height:1.2;margin:0;padding:26px 34px;background:rgba(8,12,20,0.72);border-radius:18px;">${colorizeCaption(seg.text)}</p></div>`,
        width: 1000,
        height: 700,
      },
      start: at,
      length: dur,
      position: "bottom",
      offset: { y: 0.10 },
      transition: { in: "fade", out: "fade" },
    });

    cursor += dur;
  });

  const contentDuration = cursor;
  const totalDuration = INTRO_DUR + contentDuration; // intro + contenu

  // ---- INTRO : masque de marque (image PNG transparente) sur 0→INTRO_DUR ----
  const introClips = introMaskUrl ? [{
    asset: { type: "image", src: introMaskUrl },
    start: 0, length: INTRO_DUR,
    transition: { in: "fade", out: "slideRight" },
  }] : [];

  // ---- OUTRO : écran de fin après le contenu ----
  const OUTRO_DUR = 2.5;
  const outroClips = outroImgUrl ? [{
    asset: { type: "image", src: outroImgUrl },
    start: totalDuration,
    length: OUTRO_DUR,
    transition: { in: "fade", out: "fade" },
  }] : [];

  const grandTotal = totalDuration + OUTRO_DUR;

  // Piste audio : segments calés (mode réel, décalés après l'intro) ou bloc unique.
  const audioTrack = hasRealAudio
    ? { clips: audioClips }
    : { clips: [{ asset: { type: "audio", src: audioUrl }, start: INTRO_DUR, length: contentDuration }] };

  const timeline = {
    background: "#000000",
    // Police Inter déclarée pour que les sous-titres matchent le titre du masque.
    fonts: [
      { src: "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf" },
    ],
    tracks: [
      { clips: introClips },     // masque d'intro (image transparente, 3s)
      { clips: outroClips },     // écran de fin
      { clips: captionClips },   // sous-titres (après l'intro, synchro réelle)
      { clips: videoClips },     // vidéo de fond
      audioTrack,                // voix off
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
      JSON.stringify({ render_id: data.response?.id, env, total_duration: grandTotal }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec connexion Shotstack: " + err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
  } catch (fatal) {
    // Filet global : toute erreur inattendue (traitement segments, timeline,
    // module SVG…) est renvoyée en clair au lieu de faire crasher la fonction.
    return new Response(JSON.stringify({ error: "Erreur assemblage (détail): " + fatal.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
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
