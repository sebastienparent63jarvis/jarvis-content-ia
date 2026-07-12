// Historique des scripts — archive persistante des contenus générés.
// Permet de RELIRE le script complet d'une vidéo passée, indispensable pour
// comparer ce qui marche (rétention forte) à ce qui échoue. Stocké dans
// Netlify Blobs pour survivre entre les sessions.

import { getStore } from "@netlify/blobs";

function openStore() {
  try {
    return getStore({ name: "jarvis-scripts", consistency: "strong" });
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) {
      return getStore({ name: "jarvis-scripts", siteID, token, consistency: "strong" });
    }
    throw e;
  }
}

export default async (req, context) => {
  let store;
  try {
    store = openStore();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Blobs indisponible: " + err.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  // GET : liste tous les scripts archivés (les plus récents d'abord).
  if (req.method === "GET") {
    try {
      const list = await store.list();
      const items = [];
      for (const blob of (list.blobs || [])) {
        try {
          const val = await store.get(blob.key, { type: "json" });
          if (val) items.push(val);
        } catch { /* ignore un item corrompu */ }
      }
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return new Response(JSON.stringify({ scripts: items }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Échec lecture historique: " + err.message }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }
  }

  // POST : archive un script (ou met à jour ses stats de rétention).
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400 });
    }

    const { id, script, retention, views, note } = body;

    try {
      // Mise à jour de stats sur un script existant.
      if (id && (retention !== undefined || views !== undefined || note !== undefined)) {
        let existing = null;
        try { existing = await store.get(id, { type: "json" }); } catch { existing = null; }
        if (!existing) {
          return new Response(JSON.stringify({ error: "Script introuvable" }), { status: 404 });
        }
        const updated = {
          ...existing,
          retention: retention !== undefined ? retention : existing.retention,
          views: views !== undefined ? views : existing.views,
          note: note !== undefined ? note : existing.note,
        };
        await store.set(id, JSON.stringify(updated));
        return new Response(JSON.stringify({ ok: true, script: updated }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }

      // Archivage d'un nouveau script.
      if (!script || !script.title) {
        return new Response(JSON.stringify({ error: "script manquant" }), { status: 400 });
      }
      const newId = `script-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const record = {
        id: newId,
        createdAt: Date.now(),
        title: script.title,
        category: script.category || "",
        style: script.style || "",
        description: script.description || "",
        segments: script.narration_segments || [],
        rationale: script.rationale || "",
        best_post_window: script.best_post_window || "",
        retention: null,
        views: null,
        note: "",
      };
      await store.set(newId, JSON.stringify(record));
      return new Response(JSON.stringify({ ok: true, id: newId }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Échec archivage: " + err.message }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
};

export const config = {
  path: "/api/scripts-history",
};
