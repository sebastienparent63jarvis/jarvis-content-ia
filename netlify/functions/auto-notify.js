// NOTIFICATION RÉCAP QUOTIDIENNE (cron ~7h Paris). Envoie UN SEUL mail listant
// les vidéos du jour en attente de validation (produites à 5h, collectées
// entre-temps). Remplace les mails par-vidéo. L'utilisateur valide le lot en
// une session dans « À valider ».

import { parisNow, openStore } from "./_auto-core.js";

const NOTIFY = { hour: 7, min: 0 };
const TOLERANCE_MIN = 20;

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default async (req) => {
  const { h, m } = parisNow();
  if (Math.abs((h * 60 + m) - (NOTIFY.hour * 60 + NOTIFY.min)) > TOLERANCE_MIN) {
    return new Response(JSON.stringify({ skipped: true, parisTime: `${h}:${String(m).padStart(2, "0")}` }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (!notifyEmail) {
    return new Response(JSON.stringify({ error: "NOTIFY_EMAIL non configurée" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const base = (process.env.SITE_URL || process.env.URL || "https://jarviscontenuia.netlify.app").replace(/\/$/, "");

  // Lit la file de validation (vidéos en attente).
  let pending = [];
  try {
    const r = await fetch(`${base}/api/validation-queue`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    const d = await r.json();
    pending = (d.items || []).filter(i => i.status === "pending");
  } catch (e) {
    return new Response(JSON.stringify({ error: "lecture file échouée: " + e.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (pending.length === 0) {
    return new Response(JSON.stringify({ sent: false, reason: "aucune vidéo en attente" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Construit la liste pour le mail.
  const rows = pending.map(v => {
    const when = v.publishAt ? new Date(v.publishAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "à définir";
    return `<li style="margin-bottom:8px"><b>${esc(v.title || "Sans titre")}</b><br><span style="color:#777;font-size:13px">Publication prévue : ${when}</span></li>`;
  }).join("");

  try {
    await fetch(`${base}/api/send-email`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: notifyEmail,
        subject: `Actu Crue — ${pending.length} vidéo(s) à valider aujourd'hui`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
          <h2 style="color:#7D4698">Tes vidéos du jour sont prêtes</h2>
          <p style="color:#555;line-height:1.6">${pending.length} vidéo(s) t'attendent dans l'onglet <b>À valider</b>. Regarde-les, puis valide (ou rejette) le lot en une fois — chacune partira planifiée pour son créneau du jour.</p>
          <ul style="padding-left:18px">${rows}</ul>
          <p><a href="${base}/" style="display:inline-block;background:#7D4698;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Ouvrir Actu Crue →</a></p>
          <p style="color:#999;font-size:12px">Astuce : valide avant 8h30 pour que la première vidéo parte à l'heure. Une vidéo validée après son créneau partira au créneau suivant disponible.</p>
        </div>`,
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "envoi mail échoué: " + e.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ sent: true, count: pending.length }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};

// Cron autour de 7h Paris : 5h-6h UTC (été/hiver).
export const config = { schedule: "0,15,30,45 5-6 * * *" };
