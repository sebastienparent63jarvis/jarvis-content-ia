// Lit le résultat du dernier run de test du pipeline autonome (lancé en
// background). L'app / le navigateur interroge cette fonction après avoir
// déclenché auto-pipeline-test-background.

import { openStore } from "./_auto-core.js";

export default async () => {
  try {
    const store = openStore("jarvis-auto-runs");
    const last = await store.get("last", { type: "json" }).catch(() => null);
    const lastBatch = await store.get("last_batch", { type: "json" }).catch(() => null);
    if (!last && !lastBatch) {
      return new Response(JSON.stringify({ status: "none", message: "Aucun run encore." }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ last, lastBatch }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/auto-pipeline-status" };
