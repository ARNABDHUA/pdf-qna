/**
 * VideoCall.jsx – Google Meet-style | Responsive | Username | Private rooms
 * Fixes:
 *  1. Camera: robust detection with HTTPS/permissions-policy checks + works
 *     without camera (audio-only fallback)
 *  2. Scroll: replaced flex-overflow approach with CSS Grid layout that
 *     naturally scrolls via the page body instead of a nested flex container
 */

import { useState, useEffect, useRef, useCallback } from "react";
import NavBar from "./NavBar";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function urlBase(u) { return u.replace(/\/$/, ""); }
function wsBase(u) { return u.replace(/^http/, "ws").replace(/\/$/, ""); }
function randomId() { return Math.random().toString(36).slice(2, 9); }
function initials(name) {
  const parts = (name || "?").trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (name || "??").slice(0, 2).toUpperCase();
}

// Detect why camera might not work
function diagnoseCameraEnv() {
  const issues = [];
  if (typeof window === "undefined") return issues;
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (location.protocol !== "https:" && !isLocalhost) {
    issues.push("HTTPS_REQUIRED");
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    issues.push("API_UNAVAILABLE");
  }
  return issues;
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0d14;
    --surface: #0d1117;
    --surface2: rgba(255,255,255,0.04);
    --border: rgba(255,255,255,0.07);
    --accent: #6366f1;
    --accent2: #818cf8;
    --text: #e2e8f0;
    --text2: #94a3b8;
    --text3: #475569;
    --danger: #dc2626;
    --warn: #f59e0b;
  }

  body { background: var(--bg); }

  .vc-root {
    background: var(--bg);
    font-family: 'DM Sans', system-ui, sans-serif;
    color: var(--text);
  }

  /* ── LOBBY ── */
  .vc-lobby {
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 24px 16px 48px;
    background:
      radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.12) 0%, transparent 60%),
      radial-gradient(ellipse at 70% 80%, rgba(16,185,129,0.08) 0%, transparent 60%),
      var(--bg);
    /* FIX: lobby itself scrolls naturally */
    overflow-y: auto;
  }
  .vc-lobby__card {
    width: 100%;
    max-width: 460px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 32px 28px;
  }
  .vc-lobby__brand { text-align: center; margin-bottom: 28px; }
  .vc-lobby__brand-icon { font-size: 40px; display: block; margin-bottom: 8px; }
  .vc-lobby__title { font-size: 22px; font-weight: 700; color: #f1f5f9; }
  .vc-lobby__sub { font-size: 13px; color: var(--text3); margin-top: 4px; }

  /* preview */
  .vc-preview {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    background: #111827;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .vc-preview video {
    width: 100%; height: 100%;
    object-fit: cover;
    transform: scaleX(-1);
  }
  .vc-preview__overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 20px;
    text-align: center;
  }
  .vc-preview__overlay-icon { font-size: 36px; }
  .vc-preview__overlay-text { font-size: 13px; color: var(--text3); }
  .vc-preview__overlay-sub { font-size: 12px; color: #334155; line-height: 1.5; }
  .vc-preview__btns {
    position: absolute;
    bottom: 10px; left: 50%;
    transform: translateX(-50%);
    display: flex; gap: 8px;
  }

  /* banners */
  .vc-banner {
    border-radius: 10px;
    padding: 11px 14px;
    font-size: 13px;
    margin-bottom: 12px;
    line-height: 1.6;
  }
  .vc-banner--error {
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.2);
    color: #f87171;
  }
  .vc-banner--warn {
    background: rgba(245,158,11,0.08);
    border: 1px solid rgba(245,158,11,0.2);
    color: #fbbf24;
  }
  .vc-banner--warn b { color: #fde68a; }
  .vc-banner--ok {
    background: rgba(16,185,129,0.08);
    border: 1px solid rgba(16,185,129,0.2);
    color: #34d399;
    font-size: 12px;
    text-align: center;
  }
  .vc-banner__row { display: flex; align-items: flex-start; gap: 8px; }
  .vc-banner__actions { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }

  /* fields */
  .vc-field { margin-bottom: 14px; }
  .vc-label {
    display: block;
    font-size: 12px; font-weight: 600;
    color: var(--text2);
    margin-bottom: 5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .vc-input {
    width: 100%;
    padding: 10px 13px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    color: #f1f5f9;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color .15s;
  }
  .vc-input:focus { border-color: rgba(99,102,241,0.6); }
  .vc-input::placeholder { color: #334155; }

  .vc-tabs {
    display: flex;
    background: rgba(255,255,255,0.04);
    border-radius: 10px;
    padding: 3px;
    margin-bottom: 18px;
  }
  .vc-tab {
    flex: 1; padding: 8px;
    border: none; border-radius: 8px;
    background: transparent;
    color: var(--text3);
    font-size: 13px; font-weight: 600;
    cursor: pointer;
    transition: all .15s;
    font-family: inherit;
  }
  .vc-tab.active { background: rgba(99,102,241,0.2); color: var(--accent2); }

  .vc-btn {
    width: 100%; padding: 12px;
    border: none; border-radius: 10px;
    font-size: 14px; font-weight: 600;
    cursor: pointer; font-family: inherit;
    transition: all .15s;
  }
  .vc-btn-primary { background: var(--accent); color: #fff; }
  .vc-btn-primary:hover:not(:disabled) { background: #4f46e5; }
  .vc-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .vc-btn-ghost {
    background: rgba(255,255,255,0.06);
    color: var(--text2);
    border: 1px solid var(--border);
  }
  .vc-btn-ghost:hover { background: rgba(255,255,255,0.1); color: var(--text); }
  .vc-btn-sm {
    padding: 6px 12px; border-radius: 8px;
    font-size: 12px; font-weight: 600;
    border: none; cursor: pointer;
    font-family: inherit; transition: all .15s;
    white-space: nowrap;
  }

  /* ── IN-CALL LAYOUT ── */
  /*
   * FIX #2 — Scroll approach:
   * Instead of a fixed-height flex container with nested overflow-y:auto,
   * the call view is a normal block layout. The entire page scrolls.
   * The header and controls are position:sticky so they stay visible.
   */
  .vc-call {
    display: block;
    min-height: 100vh;
    position: relative;
  }

  .vc-header {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    gap: 8px;
  }
  .vc-header__left {
    display: flex; align-items: center;
    gap: 10px; flex-wrap: wrap;
  }
  .vc-header__room {
    font-family: 'Courier New', monospace;
    font-size: 13px; font-weight: 700;
    letter-spacing: 2px;
    background: rgba(99,102,241,0.15);
    color: var(--accent2);
    border-radius: 6px;
    padding: 3px 10px;
    cursor: pointer;
    border: 1px solid rgba(99,102,241,0.25);
    user-select: all;
  }
  .vc-header__info { font-size: 12px; color: var(--text3); }
  .vc-header__name { font-size: 13px; color: var(--text2); font-weight: 500; }

  /* call body: grid area + optional sidebar, normal block flow */
  .vc-body {
    display: flex;
    align-items: flex-start;
    /* No overflow:hidden — let content expand and page scroll */
  }

  /* grid wrap — just a normal block, no overflow tricks */
  .vc-grid-wrap {
    flex: 1;
    padding: 16px;
    min-width: 0;
    /* extra bottom padding so content isn't hidden behind sticky controls */
    padding-bottom: 96px;
  }
  .vc-screenshare-wrap { width: 100%; margin-bottom: 12px; }

  .vc-grid {
    display: grid;
    gap: 12px;
    align-items: start;
  }
  .vc-grid[data-count="1"] { grid-template-columns: 1fr; }
  .vc-grid[data-count="2"] { grid-template-columns: repeat(2,1fr); }
  .vc-grid[data-count="3"],
  .vc-grid[data-count="4"] { grid-template-columns: repeat(2,1fr); }
  .vc-grid[data-count="5"],
  .vc-grid[data-count="6"] { grid-template-columns: repeat(3,1fr); }
  @media(max-width:600px) {
    .vc-grid[data-count="2"],
    .vc-grid[data-count="3"],
    .vc-grid[data-count="4"],
    .vc-grid[data-count="5"],
    .vc-grid[data-count="6"] { grid-template-columns: 1fr; }
  }

  /* tile — natural height, no aspect-ratio that fights scroll */
  .vc-tile {
    position: relative;
    background: #111827;
    border-radius: 12px;
    overflow: hidden;
    aspect-ratio: 4/3;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--border);
  }
  .vc-tile--screen { aspect-ratio: 16/9; }
  .vc-tile video { width: 100%; height: 100%; object-fit: cover; }
  .vc-tile video.mirror { transform: scaleX(-1); }
  .vc-tile__avatar {
    width: 56px; height: 56px;
    border-radius: 50%;
    background: rgba(99,102,241,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 700;
    color: var(--accent2); letter-spacing: 1px;
  }
  .vc-tile__label {
    position: absolute;
    bottom: 8px; left: 8px;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 11px; color: var(--text);
    display: flex; align-items: center; gap: 4px;
    max-width: calc(100% - 16px);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .vc-tile__muted { color: #f87171; font-size: 10px; }

  /* sidebar */
  .vc-sidebar {
    width: 280px;
    flex-shrink: 0;
    background: var(--surface);
    border-left: 1px solid var(--border);
    /* sticky so it stays alongside the scrolling grid */
    position: sticky;
    top: 48px; /* header height */
    height: calc(100vh - 48px - 72px); /* viewport minus header minus controls */
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  @media(max-width:768px) {
    .vc-sidebar { display: none; }
    .vc-sidebar.mobile-open {
      display: flex;
      position: fixed;
      inset: 0;
      top: 0; height: 100%;
      z-index: 100;
      width: 100%;
    }
  }
  .vc-sidebar__tab-bar {
    display: flex;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .vc-sidebar__tab {
    flex: 1; padding: 10px 8px;
    border: none; background: transparent;
    color: var(--text3);
    font-size: 12px; font-weight: 600;
    cursor: pointer; font-family: inherit;
    border-bottom: 2px solid transparent;
    transition: all .15s;
  }
  .vc-sidebar__tab.active { color: var(--accent2); border-bottom-color: var(--accent2); }
  .vc-sidebar__body {
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column;
  }

  /* chat */
  .vc-chat__messages {
    flex: 1; padding: 12px;
    display: flex; flex-direction: column;
    gap: 10px; overflow-y: auto;
  }
  .vc-chat__empty { color: #334155; font-size: 13px; text-align: center; margin-top: 24px; }
  .vc-chat__msg-name { font-size: 11px; color: var(--text3); margin-bottom: 2px; }
  .vc-chat__msg-bubble {
    background: rgba(255,255,255,0.05);
    border-radius: 8px; padding: 7px 10px;
    font-size: 13px; color: #cbd5e1;
    word-break: break-word;
  }
  .vc-chat__input-row {
    display: flex; gap: 6px; padding: 10px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .vc-chat__input {
    flex: 1; padding: 8px 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    color: var(--text); font-size: 13px;
    font-family: inherit; outline: none;
  }
  .vc-chat__send {
    padding: 8px 12px; background: var(--accent); color: #fff;
    border: none; border-radius: 8px;
    cursor: pointer; font-size: 13px; font-weight: 600;
  }

  /* people */
  .vc-peers__list { padding: 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
  .vc-peer-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.03);
    border-radius: 8px;
  }
  .vc-peer-row__avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(99,102,241,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: var(--accent2);
    flex-shrink: 0;
  }
  .vc-peer-row__name { font-size: 13px; color: #cbd5e1; flex: 1; }
  .vc-peer-row__you { font-size: 11px; color: var(--text3); }

  /* invite */
  .vc-invite { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .vc-invite__desc { font-size: 12px; color: var(--text3); line-height: 1.5; }

  /* sticky controls bar */
  .vc-controls {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 16px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .vc-ctrl-btn {
    width: 46px; height: 46px;
    border-radius: 50%; border: none;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; transition: all .15s;
    flex-shrink: 0; position: relative;
  }
  .vc-ctrl-btn--normal { background: rgba(255,255,255,0.1); }
  .vc-ctrl-btn--normal:hover { background: rgba(255,255,255,0.18); }
  .vc-ctrl-btn--active { background: rgba(99,102,241,0.3); }
  .vc-ctrl-btn--off { background: rgba(239,68,68,0.25); }
  .vc-ctrl-btn--danger { background: var(--danger); }
  .vc-ctrl-btn--danger:hover { background: #b91c1c; }
  .vc-ctrl-btn--chat-mobile { display: none; }
  @media(max-width:768px) { .vc-ctrl-btn--chat-mobile { display: flex; } }

  /* ── SCROLL DOWN BUTTON ── */
  .vc-scroll-fab {
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 300;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    opacity: 1;
    transition: opacity .35s ease, transform .35s ease;
  }
  .vc-scroll-fab.vc-scroll-fab--hidden {
    opacity: 0;
    pointer-events: none;
    transform: translateX(-50%) translateY(12px);
  }
  .vc-scroll-fab__pill {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 18px 8px 14px;
    background: rgba(13,17,23,0.82);
    border: 1px solid rgba(99,102,241,0.4);
    border-radius: 999px;
    backdrop-filter: blur(12px);
    color: #a5b4fc;
    font-size: 12px;
    font-weight: 600;
    font-family: 'DM Sans', system-ui, sans-serif;
    white-space: nowrap;
    box-shadow: 0 4px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,102,241,0.12);
    letter-spacing: 0.02em;
  }
  .vc-scroll-fab__icon {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: rgba(99,102,241,0.25);
    border: 1px solid rgba(99,102,241,0.35);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .vc-scroll-fab__chevron {
    display: block;
    width: 8px; height: 8px;
    border-right: 2px solid #818cf8;
    border-bottom: 2px solid #818cf8;
    transform: rotate(45deg) translateY(-2px);
    animation: vc-chevron-bob 1.4s ease-in-out infinite;
  }
  @keyframes vc-chevron-bob {
    0%, 100% { transform: rotate(45deg) translateY(-2px); }
    50%       { transform: rotate(45deg) translateY(2px); }
  }
`;

// ── SW for push ───────────────────────────────────────────────────────────────
const SW_SRC = `
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || 'Meeting', {
    body: d.body || '', icon: '/favicon.ico', data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
`;
async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  const blob = new Blob([SW_SRC], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const reg = await navigator.serviceWorker.register(url, { scope: "/" });
    await navigator.serviceWorker.ready;
    return reg;
  } catch { return null; }
}
function b64ToUint8(b64) {
  const pad = "=".repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ── VideoTile ─────────────────────────────────────────────────────────────────
function VideoTile({ stream, name, isLocal, micOn = true, videoOn = true, isScreen }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className={`vc-tile${isScreen ? " vc-tile--screen" : ""}`}>
      {stream && (isScreen || videoOn)
        ? <video ref={ref} autoPlay playsInline muted={isLocal} className={isLocal && !isScreen ? "mirror" : ""} />
        : <div className="vc-tile__avatar">{initials(name)}</div>
      }
      <div className="vc-tile__label">
        {!micOn && <span className="vc-tile__muted">🔇</span>}
        {name}{isLocal ? " (you)" : ""}{isScreen ? " · screen" : ""}
      </div>
    </div>
  );
}

// ── CtrlBtn ───────────────────────────────────────────────────────────────────
function CtrlBtn({ onClick, variant = "normal", title, icon, badge }) {
  return (
    <button className={`vc-ctrl-btn vc-ctrl-btn--${variant}`} onClick={onClick} title={title}>
      {icon}
      {badge && (
        <span style={{
          position:"absolute", top:0, right:0,
          background:"#6366f1", color:"#fff",
          borderRadius:"50%", width:16, height:16,
          fontSize:10, display:"flex", alignItems:"center", justifyContent:"center"
        }}>{badge}</span>
      )}
    </button>
  );
}

// ── MediaStatus banner ────────────────────────────────────────────────────────
function MediaBanner({ status, onRetry, onAudioOnly }) {
  if (status === "ok") {
    return <div className="vc-banner vc-banner--ok">✅ Camera &amp; microphone ready</div>;
  }
  if (status === "audio-only") {
    return <div className="vc-banner vc-banner--ok">🎙️ Microphone only (no camera found) — you can still join</div>;
  }
  if (status === "https") {
    return (
      <div className="vc-banner vc-banner--warn">
        <b>Camera requires HTTPS.</b><br />
        This page is served over plain HTTP. Browsers block camera &amp; mic access on non-secure origins.
        To fix: serve this app over <b>https://</b> or use <b>localhost</b>.<br />
        <div className="vc-banner__actions">
          <button className="vc-btn-sm" onClick={onAudioOnly}
            style={{ background:"rgba(245,158,11,0.2)", color:"#fbbf24" }}>
            🎙️ Continue audio-only
          </button>
        </div>
      </div>
    );
  }
  if (status === "denied") {
    return (
      <div className="vc-banner vc-banner--warn">
        <b>Camera/mic permission denied.</b><br />
        1. Click the 🔒 lock icon in the address bar<br />
        2. Set Camera &amp; Microphone → <b>Allow</b><br />
        3. Reload and try again
        <div className="vc-banner__actions">
          <button className="vc-btn-sm" onClick={onRetry}
            style={{ background:"rgba(245,158,11,0.2)", color:"#fbbf24" }}>
            🔄 Try Again
          </button>
          <button className="vc-btn-sm" onClick={onAudioOnly}
            style={{ background:"rgba(255,255,255,0.08)", color:"#94a3b8" }}>
            🎙️ Audio only
          </button>
        </div>
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <div className="vc-banner vc-banner--warn">
        <b>No camera found.</b> Trying microphone only…
        <div className="vc-banner__actions">
          <button className="vc-btn-sm" onClick={onRetry}
            style={{ background:"rgba(245,158,11,0.2)", color:"#fbbf24" }}>
            🔄 Retry
          </button>
          <button className="vc-btn-sm" onClick={onAudioOnly}
            style={{ background:"rgba(255,255,255,0.08)", color:"#94a3b8" }}>
            🎙️ Audio only
          </button>
        </div>
      </div>
    );
  }
  if (status === "unavailable") {
    return (
      <div className="vc-banner vc-banner--error">
        ⚠️ Camera/mic API not available in this browser or context.<br />
        <small>Make sure you're on a modern browser and the page is served over HTTPS.</small>
        <div className="vc-banner__actions">
          <button className="vc-btn-sm" onClick={onAudioOnly}
            style={{ background:"rgba(239,68,68,0.2)", color:"#f87171" }}>
            Continue anyway
          </button>
        </div>
      </div>
    );
  }
  if (status === "loading") {
    return <div className="vc-banner" style={{ background:"rgba(255,255,255,0.03)", border:"1px solid var(--border)", color:"var(--text3)", fontSize:13, textAlign:"center" }}>
      ⏳ Requesting camera &amp; microphone access…
    </div>;
  }
  if (status === "error") {
    return (
      <div className="vc-banner vc-banner--error">
        ⚠️ Could not access camera/mic.
        <div className="vc-banner__actions">
          <button className="vc-btn-sm" onClick={onRetry}
            style={{ background:"rgba(239,68,68,0.2)", color:"#f87171" }}>
            🔄 Retry
          </button>
          <button className="vc-btn-sm" onClick={onAudioOnly}
            style={{ background:"rgba(255,255,255,0.08)", color:"#94a3b8" }}>
            🎙️ Audio only
          </button>
        </div>
      </div>
    );
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VideoCall({ backendUrl = "http://localhost:8000" }) {
  const [tab, setTab]                   = useState("create");
  const [displayName, setDisplayName]   = useState("");
  const [roomInput, setRoomInput]       = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [lobbyError, setLobbyError]     = useState("");

  // media
  const [mediaStatus, setMediaStatus]   = useState("loading"); // loading|ok|audio-only|denied|notfound|unavailable|https|error
  const [lobbyStream, setLobbyStream]   = useState(null);      // video+audio or audio-only
  const [lobbyMic, setLobbyMic]         = useState(true);
  const [lobbyCam, setLobbyCam]         = useState(true);
  const streamRef = useRef(null);

  // callback ref for preview video — fires immediately when element mounts
  const previewVideoRef = useCallback((el) => {
    if (el && streamRef.current) el.srcObject = streamRef.current;
  }, []);

  // call
  const [inCall, setInCall]             = useState(false);
  const [roomId, setRoomId]             = useState("");
  const [peerId]                        = useState(randomId);
  const [status, setStatus]             = useState("");
  const [localStream, setLocalStream]   = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [remoteNames, setRemoteNames]   = useState({});
  const [remoteMic, setRemoteMic]       = useState({});
  const [micOn, setMicOn]               = useState(true);
  const [camOn, setCamOn]               = useState(true);
  const [sharing, setSharing]           = useState(false);
  const [sidebarTab, setSidebarTab]     = useState("chat");
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [chatLog, setChatLog]           = useState([]);
  const [chatMsg, setChatMsg]           = useState("");
  const [unread, setUnread]             = useState(0);
  const [copied, setCopied]             = useState(false);
  const [notifyTarget, setNotifyTarget] = useState("");
  const [pushEnabled, setPushEnabled]   = useState(false);
  const [pushStatus, setPushStatus]     = useState("");
  const chatEndRef = useRef(null);
  const wsRef      = useRef(null);
  const pcsRef     = useRef({});
  const iceQRef    = useRef({});

  // ── media helpers ────────────────────────────────────────────────────────

  function applyStream(s) {
    streamRef.current = s;
    setLobbyStream(s);
    // If the preview <video> is already mounted, wire it up directly
    const el = document.querySelector(".vc-preview video");
    if (el) el.srcObject = s;
  }

  async function requestMedia() {
    // Detect environment issues first
    const envIssues = diagnoseCameraEnv();
    if (envIssues.includes("HTTPS_REQUIRED")) {
      setMediaStatus("https");
      return;
    }
    if (envIssues.includes("API_UNAVAILABLE")) {
      setMediaStatus("unavailable");
      return;
    }

    setMediaStatus("loading");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      applyStream(s);
      setMediaStatus("ok");
    } catch (err) {
      const name = err.name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMediaStatus("denied");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        // No camera — try audio only automatically
        setMediaStatus("notfound");
        await requestAudioOnly();
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        // Camera in use — try without video
        setMediaStatus("error");
        await requestAudioOnly();
      } else {
        setMediaStatus("error");
      }
    }
  }

  async function requestAudioOnly() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      applyStream(s);
      setMediaStatus("audio-only");
      setLobbyCam(false);
    } catch {
      setMediaStatus("error");
    }
  }

  useEffect(() => {
    requestMedia();
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  function lobbyToggleMic() {
    if (!streamRef.current) return;
    const next = !lobbyMic;
    streamRef.current.getAudioTracks().forEach(t => t.enabled = next);
    setLobbyMic(next);
  }
  function lobbyToggleCam() {
    if (!streamRef.current) return;
    const next = !lobbyCam;
    streamRef.current.getVideoTracks().forEach(t => t.enabled = next);
    setLobbyCam(next);
  }

  // ── join / create ────────────────────────────────────────────────────────

  async function handleCreate() {
    const name = displayName.trim();
    if (!name) { setLobbyError("Please enter your name."); return; }
    setLobbyError("");
    try {
      const res  = await fetch(`${urlBase(backendUrl)}/videocall/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: createPassword || null, host_id: peerId }),
      });
      const data = await res.json();
      await enterCall(data.room_id, createPassword);
    } catch {
      setLobbyError("Could not create room. Is the server running?");
    }
  }

  async function handleJoin() {
    const name = displayName.trim();
    const rid  = roomInput.trim().toUpperCase();
    if (!name) { setLobbyError("Please enter your name."); return; }
    if (!rid)  { setLobbyError("Please enter a room code."); return; }
    setLobbyError("");
    try {
      const res = await fetch(`${urlBase(backendUrl)}/videocall/rooms/${rid}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: joinPassword }),
      });
      if (!res.ok) {
        const err = await res.json();
        setLobbyError(err.detail === "Wrong password" ? "❌ Wrong room password." : err.detail);
        return;
      }
    } catch {
      setLobbyError("Room not found or server unreachable.");
      return;
    }
    await enterCall(rid, joinPassword);
  }

  async function enterCall(rid, password) {
    let stream = streamRef.current;
    if (!stream) {
      // One last attempt
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        applyStream(stream);
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          applyStream(stream);
        } catch {
          // Allow joining with no media at all (view-only)
          stream = null;
        }
      }
    }
    if (stream) {
      stream.getAudioTracks().forEach(t => t.enabled = lobbyMic);
      stream.getVideoTracks().forEach(t => t.enabled = lobbyCam);
    }
    setLocalStream(stream);
    setMicOn(lobbyMic);
    setCamOn(lobbyCam);
    setRoomId(rid);
    setInCall(true);
    setStatus("Connecting…");

    const name = displayName.trim();
    const wsUrl = `${wsBase(backendUrl)}/ws/videocall/${rid}/${peerId}`
      + `?name=${encodeURIComponent(name)}`
      + (password ? `&password=${encodeURIComponent(password)}` : "");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen    = () => setStatus(`In room ${rid}`);
    ws.onmessage = (e) => handleMsg(JSON.parse(e.data), stream);
    ws.onerror   = () => setStatus("Connection error");
    ws.onclose   = (e) => {
      if (e.code === 4003) setLobbyError("Wrong password — kicked from room.");
      setStatus("Disconnected");
    };
  }

  // ── signaling ────────────────────────────────────────────────────────────

  function handleMsg(msg, stream) {
    switch (msg.type) {
      case "peers":
        msg.peers.forEach(({ id, name }) => {
          setRemoteNames(p => ({ ...p, [id]: name }));
          initOffer(id, stream);
        });
        break;
      case "peer_joined":
        setRemoteNames(p => ({ ...p, [msg.from]: msg.name }));
        setStatus(`${msg.name} joined`);
        break;
      case "peer_left":
        setStatus(`${remoteNames[msg.from] || msg.from} left`);
        pcsRef.current[msg.from]?.close();
        delete pcsRef.current[msg.from];
        setRemoteStreams(p => { const n = {...p}; delete n[msg.from]; return n; });
        setRemoteNames(p => { const n = {...p}; delete n[msg.from]; return n; });
        break;
      case "offer": handleOffer(msg, stream); break;
      case "answer":
        pcsRef.current[msg.from]?.setRemoteDescription(msg.payload)
          .then(() => flushIce(msg.from));
        break;
      case "ice": {
        const pc = pcsRef.current[msg.from];
        if (pc?.remoteDescription) pc.addIceCandidate(msg.payload);
        else { (iceQRef.current[msg.from] ??= []).push(msg.payload); }
        break;
      }
      case "chat":
        setChatLog(l => [...l, { from: msg.name || msg.from, text: msg.payload }]);
        setUnread(u => u + 1);
        break;
      case "error":
        if (msg.error === "wrong_password") setLobbyError("Wrong room password.");
        break;
    }
  }

  function makePc(pid, stream) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current[pid] = pc;
    stream?.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) wsRef.current?.send(JSON.stringify({ type:"ice", to:pid, payload:candidate }));
    };
    pc.ontrack = ({ streams }) => {
      if (streams[0]) setRemoteStreams(p => ({ ...p, [pid]: streams[0] }));
    };
    pc.onconnectionstatechange = () => {
      if (["disconnected","failed","closed"].includes(pc.connectionState))
        setRemoteStreams(p => { const n = {...p}; delete n[pid]; return n; });
    };
    return pc;
  }

  async function initOffer(pid, stream) {
    const pc = makePc(pid, stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsRef.current?.send(JSON.stringify({ type:"offer", to:pid, payload:offer }));
  }

  async function handleOffer(msg, stream) {
    const pc = makePc(msg.from, stream);
    await pc.setRemoteDescription(msg.payload);
    await flushIce(msg.from);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsRef.current?.send(JSON.stringify({ type:"answer", to:msg.from, payload:answer }));
  }

  async function flushIce(pid) {
    const pc = pcsRef.current[pid];
    if (!pc) return;
    for (const c of iceQRef.current[pid] || []) await pc.addIceCandidate(c);
    iceQRef.current[pid] = [];
  }

  // ── controls ─────────────────────────────────────────────────────────────

  function toggleMic() {
    localStream?.getAudioTracks().forEach(t => t.enabled = !micOn);
    setMicOn(v => !v);
  }
  function toggleCam() {
    localStream?.getVideoTracks().forEach(t => t.enabled = !camOn);
    setCamOn(v => !v);
  }

  async function startShare() {
    try {
      const sc = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:true });
      setScreenStream(sc);
      setSharing(true);
      const vt = sc.getVideoTracks()[0];
      Object.values(pcsRef.current).forEach(pc => {
        const s = pc.getSenders().find(s => s.track?.kind === "video");
        if (s) s.replaceTrack(vt);
      });
      vt.onended = stopShare;
    } catch {}
  }

  function stopShare() {
    screenStream?.getTracks().forEach(t => t.stop());
    setScreenStream(null);
    setSharing(false);
    const ct = localStream?.getVideoTracks()[0];
    if (ct) Object.values(pcsRef.current).forEach(pc => {
      const s = pc.getSenders().find(s => s.track?.kind === "video");
      if (s) s.replaceTrack(ct);
    });
  }

  function leaveCall() {
    wsRef.current?.send(JSON.stringify({ type:"leave" }));
    wsRef.current?.close(); wsRef.current = null;
    Object.values(pcsRef.current).forEach(pc => pc.close());
    pcsRef.current = {};
    localStream?.getTracks().forEach(t => t.stop());
    screenStream?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setLocalStream(null); setScreenStream(null);
    setRemoteStreams({}); setRemoteNames({});
    setInCall(false); setSharing(false);
    setMicOn(true); setCamOn(true);
    setLobbyStream(null);
    setStatus("");
    requestMedia();
  }

  function sendChat() {
    if (!chatMsg.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type:"chat", payload:chatMsg.trim() }));
    setChatLog(l => [...l, { from: displayName + " (you)", text:chatMsg.trim() }]);
    setChatMsg("");
  }

  function copyRoom() {
    navigator.clipboard?.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  useEffect(() => {
    if (sidebarTab === "chat") setUnread(0);
  }, [sidebarTab, sidebarOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [chatLog]);

  // push
  async function enablePush() {
    setPushStatus("Requesting…");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setPushStatus("Permission denied"); return; }
    try {
      const kr = await fetch(`${urlBase(backendUrl)}/videocall/vapid-public-key`);
      if (!kr.ok) throw new Error("VAPID not configured");
      const { public_key } = await kr.json();
      const reg = await registerSW();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64ToUint8(public_key) });
      await fetch(`${urlBase(backendUrl)}/videocall/push/subscribe`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ user_id:peerId, subscription:sub.toJSON() }),
      });
      setPushEnabled(true); setPushStatus("Enabled ✓");
    } catch (e) { setPushStatus(`Failed: ${e.message}`); }
  }

  async function sendInvite() {
    if (!notifyTarget || !roomId) return;
    await fetch(`${urlBase(backendUrl)}/videocall/push/notify-room`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ room_id:roomId, title:`${displayName} is calling`, body:`Join room ${roomId}`, user_ids:[notifyTarget] }),
    });
    setStatus(`Invite sent to ${notifyTarget}`);
    setNotifyTarget("");
  }

  const remotePeerIds = Object.keys(remoteStreams);
  const totalCount    = 1 + remotePeerIds.length;
  const hasVideo      = mediaStatus === "ok";

  // ── LOBBY ────────────────────────────────────────────────────────────────
  if (!inCall) return (
    <>
    <NavBar currentPath="/meet" />
    <div className="vc-root">
      <style>{CSS}</style>
      <div className="vc-lobby">
        <div className="vc-lobby__card">
          <div className="vc-lobby__brand">
            <span className="vc-lobby__brand-icon">📹</span>
            <div className="vc-lobby__title">Quick Meet</div>
            <div className="vc-lobby__sub">HD video calls, screen share, no sign-up</div>
          </div>

          {/* Preview */}
          <div className="vc-preview">
            {lobbyStream && hasVideo ? (
              <>
                <video
                  ref={previewVideoRef}
                  autoPlay playsInline muted
                  style={{ display: lobbyCam ? "block" : "none", width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)" }}
                />
                {!lobbyCam && (
                  <div className="vc-preview__overlay">
                    <span className="vc-preview__overlay-icon">📵</span>
                    <span className="vc-preview__overlay-text">Camera paused</span>
                  </div>
                )}
              </>
            ) : lobbyStream && mediaStatus === "audio-only" ? (
              <div className="vc-preview__overlay">
                <span className="vc-preview__overlay-icon">🎙️</span>
                <span className="vc-preview__overlay-text">Audio only</span>
                <span className="vc-preview__overlay-sub">No camera available</span>
              </div>
            ) : (
              <div className="vc-preview__overlay">
                <span className="vc-preview__overlay-icon">
                  {mediaStatus === "loading" ? "⏳" : "🚫"}
                </span>
                <span className="vc-preview__overlay-text">
                  {mediaStatus === "loading" ? "Requesting access…" : "Camera unavailable"}
                </span>
              </div>
            )}
            {lobbyStream && (
              <div className="vc-preview__btns">
                <button className="vc-btn-sm" onClick={lobbyToggleMic}
                  style={{ background: lobbyMic ? "rgba(0,0,0,0.65)" : "rgba(220,38,38,0.7)", color:"#fff" }}>
                  {lobbyMic ? "🎙️" : "🔇"}
                </button>
                {hasVideo && (
                  <button className="vc-btn-sm" onClick={lobbyToggleCam}
                    style={{ background: lobbyCam ? "rgba(0,0,0,0.65)" : "rgba(220,38,38,0.7)", color:"#fff" }}>
                    {lobbyCam ? "📷" : "📵"}
                  </button>
                )}
              </div>
            )}
          </div>

          <MediaBanner
            status={mediaStatus}
            onRetry={requestMedia}
            onAudioOnly={requestAudioOnly}
          />

          {/* Name */}
          <div className="vc-field">
            <label className="vc-label">Your name</label>
            <input className="vc-input" value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Alice" maxLength={40} />
          </div>

          <div className="vc-tabs">
            <button className={`vc-tab${tab==="create"?" active":""}`} onClick={() => setTab("create")}>+ New Room</button>
            <button className={`vc-tab${tab==="join"?" active":""}`} onClick={() => setTab("join")}>Join Room</button>
          </div>

          {lobbyError && (
            <div className="vc-banner vc-banner--error">
              <div className="vc-banner__row">⚠️ {lobbyError}</div>
            </div>
          )}

          {tab === "create" && (
            <>
              <div className="vc-field">
                <label className="vc-label">
                  Room password <span style={{ color:"#475569", textTransform:"none", fontWeight:400 }}>(optional)</span>
                </label>
                <input className="vc-input" type="password" value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  placeholder="Leave blank for a public room" />
              </div>
              <button className="vc-btn vc-btn-primary" onClick={handleCreate}>
                {createPassword ? "🔒 Create Private Room" : "Create Room"}
              </button>
            </>
          )}

          {tab === "join" && (
            <>
              <div className="vc-field">
                <label className="vc-label">Room code</label>
                <input className="vc-input" value={roomInput}
                  onChange={e => setRoomInput(e.target.value.toUpperCase())}
                  placeholder="8-character code" maxLength={8}
                  onKeyDown={e => e.key==="Enter" && handleJoin()} />
              </div>
              <div className="vc-field">
                <label className="vc-label">Password <span style={{ color:"#475569", textTransform:"none", fontWeight:400 }}>(if private)</span></label>
                <input className="vc-input" type="password" value={joinPassword}
                  onChange={e => setJoinPassword(e.target.value)}
                  placeholder="Leave blank for public rooms"
                  onKeyDown={e => e.key==="Enter" && handleJoin()} />
              </div>
              <button className="vc-btn vc-btn-primary" onClick={handleJoin}>Join Room</button>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );

  // ── IN CALL ──────────────────────────────────────────────────────────────
  return (
    <div className="vc-root">
      <style>{CSS}</style>
      <div className="vc-call">

        {/* Sticky header */}
        <div className="vc-header">
          <div className="vc-header__left">
            <span style={{ fontSize:14, fontWeight:700, color:"#f1f5f9" }}>📹</span>
            <span className="vc-header__room" onClick={copyRoom} title="Click to copy">{roomId}</span>
            {copied && <span style={{ fontSize:11, color:"#34d399" }}>Copied!</span>}
            <span className="vc-header__info">{totalCount} participant{totalCount!==1?"s":""}</span>
            {status && <span className="vc-header__info">· {status}</span>}
          </div>
          <div className="vc-header__name">👤 {displayName}</div>
        </div>

        {/* Body — normal block flow, page scrolls */}
        <div className="vc-body">
          <div className="vc-grid-wrap">
            {sharing && screenStream && (
              <div className="vc-screenshare-wrap">
                <VideoTile stream={screenStream} name={displayName} isLocal isScreen videoOn />
              </div>
            )}
            <div className="vc-grid" data-count={Math.min(totalCount,6)}>
              <VideoTile stream={localStream} name={displayName} isLocal micOn={micOn} videoOn={camOn} />
              {remotePeerIds.map(pid => (
                <VideoTile key={pid} stream={remoteStreams[pid]}
                  name={remoteNames[pid]||pid}
                  micOn={remoteMic[pid]!==false} videoOn={true} />
              ))}
            </div>
          </div>

          {/* Sidebar — sticky, scrolls within itself */}
          <div className={`vc-sidebar${sidebarOpen?" mobile-open":""}`}>
            <div className="vc-sidebar__tab-bar">
              {["chat","people","invite"].map(t => (
                <button key={t} className={`vc-sidebar__tab${sidebarTab===t?" active":""}`}
                  onClick={() => { setSidebarTab(t); if(t==="chat") setUnread(0); }}>
                  {t==="chat"?"💬 Chat":t==="people"?"👥 People":"🔔 Invite"}
                </button>
              ))}
              <button onClick={() => setSidebarOpen(false)}
                style={{ background:"none",border:"none",color:"#475569",cursor:"pointer",padding:"0 10px",fontSize:18 }}>✕</button>
            </div>
            <div className="vc-sidebar__body">
              {sidebarTab === "chat" && (
                <>
                  <div className="vc-chat__messages">
                    {chatLog.length===0 && <div className="vc-chat__empty">No messages yet</div>}
                    {chatLog.map((m,i) => (
                      <div key={i}>
                        <div className="vc-chat__msg-name">{m.from}</div>
                        <div className="vc-chat__msg-bubble">{m.text}</div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="vc-chat__input-row">
                    <input className="vc-chat__input" value={chatMsg}
                      onChange={e => setChatMsg(e.target.value)}
                      onKeyDown={e => e.key==="Enter" && sendChat()}
                      placeholder="Message…" />
                    <button className="vc-chat__send" onClick={sendChat}>→</button>
                  </div>
                </>
              )}
              {sidebarTab === "people" && (
                <div className="vc-peers__list">
                  <div className="vc-peer-row">
                    <div className="vc-peer-row__avatar">{initials(displayName)}</div>
                    <div className="vc-peer-row__name">{displayName}</div>
                    <div className="vc-peer-row__you">you</div>
                  </div>
                  {remotePeerIds.map(pid => (
                    <div key={pid} className="vc-peer-row">
                      <div className="vc-peer-row__avatar">{initials(remoteNames[pid]||pid)}</div>
                      <div className="vc-peer-row__name">{remoteNames[pid]||pid}</div>
                    </div>
                  ))}
                </div>
              )}
              {sidebarTab === "invite" && (
                <div className="vc-invite">
                  <div className="vc-invite__desc">Share the room code or send a push notification to invite someone.</div>
                  <div>
                    <div className="vc-label" style={{ marginBottom:6 }}>Room code</div>
                    <div style={{ display:"flex", gap:8 }}>
                      <input className="vc-input" value={roomId} readOnly style={{ flex:1 }} />
                      <button className="vc-btn-sm vc-btn-ghost" onClick={copyRoom}
                        style={{ background:"rgba(255,255,255,0.07)",color:"#94a3b8",border:"1px solid rgba(255,255,255,0.1)" }}>
                        {copied?"✓":"Copy"}
                      </button>
                    </div>
                  </div>
                  <div style={{ borderTop:"1px solid var(--border)", paddingTop:10 }}>
                    <div className="vc-label" style={{ marginBottom:6 }}>Push notification</div>
                    {!pushEnabled ? (
                      <>
                        <button className="vc-btn vc-btn-ghost" style={{ marginBottom:6 }} onClick={enablePush}>🔔 Enable Push</button>
                        {pushStatus && <div style={{ fontSize:12, color:"#64748b" }}>{pushStatus}</div>}
                      </>
                    ) : (
                      <>
                        <input className="vc-input" value={notifyTarget}
                          onChange={e => setNotifyTarget(e.target.value)}
                          placeholder="Recipient user ID" style={{ marginBottom:8 }} />
                        <button className="vc-btn vc-btn-primary" onClick={sendInvite}>Send Invite</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fixed controls bar at bottom */}
        <div className="vc-controls">
          <CtrlBtn onClick={toggleMic} variant={micOn?"normal":"off"} title={micOn?"Mute":"Unmute"} icon={micOn?"🎙️":"🔇"} />
          <CtrlBtn onClick={toggleCam} variant={camOn?"normal":"off"} title={camOn?"Stop camera":"Start camera"} icon={camOn?"📷":"📵"} />
          <CtrlBtn onClick={sharing?stopShare:startShare} variant={sharing?"active":"normal"} title={sharing?"Stop sharing":"Share screen"} icon="🖥️" />
          <CtrlBtn
            onClick={() => { setSidebarOpen(o=>!o); setSidebarTab("chat"); setUnread(0); }}
            variant={sidebarOpen?"active":"normal"} title="Chat" icon="💬"
            badge={unread>0?unread:null} />
          <div style={{ width:1, height:32, background:"rgba(255,255,255,0.1)", margin:"0 4px" }} />
          <CtrlBtn onClick={leaveCall} variant="danger" title="Leave call" icon="📵" />
        </div>
      </div>
    </div>
  );
}