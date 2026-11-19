// Génération de script — BACKGROUND FUNCTION (plan Netlify payant).
// Le suffixe "-background" fait tourner la fonction sans limite de 10s (jusqu'à
// 15 min), ce qui règle définitivement le 504 "Inactivity Timeout" quand le
// modèle est lent (thinking adaptatif sur un long prompt). Elle répond 202
// immédiatement, génère, et STOCKE le résultat dans Blobs sous un jobId que
// l'interface vient récupérer par polling (via script-result).

import { getStore } from "@netlify/blobs";
import { SHORTS_SYSTEM_PROMPT, buildUserPrompt, extractScript } from "./_script-core.js";

function openStore() {
  try {
    return getStore({ name: "jarvis-scriptjobs", consistency: "strong" });
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) {
      return getStore({ name: "jarvis-scriptjobs", siteID, token, consistency: "strong" });
    }
    throw e;
  }
}

export default async (req, context) => {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }

  const jobId = body.jobId;
  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId manquant" }), { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  const run = async () => {
    let store;
    try { store = openStore(); } catch { return; }

    if (!apiKey) {
      await store.set(jobId, JSON.stringify({ status: "error", error: "ANTHROPIC_API_KEY non configurée sur Netlify" }));
      return;
    }

    try {
      const userPrompt = buildUserPrompt(body);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: SHORTS_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        await store.set(jobId, JSON.stringify({ status: "error", error: data.error?.message || "Erreur API Anthropic" }));
        return;
      }

      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      if (!text) {
        await store.set(jobId, JSON.stringify({ status: "error", error: "Réponse vide de Claude" }));
        return;
      }

      let script;
      try {
        script = extractScript(text);
      } catch {
        await store.set(jobId, JSON.stringify({ status: "error", error: "Réponse non conforme au JSON", raw: text.slice(0, 400) }));
        return;
      }

      await store.set(jobId, JSON.stringify({ status: "done", script }));
    } catch (err) {
      await store.set(jobId, JSON.stringify({ status: "error", error: err.message }));
    }
  };

  // Marque "en cours" puis exécute (Netlify laisse tourner en background).
  try {
    const store = openStore();
    await store.set(jobId, JSON.stringify({ status: "pending" }));
  } catch { /* le run retentera */ }

  await run();

  return new Response(JSON.stringify({ accepted: true, jobId }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
};
