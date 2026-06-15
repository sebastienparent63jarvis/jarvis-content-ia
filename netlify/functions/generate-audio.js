// Phase 2 — Génération de la voix off via ElevenLabs.
// Reçoit le texte de narration, renvoie l'audio MP3 encodé en base64
// (pour écoute immédiate dans l'interface — l'hébergement pour Shotstack
// viendra en Phase 4).
//
// Variables d'environnement requises sur Netlify :
//   ELEVENLABS_API_KEY : ta clé API ElevenLabs
//   ELEVENLABS_VOICE_ID : l'identifiant de la voix choisie (optionnel,
//     défaut = une voix multilingue ElevenLabs)

// ── Normalisation du texte pour la synthèse vocale ──────────────────────────
// Les moteurs TTS lisent mal les chiffres et symboles bruts (€, %, k, etc.).
// On convertit en toutes lettres françaises avant l'envoi à ElevenLabs.
function normalizeForTTS(input) {
  let t = input;

  // Correction d'homographes verbe/nom qui trompent le TTS (filet de sécurité,
  // en complément des instructions données au générateur de scripts).
  // On remplace la forme verbale ambiguë par un synonyme non ambigu.
  const homographs = [
    [/\btu param[èe]tres\b/gi, "tu programmes"],
    [/\bje param[èe]tre\b/gi, "je programme"],
  ];
  for (const [re, rep] of homographs) t = t.replace(re, rep);

  // Abréviation "k" accolée à un nombre : 10k -> 10 mille, 1.5k -> 1500
  t = t.replace(/(\d+)[.,](\d+)\s*k\b/gi, (_, a, b) => `${a} mille ${b} cent`);
  t = t.replace(/(\d+)\s*k\b/gi, (_, a) => `${a} mille`);

  // Montants en euros : 1500€ ou 1 500 € ou 1500 euros
  t = t.replace(/(\d[\d\s.,]*)\s*€/g, (_, n) => `${n.trim()} euros`);
  t = t.replace(/€/g, " euros");

  // Pourcentages : 25% -> 25 pour cent
  t = t.replace(/(\d[\d\s.,]*)\s*%/g, (_, n) => `${n.trim()} pour cent`);
  t = t.replace(/%/g, " pour cent");

  // Dollars
  t = t.replace(/\$\s*(\d[\d\s.,]*)/g, (_, n) => `${n.trim()} dollars`);
  t = t.replace(/(\d[\d\s.,]*)\s*\$/g, (_, n) => `${n.trim()} dollars`);
  t = t.replace(/\$/g, " dollars");

  // Séparateurs de milliers : "1 500" ou "1.500" collés -> on laisse les chiffres,
  // ElevenLabs lit correctement les nombres simples ; on nettoie juste les espaces multiples.
  t = t.replace(/\s{2,}/g, " ").trim();

  return t;
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ELEVENLABS_API_KEY non configurée sur Netlify (Site settings > Environment variables)" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400 });
  }

  const { text, voiceId: requestVoiceId } = body;
  if (!text || typeof text !== "string") {
    return new Response(JSON.stringify({ error: "Champ 'text' manquant" }), { status: 400 });
  }

  // Voix : priorité au Voice ID envoyé depuis l'app (champ Paramètres),
  // sinon variable d'environnement, sinon défaut.
  const voiceId = requestVoiceId || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

  // Garde-fou : limite la longueur pour éviter de brûler des crédits
  // sur une requête anormale (un Short = ~700-900 caractères max).
  if (text.length > 1500) {
    return new Response(
      JSON.stringify({ error: `Texte trop long (${text.length} caractères, max 1500). Garde-fou anti-surconsommation de crédits.` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const normalizedText = normalizeForTTS(text);

  try {
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: normalizedText,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!ttsRes.ok) {
      let errDetail = "";
      try {
        const errJson = await ttsRes.json();
        errDetail = JSON.stringify(errJson);
      } catch {
        errDetail = await ttsRes.text();
      }
      return new Response(
        JSON.stringify({ error: `Erreur ElevenLabs (${ttsRes.status}): ${errDetail}` }),
        { status: ttsRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString("base64");

    return new Response(
      JSON.stringify({ audio_base64: base64, mime: "audio/mpeg", chars_used: text.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Échec de connexion à ElevenLabs: " + err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/generate-audio",
};
