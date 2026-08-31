// Fonction de TEST du pipeline autonome — normale (non programmée), donc
// déclenchable par URL sans 403. Exécute la même production que le cron, mais
// SANS le contrôle d'heure (pour tester quand on veut). Protégée par un secret
// simple pour éviter les déclenchements involontaires.

import { runScriptStep } from "./_auto-core.js";

const SLOT = { hour: 8, min: 30 };

export default async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  // Secret léger : on réutilise une variable déjà présente pour ne pas en créer.
  // Il faut passer ?key=<les 6 premiers caractères de HCTI_USER_ID>.
  const expected = (process.env.AUTO_TEST_KEY || "").trim();
  if (expected && key !== expected) {
    return new Response(JSON.stringify({ error: "clé de test invalide (ajoute ?key=... — voir AUTO_TEST_KEY dans Netlify)" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  const result = await runScriptStep(SLOT);
  return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
};

export const config = { path: "/api/auto-pipeline-test" };
