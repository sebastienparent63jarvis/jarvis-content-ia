// Proxy d'images Wikimedia Commons pour Shotstack.
// Wikimedia bloque le User-Agent du téléchargeur de Shotstack ; ce proxy va
// chercher l'image avec un User-Agent conforme (compte Actu Crue) et la ressert
// depuis le domaine du site, que Shotstack sait télécharger.
//   GET /api/img?u=<url upload.wikimedia.org encodée>
// Restreint aux hôtes d'images libres connus (Commons, Flickr via Openverse) — pas de proxy ouvert.

const UA = "ActuCrue/1.0 (https://commons.wikimedia.org/wiki/User:Actu_Crue)";

export default async (req) => {
  const u = new URL(req.url).searchParams.get("u");
  if (!u || !/^https:\/\/((?:upload|thumb)\.wikimedia\.org|live\.staticflickr\.com|farm\d+\.staticflickr\.com|c\d*\.staticflickr\.com)\//.test(u)) {
    return new Response(JSON.stringify({ error: "url invalide (upload.wikimedia.org requis)" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const src = u.replace("https://thumb.wikimedia.org/", "https://upload.wikimedia.org/");
    const r = await fetch(src, { headers: { "User-Agent": UA, "Accept": "image/*,*/*", ...(/wikimedia/.test(u) ? { "Referer": "https://commons.wikimedia.org/" } : {}) } });
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "wikimedia " + r.status }), { status: r.status, headers: { "Content-Type": "application/json" } });
    }
    const buf = await r.arrayBuffer();
    const ct = r.headers.get("content-type") || "image/jpeg";
    return new Response(buf, { status: 200, headers: { "Content-Type": ct, "Cache-Control": "public, max-age=604800" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/img" };
