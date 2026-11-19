// Fournit à l'app un access_token frais (courte durée) pour uploader le MP4
// DIRECTEMENT du navigateur vers YouTube — évite de faire transiter un gros
// fichier par une fonction serverless (limites de taille/temps).
// Le refresh_token, lui, ne quitte JAMAIS le serveur.

import { getAccessToken, hasOAuthConfig } from "./_youtube-oauth.js";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }
  if (!hasOAuthConfig()) {
    return new Response(JSON.stringify({ error: "OAuth non configuré sur Netlify" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const accessToken = await getAccessToken();
    return new Response(JSON.stringify({ access_token: accessToken }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const reason = e.message === "NON_CONNECTE" ? "not_connected"
      : e.message === "TOKEN_EXPIRE" ? "expired" : "error";
    return new Response(JSON.stringify({ error: e.message, reason }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/youtube-token" };
