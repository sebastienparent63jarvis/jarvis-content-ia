// Configuration et utilitaires OAuth YouTube partagés.
// Variables d'environnement Netlify requises :
//   GOOGLE_CLIENT_ID     — l'ID client OAuth (créé dans Google Cloud)
//   GOOGLE_CLIENT_SECRET — le code secret du client
// L'URI de redirection est déduite de l'URL du site (doit correspondre EXACTEMENT
// à celle déclarée dans Google Cloud : https://<site>/api/youtube-callback).

import { getStore } from "@netlify/blobs";

export const REDIRECT_PATH = "/api/youtube-callback";
// Scope minimal : upload seulement (moins sensible que le scope "youtube" complet).
export const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

export function redirectUri(host) {
  const proto = host && host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}${REDIRECT_PATH}`;
}

// Store persistant pour le refresh_token (un seul utilisateur : toi).
export function tokenStore() {
  try {
    return getStore({ name: "jarvis-youtube-tokens", consistency: "strong" });
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) {
      return getStore({ name: "jarvis-youtube-tokens", siteID, token, consistency: "strong" });
    }
    throw e;
  }
}

const TOKEN_KEY = "refresh_token";

export async function saveRefreshToken(rt) {
  const store = tokenStore();
  await store.set(TOKEN_KEY, rt);
}

export async function getRefreshToken() {
  const store = tokenStore();
  try { return await store.get(TOKEN_KEY); } catch { return null; }
}

export async function clearRefreshToken() {
  const store = tokenStore();
  try { await store.delete(TOKEN_KEY); } catch { /* ignore */ }
}

// Échange un code d'autorisation contre des jetons (access + refresh).
export async function exchangeCodeForTokens(code, host) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(host),
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Échec échange de code");
  return data; // { access_token, refresh_token, expires_in, ... }
}

// Obtient un access_token frais à partir du refresh_token stocké.
export async function getAccessToken() {
  const refresh = await getRefreshToken();
  if (!refresh) throw new Error("NON_CONNECTE"); // pas encore autorisé
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    // invalid_grant = refresh token expiré (mode test = 7 jours) ou révoqué.
    if (data.error === "invalid_grant") throw new Error("TOKEN_EXPIRE");
    throw new Error(data.error_description || data.error || "Échec rafraîchissement");
  }
  return data.access_token;
}

export function hasOAuthConfig() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
