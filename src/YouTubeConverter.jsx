import React, { useState, useRef, useEffect } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const BASE_URL = "https://pdf-qna-backend.onrender.com";

const STEPS = [
  { id: "validate", label: "Validating URL",       icon: "🔍" },
  { id: "metadata", label: "Fetching video info",  icon: "📋" },
  { id: "download", label: "Downloading audio",    icon: "🎵" },
  { id: "transcribe", label: "Transcribing speech", icon: "✍️" },
  { id: "pdf",      label: "Building PDF",          icon: "📄" },
];

// ── Utility ───────────────────────────────────────────────────────────────────
function isValidYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w\-]+/.test(
    url.trim()
  );
}

function extractVideoId(url) {
  const m =
    url.match(/youtube\.com\/watch\?v=([\w\-]+)/) ||
    url.match(/youtu\.be\/([\w\-]+)/) ||
    url.match(/youtube\.com\/shorts\/([\w\-]+)/);
  return m ? m[1] : null;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = {
  YouTube:  () => (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: "100%", height: "100%" }}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  Eye:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%" }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%" }}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Download: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%" }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Home:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%" }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  X:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%" }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Bolt:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%" }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Check:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%" }}><polyline points="20 6 9 17 4 12"/></svg>,
  Loader:   () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%", animation: "spin 1s linear infinite" }}>
      <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
      <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
    </svg>
  ),
};

// ── Step Tracker ──────────────────────────────────────────────────────────────
function StepTracker({ currentStep, error }) {
  const currentIdx = STEPS.findIndex(s => s.id === currentStep);
  return (
    <div style={styles.stepTracker}>
      {STEPS.map((step, i) => {
        const done    = i < currentIdx;
        const active  = i === currentIdx;
        const failed  = active && error;
        return (
          <div key={step.id} style={styles.stepRow}>
            <div style={{
              ...styles.stepDot,
              background: failed  ? "#fc8181"
                        : done    ? "#68d391"
                        : active  ? "#f6ad55"
                        : "#2d3748",
              borderColor: failed  ? "#e53e3e"
                         : done    ? "#48bb78"
                         : active  ? "#ed8936"
                         : "#4a5568",
              boxShadow: active && !failed ? "0 0 0 3px rgba(246,173,85,0.3)" : "none",
            }}>
              {done ? (
                <span style={{ width: 14, height: 14, display: "block" }}><Icon.Check /></span>
              ) : active && !failed ? (
                <span style={{ width: 14, height: 14, display: "block" }}><Icon.Loader /></span>
              ) : (
                <span style={{ fontSize: 11 }}>{step.icon}</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <span style={{
                ...styles.stepLabel,
                color: failed  ? "#fc8181"
                     : done    ? "#68d391"
                     : active  ? "#f6ad55"
                     : "#718096",
                fontWeight: active ? 600 : 400,
              }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ ...styles.stepLine, background: done ? "#48bb78" : "#2d3748" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Thumbnail Preview ─────────────────────────────────────────────────────────
function VideoThumbnail({ videoId }) {
  return (
    <div style={styles.thumbnail}>
      <img
        src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
        alt="Video thumbnail"
        style={styles.thumbnailImg}
        onError={e => { e.target.style.display = "none"; }}
      />
      <div style={styles.thumbnailOverlay}>
        <div style={styles.ytPlayBtn}>
          <div style={{ width: 20, height: 20 }}><Icon.YouTube /></div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function YouTubeConverter() {
  const [url,         setUrl]         = useState("");
  const [apiKey,      setApiKey]      = useState(() => localStorage.getItem("groq_key_yt") || "");
  const [showKey,     setShowKey]     = useState(false);
  const [status,      setStatus]      = useState("idle"); // idle | loading | done | error
  const [currentStep, setCurrentStep] = useState(null);
  const [error,       setError]       = useState(null);
  const [result,      setResult]      = useState(null);  // { blob, filename, title }
  const [videoId,     setVideoId]     = useState(null);

  const urlInputRef = useRef(null);

  useEffect(() => {
    urlInputRef.current?.focus();
  }, []);

  const handleApiKeyChange = (v) => {
    setApiKey(v);
    localStorage.setItem("groq_key_yt", v);
  };

  const handleUrlChange = (v) => {
    setUrl(v);
    setVideoId(extractVideoId(v));
    setError(null);
    if (status === "error") setStatus("idle");
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      handleUrlChange(text.trim());
    } catch { /* fallback: user can type */ }
  };

  const handleClear = () => {
    setUrl("");
    setVideoId(null);
    setError(null);
    setStatus("idle");
    setResult(null);
    urlInputRef.current?.focus();
  };

  const handleConvert = async () => {
    if (!url.trim())    return;
    if (!apiKey.trim()) { setError("Groq API key is required. Get one free at console.groq.com"); return; }
    if (!isValidYouTubeUrl(url)) { setError("Please enter a valid YouTube URL."); return; }

    setStatus("loading");
    setError(null);
    setResult(null);
    setCurrentStep("validate");

    // Simulate step progression while we wait for the real backend call
    const stepDelay = (ms) => new Promise(r => setTimeout(r, ms));

    // We advance steps with realistic timing while the request is in flight
    const advanceSteps = async () => {
      await stepDelay(600);  setCurrentStep("metadata");
      await stepDelay(1200); setCurrentStep("download");
      await stepDelay(3000); setCurrentStep("transcribe");
      // "transcribe" stays until the request finishes
    };

    const stepPromise = advanceSteps();

    try {
      const res = await fetch(`${BASE_URL}/convert/youtube-to-pdf`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ url: url.trim(), api_key: apiKey.trim() }),
        signal:  AbortSignal.timeout(300_000), // 5 min
      });

      // Make sure step animation finishes at least through "transcribe"
      await stepPromise;
      setCurrentStep("pdf");
      await stepDelay(600);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server error ${res.status}`);
      }

      const blob     = await res.blob();
      const cd       = res.headers.get("content-disposition") || "";
      const fnMatch  = cd.match(/filename="(.+?)"/);
      const filename = fnMatch ? fnMatch[1] : "transcript.pdf";

      setResult({ blob, filename });
      setStatus("done");
    } catch (err) {
      setError(err.name === "TimeoutError"
        ? "Request timed out. The video may be too long or the server is busy."
        : err.message);
      setStatus("error");
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading  = status === "loading";
  const isDone     = status === "done";
  const isError    = status === "error";
  const urlValid   = isValidYouTubeUrl(url);

  return (
    <div style={styles.root}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        * { box-sizing: border-box; }
        input::placeholder { color: #4a5568; }
        textarea::placeholder { color: #4a5568; }
      `}</style>

      {/* ── Back nav ───────────────────────────────────────────────────── */}
      <a href="/" style={styles.backLink}>
        <span style={{ width: 16, height: 16, display: "inline-block" }}><Icon.Home /></span>
        Back to QNA-AI
      </a>

      {/* ── Card ───────────────────────────────────────────────────────── */}
      <div style={styles.card}>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.ytIconWrap}>
            <Icon.YouTube />
          </div>
          <div>
            <h1 style={styles.title}>YouTube → PDF</h1>
            <p style={styles.subtitle}>Transcribe any video and download a formatted PDF</p>
          </div>
        </div>

        {/* Info banner */}
        <div style={styles.infoBanner}>
          <span style={{ width: 14, height: 14, display: "inline-block", flexShrink: 0 }}><Icon.Bolt /></span>
          <span>Powered by <strong>Groq Whisper</strong> — free, ultra-fast transcription. Videos up to ~45 min.</span>
        </div>

        {/* ── URL input ─────────────────────────────────────────────────── */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>YouTube URL</label>
          <div style={{ position: "relative" }}>
            <div style={styles.ytPrefixIcon}>
              <Icon.YouTube />
            </div>
            <input
              ref={urlInputRef}
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={e => handleUrlChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleConvert(); }}
              disabled={isLoading}
              style={{
                ...styles.input,
                paddingLeft: 42,
                paddingRight: url ? 36 : 12,
                borderColor: isError && !url ? "#e53e3e"
                           : urlValid        ? "#48bb78"
                           : "#2d3748",
              }}
            />
            {url && (
              <button onClick={handleClear} style={styles.clearBtn} title="Clear">
                <Icon.X />
              </button>
            )}
          </div>
          <div style={styles.urlActions}>
            <button onClick={handlePaste} style={styles.smallBtn} disabled={isLoading}>
              📋 Paste from clipboard
            </button>
            {urlValid && <span style={styles.validBadge}>✓ Valid YouTube URL</span>}
          </div>
        </div>

        {/* Thumbnail preview */}
        {videoId && <VideoThumbnail videoId={videoId} />}

        {/* ── API Key input ─────────────────────────────────────────────── */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            Groq API Key
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              style={styles.getLinkStyle}
            >
              Get free key →
            </a>
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showKey ? "text" : "password"}
              placeholder="gsk_..."
              value={apiKey}
              onChange={e => handleApiKeyChange(e.target.value)}
              disabled={isLoading}
              style={{
                ...styles.input,
                paddingRight: 42,
                borderColor: apiKey.startsWith("gsk_") ? "#48bb78" : "#2d3748",
                fontFamily: !showKey && apiKey ? "monospace" : "inherit",
                letterSpacing: !showKey && apiKey ? "0.08em" : "normal",
              }}
            />
            <button
              onClick={() => setShowKey(s => !s)}
              style={styles.eyeBtn}
              title={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <Icon.EyeOff /> : <Icon.Eye />}
            </button>
          </div>
          {apiKey.startsWith("gsk_") && (
            <p style={styles.keyOk}>✓ Key looks valid — saved for this session</p>
          )}
          <p style={styles.keyHint}>
            Your key is stored in localStorage and never sent anywhere except directly to Groq.
          </p>
        </div>

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {error && (
          <div style={styles.errorBox}>
            <span style={{ fontWeight: 600 }}>⚠ Error:</span> {error}
          </div>
        )}

        {/* ── Step tracker ──────────────────────────────────────────────── */}
        {(isLoading || isDone || isError) && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <StepTracker currentStep={currentStep} error={isError} />
          </div>
        )}

        {/* ── Success banner ─────────────────────────────────────────────── */}
        {isDone && result && (
          <div style={{ ...styles.successBox, animation: "fadeIn 0.4s ease" }}>
            <div style={styles.successHeader}>
              <span style={{ fontSize: 22 }}>🎉</span>
              <div>
                <p style={styles.successTitle}>Transcript PDF ready!</p>
                <p style={styles.successSub}>{result.filename}</p>
              </div>
            </div>
            <button onClick={handleDownload} style={styles.downloadBtn}>
              <span style={{ width: 18, height: 18, display: "inline-block" }}><Icon.Download /></span>
              Download PDF
            </button>
          </div>
        )}

        {/* ── Convert button ────────────────────────────────────────────── */}
        {!isDone && (
          <button
            onClick={handleConvert}
            disabled={isLoading || !url.trim() || !apiKey.trim()}
            style={{
              ...styles.convertBtn,
              opacity: isLoading || !url.trim() || !apiKey.trim() ? 0.5 : 1,
              cursor:  isLoading || !url.trim() || !apiKey.trim() ? "not-allowed" : "pointer",
              background: isLoading
                ? "linear-gradient(135deg, #718096, #4a5568)"
                : "linear-gradient(135deg, #e53e3e, #c53030)",
            }}
          >
            {isLoading ? (
              <>
                <span style={{ width: 18, height: 18, display: "inline-block" }}><Icon.Loader /></span>
                Processing…
              </>
            ) : (
              <>
                <span style={{ width: 18, height: 18, display: "inline-block" }}><Icon.YouTube /></span>
                Convert to PDF
              </>
            )}
          </button>
        )}

        {isDone && (
          <button onClick={handleClear} style={styles.resetBtn}>
            Convert another video
          </button>
        )}

        {/* ── How it works ─────────────────────────────────────────────── */}
        {/* <details style={styles.details}>
          <summary style={styles.detailsSummary}>How it works</summary>
          <ol style={styles.howList}>
            <li><strong>yt-dlp</strong> downloads the audio track from the YouTube video (no video download — fast & efficient).</li>
            <li><strong>Groq Whisper Large v3</strong> transcribes the audio to text with timestamps.</li>
            <li><strong>ReportLab</strong> formats the transcript into a clean, timestamped PDF with video metadata.</li>
            <li>The PDF is streamed directly to your browser for download — nothing is stored on the server.</li>
          </ol>
          <p style={{ color: "#718096", fontSize: 12, marginTop: 8 }}>
            ⚠ Works best with English audio. Very long videos (&gt;45 min) may hit Groq's 25 MB audio limit.
          </p>
        </details> */}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight:       "100vh",
    background:      "#0f1117",
    display:         "flex",
    flexDirection:   "column",
    alignItems:      "center",
    padding:         "24px 16px 48px",
    fontFamily:      "'Segoe UI', system-ui, sans-serif",
  },
  backLink: {
    display:         "flex",
    alignItems:      "center",
    gap:             6,
    color:           "#718096",
    textDecoration:  "none",
    fontSize:        13,
    marginBottom:    20,
    alignSelf:       "flex-start",
    maxWidth:        520,
    width:           "100%",
    transition:      "color 0.15s",
  },
  card: {
    background:      "#1a1e2e",
    borderRadius:    16,
    padding:         "32px 28px",
    width:           "100%",
    maxWidth:        520,
    boxShadow:       "0 20px 60px rgba(0,0,0,0.4)",
    border:          "1px solid #2d3748",
    display:         "flex",
    flexDirection:   "column",
    gap:             20,
  },
  header: {
    display:         "flex",
    alignItems:      "center",
    gap:             14,
  },
  ytIconWrap: {
    width:           44,
    height:          44,
    flexShrink:      0,
    color:           "#e53e3e",
    filter:          "drop-shadow(0 0 8px rgba(229,62,62,0.5))",
  },
  title: {
    margin:          0,
    fontSize:        24,
    fontWeight:      700,
    color:           "#f7fafc",
    letterSpacing:   "-0.5px",
  },
  subtitle: {
    margin:          "2px 0 0",
    fontSize:        13,
    color:           "#718096",
  },
  infoBanner: {
    background:      "#1e2d40",
    border:          "1px solid #2b4a6a",
    borderRadius:    8,
    padding:         "10px 14px",
    fontSize:        13,
    color:           "#90cdf4",
    display:         "flex",
    alignItems:      "center",
    gap:             8,
  },
  fieldGroup: {
    display:         "flex",
    flexDirection:   "column",
    gap:             6,
  },
  label: {
    fontSize:        12,
    fontWeight:      600,
    color:           "#a0aec0",
    textTransform:   "uppercase",
    letterSpacing:   "0.05em",
    display:         "flex",
    alignItems:      "center",
    gap:             8,
  },
  getLinkStyle: {
    color:           "#68d391",
    textDecoration:  "none",
    fontWeight:      500,
    textTransform:   "none",
    letterSpacing:   "normal",
    fontSize:        12,
  },
  input: {
    width:           "100%",
    background:      "#0f1117",
    border:          "1.5px solid #2d3748",
    borderRadius:    8,
    padding:         "10px 12px",
    color:           "#f7fafc",
    fontSize:        14,
    outline:         "none",
    transition:      "border-color 0.2s",
  },
  ytPrefixIcon: {
    position:        "absolute",
    left:            12,
    top:             "50%",
    transform:       "translateY(-50%)",
    width:           18,
    height:          18,
    color:           "#e53e3e",
    pointerEvents:   "none",
  },
  clearBtn: {
    position:        "absolute",
    right:           8,
    top:             "50%",
    transform:       "translateY(-50%)",
    background:      "none",
    border:          "none",
    color:           "#718096",
    cursor:          "pointer",
    width:           20,
    height:          20,
    padding:         0,
    display:         "flex",
    alignItems:      "center",
    justifyContent:  "center",
  },
  eyeBtn: {
    position:        "absolute",
    right:           10,
    top:             "50%",
    transform:       "translateY(-50%)",
    background:      "none",
    border:          "none",
    color:           "#718096",
    cursor:          "pointer",
    width:           20,
    height:          20,
    padding:         0,
  },
  urlActions: {
    display:         "flex",
    alignItems:      "center",
    gap:             10,
    flexWrap:        "wrap",
  },
  smallBtn: {
    background:      "#2d3748",
    border:          "1px solid #4a5568",
    borderRadius:    6,
    color:           "#a0aec0",
    fontSize:        12,
    padding:         "4px 10px",
    cursor:          "pointer",
  },
  validBadge: {
    fontSize:        12,
    color:           "#68d391",
    fontWeight:      600,
  },
  keyOk: {
    margin:          0,
    fontSize:        12,
    color:           "#68d391",
  },
  keyHint: {
    margin:          0,
    fontSize:        11,
    color:           "#4a5568",
  },
  thumbnail: {
    position:        "relative",
    borderRadius:    10,
    overflow:        "hidden",
    border:          "1px solid #2d3748",
    aspectRatio:     "16/9",
    background:      "#0f1117",
  },
  thumbnailImg: {
    width:           "100%",
    height:          "100%",
    objectFit:       "cover",
    display:         "block",
  },
  thumbnailOverlay: {
    position:        "absolute",
    inset:           0,
    display:         "flex",
    alignItems:      "center",
    justifyContent:  "center",
    background:      "rgba(0,0,0,0.3)",
  },
  ytPlayBtn: {
    background:      "#e53e3e",
    borderRadius:    "50%",
    width:           48,
    height:          48,
    display:         "flex",
    alignItems:      "center",
    justifyContent:  "center",
    color:           "white",
    boxShadow:       "0 0 20px rgba(229,62,62,0.6)",
  },
  errorBox: {
    background:      "#2d1b1b",
    border:          "1px solid #e53e3e",
    borderRadius:    8,
    padding:         "12px 14px",
    color:           "#fc8181",
    fontSize:        13,
    lineHeight:      1.5,
  },
  stepTracker: {
    background:      "#141824",
    borderRadius:    10,
    padding:         "16px 18px",
    border:          "1px solid #2d3748",
    display:         "flex",
    flexDirection:   "column",
    gap:             0,
  },
  stepRow: {
    display:         "flex",
    alignItems:      "center",
    gap:             12,
    position:        "relative",
    paddingBottom:   12,
  },
  stepDot: {
    width:           30,
    height:          30,
    borderRadius:    "50%",
    border:          "2px solid",
    display:         "flex",
    alignItems:      "center",
    justifyContent:  "center",
    flexShrink:      0,
    transition:      "all 0.3s ease",
  },
  stepLabel: {
    fontSize:        13,
    transition:      "color 0.3s ease",
  },
  stepLine: {
    position:        "absolute",
    left:            14,
    top:             30,
    width:           2,
    height:          12,
    transition:      "background 0.3s ease",
  },
  successBox: {
    background:      "#1a2e1a",
    border:          "1px solid #48bb78",
    borderRadius:    10,
    padding:         "16px 18px",
    display:         "flex",
    flexDirection:   "column",
    gap:             12,
  },
  successHeader: {
    display:         "flex",
    alignItems:      "center",
    gap:             12,
  },
  successTitle: {
    margin:          0,
    fontWeight:      700,
    color:           "#68d391",
    fontSize:        15,
  },
  successSub: {
    margin:          0,
    fontSize:        12,
    color:           "#48bb78",
    wordBreak:       "break-all",
  },
  downloadBtn: {
    background:      "linear-gradient(135deg, #48bb78, #276749)",
    border:          "none",
    borderRadius:    8,
    color:           "white",
    fontWeight:      700,
    fontSize:        15,
    padding:         "12px 20px",
    cursor:          "pointer",
    display:         "flex",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             8,
    width:           "100%",
    boxShadow:       "0 4px 15px rgba(72,187,120,0.3)",
  },
  convertBtn: {
    border:          "none",
    borderRadius:    8,
    color:           "white",
    fontWeight:      700,
    fontSize:        15,
    padding:         "13px 20px",
    display:         "flex",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             8,
    width:           "100%",
    transition:      "all 0.2s ease",
    boxShadow:       "0 4px 15px rgba(229,62,62,0.3)",
  },
  resetBtn: {
    background:      "#2d3748",
    border:          "1px solid #4a5568",
    borderRadius:    8,
    color:           "#a0aec0",
    fontSize:        14,
    padding:         "11px",
    cursor:          "pointer",
    width:           "100%",
  },
  details: {
    borderTop:       "1px solid #2d3748",
    paddingTop:      16,
    marginTop:       -4,
  },
  detailsSummary: {
    color:           "#718096",
    fontSize:        13,
    cursor:          "pointer",
    userSelect:      "none",
  },
  howList: {
    margin:          "10px 0 0",
    paddingLeft:     20,
    color:           "#a0aec0",
    fontSize:        13,
    lineHeight:      1.7,
    display:         "flex",
    flexDirection:   "column",
    gap:             6,
  },
};
