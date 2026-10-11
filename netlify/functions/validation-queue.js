// File d'attente de VALIDATION : les vidéos produites par le pipeline autonome
// y sont rangées "en attente", jusqu'à ce que tu les valides (ou rejettes) via
// la page de validation. Stockée dans Netlify Blobs pour survivre entre sessions.
//
// Actions (POST { action, ... }) :
//   add    { item }            → range une vidéo en attente, renvoie son id
//   list                       → liste les vidéos en attente
//   get    { id }              → détail d'une vidéo
//   decide { id, decision }    → "approved" | "rejected" (marque l'état)
//
// Un "item" contient : { title, description, videoUrl, thumbUrl, publishAt, createdAt }

import { getStore } from "@netlify/blobs";

function openStore() {
  try {
    return getStore({ name: "jarvis-validation-queue", consistency: "strong" });
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) {
      return getStore({ name: "jarvis-validation-queue", siteID, token, consistency: "strong" });
    }
    throw e;
  }
}

const INDEX_KEY = "_index"; // liste des ids

async function readIndex(store) {
  try { return (await store.get(INDEX_KEY, { type: "json" })) || []; } catch { return []; }
}
async function writeIndex(store, ids) {
  await store.set(INDEX_KEY, JSON.stringify(ids));
}

export default async (req, context) => {
  let store;
  try { store = openStore(); } catch (err) {
    return new Response(JSON.stringify({ error: "Blobs indisponible: " + err.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const action = body.action || "list";

  try {
    if (action === "add") {
      const id = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item = { id, status: "pending", createdAt: new Date().toISOString(), ...(body.item || {}) };
      await store.set(id, JSON.stringify(item));
      const ids = await readIndex(store);
      ids.unshift(id);
      await writeIndex(store, ids);
      return json({ ok: true, id });
    }

    if (action === "list") {
      // On SCANNE toute la file (plus de plafond à 50 qui enterrait les vidéos
      // à valider sous les déjà-décidées) et on collecte les "pending", les plus
      // récentes d'abord. On plafonne seulement le NOMBRE RENVOYÉ, pas le scan.
      const ids = await readIndex(store);
      const wantAll = !!body.all;
      const MAX_RETURN = wantAll ? 200 : 80;
      const MAX_SCAN = 500;
      const items = [];
      for (const id of ids.slice(0, MAX_SCAN)) {
        try {
          const it = await store.get(id, { type: "json" });
          if (!it) continue;
          if (wantAll || it.status === "pending") {
            items.push(it);
            if (items.length >= MAX_RETURN) break;
          }
        } catch { /* ignore l'entrée manquante */ }
      }
      return json({ items });
    }

    if (action === "get") {
      if (!body.id) return json({ error: "id manquant" }, 400);
      const it = await store.get(body.id, { type: "json" });
      if (!it) return json({ error: "introuvable" }, 404);
      return json({ item: it });
    }

    if (action === "decide") {
      if (!body.id || !["approved", "rejected"].includes(body.decision)) {
        return json({ error: "id ou decision invalide" }, 400);
      }
      const it = await store.get(body.id, { type: "json" });
      if (!it) return json({ error: "introuvable" }, 404);
      it.status = body.decision;
      it.decidedAt = new Date().toISOString();
      await store.set(body.id, JSON.stringify(it));
      // Retire l'id de l'index : la file ne garde que les "pending", elle ne
      // regrossit plus sans fin (le document reste en Blob pour l'historique).
      const ids = await readIndex(store);
      const next = ids.filter(x => x !== body.id);
      if (next.length !== ids.length) await writeIndex(store, next);
      return json({ ok: true, item: it });
    }

    return json({ error: "action inconnue" }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const config = { path: "/api/validation-queue" };
