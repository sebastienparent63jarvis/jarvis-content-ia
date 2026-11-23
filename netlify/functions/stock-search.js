// Additif — recherche de vidéos d'illustration Pexels (licence Pexels : usage
// commercial gratuit, sans attribution obligatoire). Format paysage par défaut.
// GET /api/stock-search?q=board%20meeting&orientation=landscape&n=12
export default async (req) => {
  const key = process.env.PEXELS_API_KEY;
  const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (!key) return j({ error: "PEXELS_API_KEY manquante" }, 500);
  const u = new URL(req.url);
  const q = u.searchParams.get("q"); if (!q) return j({ error: "q requis" }, 400);
  const orientation = u.searchParams.get("orientation") || "landscape";
  const n = Math.min(40, +(u.searchParams.get("n") || 12));
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=${orientation}&size=medium&per_page=${n}`, { headers: { Authorization: key } });
  if (!r.ok) return j({ error: "Pexels " + r.status }, 502);
  const d = await r.json();
  const pickFile = (files) => {
    const ok = (files || []).filter((f) => f.file_type === "video/mp4" && f.width && f.height);
    const land = ok.filter((f) => orientation === "portrait" ? f.height >= f.width : f.width >= f.height);
    const pool = land.length ? land : ok;
    pool.sort((a, b) => Math.abs((orientation === "portrait" ? a.height : a.width) - 1920) - Math.abs((orientation === "portrait" ? b.height : b.width) - 1920));
    return pool[0] || null;
  };
  const videos = (d.videos || []).map((v) => { const f = pickFile(v.video_files); return f && { id: v.id, dur: v.duration, w: f.width, h: f.height, src: f.link, thumb: v.image, by: v.user?.name, page: v.url }; }).filter(Boolean);
  return j({ q, total: d.total_results, videos });
};
