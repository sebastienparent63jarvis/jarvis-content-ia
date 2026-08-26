// Indique à l'app si YouTube est connecté et si le jeton est encore valide.
// Sert à afficher "Connecté ✓" ou "À reconnecter" (expiration 7 jours en test).

import { getAccessToken, hasOAuthConfig } from "./_youtube-oauth.js";

export default async (req, context) => {
  if (!hasOAuthConfig()) {
    return new Response(JSON.stringify({ connected: false, reason: "no_config" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  try {
    await getAccessToken(); // tente un rafraîchissement réel
    return new Response(JSON.stringify({ connected: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const reason = e.message === "NON_CONNECTE" ? "not_connected"
      : e.message === "TOKEN_EXPIRE" ? "expired"
      : "error";
    return new Response(JSON.stringify({ connected: false, reason, detail: e.message }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/youtube-status" };
