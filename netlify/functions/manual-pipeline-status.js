// Lit le statut du dernier lancement manuel accéléré.
import { openStore } from "./_auto-core.js";

export default async () => {
  try {
    const last = await openStore("jarvis-auto-runs").get("last_manual", { type: "json" });
    return new Response(JSON.stringify(last || { status: "none" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/manual-pipeline-status" };
