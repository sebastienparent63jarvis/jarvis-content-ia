// Callback OAuth : Google renvoie ici après consentement, avec un ?code=...
// On échange le code contre les jetons et on stocke le refresh_token.
// Puis on renvoie une petite page qui confirme et referme la boucle.

import { exchangeCodeForTokens, saveRefreshToken } from "./_youtube-oauth.js";

function page(title, message, ok) {
  const color = ok ? "#3DD68C" : "#FF5C72";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{background:#0B0710;color:#F3EEF8;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;}
  .card{background:rgba(28,18,40,0.9);border:1px solid rgba(180,140,210,0.2);border-radius:20px;padding:36px;max-width:420px;}
  h1{color:${color};font-size:22px;margin:0 0 12px;} p{color:#9A8CA8;line-height:1.5;font-size:14px;}
  a{color:#7D4698;font-weight:700;text-decoration:none;}</style></head>
  <body><div class="card"><h1>${title}</h1><p>${message}</p><p><a href="/">← Retour à Actu Crue</a></p></div></body></html>`;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");

  if (err) {
    return new Response(page("Connexion refusée", "Tu as refusé l'autorisation, ou une erreur est survenue : " + err, false), {
      status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (!code) {
    return new Response(page("Erreur", "Aucun code d'autorisation reçu de Google.", false), {
      status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  try {
    const host = req.headers.get("host");
    const tokens = await exchangeCodeForTokens(code, host);
    if (!tokens.refresh_token) {
      // Peut arriver si l'utilisateur avait déjà autorisé sans prompt=consent.
      return new Response(page("Presque !", "Google n'a pas renvoyé de jeton durable. Réessaie la connexion (on force le consentement pour l'obtenir).", false), {
        status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    await saveRefreshToken(tokens.refresh_token);
    return new Response(page("YouTube connecté ✓", "Ton compte est relié à Actu Crue. Tu peux fermer cette page et revenir à l'app pour publier.", true), {
      status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    return new Response(page("Échec de connexion", "Erreur lors de l'échange avec Google : " + e.message, false), {
      status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
};

export const config = { path: "/api/youtube-callback" };
