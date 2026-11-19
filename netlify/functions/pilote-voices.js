// Additif (pilote long-format) — liste les voix ElevenLabs du compte, pour
// choisir une voix française de façon déterministe avant de générer.
// Lecture seule. Ne touche à aucune fonction existante.

export default async (req) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return json({ error: "ELEVENLABS_API_KEY manquante" }, 500);
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });
    const d = await r.json();
    const voices = (d.voices || []).map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      labels: v.labels || {},
      category: v.category,
    }));
    return json({ count: voices.length, voices, defaultEnv: process.env.ELEVENLABS_VOICE_ID || null });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const config = { path: "/api/pilote-voices" };
