// RENDU DU PILOTE "Nvidia" EN MP4 via Shotstack — fonction dédiée (one-shot).
// Construit la timeline complète (B-roll + Ken Burns + habillage ambre Actu Crue
// + voix off de Céline + logo de fin) et l'envoie à Shotstack, qui va chercher
// tous les médias lui-même (URLs Higgsfield/CloudFront) avec TA clé.
//
// Usage :
//   - Lancer le rendu : GET/POST  /api/render-pilote          -> renvoie { id }
//   - Suivre le rendu : GET        /api/render-pilote?id=XXXX  -> { status, url }
//     (status "done" => url = lien du MP4 final)
//
// Env requis (déjà présents sur le site) : SHOTSTACK_API_KEY, SHOTSTACK_ENV ("stage" ou "v1").
// Pour un MP4 final propre, utiliser l'env/clé de PRODUCTION ("v1").

const BASE = "https://d8j0ntlcm91z4.cloudfront.net/user_3LvsnJtPUcvVMIC8NpcWMXZwNS1/";
const U = (n) => BASE + n;

// Police chargée pour les HTML overlays (geometric sans, proche de Space Grotesk).
const FONT = { src: "https://templates.shotstack.io/basic/asset/font/montserrat-semibold.ttf" };
const FONT_BOLD = { src: "https://templates.shotstack.io/basic/asset/font/montserrat-bold.ttf" };

const AMBER = "#f5a524";
const INK = "#0e0f13";
const CHALK = "#edeef0";

// --- Segments : voix off (mp3) + plan de fond + habillage ---------------------
const SEGMENTS = [
  { vo: "hf_20261117_225133_3d700b70-7442-402e-bf75-e93feb07c4c0.mp3",
    media: { type: "image", src: "hf_20261117_192329_2680ed96-c74c-4a97-a80f-a1d9f5805ff2.png" }, kb: "zoomIn",
    text: "En quarante-huit heures, l'homme le plus puissant de l'intelligence artificielle est tombe. Jensen Huang, le fondateur de Nvidia, l'entreprise a plus de quatre mille milliards de dollars qui fait tourner quasiment toute l'IA mondiale, a quitte son poste. Du jour au lendemain. Effet immediat. Et la vraie question n'est pas pourquoi. C'est : qui tient l'IA, maintenant ?",
    overlay: { kind: "lt", kick: "Actualite", hl: "Nvidia sans son fondateur" } },

  { vo: "hf_20261117_225103_0e4a05f7-8e1c-4adf-a2c5-ff0dad61942e.mp3",
    media: { type: "image", src: "hf_20261117_192328_89ecdb5d-63b2-4478-ab34-9072198d036a.png" }, kb: "zoomOut",
    text: "Le 12 novembre 2026, Nvidia publie un communique de quelques lignes. Jensen Huang demissionne de la presidence, de la direction generale, et du conseil d'administration. Trente-trois ans apres avoir co-fonde l'entreprise. A sa place, le conseil nomme Colette Kress, la directrice financiere, comme directrice generale par interim. Et pour la premiere fois de son histoire, Nvidia se dote d'un president du conseil distinct, Harvey Jones.",
    overlay: { kind: "slate", n: "01", nm: "Le seisme", sub: "12 nov. 2026" } },

  { vo: "hf_20261117_225103_700a4940-3107-4f98-87b2-4e4c080cf57e.mp3",
    media: { type: "image", src: "hf_20261117_192403_3fdaec46-5034-495c-912b-be2d6e1d020a.png" }, kb: "slideLeft",
    text: "Pour comprendre le choc, il faut mesurer qui etait Huang. En une decennie, il a transforme un fabricant de cartes graphiques pour jeux video en l'infrastructure de la revolution IA. Sans les puces Nvidia, pas de ChatGPT, pas de Gemini, pas de la quasi-totalite de ce qu'on appelle l'IA aujourd'hui.",
    overlay: null },

  { vo: "hf_20261117_225103_29ea7945-cb7e-4907-bf54-d7a194d46242.mp3",
    media: { type: "image", src: "hf_20261117_192329_d02ad04d-e95f-4ea1-b659-a2e056befe86.png" }, kb: "zoomIn",
    text: "Officiellement, Nvidia ne donne aucune raison. Mais les jours qui precedent racontent autre chose. Le dimanche, d'apres Al Jazeera, Huang reconnait avoir ete infidele a son epouse, et presente ses excuses. En parallele, selon le New York Times et Reuters, le conseil d'administration se reunit pour envisager son depart, sur fond de revelations sur sa vie privee.",
    overlay: { kind: "slate", n: "02", nm: "La chute" } },

  { vo: "hf_20261117_225103_0b9a98d4-3429-4347-b399-d0ee2adcada6.mp3",
    media: { type: "image", src: "hf_20261117_192403_c3748130-105c-4cf2-a318-fffae7ef5858.png" }, kb: "zoomOut",
    text: "Et puis il y a le volet qui depasse le scandale : la securite nationale. Nvidia annonce enqueter pour savoir si Huang a ete la cible d'une operation de renseignement etranger. La question posee n'est pas a-t-il trahi, mais a-t-il ete vise. Le conseil precise n'avoir aucune raison de croire que la securite nationale ait ete compromise. Pekin qualifie les accusations d'espionnage d'infondees. Ce sont des allegations et une enquete en cours, pas un verdict.",
    overlay: null },

  { vo: "hf_20261117_225133_c0924894-7268-449b-a685-69961f1fe0ba.mp3",
    media: { type: "image", src: "hf_20261117_192329_a41a0a7c-250b-4671-aa94-d3d1ab4fe37e.png" }, kb: "slideRight",
    text: "Colette Kress n'est pas une inconnue parachutee. Elle est directrice financiere de Nvidia depuis 2013. Pendant son mandat, le chiffre d'affaires annuel est passe d'environ quatre milliards de dollars a pres de deux cent seize milliards. Mais elle est par interim. Deja, les noms fusent : Donald Trump a suggere l'ancien patron d'Apple, Tim Cook. Le vrai suspense : la stabilite d'une gestionnaire, ou un grand nom pour rassurer la planete tech ?",
    overlay: { kind: "slate", n: "03", nm: "La releve", sub: "Colette Kress - DG par interim" } },

  { vo: "hf_20261117_225103_068360d9-53a4-48ac-862a-b83045cc57cf.mp3",
    media: { type: "image", src: "hf_20261117_192403_c3748130-105c-4cf2-a318-fffae7ef5858.png" }, kb: "zoomIn",
    text: "La reaction est immediate. L'action Nvidia plonge de plus de quatorze pour cent en seance, avant de reprendre un peu de terrain. Mais le vrai enjeu est ailleurs : les puces et la Chine. Huang etait le lobbyiste en chef contre les restrictions d'exportation. Son depart, mele aux soupcons d'espionnage, relance en force le camp des faucons a Washington. La politique des puces, le nerf de la guerre IA, pourrait basculer.",
    overlay: { kind: "slate", n: "04", nm: "L'onde de choc" },
    calls: [ { v: "-14 %", l: "Action Nvidia en seance" }, { v: "~54 Mds$", l: "Puces H200 vers la Chine" } ] },

  { vo: "hf_20261117_225204_8240ce1e-836b-4df6-8c24-8124ae9be1ac.mp3",
    media: { type: "video", src: "hf_20261117_192445_fd180303-57c8-434e-aadf-af857d38a500.mp4" }, kb: null,
    text: "Alors voila la vraie bascule. Pendant des annees, le boom de l'IA avait un visage : celui de Jensen Huang. Ce visage vient de s'effacer. Et la machine, elle, continue de tourner. La question depasse Nvidia : est-ce que la revolution de l'IA depend encore des hommes qui la dirigent, ou est-elle devenue plus grande qu'eux ?",
    overlay: { kind: "slate", n: "05", nm: "Et maintenant ?" } },

  { vo: "hf_20261117_225133_385d54f5-16b1-47df-9d7d-59e1a6357089.mp3",
    media: { type: "image", src: "hf_20261117_221153_208e6a1a-8ab4-47e9-b0dc-d80bfe486ceb.png" }, kb: "zoomIn",
    text: "Chez Actu Crue, on vous donne les faits, verifies et sources, pour que vous vous fassiez votre propre idee. Vous pariez sur quoi : Colette Kress confirmee, ou un grand nom venu de l'exterieur ? Dites-le en commentaire. Abonnez-vous pour ne pas rater la suite.",
    overlay: { kind: "cta", text: "Abonnez-vous" } },
];

// Durée estimée d'un segment à partir du texte (~13.5 caractères/seconde FR + marge).
function estDur(text) {
  return Math.max(3, Math.round((text.length / 13.5 + 0.5) * 10) / 10);
}

// --- Habillage (HTML full-frame transparent, élément positionné en CSS) -------
function htmlAsset(inner) {
  return { type: "html", width: 1920, height: 1080, html: `<div class="f">${inner}</div>`,
    css: `.f{width:1920px;height:1080px;position:relative;font-family:'Montserrat',sans-serif}`,
    background: "transparent" };
}
function bugAsset() {
  return htmlAsset(
    `<div style="position:absolute;top:34px;left:40px;display:flex;align-items:center;gap:11px;background:rgba(10,11,15,.5);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:9px 16px 9px 10px">
       <span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;background:${AMBER};color:#111;font-weight:700;font-size:16px;border-radius:5px">AC</span>
       <span style="color:${CHALK};font-weight:700;font-size:26px;letter-spacing:2px">ACTU CRUE</span>
     </div>`);
}
function slateAsset(n, nm, sub) {
  return htmlAsset(
    `<div style="position:absolute;left:70px;bottom:120px;display:flex;align-items:flex-end;gap:26px">
       <div style="width:9px;height:120px;background:${AMBER};border-radius:3px"></div>
       <div style="color:${CHALK};font-weight:700;font-size:150px;line-height:.8">${n}</div>
       <div style="color:${CHALK};font-weight:700;font-size:46px;letter-spacing:3px;text-transform:uppercase;padding-bottom:14px">${nm}
         ${sub ? `<div style="color:${AMBER};font-weight:600;font-size:24px;letter-spacing:1px;text-transform:none;margin-top:10px">${sub}</div>` : ""}
       </div>
     </div>`);
}
function ltAsset(kick, hl) {
  return htmlAsset(
    `<div style="position:absolute;left:70px;right:70px;bottom:110px">
       <div style="display:inline-block;background:${AMBER};color:#111;font-weight:700;font-size:28px;letter-spacing:3px;text-transform:uppercase;padding:6px 18px;border-radius:5px;margin-bottom:18px">${kick}</div>
       <div style="color:${CHALK};font-weight:700;font-size:72px;line-height:1.04;text-shadow:0 3px 18px rgba(0,0,0,.7);max-width:1300px">${hl}</div>
     </div>`);
}
function callsAsset(calls) {
  const chips = calls.map(c =>
    `<div style="display:flex;align-items:baseline;gap:16px;background:rgba(10,11,15,.66);border:1px solid rgba(255,255,255,.18);border-left:7px solid ${AMBER};border-radius:10px;padding:14px 22px;margin-bottom:16px">
       <span style="color:${AMBER};font-weight:700;font-size:48px;line-height:1">${c.v}</span>
       <span style="color:${CHALK};font-size:24px">${c.l}</span>
     </div>`).join("");
  return htmlAsset(`<div style="position:absolute;right:46px;top:220px;display:flex;flex-direction:column;align-items:flex-end">${chips}</div>`);
}
function ctaAsset(text) {
  return htmlAsset(
    `<div style="position:absolute;left:0;right:0;bottom:150px;text-align:center">
       <div style="display:inline-block;background:${INK};color:#f5e9d2;font-weight:700;font-size:54px;letter-spacing:1px;padding:22px 54px;border-radius:999px">${text}</div>
     </div>`);
}

function buildEdit() {
  const visual = [];
  const overlays = [];
  const audio = [];
  let t = 0;
  const XF = 0.4; // fondu enchaîné

  SEGMENTS.forEach((s, i) => {
    const d = estDur(s.text);
    // --- plan de fond (image Ken Burns ou vidéo) ---
    const clip = {
      asset: s.media.type === "video"
        ? { type: "video", src: U(s.media.src), volume: 0 }
        : { type: "image", src: U(s.media.src) },
      start: t, length: d, fit: "cover",
      transition: { in: i === 0 ? "fade" : "fade", out: "fade" },
    };
    if (s.media.type === "image" && s.kb) clip.effect = s.kb;
    visual.push(clip);

    // --- voix off ---
    audio.push({ asset: { type: "audio", src: U(s.vo) }, start: t, length: d });

    // --- habillage (apparait 0.3s après le début, disparait avant la fin) ---
    const oStart = t + 0.3, oLen = Math.max(1.5, d - 0.9);
    if (s.overlay) {
      let a = null;
      if (s.overlay.kind === "slate") a = slateAsset(s.overlay.n, s.overlay.nm, s.overlay.sub);
      else if (s.overlay.kind === "lt") a = ltAsset(s.overlay.kick, s.overlay.hl);
      else if (s.overlay.kind === "cta") a = ctaAsset(s.overlay.text);
      if (a) overlays.push({ asset: a, start: oStart, length: oLen, transition: { in: "fade", out: "fade" } });
    }
    if (s.calls) overlays.push({ asset: callsAsset(s.calls), start: oStart + 0.5, length: Math.max(1.5, d - 1.4), transition: { in: "fade", out: "fade" } });

    t += d - XF; // léger chevauchement pour le fondu
  });

  const total = t + XF;
  const bug = { asset: bugAsset(), start: 0, length: total, transition: { in: "fade" } };

  return {
    timeline: {
      background: INK,
      fonts: [FONT, FONT_BOLD],
      tracks: [
        { clips: overlays },   // habillage (dessus)
        { clips: [bug] },      // bug permanent
        { clips: visual },     // plans de fond
        { clips: audio },      // voix off
      ],
    },
    output: { format: "mp4", size: { width: 1920, height: 1080 }, fps: 25 },
  };
}

export default async (req) => {
  const env = process.env.SHOTSTACK_ENV || "stage";
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) return json({ error: "SHOTSTACK_API_KEY manquant" }, 500);
  const api = `https://api.shotstack.io/${env}`;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  // --- Suivi d'un rendu ---
  if (id) {
    try {
      const r = await fetch(`${api}/render/${id}`, { headers: { "x-api-key": key } });
      const d = await r.json();
      const resp = d.response || {};
      return json({ status: resp.status, url: resp.url || null, error: resp.error || null });
    } catch (e) { return json({ error: e.message }, 502); }
  }

  // --- Lancement du rendu ---
  try {
    const edit = buildEdit();
    const r = await fetch(`${api}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify(edit),
    });
    const text = await r.text();
    let d; try { d = JSON.parse(text); } catch { d = { raw: text.slice(0, 600) }; }
    if (!r.ok || !(d.response && d.response.id)) {
      return json({ error: "Shotstack a refuse le rendu", http: r.status, detail: d }, 502);
    }
    return json({ ok: true, id: d.response.id, env, segments: SEGMENTS.length,
      suivi: `/api/render-pilote?id=${d.response.id}` });
  } catch (e) { return json({ error: e.message }, 500); }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { "Content-Type": "application/json" } });
}

export const config = { path: "/api/render-pilote" };
