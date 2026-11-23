// Test du modèle Actu Crue sur UN short (sans toucher au drapeau ni aux créneaux).
// POST /api/ac-short-test-background  { topic? }  -> 202 ; résultat : jarvis-config/ac-test-last
// Le short rendu est ensuite rangé dans « À valider » par la collecte habituelle.
import { getStore } from "@netlify/blobs";
import { runScriptStep } from "./_auto-core.js";
import { runProductionStepAC } from "./_ac-short.js";
function store(name) {
  try { return getStore({ name, consistency: "strong" }); }
  catch (e) { const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID, token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN; return getStore({ name, siteID, token, consistency: "strong" }); }
}
export default async (req) => {
  const body = await req.json().catch(() => ({}));
  const base = (process.env.URL || "https://jarviscontenuia.netlify.app").replace(/\/$/, "");
  const st = store("jarvis-config");
  await st.setJSON("ac-test-last", { status: "running", startedAt: new Date().toISOString() });
  try {
    const s = await runScriptStep({ hour: 12, min: 0 }, { topic: body.topic || undefined, publishAt: null });
    if (s.error) throw new Error("script : " + s.error);
    const p = await runProductionStepAC(s.jobId, base);
    await st.setJSON("ac-test-last", { status: "done", finishedAt: new Date().toISOString(), ...p });
  } catch (e) {
    await st.setJSON("ac-test-last", { status: "failed", error: String(e.message || e) });
  }
};
