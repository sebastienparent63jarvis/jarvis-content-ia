// Récupère une image distante (miniature HCTI) côté serveur et la renvoie en
// base64. Contourne le blocage CORS quand le navigateur tente de télécharger
// l'image HCTI pour la ré-uploader vers YouTube.

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }
  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400 });
  }
  const { url } = body;
  if (!url) {
    return new Response(JSON.stringify({ error: "url manquante" }), { status: 400 });
  }
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const buf = Buffer.from(await resp.arrayBuffer());
    const base64 = buf.toString("base64");
    const contentType = resp.headers.get("content-type") || "image/png";
    return new Response(JSON.stringify({ base64, contentType }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Récupération image échouée: " + e.message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/fetch-image" };
