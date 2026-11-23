// FORMAT LONG générique (modèle Actu Crue) — lance le rendu d'un montage produit
// par studio/build_long.js et crée le job ; la collecte habituelle le range dans
// « À valider ». POST /api/render-long { slug, title, description, publishAt? }
// Le montage est lu sur le site : /productions/<slug>/edit.json (déployé par git).
import { getStore } from "@netlify/blobs";
function store(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) { return getStore({ name, siteID: process.env.NETLIFY_SITE_ID || process.env.SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN, consistency: "strong" }); }
}
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
function prefix(n, base) { if (Array.isArray(n)) return n.forEach((x) => prefix(x, base)); if (n && typeof n === "object") { if (typeof n.src === "string" && !/^https?:\/\//.test(n.src)) n.src = base + "/" + n.src; Object.values(n).forEach((x) => prefix(x, base)); } }
export default async (req) => {
  if (req.method !== "POST") return j({ error: "POST requis" }, 405);
  const { slug, title, description, publishAt } = await req.json().catch(() => ({}));
  if (!slug || !/^[a-z0-9-]+$/.test(slug) || !title) return j({ error: "slug (a-z0-9-) et title requis" }, 400);
  const key = process.env.SHOTSTACK_API_KEY; if (!key) return j({ error: "SHOTSTACK_API_KEY manquant" }, 500);
  const env = process.env.SHOTSTACK_ENV || "stage";
  const base = (process.env.URL || "https://jarviscontenuia.netlify.app").replace(/\/$/, "");
  const er = await fetch(`${base}/productions/${slug}/edit.json`, { cache: "no-store" });
  if (!er.ok) return j({ error: "edit.json introuvable (déploiement pas encore en ligne ?)", http: er.status }, 404);
  const edit = await er.json(); prefix(edit, base);
  const r = await fetch(`https://api.shotstack.io/${env}/render`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key }, body: JSON.stringify(edit) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.response?.id) return j({ error: "Shotstack a refusé", http: r.status, detail: d }, 502);
  const jobs = store("jarvis-auto-jobs");
  const jobId = `job-long-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await jobs.set(jobId, JSON.stringify({ id: jobId, status: "rendering", renderId: d.response.id, renderEnv: env, createdAt: new Date().toISOString(), slot: "long", publishAt: publishAt || null, format: "long", script: { title, description: description || "" } }));
  const idx = (await jobs.get("_index", { type: "json" })) || []; idx.unshift(jobId); await jobs.set("_index", JSON.stringify(idx));
  return j({ ok: true, id: d.response.id, jobId });
};
export const config = { path: "/api/render-long" };
