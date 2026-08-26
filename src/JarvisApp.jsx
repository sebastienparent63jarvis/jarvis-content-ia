import { useState, useEffect, useCallback } from "react";

// ── DESIGN TOKENS ──────────────────────────────────────────────────────────
// Dark command-center aesthetic: deep navy base, electric amber accent,
// monospace data readouts. Feels like a Bloomberg terminal meets a war room.
const T = {
  // Fond sombre profond teinté aubergine (cohérent avec le violet Tor)
  bg0: "#0B0710",
  bg1: "#140D1C",
  bg2: "#1C1228",
  border: "rgba(180,140,210,0.16)",       // bordure "verre" translucide violacée
  accent: "#7D4698",                        // violet Tor officiel
  accentDim: "#3A2247",
  accentGlow: "rgba(125,70,152,0.45)",      // halo lumineux violet
  green: "#3DD68C",
  red: "#FF5C72",
  blue: "#9B8CFF",
  text: "#F3EEF8",
  muted: "#9A8CA8",                          // texte secondaire lavande grisé
  mono: "'JetBrains Mono', 'Courier New', monospace",
  sans: "'Inter', 'Segoe UI', system-ui, sans-serif",
  // Matériaux "Liquid Glass"
  glass: "rgba(40,26,54,0.55)",             // panneau verre dépoli
  glassSolid: "rgba(28,18,40,0.92)",        // verre plus opaque (zones de texte)
  glassHi: "rgba(255,255,255,0.06)",        // highlight de bord supérieur
  blur: "saturate(160%) blur(20px)",        // flou d'arrière-plan
};

// ── HELPERS ─────────────────────────────────────────────────────────────────
const now = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const today = () => new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const uid = () => Math.random().toString(36).slice(2, 8);

const SYSTEM_PROMPT = `Tu es JARVIS — un moteur d'intelligence éditoriale autonome spécialisé dans la création de contenu YouTube haute-performance pour la niche Finance Personnelle × IA.

Ta mission : maximiser le RPM et l'engagement sur YouTube en produisant du contenu qui convertit.

Données de marché actuelles (2026) :
- Niche cible : Finance Personnelle + Outils IA (RPM $25-50, CPM $15-45)
- Plateforme principale : YouTube (long-forme + Shorts)
- Public cible : 25-45 ans, francophones, intéressés par l'indépendance financière et l'IA

Principes éditoriaux :
1. Titres ultra-cliquables (curiosity gap, chiffres précis, urgence)
2. Hooks des 15 premières secondes conçus pour stopper le scroll
3. Structure PSP (Promesse → Substance → Payoff)
4. Appels à l'action orientés conversion (abonnement, affiliation, sponsor)
5. Veille concurrentielle intégrée : s'inspirer des formats qui cartonnent, pas les copier

Pour chaque demande, tu dois :
- Prendre des DÉCISIONS autonomes (pas de "vous pourriez")
- Justifier chaque choix par la data
- Logger ta décision dans le rapport quotidien
- Adapter le ton : percutant, direct, sans jargon inutile

Format de réponse JSON OBLIGATOIRE :
{
  "decision": "Description courte de la décision prise",
  "content": "Le contenu principal généré",
  "rationale": "Justification basée sur la data",
  "next_action": "Action recommandée ensuite",
  "kpi_target": "KPI visé pour cette pièce de contenu"
}`;

// ── API CALL ─────────────────────────────────────────────────────────────────
// Appelle notre fonction serverless Netlify (/api/jarvis), qui détient la clé
// API côté serveur. Aucune clé n'est jamais exposée au navigateur.
async function callJarvis(messages, onChunk) {
  const res = await fetch("/api/jarvis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: SYSTEM_PROMPT, messages }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Erreur inconnue");
  }
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return text;
}

// ── SEND EMAIL VIA MAILTO ────────────────────────────────────────────────────
function sendDailyReport(email, log) {
  const subject = `[JARVIS] Rapport quotidien — ${today()}`;
  const body = log
    .map((e, i) => `[${e.time}] ${e.decision}\n→ ${e.rationale}\n→ KPI: ${e.kpi}\n`)
    .join("\n---\n");
  const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailto);
}

// ── COMPONENTS ───────────────────────────────────────────────────────────────
function Badge({ color, children }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: T.mono, fontWeight: 600,
    }}>{children}</span>
  );
}

function DecisionCard({ entry }) {
  return (
    <div style={{
      background: T.glassSolid, border: `1px solid ${T.border}`, borderRadius: 8,
      padding: "14px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted }}>{entry.time}</span>
        <Badge color={T.accent}>{entry.type}</Badge>
        {entry.kpi && <Badge color={T.green}>{entry.kpi}</Badge>}
      </div>
      <div style={{ fontWeight: 600, color: T.text, marginBottom: 6, fontSize: 14 }}>{entry.decision}</div>
      {entry.rationale && (
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>{entry.rationale}</div>
      )}
    </div>
  );
}

function Spinner() {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length < 3 ? d + "." : "."), 400);
    return () => clearInterval(t);
  }, []);
  return <span style={{ color: T.accent, fontFamily: T.mono }}>{dots}</span>;
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function JarvisApp() {
  const [view, setView] = useState("dashboard"); // dashboard | generate | pipeline | report | settings
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState(null);
  const [log, setLog] = useState([]);
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [youtubeKey, setYoutubeKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [contentType, setContentType] = useState("title");
  const [topic, setTopic] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [reportSent, setReportSent] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Pipeline Shorts (Phase 1)
  const [pipelineNews, setPipelineNews] = useState(""); // thème d'actualité optionnel
  const [newsAngle, setNewsAngle] = useState(""); // angle éditorial imposé (vide = tous angles)
  const [newsTopics, setNewsTopics] = useState(null); // sujets d'actu proposés
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);

  const fetchNews = async (autoGenerate) => {
    setNewsLoading(true);
    setNewsError(null);
    setNewsTopics(null);
    const jobId = `news-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      // 1. Déclenche la recherche en background (répond 202 immédiatement).
      await fetch("/.netlify/functions/fetch-news-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, hint: pipelineNews.trim() || undefined, angle: newsAngle || undefined }),
      });

      // 2. Poll le résultat jusqu'à done/error (max ~60s).
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let topics = null;
      for (let i = 0; i < 30; i++) {
        await sleep(2500);
        const r = await fetch(`/api/news-result?jobId=${encodeURIComponent(jobId)}`);
        const raw = await r.text();
        let d;
        try { d = JSON.parse(raw); } catch { continue; }
        if (d.status === "done") { topics = d.topics || []; break; }
        if (d.status === "error") throw new Error((d.error || "Erreur recherche actu") + (d.raw ? " — réponse: " + d.raw.slice(0, 150) : ""));
        // sinon status pending/en cours → on continue à attendre
      }
      if (topics === null) throw new Error("La recherche d'actualité a dépassé le délai. Réessaie.");

      if (autoGenerate && topics.length > 0) {
        const best = topics[0];
        setPipelineNews(best.actu);
        setNewsLoading(false);
        await handleGenerateScript(best.actu);
        return;
      }
      setNewsTopics(topics);
    } catch (e) {
      setNewsError(e.message);
    }
    setNewsLoading(false);
  };
  const [pipelineTopic, setPipelineTopic] = useState("");
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineScript, setPipelineScript] = useState(null);
  const [pipelineError, setPipelineError] = useState(null);
  const [recentTopics, setRecentTopics] = useState([]); // anti-répétition
  const [currentScriptId, setCurrentScriptId] = useState(null); // id archive du script courant
  const [history, setHistory] = useState(null); // scripts archivés
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [openScriptId, setOpenScriptId] = useState(null); // script déplié dans l'historique

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch("/api/scripts-history");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur inconnue");
      setHistory(data.scripts || []);
    } catch (e) {
      setHistoryError(e.message);
    }
    setHistoryLoading(false);
  };

  const saveRetention = async (id, retention, views) => {
    try {
      const res = await fetch("/api/scripts-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, retention: retention === "" ? null : Number(retention), views: views === "" ? null : Number(views) }),
      });
      if (res.ok) {
        setHistory(prev => (prev || []).map(s => s.id === id ? { ...s, retention: retention === "" ? null : Number(retention), views: views === "" ? null : Number(views) } : s));
      }
    } catch { /* silencieux */ }
  };

  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioUrlHosted, setAudioUrlHosted] = useState(null); // URL publique pour Shotstack
  const [audioSegmentsHosted, setAudioSegmentsHosted] = useState(null); // [{index,url,duration}] pour synchro exacte
  const [copiedField, setCopiedField] = useState(null); // fiche de publication
  const [markedPublished, setMarkedPublished] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const [voiceId, setVoiceId] = useState(""); // vide = la voix de Netlify (ELEVENLABS_VOICE_ID) fait autorité
  const [ytConnected, setYtConnected] = useState(null); // null=inconnu, true/false
  const [ytReason, setYtReason] = useState(null);
  const [ytChecking, setYtChecking] = useState(false);
  const [voiceIdInput, setVoiceIdInput] = useState("");
  const [voiceSaved, setVoiceSaved] = useState(false);

  // Pipeline Shorts (Phase 3 — visuels)
  const [visualsLoading, setVisualsLoading] = useState(false);
  const [visuals, setVisuals] = useState(null);
  const [visualsError, setVisualsError] = useState(null);

  // Pipeline Shorts (Phase 4 — assemblage vidéo)
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoStatus, setVideoStatus] = useState(null); // texte d'étape en cours
  const [videoUrl, setVideoUrl] = useState(null);
  const [ytPublishAt, setYtPublishAt] = useState(""); // date/heure de publication planifiée
  const [ytUploading, setYtUploading] = useState(false);
  const [ytUploadStatus, setYtUploadStatus] = useState(null);
  const [ytUploadError, setYtUploadError] = useState(null);
  const [ytPublishedId, setYtPublishedId] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbUrl, setThumbUrl] = useState(null);
  const [thumbError, setThumbError] = useState(null);
  const [videoError, setVideoError] = useState(null);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const handleAssembleVideo = async () => {
    if (!pipelineScript || !audioUrlHosted || !visuals) return;
    setVideoLoading(true);
    setVideoUrl(null);
    setVideoError(null);
    setVideoStatus("Génération du masque de marque (intro + fin)…");
    try {
      // 0. Génère les images de marque dans une fonction isolée (HCTI).
      //    L'intro = masque incrusté sur la 1re image Pexels. Si ça échoue, on
      //    assemble quand même la vidéo SANS intro/outro.
      let introMaskUrl = null, outroImgUrl = null;
      const firstPreview = (visuals && visuals.clips || []).find(c => c.clip && c.clip.preview);
      try {
        const bRes = await fetch("/api/generate-brand-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: pipelineScript.title,
            category: pipelineScript.category,
            word: pipelineScript.thumbnail_word,
            bgImage: firstPreview ? firstPreview.clip.preview : undefined,
          }),
        });
        const bRaw = await bRes.text();
        let bData; try { bData = JSON.parse(bRaw); } catch { bData = {}; }
        if (bRes.ok) { introMaskUrl = bData.introMaskUrl; outroImgUrl = bData.outroImgUrl; }
        else setVideoStatus("Masque de marque indisponible (" + (bData.error || "erreur") + ") — vidéo sans intro.");
      } catch { setVideoStatus("Masque de marque indisponible — vidéo sans intro."); }

      // 1. Lance l'assemblage (léger : ne fait plus que la recette Shotstack)
      setVideoStatus("Envoi de la recette de montage à Shotstack…");
      const res = await fetch("/api/assemble-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl: audioUrlHosted,
          audioSegments: audioSegmentsHosted || undefined,
          segments: pipelineScript.narration_segments || [],
          clips: visuals.clips || [],
          title: pipelineScript.title,
          category: pipelineScript.category,
          word: pipelineScript.thumbnail_word,
          introMaskUrl,
          outroImgUrl,
        }),
      });
      const rawResp = await res.text();
      let data;
      try { data = JSON.parse(rawResp); }
      catch { throw new Error(`Erreur assemblage (HTTP ${res.status}) : ${rawResp.slice(0, 200)}`); }
      if (!res.ok) throw new Error(data.error || "Erreur assemblage");

      const renderId = data.render_id;
      if (!renderId) throw new Error("Pas d'ID de rendu retourné");

      // 2. Sonde le statut jusqu'à done/failed (max ~3 min)
      setVideoStatus("Rendu vidéo en cours sur le cloud Shotstack…");
      let attempts = 0;
      const maxAttempts = 60; // 60 x 3s = 3 min
      while (attempts < maxAttempts) {
        await sleep(3000);
        attempts++;
        const stRes = await fetch(`/api/render-status?id=${encodeURIComponent(renderId)}`);
        const st = await stRes.json();
        if (!stRes.ok) throw new Error(st.error || "Erreur statut");
        setVideoStatus(`Rendu : ${st.status}… (${attempts * 3}s)`);
        if (st.status === "done" && st.url) {
          setVideoUrl(st.url);
          addToLog({
            type: "VIDÉO",
            decision: `Vidéo assemblée : "${pipelineScript.title}"`,
            rationale: `Durée ~${data.total_duration}s · ${(visuals.clips || []).length} segments`,
            kpi: "Phase 4 ✓",
          });
          break;
        }
        if (st.status === "failed") throw new Error("Le rendu Shotstack a échoué");
      }
      if (attempts >= maxAttempts && !videoUrl) {
        throw new Error("Délai de rendu dépassé (3 min). Réessaie ou vérifie Shotstack.");
      }
    } catch (e) {
      setVideoError(e.message);
    }
    setVideoLoading(false);
    setVideoStatus(null);
  };

  const handleGenerateThumbnail = async () => {
    if (!pipelineScript) return;
    setThumbLoading(true);
    setThumbUrl(null);
    setThumbError(null);
    try {
      // Fond : image de preview du premier clip Pexels (frame fixe).
      const firstClip = (visuals && visuals.clips || []).find(c => c.clip && (c.clip.preview || c.clip.link));
      const word = pipelineScript.thumbnail_word || (pipelineScript.title || "").split(" ").slice(0, 2).join(" ");
      const res = await fetch("/api/generate-thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bgImage: firstClip ? (firstClip.clip.preview || undefined) : undefined,
          title: pipelineScript.title,
          category: pipelineScript.category,
          word,
        }),
      });
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { throw new Error(`Réponse inattendue (HTTP ${res.status})`); }
      if (!res.ok) throw new Error(data.error || "Erreur miniature");
      if (!data.url) throw new Error("Aucune image retournée");
      setThumbUrl(data.url);
    } catch (e) {
      setThumbError(e.message);
    }
    setThumbLoading(false);
  };

  const handleFetchVisuals = async () => {
    if (!pipelineScript) return;
    setVisualsLoading(true);
    setVisuals(null);
    setVisualsError(null);
    try {
      const res = await fetch("/api/fetch-visuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: pipelineScript.narration_segments || [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur inconnue");
      setVisuals(data);
      addToLog({
        type: "VISUELS",
        decision: `${data.total - data.missing}/${data.total} clips récupérés (Pexels)`,
        rationale: data.missing > 0 ? `${data.missing} segment(s) sans visuel trouvé` : "Tous les segments ont un visuel",
        kpi: "Phase 3 ✓",
      });
    } catch (e) {
      setVisualsError(e.message);
    }
    setVisualsLoading(false);
  };


  const handleGenerateScript = async (newsOverride) => {
    setPipelineLoading(true);
    setPipelineScript(null);
    setPipelineError(null);
    setAudioUrl(null);
    setAudioUrlHosted(null);
    setVisuals(null);
    setVideoUrl(null);
    const jobId = `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      // 1. Déclenche la génération en background (répond 202 immédiatement).
      await fetch("/.netlify/functions/generate-script-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          topic: pipelineTopic.trim() || undefined,
          newsTheme: (typeof newsOverride === "string" && newsOverride) ? newsOverride : (pipelineNews.trim() || undefined),
          recentTopics: recentTopics.slice(0, 15),
        }),
      });

      // 2. Poll le résultat jusqu'à done/error (max ~2,5 min).
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let data = null;
      for (let i = 0; i < 60; i++) {
        await sleep(2500);
        const r = await fetch(`/api/script-result?jobId=${encodeURIComponent(jobId)}`);
        const raw = await r.text();
        let d;
        try { d = JSON.parse(raw); } catch { continue; }
        if (d.status === "done") { data = d; break; }
        if (d.status === "error") throw new Error((d.error || "Erreur génération") + (d.raw ? " — " + d.raw.slice(0, 150) : ""));
        // pending → on continue à attendre
      }
      if (!data) throw new Error("La génération a dépassé le délai d'attente. Réessaie.");

      setPipelineScript(data.script);
      setRecentTopics(prev => [data.script.title, ...prev].slice(0, 30));

      // Archive le script dans l'historique persistant (pour comparaison future).
      try {
        const arch = await fetch("/api/scripts-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: data.script }),
        });
        const archData = await arch.json();
        if (arch.ok && archData.id) setCurrentScriptId(archData.id);
      } catch { /* archivage best-effort, ne bloque pas la génération */ }

      addToLog({
        type: "SCRIPT SHORTS",
        decision: data.script.title,
        rationale: (data.script.category ? `[${data.script.category}] ` : "") + (data.script.rationale || ""),
        kpi: `~${data.script.total_duration_estimate_sec}s`,
      });
    } catch (e) {
      setPipelineError(e.message);
    }
    setPipelineLoading(false);
  };


  // Upload direct navigateur → YouTube (évite de faire transiter le MP4 par nos
  // fonctions). Vidéo en PRIVÉ + date de publication planifiée (publishAt).
  const handlePublishYouTube = async () => {
    if (!videoUrl || !pipelineScript) return;
    setYtUploading(true);
    setYtUploadError(null);
    setYtPublishedId(null);
    try {
      // 1. Jeton d'accès frais (le refresh_token reste côté serveur)
      setYtUploadStatus("Authentification YouTube…");
      const tokRes = await fetch("/api/youtube-token", { method: "POST" });
      const tokData = await tokRes.json();
      if (!tokRes.ok) {
        if (tokData.reason === "expired") throw new Error("Connexion YouTube expirée. Va dans Paramètres → Reconnecter.");
        if (tokData.reason === "not_connected") throw new Error("YouTube non connecté. Va dans Paramètres → Connecter YouTube.");
        throw new Error(tokData.error || "Impossible d'obtenir l'accès YouTube");
      }
      const accessToken = tokData.access_token;

      // 2. Récupère le MP4 (depuis Shotstack) en blob
      setYtUploadStatus("Récupération de la vidéo…");
      const vidResp = await fetch(videoUrl);
      const videoBlob = await vidResp.blob();

      // 3. Métadonnées. publishAt impose privacyStatus "private".
      const publishAtIso = ytPublishAt ? new Date(ytPublishAt).toISOString() : null;
      const metadata = {
        snippet: {
          title: (pipelineScript.title || "Actu Crue").slice(0, 100),
          description: pipelineScript.description || "",
          categoryId: "25", // News & Politics
        },
        status: {
          privacyStatus: "private",
          selfDeclaredMadeForKids: false,
          ...(publishAtIso ? { publishAt: publishAtIso } : {}),
        },
      };

      // 4. Démarre l'upload resumable (renvoie une URL d'upload dans Location)
      setYtUploadStatus("Ouverture du transfert vers YouTube…");
      const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify(metadata),
      });
      if (!initRes.ok) {
        const errTxt = await initRes.text();
        throw new Error("YouTube a refusé l'ouverture du transfert : " + errTxt.slice(0, 200));
      }
      const uploadUrl = initRes.headers.get("location");
      if (!uploadUrl) throw new Error("YouTube n'a pas renvoyé d'URL de transfert");

      // 5. Envoie les octets de la vidéo
      setYtUploadStatus("Envoi de la vidéo à YouTube… (ne ferme pas l'app)");
      const upRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: videoBlob,
      });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error("Échec de l'envoi : " + (upData.error?.message || "erreur inconnue"));
      const videoId = upData.id;

      // 6. Applique la miniature (si générée)
      if (thumbUrl && videoId) {
        try {
          setYtUploadStatus("Application de la miniature…");
          const thumbResp = await fetch(thumbUrl);
          const thumbBlob = await thumbResp.blob();
          await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "image/png" },
            body: thumbBlob,
          });
        } catch { /* la miniature custom peut échouer si chaîne non vérifiée — non bloquant */ }
      }

      setYtPublishedId(videoId);
      setYtUploadStatus(null);
      addToLog({
        type: "PUBLICATION YOUTUBE",
        decision: `Uploadée (privée) : "${pipelineScript.title}"`,
        rationale: publishAtIso ? `Publication planifiée : ${new Date(publishAtIso).toLocaleString("fr-FR")}` : "En privé, sans date (à publier manuellement)",
        kpi: "Phase 5 ✓",
      });
    } catch (e) {
      setYtUploadError(e.message);
      setYtUploadStatus(null);
    }
    setYtUploading(false);
  };

  // Vérifie l'état de connexion YouTube (OAuth).
  const checkYouTube = async () => {
    setYtChecking(true);
    try {
      const r = await fetch("/api/youtube-status");
      const d = await r.json();
      setYtConnected(!!d.connected);
      setYtReason(d.reason || null);
    } catch {
      setYtConnected(false); setYtReason("error");
    }
    setYtChecking(false);
  };

  // Pipeline Shorts (Phase 2 — voix off, SEGMENT PAR SEGMENT pour une synchro exacte)
  const handleGenerateAudio = async () => {
    if (!pipelineScript) return;
    setAudioLoading(true);
    setAudioUrl(null);
    setAudioUrlHosted(null);
    setAudioSegmentsHosted(null);
    setAudioError(null);
    const segs = pipelineScript.narration_segments || [];
    try {
      // Décode la durée réelle d'un MP3 base64 via l'AudioContext du navigateur.
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const measureDuration = async (base64) => {
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const decoded = await audioCtx.decodeAudioData(bytes.buffer.slice(0));
        return decoded.duration;
      };

      const hostedSegments = [];
      let totalChars = 0;
      for (let i = 0; i < segs.length; i++) {
        setAudioError(null);
        // 1. Génère la voix de CE segment
        const res = await fetch("/api/generate-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: segs[i].text, voiceId: voiceId.trim() || undefined }),
        });
        const raw = await res.text();
        let data;
        try { data = JSON.parse(raw); } catch { throw new Error(`Segment ${i + 1} : réponse audio invalide`); }
        if (!res.ok) throw new Error(`Segment ${i + 1} : ${data.error || "erreur voix off"}`);
        totalChars += data.chars_used || segs[i].text.length;

        // 2. Mesure sa durée RÉELLE
        let duration = 5;
        try { duration = await measureDuration(data.audio_base64); } catch { /* garde le défaut */ }

        // 3. Héberge ce segment pour Shotstack
        const hostRes = await fetch("/api/store-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_base64: data.audio_base64 }),
        });
        const hostData = await hostRes.json();
        if (!hostRes.ok || !hostData.url) throw new Error(`Segment ${i + 1} : hébergement audio échoué (${hostData.error || "?"})`);

        hostedSegments.push({ index: i, url: hostData.url, duration });
        // Le premier segment sert d'aperçu écoutable.
        if (i === 0) setAudioUrl(`data:${data.mime};base64,${data.audio_base64}`);
      }

      setAudioSegmentsHosted(hostedSegments);
      setAudioUrlHosted(hostedSegments[0]?.url || null); // compat (présence = prêt)

      addToLog({
        type: "VOIX OFF",
        decision: `Voix off générée (${hostedSegments.length} segments synchronisés)`,
        rationale: `${totalChars} caractères ElevenLabs · durées réelles mesurées`,
        kpi: "Phase 2 ✓",
      });
    } catch (e) {
      setAudioError(e.message);
    }
    setAudioLoading(false);
  };


  // Pulse animation on new log entry
  useEffect(() => {
    if (log.length > 0) { setPulse(true); setTimeout(() => setPulse(false), 600); }
  }, [log.length]);

  useEffect(() => {
    if (view === "settings" && ytConnected === null) checkYouTube();
  }, [view]);

  const addToLog = (entry) => {
    setLog(prev => [{ id: uid(), time: now(), ...entry }, ...prev]);
  };

  const CONTENT_TYPES = [
    { id: "title", label: "🎯 Titre YouTube", desc: "Titre ultra-cliquable optimisé CTR" },
    { id: "hook", label: "⚡ Hook 15s", desc: "Accroche d'ouverture vidéo" },
    { id: "script", label: "📝 Script complet", desc: "Script structuré PSP" },
    { id: "shorts", label: "📱 YouTube Shorts", desc: "Script Shorts < 60 secondes" },
    { id: "thumbnail", label: "🖼 Brief thumbnail", desc: "Brief visuel pour miniature" },
    { id: "trend", label: "📊 Analyse tendances", desc: "Veille actu mondiale" },
  ];

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setOutput(null);

    const userMsg = {
      role: "user",
      content: `Type de contenu demandé : ${contentType.toUpperCase()}
Sujet/Contexte : ${topic}
Niche : Finance Personnelle × IA YouTube
Langue : Français
Audience : Francophones 25-45 ans, intéressés by indépendance financière & outils IA

Génère le contenu optimal. Réponds UNIQUEMENT en JSON valide avec les champs : decision, content, rationale, next_action, kpi_target.`,
    };

    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);

    try {
      const raw = await callJarvis(newHistory, null);
      let parsed;
      try {
        const clean = raw.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(clean);
      } catch {
        parsed = { decision: "Contenu généré", content: raw, rationale: "Analyse IA", next_action: "Réviser et publier", kpi_target: "CTR > 8%" };
      }

      setOutput(parsed);
      addToLog({
        type: contentType.toUpperCase(),
        decision: parsed.decision || `Génération ${contentType}`,
        rationale: parsed.rationale || "",
        kpi: parsed.kpi_target || "",
      });

      const assistantMsg = { role: "assistant", content: raw };
      setChatHistory([...newHistory, assistantMsg]);
    } catch (e) {
      setOutput({ content: "Erreur : " + e.message, decision: "Erreur de connexion", rationale: "Vérifie que ANTHROPIC_API_KEY est configurée dans Netlify (Site settings > Environment variables).", next_action: "", kpi_target: "" });
    }
    setLoading(false);
  };

  const handleSendReport = () => {
    if (!savedEmail) return;
    sendDailyReport(savedEmail, log);
    addToLog({ type: "RAPPORT", decision: `Rapport quotidien envoyé à ${savedEmail}`, rationale: `${log.length} décisions loguées aujourd'hui`, kpi: "—" });
    setReportSent(true);
    setTimeout(() => setReportSent(false), 3000);
  };

  // ── LAYOUT ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: T.bg0, color: T.text, fontFamily: T.sans, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

      {/* Ambient Liquid-Glass background : halos violets diffus + grain doux */}
      <style>{`
        @keyframes acFloat { 0%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} 100%{transform:translate(0,0)} }
        .ac-glass { background: ${T.glass}; -webkit-backdrop-filter: ${T.blur}; backdrop-filter: ${T.blur};
          border: 1px solid ${T.border}; box-shadow: inset 0 1px 0 ${T.glassHi}, 0 8px 32px rgba(0,0,0,0.36); }
        .ac-panel { background: ${T.glass}; -webkit-backdrop-filter: ${T.blur}; backdrop-filter: ${T.blur};
          border: 1px solid ${T.border}; border-radius: 20px;
          box-shadow: inset 0 1px 0 ${T.glassHi}, 0 8px 32px rgba(0,0,0,0.36); }
        input::placeholder, textarea::placeholder { color: ${T.muted}; opacity: 0.7; }
        * { scrollbar-color: ${T.accent} transparent; }
      `}</style>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-10%", left: "-5%", width: 520, height: 520, borderRadius: "50%",
          background: `radial-gradient(circle, ${T.accentGlow} 0%, transparent 70%)`, filter: "blur(40px)", animation: "acFloat 18s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-15%", right: "-8%", width: 620, height: 620, borderRadius: "50%",
          background: `radial-gradient(circle, rgba(125,70,152,0.30) 0%, transparent 70%)`, filter: "blur(50px)", animation: "acFloat 22s ease-in-out infinite reverse" }} />
        <div style={{ position: "absolute", top: "40%", left: "55%", width: 360, height: 360, borderRadius: "50%",
          background: `radial-gradient(circle, rgba(155,140,255,0.14) 0%, transparent 70%)`, filter: "blur(40px)", animation: "acFloat 26s ease-in-out infinite" }} />
      </div>

      {/* Tout le contenu au-dessus du fond ambiant */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* TOP BAR */}
      <header className="ac-glass" style={{
        padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100, borderRadius: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 34, height: 34, background: T.accent, borderRadius: 9,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 15, color: "#fff", fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            boxShadow: `0 0 16px ${T.accentGlow}`, letterSpacing: "-0.5px",
          }}>AC</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "0.12em" }}>ACTU CRUE</div>
            <div style={{ fontSize: 10, color: T.muted, fontFamily: T.mono }}>Moteur de contenu</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, boxShadow: `0 0 8px ${T.green}` }} />
          <span style={{ fontSize: 11, fontFamily: T.mono, color: T.green }}>ACTIF</span>
          <span style={{ fontSize: 11, fontFamily: T.mono, color: T.muted, marginLeft: 8 }}>{today()}</span>
        </div>
      </header>

      {/* BODY */}
      <div style={{ display: "flex", flex: 1 }}>

        {/* SIDEBAR */}
        <nav className="ac-glass" style={{
          width: 200, padding: "20px 0", display: "flex", flexDirection: "column", gap: 2,
          borderRadius: 0, borderRight: `1px solid ${T.border}`,
        }}>
          {[
            { id: "dashboard", icon: "⬡", label: "Dashboard" },
            { id: "pipeline", icon: "▶", label: "Pipeline Shorts" },
            { id: "generate", icon: "✦", label: "Générer" },
            { id: "history", icon: "◪", label: "Historique" },
            { id: "report", icon: "◈", label: `Journal (${log.length})` },
            { id: "settings", icon: "◎", label: "Paramètres" },
          ].map(item => (
            <button key={item.id} onClick={() => { setView(item.id); if (item.id === "history") loadHistory(); }} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
              background: view === item.id ? `linear-gradient(90deg, ${T.accentGlow}, transparent)` : "transparent",
              color: view === item.id ? "#fff" : T.muted,
              border: "none", borderLeft: view === item.id ? `2px solid ${T.accent}` : "2px solid transparent",
              cursor: "pointer", fontSize: 13, fontWeight: view === item.id ? 600 : 400,
              textAlign: "left", width: "100%", transition: "all 0.15s",
            }}>
              <span style={{ fontFamily: T.mono, fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}

          {savedEmail && (
            <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: `1px solid ${T.border}` }}>
              <button onClick={handleSendReport} style={{
                width: "100%", padding: "8px 0", background: reportSent ? T.green : T.accentDim,
                color: reportSent ? T.bg0 : T.accent, border: `1px solid ${T.accent}44`,
                borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.mono, fontWeight: 700,
                transition: "all 0.3s",
              }}>
                {reportSent ? "✓ ENVOYÉ" : "▶ RAPPORT MAIL"}
              </button>
            </div>
          )}
        </nav>

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, padding: 28, overflowY: "auto", maxHeight: "calc(100vh - 56px)" }}>

          {/* ── DASHBOARD ── */}
          {view === "dashboard" && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
                Vue d'ensemble
              </h2>
              <p style={{ color: T.muted, fontSize: 13, marginBottom: 28 }}>
                Moteur autonome — actualité mondiale décryptée — YouTube
              </p>

              {/* STATS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
                {[
                  { label: "Format cible", value: "~90s", sub: "Actu mondiale → toi", color: T.accent },
                  { label: "Décisions loguées", value: log.length, sub: "aujourd'hui", color: T.blue },
                  { label: "Rapport email", value: savedEmail ? "✓ configuré" : "non configuré", sub: savedEmail || "→ Paramètres", color: savedEmail ? T.green : T.red },
                ].map((s, i) => (
                  <div key={i} style={{ background: T.glass, backdropFilter: T.blur, WebkitBackdropFilter: T.blur, border: `1px solid ${T.border}`, borderRadius: 18, padding: 20, boxShadow: `inset 0 1px 0 ${T.glassHi}, 0 8px 32px rgba(0,0,0,0.36)` }}>
                    <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: T.mono }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* MARKET INTEL */}
              <div style={{ background: T.glass, backdropFilter: T.blur, WebkitBackdropFilter: T.blur, border: `1px solid ${T.border}`, borderRadius: 18, padding: 20, boxShadow: `inset 0 1px 0 ${T.glassHi}, 0 8px 32px rgba(0,0,0,0.36)`, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  ◈ Champ éditorial — Actu Crue
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Géopolitique & éco", value: "Cœur de cible", trend: "◆" },
                    { label: "Business & marchés", value: "Fort impact", trend: "◆" },
                    { label: "Tech · Science · Santé", value: "À suivre", trend: "◆" },
                    { label: "Angle : retombées pour toi", value: "Signature", trend: "✓" },
                  ].map((m, i) => (
                    <div key={i} style={{ padding: "10px 14px", background: T.glassSolid, borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: T.muted }}>{m.label}</span>
                      <span style={{ fontFamily: T.mono, fontSize: 13, color: T.green, fontWeight: 700 }}>{m.trend} {m.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* QUICK START */}
              <div style={{ background: `${T.accent}11`, border: `1px solid ${T.accent}33`, borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.accent, marginBottom: 8 }}>▶ Démarrage rapide</div>
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
                  1. Configure ton email dans <strong style={{ color: T.text }}>Paramètres</strong> pour les rapports quotidiens<br />
                  2. Va dans <strong style={{ color: T.text }}>Générer</strong> pour produire ton premier contenu<br />
                  3. Chaque décision est automatiquement loguée dans le <strong style={{ color: T.text }}>Journal</strong>
                </div>
              </div>
            </div>
          )}

          {/* ── PIPELINE SHORTS (Phase 1) ── */}
          {view === "pipeline" && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Pipeline vidéo</h2>
              <p style={{ color: T.muted, fontSize: 13, marginBottom: 24 }}>
                Génération du script structuré (audio + visuels + métadonnées). Phases suivantes : voix off, visuels stock, montage, publication.
              </p>

              {/* NEWS SEARCH — background web search, two modes */}
              <div style={{ marginBottom: 16, padding: 14, background: T.glassSolid, borderRadius: 12, border: `1px solid ${T.border}` }}>
                <label style={{ fontSize: 12, color: T.accent, fontFamily: T.mono, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  ◈ Recherche d'actualité (web)
                </label>
                <input
                  value={pipelineNews}
                  onChange={e => setPipelineNews(e.target.value)}
                  placeholder="Optionnel : sujet imposé (ex: tornade dans l'Aude, sanctions Iran…)"
                  style={{
                    width: "100%", background: T.glassSolid, border: `1px solid ${T.border}`,
                    borderRadius: 8, padding: "10px 14px", color: T.text, fontSize: 13,
                    fontFamily: T.sans, boxSizing: "border-box", outline: "none", marginBottom: 10,
                  }}
                />
                {/* SÉLECTEUR D'ANGLE ÉDITORIAL */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: T.muted, fontFamily: T.mono, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Angle imposé</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { id: "", label: "Tous angles" },
                      { id: "finance", label: "💰 Finance" },
                      { id: "environnement", label: "🌍 Environnement" },
                      { id: "geopolitique", label: "⚔️ Géopolitique" },
                      { id: "tech", label: "🔬 Tech/Science/Santé" },
                    ].map(a => (
                      <button key={a.id} onClick={() => setNewsAngle(a.id)} style={{
                        padding: "7px 12px",
                        background: newsAngle === a.id ? `linear-gradient(90deg, ${T.accentGlow}, ${T.accentDim})` : T.glassSolid,
                        color: newsAngle === a.id ? "#fff" : T.muted,
                        border: `1px solid ${newsAngle === a.id ? T.accent : T.border}`,
                        borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: newsAngle === a.id ? 700 : 500,
                      }}>{a.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => fetchNews(false)}
                    disabled={newsLoading || pipelineLoading}
                    style={{
                      flex: 1, minWidth: 160, padding: "10px", background: T.bg2, color: T.accent,
                      border: `1px solid ${T.accent}`, borderRadius: 8,
                      cursor: (newsLoading || pipelineLoading) ? "not-allowed" : "pointer",
                      fontSize: 12, fontFamily: T.mono, fontWeight: 700,
                    }}
                  >
                    {newsLoading ? <>RECHERCHE <Spinner /></> : "🔍 PROPOSE-MOI DES SUJETS"}
                  </button>
                  <button
                    onClick={() => fetchNews(true)}
                    disabled={newsLoading || pipelineLoading}
                    style={{
                      flex: 1, minWidth: 160, padding: "10px", background: (newsLoading || pipelineLoading) ? T.accentDim : T.accent, color: T.bg0,
                      border: "none", borderRadius: 8,
                      cursor: (newsLoading || pipelineLoading) ? "not-allowed" : "pointer",
                      fontSize: 12, fontFamily: T.mono, fontWeight: 700,
                    }}
                  >
                    {newsLoading ? <>… <Spinner /></> : "⚡ CHOISIS ET GÉNÈRE"}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
                  La recherche web prend quelques secondes de plus — c'est normal. "Propose" te laisse choisir ; "Choisis et génère" prend le sujet le plus percutant et lance tout.
                </div>
                {newsError && <div style={{ marginTop: 8, fontSize: 11, color: T.red }}>{newsError}</div>}

                {newsTopics && newsTopics.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, color: T.muted, fontFamily: T.mono, marginBottom: 8 }}>SUJETS PROPOSÉS — clique pour générer :</div>
                    {newsTopics.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => { setPipelineNews(t.actu); handleGenerateScript(t.actu); }}
                        disabled={pipelineLoading}
                        style={{
                          display: "block", width: "100%", textAlign: "left", marginBottom: 8,
                          background: T.glassSolid, border: `1px solid ${T.border}`, borderRadius: 8,
                          padding: "10px 12px", cursor: pipelineLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 3 }}>{t.titre_propose}</div>
                        <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.4 }}>📰 {t.actu}</div>
                        <div style={{ fontSize: 10, color: T.accent, lineHeight: 1.4, marginTop: 2 }}>💰 {t.angle_finance}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* TOPIC INPUT */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: T.muted, fontFamily: T.mono, display: "block", marginBottom: 6 }}>
                  SUJET (optionnel — laisse vide pour un choix automatique)
                </label>
                <input
                  value={pipelineTopic}
                  onChange={e => setPipelineTopic(e.target.value)}
                  placeholder="Ex: tensions au Moyen-Orient, décision de la BCE, percée IA…"
                  style={{
                    width: "100%", background: T.glassSolid, border: `1px solid ${T.border}`,
                    borderRadius: 8, padding: "12px 14px", color: T.text, fontSize: 13,
                    fontFamily: T.sans, boxSizing: "border-box", outline: "none",
                  }}
                />
              </div>

              <button
                onClick={handleGenerateScript}
                disabled={pipelineLoading}
                style={{
                  padding: "12px 28px", background: pipelineLoading ? T.accentDim : T.accent,
                  color: T.bg0, border: "none", borderRadius: 8, cursor: pipelineLoading ? "not-allowed" : "pointer",
                  fontWeight: 800, fontSize: 14, fontFamily: T.mono, letterSpacing: "0.05em",
                }}
              >
                {pipelineLoading ? <>GÉNÉRATION <Spinner /></> : "▶ GÉNÉRER LE SCRIPT"}
              </button>

              {pipelineError && (
                <div style={{ marginTop: 16, background: `${T.red}11`, border: `1px solid ${T.red}33`, borderRadius: 8, padding: 14, fontSize: 12, color: T.red }}>
                  {pipelineError}
                </div>
              )}

              {pipelineScript && (
                <div style={{ marginTop: 24, background: T.glass, backdropFilter: T.blur, WebkitBackdropFilter: T.blur, border: `1px solid ${T.border}`, borderRadius: 18, padding: 20, boxShadow: `inset 0 1px 0 ${T.glassHi}, 0 8px 32px rgba(0,0,0,0.36)` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    <Badge color={T.accent}>SCRIPT GÉNÉRÉ</Badge>
                    <Badge color={T.green}>{pipelineScript.total_duration_estimate_sec}s</Badge>
                    {pipelineScript.category && <Badge color={T.blue}>{pipelineScript.category}</Badge>}
                  </div>

                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{pipelineScript.title}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>{pipelineScript.description}</div>

                  <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    ◈ Segments narration + visuels
                  </div>

                  {(pipelineScript.narration_segments || []).map((seg, i) => (
                    <div key={i} style={{
                      background: T.glassSolid, borderRadius: 12, padding: 14, marginBottom: 10,
                      borderLeft: `3px solid ${T.blue}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.muted }}>SEGMENT {i + 1}</span>
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.green }}>~{seg.duration_estimate_sec}s</span>
                      </div>
                      <div style={{ fontSize: 13, color: T.text, marginBottom: 8, lineHeight: 1.6 }}>{seg.text}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(seg.visual_keywords || []).map((kw, j) => (
                          <span key={j} style={{
                            fontSize: 10, fontFamily: T.mono, color: T.muted,
                            background: T.glassSolid, border: `1px solid ${T.border}`,
                            borderRadius: 4, padding: "2px 8px",
                          }}>🎬 {kw}</span>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div style={{ marginTop: 12, background: `${T.accent}11`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, color: T.muted, fontFamily: T.mono, marginBottom: 4 }}>JUSTIFICATION ÉDITORIALE</div>
                    <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{pipelineScript.rationale}</div>
                  </div>

                  <div style={{ marginTop: 16, padding: 14, background: T.glassSolid, borderRadius: 12 }}>
                    <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      ◈ Phase 2 — Voix off (ElevenLabs)
                    </div>
                    <button
                      onClick={handleGenerateAudio}
                      disabled={audioLoading}
                      style={{
                        padding: "10px 22px", background: audioLoading ? T.accentDim : T.accent,
                        color: T.bg0, border: "none", borderRadius: 8,
                        cursor: audioLoading ? "not-allowed" : "pointer",
                        fontWeight: 800, fontSize: 13, fontFamily: T.mono,
                      }}
                    >
                      {audioLoading ? <>GÉNÉRATION AUDIO <Spinner /></> : "♪ GÉNÉRER LA VOIX OFF"}
                    </button>
                    {audioError && (
                      <div style={{ marginTop: 10, fontSize: 12, color: T.red, lineHeight: 1.6 }}>{audioError}</div>
                    )}
                    {audioUrl && (
                      <div style={{ marginTop: 12 }}>
                        <audio controls src={audioUrl} style={{ width: "100%" }} />
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 6, fontFamily: T.mono }}>
                          Écoute et valide la voix avant la Phase 4 (assemblage vidéo)
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: 12, fontSize: 11, color: T.muted, fontFamily: T.mono, lineHeight: 1.8 }}>
                      → Phase 4 : assemblage automatique via Shotstack
                    </div>
                  </div>

                  {/* PHASE 3 — VISUELS */}
                  <div style={{ marginTop: 16, padding: 14, background: T.glassSolid, borderRadius: 12 }}>
                    <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      ◈ Phase 3 — Visuels (Pexels)
                    </div>
                    <button
                      onClick={handleFetchVisuals}
                      disabled={visualsLoading}
                      style={{
                        padding: "10px 22px", background: visualsLoading ? T.accentDim : T.accent,
                        color: T.bg0, border: "none", borderRadius: 8,
                        cursor: visualsLoading ? "not-allowed" : "pointer",
                        fontWeight: 800, fontSize: 13, fontFamily: T.mono,
                      }}
                    >
                      {visualsLoading ? <>RECHERCHE VISUELS <Spinner /></> : "🎬 RÉCUPÉRER LES VISUELS"}
                    </button>
                    {visualsError && (
                      <div style={{ marginTop: 10, fontSize: 12, color: T.red, lineHeight: 1.6 }}>{visualsError}</div>
                    )}
                    {visuals && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, color: visuals.missing > 0 ? T.accent : T.green, marginBottom: 10, fontFamily: T.mono }}>
                          {visuals.total - visuals.missing}/{visuals.total} clips trouvés
                          {visuals.missing > 0 && ` · ${visuals.missing} sans visuel`}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                          {visuals.clips.map((c, i) => (
                            <div key={i} style={{
                              borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}`,
                              aspectRatio: "9/16", background: T.bg2, position: "relative",
                            }}>
                              {c.clip ? (
                                <img src={c.clip.preview} alt={c.query} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 9, color: T.red, textAlign: "center", padding: 4 }}>
                                  aucun clip<br />"{c.query}"
                                </div>
                              )}
                              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.6)", fontSize: 9, color: "#fff", padding: "2px 4px", fontFamily: T.mono }}>
                                #{i + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 11, color: T.muted, fontFamily: T.mono, lineHeight: 1.6 }}>
                          Aperçus des clips qui seront assemblés en Phase 4. Clips fournis par Pexels.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* PHASE 4 — ASSEMBLAGE VIDÉO */}
                  <div style={{ marginTop: 16, padding: 14, background: T.glassSolid, borderRadius: 12 }}>
                    <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      ◈ Phase 4 — Assemblage vidéo (Shotstack)
                    </div>
                    {(!audioUrlHosted || !visuals) && (
                      <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.6 }}>
                        Génère d'abord la voix off (Phase 2) ET les visuels (Phase 3) avant l'assemblage.
                      </div>
                    )}
                    <button
                      onClick={handleAssembleVideo}
                      disabled={videoLoading || !audioUrlHosted || !visuals}
                      style={{
                        padding: "10px 22px",
                        background: (videoLoading || !audioUrlHosted || !visuals) ? T.accentDim : T.accent,
                        color: T.bg0, border: "none", borderRadius: 8,
                        cursor: (videoLoading || !audioUrlHosted || !visuals) ? "not-allowed" : "pointer",
                        fontWeight: 800, fontSize: 13, fontFamily: T.mono,
                      }}
                    >
                      {videoLoading ? <>ASSEMBLAGE <Spinner /></> : "🎞 ASSEMBLER LA VIDÉO"}
                    </button>
                    {videoStatus && (
                      <div style={{ marginTop: 10, fontSize: 12, color: T.blue, fontFamily: T.mono }}>{videoStatus}</div>
                    )}
                    {videoError && (
                      <div style={{ marginTop: 10, fontSize: 12, color: T.red, lineHeight: 1.6 }}>{videoError}</div>
                    )}
                    {videoUrl && (
                      <div style={{ marginTop: 12 }}>
                        <video controls src={videoUrl} style={{ width: "100%", maxWidth: 280, borderRadius: 8, display: "block" }} />
                        <a href={videoUrl} target="_blank" rel="noreferrer" style={{
                          display: "inline-block", marginTop: 10, fontSize: 12, color: T.accent,
                          fontFamily: T.mono, textDecoration: "none",
                        }}>
                          ↗ Ouvrir / télécharger le MP4
                        </a>
                      </div>
                    )}
                  </div>

                  {/* PHASE 5 — FICHE DE PUBLICATION */}
                  {videoUrl && (
                    <div style={{ marginTop: 16, padding: 16, background: T.glassSolid, borderRadius: 12, border: `1px solid ${T.accent}44` }}>
                      <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        ◈ Phase 5 — Fiche de publication YouTube
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginBottom: 14, lineHeight: 1.6 }}>
                        Tout est prêt. Télécharge le MP4 ci-dessus, puis copie chaque élément dans YouTube Studio. Tu valides la vidéo avant qu'elle parte.
                      </div>

                      {[
                        { label: "TITRE", value: pipelineScript.title },
                        { label: "DESCRIPTION", value: pipelineScript.description },
                        { label: "CATÉGORIE", value: pipelineScript.category || "—" },
                      ].map((field, i) => (
                        <div key={i} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.muted }}>{field.label}</span>
                            <button
                              onClick={() => { navigator.clipboard?.writeText(field.value || ""); setCopiedField(field.label); setTimeout(() => setCopiedField(null), 1500); }}
                              style={{
                                fontSize: 10, fontFamily: T.mono, fontWeight: 700,
                                background: copiedField === field.label ? T.green : "transparent",
                                color: copiedField === field.label ? T.bg0 : T.accent,
                                border: `1px solid ${copiedField === field.label ? T.green : T.accent}`,
                                borderRadius: 4, padding: "2px 10px", cursor: "pointer",
                              }}
                            >
                              {copiedField === field.label ? "✓ COPIÉ" : "COPIER"}
                            </button>
                          </div>
                          <div style={{ fontSize: 12, color: T.text, background: T.bg2, borderRadius: 6, padding: "8px 12px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                            {field.value}
                          </div>
                        </div>
                      ))}

                      {/* MINIATURE / COUVERTURE */}
                      <div style={{ marginTop: 4, marginBottom: 12, padding: 12, background: T.bg2, borderRadius: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontFamily: T.mono, color: T.muted }}>
                            MINIATURE {pipelineScript.thumbnail_word ? `· mot-choc : "${pipelineScript.thumbnail_word}"` : ""}
                          </span>
                          <button
                            onClick={handleGenerateThumbnail}
                            disabled={thumbLoading}
                            style={{
                              fontSize: 10, fontFamily: T.mono, fontWeight: 700,
                              background: thumbLoading ? T.accentDim : "transparent",
                              color: T.accent, border: `1px solid ${T.accent}`,
                              borderRadius: 4, padding: "4px 12px", cursor: thumbLoading ? "not-allowed" : "pointer",
                            }}
                          >
                            {thumbLoading ? <>GÉNÉRATION <Spinner /></> : "🖼 GÉNÉRER LA MINIATURE"}
                          </button>
                        </div>
                        <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.5, marginBottom: thumbUrl || thumbError ? 8 : 0 }}>
                          Couverture sans sous-titre, mot-choc en gros. Utile pour ta grille de chaîne et le partage.
                        </div>
                        {thumbError && <div style={{ fontSize: 11, color: T.red }}>{thumbError}</div>}
                        {thumbUrl && (
                          <div>
                            <img src={thumbUrl} alt="miniature" style={{ width: "100%", maxWidth: 200, borderRadius: 8, display: "block" }} />
                            <a href={thumbUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: T.accent, fontFamily: T.mono, textDecoration: "none", display: "inline-block", marginTop: 6 }}>
                              ↗ Télécharger la miniature
                            </a>
                          </div>
                        )}
                      </div>

                      {/* ── PUBLICATION AUTOMATIQUE YOUTUBE ── */}
                      <div style={{ marginTop: 8, marginBottom: 12, padding: 14, background: `${T.accent}11`, border: `1px solid ${T.accent}55`, borderRadius: 10 }}>
                        <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          🚀 Publier automatiquement sur YouTube
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6, marginBottom: 12 }}>
                          Envoie la vidéo sur ta chaîne en <strong style={{ color: T.text }}>privé</strong>, avec titre, description et miniature. Choisis quand elle sera publiée automatiquement (ou laisse vide pour décider plus tard dans Studio).
                        </div>

                        <label style={{ fontSize: 10, fontFamily: T.mono, color: T.muted, display: "block", marginBottom: 6 }}>
                          DATE & HEURE DE PUBLICATION (optionnel)
                        </label>
                        <input
                          type="datetime-local"
                          value={ytPublishAt}
                          onChange={e => setYtPublishAt(e.target.value)}
                          style={{
                            width: "100%", background: T.bg0, border: `1px solid ${T.border}`,
                            borderRadius: 6, padding: "9px 12px", color: T.text, fontSize: 13,
                            fontFamily: T.sans, outline: "none", boxSizing: "border-box", marginBottom: 12,
                            colorScheme: "dark",
                          }}
                        />

                        {ytPublishedId ? (
                          <div style={{ padding: 12, background: `${T.green}18`, border: `1px solid ${T.green}55`, borderRadius: 8 }}>
                            <div style={{ fontSize: 12, color: T.green, fontWeight: 700, marginBottom: 6 }}>
                              ✓ Vidéo envoyée sur YouTube {ytPublishAt ? "et planifiée" : "(en privé)"}
                            </div>
                            <a href={`https://studio.youtube.com/video/${ytPublishedId}/edit`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 11, color: T.accent, fontFamily: T.mono, textDecoration: "none" }}>
                              ↗ Voir/ajuster dans YouTube Studio
                            </a>
                          </div>
                        ) : (
                          <button
                            onClick={handlePublishYouTube}
                            disabled={ytUploading}
                            style={{
                              width: "100%", padding: "12px", background: ytUploading ? T.accentDim : T.accent,
                              color: "#fff", border: "none", borderRadius: 8, cursor: ytUploading ? "not-allowed" : "pointer",
                              fontWeight: 800, fontSize: 13,
                            }}
                          >
                            {ytUploading ? <>{ytUploadStatus || "Envoi…"} <Spinner /></> : "Publier sur YouTube"}
                          </button>
                        )}
                        {ytUploadError && (
                          <div style={{ marginTop: 10, fontSize: 11, color: T.red, lineHeight: 1.5 }}>{ytUploadError}</div>
                        )}
                        {ytPublishAt && !ytPublishedId && (
                          <div style={{ marginTop: 8, fontSize: 10, color: T.muted }}>
                            Rappel : la publication planifiée exige que la date soit dans le futur.
                          </div>
                        )}
                      </div>

                      <div style={{ fontSize: 10, color: T.muted, textAlign: "center", margin: "10px 0 6px" }}>
                        — ou publie à la main —
                      </div>
                      <a
                        href="https://studio.youtube.com/channel/UClW3vKJDea-ZZu861ly8rhQ/videos/upload"
                        target="_blank" rel="noreferrer"
                        style={{
                          display: "block", textAlign: "center", marginTop: 4,
                          padding: "10px", background: "transparent", color: T.muted,
                          border: `1px solid ${T.border}`,
                          borderRadius: 8, fontWeight: 700, fontSize: 12, fontFamily: T.mono,
                          textDecoration: "none",
                        }}
                      >
                        ↗ Ouvrir YouTube Studio (upload manuel)
                      </a>
                      <button
                        onClick={() => {
                          addToLog({ type: "PUBLICATION", decision: `Marqué publié : "${pipelineScript.title}"`, rationale: "Validation manuelle confirmée", kpi: "Phase 5 ✓" });
                          setMarkedPublished(true);
                          setTimeout(() => setMarkedPublished(false), 2000);
                        }}
                        style={{
                          width: "100%", marginTop: 8, padding: "8px",
                          background: markedPublished ? T.green : "transparent",
                          color: markedPublished ? T.bg0 : T.muted,
                          border: `1px solid ${T.border}`, borderRadius: 8,
                          cursor: "pointer", fontSize: 11, fontFamily: T.mono,
                        }}
                      >
                        {markedPublished ? "✓ ENREGISTRÉ DANS LE JOURNAL" : "Marquer comme publié (pour le suivi)"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── GENERATE ── */}
          {view === "generate" && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Générer du contenu</h2>
              <p style={{ color: T.muted, fontSize: 13, marginBottom: 24 }}>JARVIS prend la décision éditoriale et justifie son choix.</p>

              {/* TYPE SELECTOR */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                {CONTENT_TYPES.map(ct => (
                  <button key={ct.id} onClick={() => setContentType(ct.id)} style={{
                    padding: "12px 14px", background: contentType === ct.id ? `${T.accent}22` : T.bg2,
                    border: `1px solid ${contentType === ct.id ? T.accent : T.border}`,
                    borderRadius: 8, cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: contentType === ct.id ? T.accent : T.text, marginBottom: 3 }}>{ct.label}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{ct.desc}</div>
                  </button>
                ))}
              </div>

              {/* INPUT */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: T.muted, fontFamily: T.mono, display: "block", marginBottom: 6 }}>SUJET / CONTEXTE</label>
                <textarea
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="Ex: Comment investir son premier salaire en 2026 avec des outils IA..."
                  rows={3}
                  style={{
                    width: "100%", background: T.glassSolid, border: `1px solid ${T.border}`,
                    borderRadius: 8, padding: "12px 14px", color: T.text, fontSize: 13,
                    fontFamily: T.sans, resize: "vertical", boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading || !topic.trim()}
                style={{
                  padding: "12px 28px", background: loading || !topic.trim() ? T.accentDim : T.accent,
                  color: T.bg0, border: "none", borderRadius: 8, cursor: loading || !topic.trim() ? "not-allowed" : "pointer",
                  fontWeight: 800, fontSize: 14, fontFamily: T.mono, letterSpacing: "0.05em",
                  transition: "all 0.2s",
                }}
              >
                {loading ? <>ANALYSE EN COURS <Spinner /></> : "✦ GÉNÉRER"}
              </button>

              {/* OUTPUT */}
              {output && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ background: T.glass, backdropFilter: T.blur, WebkitBackdropFilter: T.blur, border: `1px solid ${T.border}`, borderRadius: 18, padding: 20, boxShadow: `inset 0 1px 0 ${T.glassHi}, 0 8px 32px rgba(0,0,0,0.36)` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <Badge color={T.accent}>DÉCISION</Badge>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{output.decision}</span>
                    </div>

                    {output.content && (
                      <div style={{
                        background: T.glassSolid, borderRadius: 12, padding: 16, marginBottom: 16,
                        fontFamily: T.mono, fontSize: 13, color: T.text, lineHeight: 1.8,
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {output.content}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {output.rationale && (
                        <div style={{ background: T.glassSolid, borderRadius: 10, padding: 12 }}>
                          <div style={{ fontSize: 10, color: T.muted, fontFamily: T.mono, marginBottom: 4 }}>JUSTIFICATION</div>
                          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{output.rationale}</div>
                        </div>
                      )}
                      {output.next_action && (
                        <div style={{ background: T.glassSolid, borderRadius: 10, padding: 12 }}>
                          <div style={{ fontSize: 10, color: T.muted, fontFamily: T.mono, marginBottom: 4 }}>ACTION SUIVANTE</div>
                          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{output.next_action}</div>
                        </div>
                      )}
                    </div>
                    {output.kpi_target && (
                      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge color={T.green}>KPI VISÉ</Badge>
                        <span style={{ fontSize: 12, color: T.green, fontFamily: T.mono }}>{output.kpi_target}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── REPORT / JOURNAL ── */}
          {view === "report" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Journal des décisions</h2>
                  <p style={{ color: T.muted, fontSize: 13 }}>Toutes les actions prises par JARVIS aujourd'hui</p>
                </div>
                {savedEmail && (
                  <button onClick={handleSendReport} style={{
                    padding: "10px 18px", background: reportSent ? T.green : "transparent",
                    color: reportSent ? T.bg0 : T.accent, border: `1px solid ${T.accent}`,
                    borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: T.mono, fontWeight: 700,
                  }}>
                    {reportSent ? "✓ ENVOYÉ" : `▶ ENVOYER À ${savedEmail}`}
                  </button>
                )}
              </div>

              {log.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: "60px 0", color: T.muted,
                  border: `1px dashed ${T.border}`, borderRadius: 10,
                }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
                  <div style={{ fontSize: 14, fontFamily: T.mono }}>Aucune décision loguée</div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>Génère du contenu pour alimenter le journal</div>
                </div>
              ) : (
                log.map(entry => <DecisionCard key={entry.id} entry={entry} />)
              )}
            </div>
          )}

          {/* ── HISTORIQUE DES SCRIPTS ── */}
          {view === "history" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Historique des scripts</h2>
                <button onClick={loadHistory} style={{
                  padding: "8px 16px", background: "transparent", color: T.accent,
                  border: `1px solid ${T.accent}`, borderRadius: 6, cursor: "pointer",
                  fontSize: 12, fontFamily: T.mono, fontWeight: 700,
                }}>↻ ACTUALISER</button>
              </div>
              <p style={{ color: T.muted, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                Relis n'importe quel script passé et note sa rétention. Compare ce qui marche (rétention haute) à ce qui échoue — c'est comme ça qu'on trouve ce qui fonctionne chez toi.
              </p>

              {historyLoading && <div style={{ color: T.accent, fontFamily: T.mono, fontSize: 13 }}>Chargement <Spinner /></div>}
              {historyError && <div style={{ color: T.red, fontSize: 13 }}>{historyError}</div>}

              {history && history.length === 0 && !historyLoading && (
                <div style={{ textAlign: "center", padding: "50px 0", color: T.muted, border: `1px dashed ${T.border}`, borderRadius: 10 }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>◪</div>
                  <div style={{ fontSize: 14, fontFamily: T.mono }}>Aucun script archivé</div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>Génère un script dans Pipeline Shorts, il sera archivé ici</div>
                </div>
              )}

              {history && history.map(s => {
                const retColor = s.retention == null ? T.muted : s.retention >= 60 ? T.green : s.retention >= 45 ? T.accent : T.red;
                const isOpen = openScriptId === s.id;
                return (
                  <div key={s.id} style={{ background: T.glass, backdropFilter: T.blur, WebkitBackdropFilter: T.blur, border: `1px solid ${T.border}`, borderRadius: 18, padding: 16, boxShadow: `inset 0 1px 0 ${T.glassHi}, 0 8px 32px rgba(0,0,0,0.36)`, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>{s.title}</div>
                        <div style={{ fontSize: 11, fontFamily: T.mono, color: T.muted }}>
                          {new Date(s.createdAt).toLocaleDateString("fr-FR")} {s.category ? `· ${s.category}` : ""}
                        </div>
                        {s.style && (
                          <span style={{
                            display: "inline-block", marginTop: 6, fontSize: 10, fontFamily: T.mono, fontWeight: 700,
                            background: `${T.blue}22`, color: T.blue, border: `1px solid ${T.blue}44`,
                            borderRadius: 4, padding: "2px 8px",
                          }}>
                            {s.style === "actualite_punchy" ? "Actualité punchy" : s.style === "solution_rapide" ? "Solution rapide" : s.style === "profond" ? "Profondeur ancrée" : s.style === "actionnable" ? "Solution rapide" : s.style === "actualite" ? "Ancrage actualité" : s.style}
                          </span>
                        )}
                      </div>
                      {s.retention != null && (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: retColor, fontFamily: T.mono }}>{s.retention}%</div>
                          <div style={{ fontSize: 9, color: T.muted, fontFamily: T.mono }}>rétention 10s</div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <button onClick={() => setOpenScriptId(isOpen ? null : s.id)} style={{
                        padding: "5px 12px", background: "transparent", color: T.accent,
                        border: `1px solid ${T.accent}`, borderRadius: 6, cursor: "pointer",
                        fontSize: 11, fontFamily: T.mono, fontWeight: 700,
                      }}>{isOpen ? "▲ MASQUER LE SCRIPT" : "▼ LIRE LE SCRIPT"}</button>

                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                        <span style={{ fontSize: 10, color: T.muted, fontFamily: T.mono }}>RÉTENTION 10s :</span>
                        <input
                          type="number"
                          defaultValue={s.retention ?? ""}
                          onBlur={(e) => saveRetention(s.id, e.target.value, s.views ?? "")}
                          placeholder="%"
                          style={{
                            width: 60, background: T.bg0, border: `1px solid ${T.border}`,
                            borderRadius: 4, padding: "4px 8px", color: T.text, fontSize: 12, fontFamily: T.mono,
                          }}
                        />
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 12, background: T.glassSolid, borderRadius: 12, padding: 14 }}>
                        {(s.segments || []).map((seg, i) => (
                          <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < s.segments.length - 1 ? `1px solid ${T.border}` : "none" }}>
                            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.muted, marginRight: 8 }}>#{i + 1}</span>
                            <span style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{seg.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SETTINGS ── */}
          {view === "settings" && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Paramètres</h2>
              <p style={{ color: T.muted, fontSize: 13, marginBottom: 28 }}>Configure tes clés et notifications.</p>

              {/* EMAIL SECTION */}
              <div style={{ background: T.glassSolid, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  ◈ Rapport quotidien — Email
                </div>
                <p style={{ fontSize: 12, color: T.muted, marginBottom: 16, lineHeight: 1.7 }}>
                  Chaque soir, JARVIS compile toutes ses décisions de la journée et t'envoie un compte-rendu détaillé : contenus générés, justifications, KPIs visés, actions suggérées.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="ton@email.com"
                    style={{
                      flex: 1, background: T.bg0, border: `1px solid ${T.border}`,
                      borderRadius: 6, padding: "10px 14px", color: T.text, fontSize: 13,
                      fontFamily: T.sans, outline: "none",
                    }}
                  />
                  <button onClick={() => { if (email.includes("@")) setSavedEmail(email); }} style={{
                    padding: "10px 20px", background: T.accent, color: T.bg0,
                    border: "none", borderRadius: 6, cursor: "pointer",
                    fontWeight: 700, fontSize: 13, fontFamily: T.mono,
                  }}>
                    SAUVEGARDER
                  </button>
                </div>
                {savedEmail && (
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />
                    <span style={{ fontSize: 12, color: T.green, fontFamily: T.mono }}>Rapports activés → {savedEmail}</span>
                  </div>
                )}
              </div>

              {/* VOICE ID SECTION */}
              <div style={{ background: T.glassSolid, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  ◈ Voix off — Voice ID ElevenLabs
                </div>
                <p style={{ fontSize: 12, color: T.muted, marginBottom: 16, lineHeight: 1.7 }}>
                  Change la voix de narration sans repasser par Netlify. Récupère un Voice ID dans ElevenLabs (Voice Library → choisis une voix française → "ID" ou "Copy Voice ID") et colle-le ici.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={voiceIdInput}
                    onChange={e => { setVoiceIdInput(e.target.value); setVoiceSaved(false); }}
                    placeholder="Voice ID (ex: KGV4bLP8m7z8zXo2kC2X)"
                    style={{
                      flex: 1, background: T.bg0, border: `1px solid ${T.border}`,
                      borderRadius: 6, padding: "10px 14px", color: T.text, fontSize: 13,
                      fontFamily: T.mono, outline: "none",
                    }}
                  />
                  <button onClick={() => { if (voiceIdInput.trim()) { setVoiceId(voiceIdInput.trim()); setVoiceSaved(true); } }} style={{
                    padding: "10px 20px", background: T.accent, color: T.bg0,
                    border: "none", borderRadius: 6, cursor: "pointer",
                    fontWeight: 700, fontSize: 13, fontFamily: T.mono,
                  }}>
                    APPLIQUER
                  </button>
                </div>
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: voiceSaved ? T.green : T.muted }} />
                  <span style={{ fontSize: 12, color: voiceSaved ? T.green : T.muted, fontFamily: T.mono }}>
                    {voiceSaved ? "Voix mise à jour ✓" : (voiceId.trim() ? `Voix forcée : ${voiceId}` : "Voix : celle de Netlify (par défaut)")}
                  </span>
                </div>
                <div style={{ marginTop: 12, padding: 10, background: `${T.blue}11`, borderRadius: 6, fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
                  Laisse vide pour utiliser la voix configurée dans Netlify (ELEVENLABS_VOICE_ID) — c'est la source de vérité. Ne renseigne un ID ici que pour forcer une autre voix le temps d'un test.
                </div>
              </div>

              {/* YOUTUBE CONNEXION (OAuth) */}
              <div style={{ background: T.glassSolid, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  ◈ Publication YouTube (connexion)
                </div>
                <p style={{ fontSize: 12, color: T.muted, marginBottom: 16, lineHeight: 1.7 }}>
                  Relie ta chaîne pour publier depuis Actu Crue. La vidéo sera envoyée en privé + planifiée (tu la passes en public dans Studio tant que l'app n'est pas validée par Google).
                </p>

                {/* État de connexion */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%",
                    background: ytChecking ? T.muted : ytConnected ? T.green : (ytReason === "expired" ? T.blue : T.red),
                    boxShadow: ytConnected ? `0 0 8px ${T.green}` : "none" }} />
                  <span style={{ fontSize: 12, fontFamily: T.mono, color: ytChecking ? T.muted : ytConnected ? T.green : (ytReason === "expired" ? T.blue : T.red) }}>
                    {ytChecking ? "Vérification…"
                      : ytConnected ? "YouTube connecté ✓"
                      : ytReason === "expired" ? "Connexion expirée (à renouveler)"
                      : ytReason === "no_config" ? "OAuth non configuré sur Netlify"
                      : "Non connecté"}
                  </span>
                  <button onClick={checkYouTube} style={{
                    marginLeft: "auto", padding: "4px 10px", background: "transparent",
                    border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer",
                    fontSize: 10, fontFamily: T.mono, color: T.muted,
                  }}>Rafraîchir</button>
                </div>

                <a href="/api/youtube-connect" style={{
                  display: "inline-block", padding: "11px 22px",
                  background: ytConnected ? "transparent" : T.accent,
                  color: ytConnected ? T.accent : "#fff",
                  border: `1px solid ${T.accent}`,
                  borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
                  textDecoration: "none",
                }}>
                  {ytConnected ? "Reconnecter" : "Connecter YouTube"}
                </a>

                {ytReason === "expired" && (
                  <div style={{ marginTop: 14, padding: 10, background: `${T.blue}11`, borderRadius: 6, fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
                    En mode test Google, l'accès expire tous les 7 jours. Reclique "Reconnecter" pour renouveler — instantané, un simple clic sur ton compte.
                  </div>
                )}
              </div>

              {/* NICHE INFO */}
              <div style={{ background: T.glassSolid, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24 }}>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  ◎ Stratégie définie par JARVIS
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 12 }}>
                  {[
                    ["Niche", "Finance Personnelle × IA & Outils"],
                    ["Plateforme", "YouTube (long-forme + Shorts)"],
                    ["CPM cible", "$15–$45 (Finance) + $8–$25 (Tech)"],
                    ["Audience", "Francophones 25–45 ans"],
                    ["Langue contenu", "Français"],
                    ["Revenus annexes", "Affiliation + Sponsoring + Produits digitaux"],
                  ].map(([k, v]) => (
                    <>
                      <span style={{ color: T.muted, fontFamily: T.mono }}>{k}</span>
                      <span style={{ color: T.text }}>{v}</span>
                    </>
                  ))}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
      </div>
    </div>
  );
}
