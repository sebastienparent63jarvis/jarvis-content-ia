import { useState, useEffect, useCallback } from "react";

// ── DESIGN TOKENS ──────────────────────────────────────────────────────────
// Dark command-center aesthetic: deep navy base, electric amber accent,
// monospace data readouts. Feels like a Bloomberg terminal meets a war room.
const T = {
  bg0: "#080C14",
  bg1: "#0D1321",
  bg2: "#121929",
  border: "#1E2D45",
  accent: "#F5A623",
  accentDim: "#7A4E0A",
  green: "#00D97E",
  red: "#FF4757",
  blue: "#3A86FF",
  text: "#E8EDF5",
  muted: "#5A6A82",
  mono: "'JetBrains Mono', 'Courier New', monospace",
  sans: "'Inter', 'Segoe UI', system-ui, sans-serif",
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
      background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8,
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
  const [pipelineSlot, setPipelineSlot] = useState("matin");
  const [pipelineTopic, setPipelineTopic] = useState("");
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineScript, setPipelineScript] = useState(null);
  const [pipelineError, setPipelineError] = useState(null);
  const [recentTopics, setRecentTopics] = useState([]); // anti-répétition
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioError, setAudioError] = useState(null);

  const handleGenerateScript = async () => {
    setPipelineLoading(true);
    setPipelineScript(null);
    setPipelineError(null);
    setAudioUrl(null);
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: pipelineTopic.trim() || undefined,
          slot: pipelineSlot,
          recentTopics: recentTopics.slice(0, 15),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur inconnue");
      setPipelineScript(data.script);
      setRecentTopics(prev => [data.script.title, ...prev].slice(0, 30));
      addToLog({
        type: "SCRIPT SHORTS",
        decision: data.script.title,
        rationale: (data.script.category ? `[${data.script.category}] ` : "") + (data.script.rationale || ""),
        kpi: `~${data.script.total_duration_estimate_sec}s · créneau ${pipelineSlot}`,
      });
    } catch (e) {
      setPipelineError(e.message);
    }
    setPipelineLoading(false);
  };


  // Pipeline Shorts (Phase 2 — voix off)
  const handleGenerateAudio = async () => {
    if (!pipelineScript) return;
    setAudioLoading(true);
    setAudioUrl(null);
    setAudioError(null);
    const fullText = (pipelineScript.narration_segments || []).map(s => s.text).join(" ");
    try {
      const res = await fetch("/api/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur inconnue");
      const url = `data:${data.mime};base64,${data.audio_base64}`;
      setAudioUrl(url);
      addToLog({
        type: "VOIX OFF",
        decision: `Audio généré pour "${pipelineScript.title}"`,
        rationale: `${data.chars_used} caractères ElevenLabs consommés`,
        kpi: "Phase 2 ✓",
      });
    } catch (e) {
      setAudioError(e.message);
    }
    setAudioLoading(false);
  };


  const SLOTS = [
    { id: "matin", label: "Matin", time: "07h30", desc: "Routine / motivation" },
    { id: "midi", label: "Midi", time: "12h30", desc: "Pause active" },
    { id: "soir", label: "Soir", time: "19h30", desc: "Pic d'audience" },
  ];


  // Pulse animation on new log entry
  useEffect(() => {
    if (log.length > 0) { setPulse(true); setTimeout(() => setPulse(false), 600); }
  }, [log.length]);

  const addToLog = (entry) => {
    setLog(prev => [{ id: uid(), time: now(), ...entry }, ...prev]);
  };

  const CONTENT_TYPES = [
    { id: "title", label: "🎯 Titre YouTube", desc: "Titre ultra-cliquable optimisé CTR" },
    { id: "hook", label: "⚡ Hook 15s", desc: "Accroche d'ouverture vidéo" },
    { id: "script", label: "📝 Script complet", desc: "Script structuré PSP" },
    { id: "shorts", label: "📱 YouTube Shorts", desc: "Script Shorts < 60 secondes" },
    { id: "thumbnail", label: "🖼 Brief thumbnail", desc: "Brief visuel pour miniature" },
    { id: "trend", label: "📊 Analyse tendances", desc: "Veille niche Finance×IA" },
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
    <div style={{ minHeight: "100vh", background: T.bg0, color: T.text, fontFamily: T.sans, display: "flex", flexDirection: "column" }}>

      {/* TOP BAR */}
      <header style={{
        background: T.bg1, borderBottom: `1px solid ${T.border}`,
        padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, background: T.accent, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 16, color: T.bg0, fontFamily: T.mono,
          }}>J</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.03em" }}>JARVIS</div>
            <div style={{ fontSize: 10, color: T.muted, fontFamily: T.mono }}>Finance × IA Content Engine</div>
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
        <nav style={{
          width: 200, background: T.bg1, borderRight: `1px solid ${T.border}`,
          padding: "20px 0", display: "flex", flexDirection: "column", gap: 2,
        }}>
          {[
            { id: "dashboard", icon: "⬡", label: "Dashboard" },
            { id: "pipeline", icon: "▶", label: "Pipeline Shorts" },
            { id: "generate", icon: "✦", label: "Générer" },
            { id: "report", icon: "◈", label: `Journal (${log.length})` },
            { id: "settings", icon: "◎", label: "Paramètres" },
          ].map(item => (
            <button key={item.id} onClick={() => setView(item.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
              background: view === item.id ? T.bg2 : "transparent",
              color: view === item.id ? T.accent : T.muted,
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
                Moteur autonome — niche Finance × IA — YouTube FR
              </p>

              {/* STATS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
                {[
                  { label: "RPM cible", value: "$25–50", sub: "Finance × IA niche", color: T.accent },
                  { label: "Décisions loguées", value: log.length, sub: "aujourd'hui", color: T.blue },
                  { label: "Rapport email", value: savedEmail ? "✓ configuré" : "non configuré", sub: savedEmail || "→ Paramètres", color: savedEmail ? T.green : T.red },
                ].map((s, i) => (
                  <div key={i} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: T.mono }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* MARKET INTEL */}
              <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  ◈ Intelligence marché — données 2026
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "CPM Finance YouTube", value: "$15 – $45", trend: "▲" },
                    { label: "RPM Personal Finance", value: "$25 – $50", trend: "▲" },
                    { label: "CPM Tech/IA", value: "$8 – $25", trend: "▲" },
                    { label: "Concurrence niche hybride", value: "Faible", trend: "✓" },
                  ].map((m, i) => (
                    <div key={i} style={{ padding: "10px 14px", background: T.bg0, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Pipeline Shorts — Phase 1</h2>
              <p style={{ color: T.muted, fontSize: 13, marginBottom: 24 }}>
                Génération du script structuré (audio + visuels + métadonnées). Phases suivantes : voix off, visuels stock, montage, publication.
              </p>

              {/* SLOT SELECTOR */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: T.muted, fontFamily: T.mono, display: "block", marginBottom: 8 }}>CRÉNEAU DE PUBLICATION</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {SLOTS.map(s => (
                    <button key={s.id} onClick={() => setPipelineSlot(s.id)} style={{
                      padding: "10px 14px", background: pipelineSlot === s.id ? `${T.accent}22` : T.bg2,
                      border: `1px solid ${pipelineSlot === s.id ? T.accent : T.border}`,
                      borderRadius: 8, cursor: "pointer", textAlign: "left",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: pipelineSlot === s.id ? T.accent : T.text }}>{s.label}</span>
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.muted }}>{s.time}</span>
                      </div>
                      <div style={{ fontSize: 11, color: T.muted }}>{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* TOPIC INPUT */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: T.muted, fontFamily: T.mono, display: "block", marginBottom: 6 }}>
                  SUJET (optionnel — laisse vide pour que JARVIS choisisse)
                </label>
                <input
                  value={pipelineTopic}
                  onChange={e => setPipelineTopic(e.target.value)}
                  placeholder="Ex: 3 erreurs qui ruinent ton épargne en 2026"
                  style={{
                    width: "100%", background: T.bg2, border: `1px solid ${T.border}`,
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
                <div style={{ marginTop: 24, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    <Badge color={T.accent}>SCRIPT GÉNÉRÉ</Badge>
                    <Badge color={T.green}>{pipelineScript.total_duration_estimate_sec}s</Badge>
                    <Badge color={T.blue}>Créneau: {pipelineScript.best_post_window || pipelineSlot}</Badge>
                  </div>

                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{pipelineScript.title}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>{pipelineScript.description}</div>

                  <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    ◈ Segments narration + visuels
                  </div>

                  {(pipelineScript.narration_segments || []).map((seg, i) => (
                    <div key={i} style={{
                      background: T.bg0, borderRadius: 8, padding: 14, marginBottom: 10,
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
                            background: T.bg2, border: `1px solid ${T.border}`,
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

                  <div style={{ marginTop: 16, padding: 14, background: T.bg0, borderRadius: 8 }}>
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
                      → Phase 3 : récupération des clips vidéo correspondant aux mots-clés<br />
                      → Phase 4 : assemblage automatique via Shotstack
                    </div>
                  </div>
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
                    width: "100%", background: T.bg2, border: `1px solid ${T.border}`,
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
                  <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <Badge color={T.accent}>DÉCISION</Badge>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{output.decision}</span>
                    </div>

                    {output.content && (
                      <div style={{
                        background: T.bg0, borderRadius: 8, padding: 16, marginBottom: 16,
                        fontFamily: T.mono, fontSize: 13, color: T.text, lineHeight: 1.8,
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {output.content}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {output.rationale && (
                        <div style={{ background: T.bg0, borderRadius: 6, padding: 12 }}>
                          <div style={{ fontSize: 10, color: T.muted, fontFamily: T.mono, marginBottom: 4 }}>JUSTIFICATION</div>
                          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{output.rationale}</div>
                        </div>
                      )}
                      {output.next_action && (
                        <div style={{ background: T.bg0, borderRadius: 6, padding: 12 }}>
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

          {/* ── SETTINGS ── */}
          {view === "settings" && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Paramètres</h2>
              <p style={{ color: T.muted, fontSize: 13, marginBottom: 28 }}>Configure tes clés et notifications.</p>

              {/* EMAIL SECTION */}
              <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
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

              {/* YOUTUBE API SECTION */}
              <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  ◈ YouTube Data API v3 (optionnel)
                </div>
                <div style={{
                  background: `${T.blue}11`, border: `1px solid ${T.blue}33`,
                  borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 12, color: T.text, lineHeight: 1.8,
                }}>
                  <strong style={{ color: T.blue }}>Comment obtenir ta clé API YouTube :</strong><br />
                  1. Va sur <span style={{ fontFamily: T.mono, color: T.accent }}>console.cloud.google.com</span><br />
                  2. Crée un projet → "APIs & Services" → "Bibliothèque"<br />
                  3. Recherche "YouTube Data API v3" → Activer<br />
                  4. "Identifiants" → "Créer des identifiants" → "Clé API"<br />
                  5. Copie la clé ici ↓ (gratuit, 10 000 requêtes/jour)
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="password"
                    value={youtubeKey}
                    onChange={e => setYoutubeKey(e.target.value)}
                    placeholder="AIzaSy... (clé YouTube Data API v3)"
                    style={{
                      flex: 1, background: T.bg0, border: `1px solid ${T.border}`,
                      borderRadius: 6, padding: "10px 14px", color: T.text, fontSize: 13,
                      fontFamily: T.mono, outline: "none",
                    }}
                  />
                  <button onClick={() => { if (youtubeKey.startsWith("AIza")) setSavedKey(youtubeKey); }} style={{
                    padding: "10px 20px", background: T.accent, color: T.bg0,
                    border: "none", borderRadius: 6, cursor: "pointer",
                    fontWeight: 700, fontSize: 13, fontFamily: T.mono,
                  }}>
                    SAUVEGARDER
                  </button>
                </div>
                {savedKey && (
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />
                    <span style={{ fontSize: 12, color: T.green, fontFamily: T.mono }}>API YouTube connectée ✓</span>
                  </div>
                )}
              </div>

              {/* NICHE INFO */}
              <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24 }}>
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
  );
}
