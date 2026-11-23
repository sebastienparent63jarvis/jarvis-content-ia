// Additif — rendu d'un ÉCHANTILLON de montage (tests 5-10 s), sans job ni file "À valider".
// POST /api/render-sample  body: { edit }  -> { id }   (statut : /api/render-status?id=)
export default async (req) => {
  const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return j({ error: "POST requis" }, 405);
  const key = process.env.SHOTSTACK_API_KEY; if (!key) return j({ error: "SHOTSTACK_API_KEY manquant" }, 500);
  const env = process.env.SHOTSTACK_ENV || "stage";
  const base = (process.env.URL || "https://jarviscontenuia.netlify.app").replace(/\/$/, "");
  const { edit } = await req.json().catch(() => ({}));
  if (!edit || !edit.timeline) return j({ error: "edit manquant" }, 400);
  const fix = (n) => { if (Array.isArray(n)) return n.forEach(fix); if (n && typeof n === "object") { if (typeof n.src === "string" && !/^https?:\/\//.test(n.src)) n.src = base + "/" + n.src; Object.values(n).forEach(fix); } };
  fix(edit);
  const r = await fetch(`https://api.shotstack.io/${env}/render`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key }, body: JSON.stringify(edit) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.response?.id) return j({ error: "Shotstack a refusé", http: r.status, detail: d }, 502);
  return j({ ok: true, id: d.response.id });
};
