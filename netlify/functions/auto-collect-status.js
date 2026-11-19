// Lit le résultat du dernier run de collecte (Temps B).
import { openStore } from "./_auto-core.js";

export default async () => {
  try {
    const store = openStore("jarvis-auto-runs");
    const last = await store.get("last_collect", { type: "json" });
    if (!last) {
      return new Response(JSON.stringify({ status: "none", message: "Aucune collecte encore." }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(last), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/auto-collect-status" };
