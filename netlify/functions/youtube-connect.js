// Démarre la connexion OAuth YouTube : redirige vers l'écran de consentement
// Google. access_type=offline + prompt=consent garantissent un refresh_token.

import { SCOPE, redirectUri, hasOAuthConfig } from "./_youtube-oauth.js";

export default async (req, context) => {
  if (!hasOAuthConfig()) {
    return new Response(JSON.stringify({ error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET non configurés sur Netlify" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const host = req.headers.get("host");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(host),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",   // pour obtenir un refresh_token
    prompt: "consent",        // force l'écran de consentement (garantit le refresh_token)
    include_granted_scopes: "true",
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  // Redirection 302 vers Google.
  return new Response(null, { status: 302, headers: { Location: url } });
};

export const config = { path: "/api/youtube-connect" };
