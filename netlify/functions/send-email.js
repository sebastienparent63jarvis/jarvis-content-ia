// Envoie un vrai email côté serveur via Resend (contrairement au mailto: qui
// exige que l'utilisateur soit devant l'app). Sert aux notifications autonomes :
// "ta vidéo du jour est prête à valider". Nécessite la variable RESEND_API_KEY.
//
// Corps attendu : { to, subject, html }  (ou { to, subject, text })
// Test rapide : { to } seul → envoie un mail de test.

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY non configurée sur Netlify" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400 });
  }

  const to = body.to;
  if (!to || !to.includes("@")) {
    return new Response(JSON.stringify({ error: "Adresse email 'to' manquante ou invalide" }), { status: 400 });
  }

  // Contenu par défaut = mail de test.
  const subject = body.subject || "Actu Crue — test d'envoi ✓";
  const html = body.html || `<div style="font-family:system-ui,sans-serif;max-width:480px">
    <h2 style="color:#7D4698">Actu Crue — test réussi</h2>
    <p>Si tu reçois ce mail, l'envoi automatique fonctionne. Tu recevras ici tes vidéos à valider avant publication.</p>
  </div>`;

  // Expéditeur : le domaine de test de Resend fonctionne sans configurer de DNS.
  // (Pour un envoi depuis ta propre adresse, il faudra vérifier un domaine chez
  // Resend ; on garde onboarding@resend.dev pour démarrer sans friction.)
  const from = body.from || "Actu Crue <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.message || data.name || `HTTP ${res.status}`, raw: data }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Envoi échoué: " + e.message }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/send-email" };
