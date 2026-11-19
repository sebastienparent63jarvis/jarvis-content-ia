// RENDU DU PILOTE NVIDIA (v5) — s'intègre à la file "À valider".
// Le rendu est enregistré comme un JOB dans jarvis-auto-jobs ; la collecte cron
// existante (auto-collect, toutes les 5 min) le range dans "À valider" une fois
// le montage Shotstack terminé. Zéro ID, zéro bash côté utilisateur.
//   GET /api/render-pilote              -> page (bouton Lancer + adoption auto du rendu en cours)
//   GET /api/render-pilote?go=1         -> lance un rendu + crée le job
//   GET /api/render-pilote?adoptdefault=1 -> enregistre le rendu déjà lancé comme job
import { EDIT } from "./edit_template.js";
import { getStore } from "@netlify/blobs";

const DEFAULT_ID = "1c4112cd-34cb-4662-88b0-d72f8329ad9e"; // rendu déjà lancé
const PILOT_TITLE = "Nvidia sans Jensen Huang : qui dirige l'IA maintenant ?";
const PILOT_DESC = [
  "Jensen Huang a quitté la direction de Nvidia le 12 novembre 2026. Décryptage calme et sourcé : ce que son départ change pour l'intelligence artificielle, la course à la succession, les marchés, et la guerre des puces entre les États-Unis et la Chine.",
  "",
  "Chapitres : Le séisme · La chute · La relève · L'onde de choc · Et maintenant ?",
  "",
  "Sources : NVIDIA, Reuters, The New York Times, Bloomberg, Financial Times, Al Jazeera, Fortune, HSBC.",
  "Actu Crue — l'actualité, vérifiée.",
].join("\n");

function store(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
    throw e;
  }
}

// Crée un job "rendering" pour un renderId — idempotent (pas de doublon par renderId).
async function createJob(renderId, env) {
  const jobStore = store("jarvis-auto-jobs");
  const idx = (await jobStore.get("_index", { type: "json" })) || [];
  for (const jid of idx.slice(0, 60)) {
    try { const j = await jobStore.get(jid, { type: "json" }); if (j && j.renderId === renderId) return jid; } catch {}
  }
  const jobId = `job-pilote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const job = {
    id: jobId, status: "rendering", renderId, renderEnv: env,
    createdAt: new Date().toISOString(), slot: "pilote", publishAt: null,
    script: { title: PILOT_TITLE, description: PILOT_DESC },
  };
  await jobStore.set(jobId, JSON.stringify(job));
  idx.unshift(jobId); await jobStore.set("_index", JSON.stringify(idx));
  return jobId;
}

function prefixRelative(node, base) {
  if (Array.isArray(node)) { node.forEach(n => prefixRelative(n, base)); return; }
  if (node && typeof node === "object") {
    if (typeof node.src === "string" && !/^https?:\/\//.test(node.src)) node.src = base + "/" + node.src;
    for (const v of Object.values(node)) prefixRelative(v, base);
  }
}

export default async (req) => {
  const env = process.env.SHOTSTACK_ENV || "stage";
  const key = process.env.SHOTSTACK_API_KEY;
  const api = `https://api.shotstack.io/${env}`;
  const base = (process.env.URL || process.env.SITE_URL || "https://jarviscontenuia.netlify.app").replace(/\/$/, "");
  const u = new URL(req.url);
  const go = u.searchParams.get("go");
  const adopt = u.searchParams.get("adoptdefault");

  if (!go && !adopt) return new Response(PAGE, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (!key) return json({ error: "SHOTSTACK_API_KEY manquant" }, 500);

  try {
    if (adopt) { const jid = await createJob(DEFAULT_ID, env); return json({ ok: true, adopted: DEFAULT_ID, jobId: jid }); }
    // go : lancer un nouveau rendu + créer le job
    const edit = JSON.parse(JSON.stringify(EDIT)); prefixRelative(edit, base);
    const r = await fetch(`${api}/render`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key }, body: JSON.stringify(edit) });
    const text = await r.text(); let d; try { d = JSON.parse(text); } catch { d = { raw: text.slice(0, 600) }; }
    if (!r.ok || !(d.response && d.response.id)) return json({ error: "Shotstack a refuse le rendu", http: r.status, detail: d }, 502);
    const jid = await createJob(d.response.id, env);
    return json({ ok: true, id: d.response.id, jobId: jid });
  } catch (e) { return json({ error: e.message }, 500); }
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
export const config = { path: "/api/render-pilote" };

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Actu Crue — Rendu pilote</title><style>
:root{--amber:#f5a524;--chalk:#edeef0;--mut:#99a2b1}
*{box-sizing:border-box;margin:0;font-family:Arial,Helvetica,sans-serif}
body{background:radial-gradient(120% 120% at 50% 0%,#15171c,#090a0d 70%);color:var(--chalk);min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:40px 16px;gap:20px}
h1{font-size:24px;letter-spacing:.5px}h1 b{color:var(--amber)}
.card{width:100%;max-width:720px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:16px}
button{font-size:16px;font-weight:700;color:#111;background:var(--amber);border:none;padding:15px 24px;border-radius:999px;cursor:pointer}
.st{font-size:15px;line-height:1.5;color:var(--mut)}.st b{color:var(--amber)}
a{color:var(--amber)}
</style></head><body>
<h1>ACTU <b>CRUE</b> — Rendu du pilote</h1>
<div class="card">
  <div class="st" id="st">Chargement…</div>
  <button onclick="launch()">▶ Lancer un nouveau rendu</button>
  <div class="st">Les vidéos rendues arrivent automatiquement dans l'onglet <b>« À valider »</b> du site (collecte toutes les 5 min). Tu les publies de là, comme les autos. <a href="/">← Retour au site</a></div>
</div>
<script>
function st(t){document.getElementById('st').innerHTML=t;}
async function launch(){st('Lancement du rendu…');try{var r=await fetch('/api/render-pilote?go=1');var d=await r.json();if(d.ok)st('<b>C\\'est lancé !</b> La vidéo apparaîtra dans l\\'onglet « À valider » d\\'ici 5 à 10 minutes.');else st('Erreur : '+(d.error||JSON.stringify(d)));}catch(e){st('Erreur réseau.');}}
(async function(){try{var r=await fetch('/api/render-pilote?adoptdefault=1');var d=await r.json();if(d.ok)st('Ton rendu en cours a été <b>ajouté à la file</b>. Il apparaîtra dans l\\'onglet « À valider » dès qu\\'il sera prêt (quelques minutes).');else st('Prêt. Clique pour lancer un rendu.');}catch(e){st('Prêt. Clique pour lancer un rendu.');}})();
</script></body></html>`;
