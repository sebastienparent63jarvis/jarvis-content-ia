// Bascule du modèle de production des shorts.
// GET /api/shorts-model            -> { model }
// GET /api/shorts-model?set=actucrue | legacy
import { getShortsModel, setShortsModel } from "./_ac-short.js";
export default async (req) => {
  const set = new URL(req.url).searchParams.get("set");
  if (set && !["actucrue", "legacy"].includes(set)) return new Response(JSON.stringify({ error: "valeur : actucrue ou legacy" }), { status: 400 });
  const model = set ? await setShortsModel(set) : await getShortsModel();
  return new Response(JSON.stringify({ model }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
};
export const config = { path: "/api/shorts-model" };
