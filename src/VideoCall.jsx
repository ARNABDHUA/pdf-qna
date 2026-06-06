/**
 * VideoCall.jsx – v2: mobile screen share + camera rotate + shareable link
 *
 * NEW FEATURES:
 *
 * FEATURE 1 — Mobile screen share
 * ──────────────────────────────────────────────────────────────────────────────
 * getDisplayMedia is attempted as before; on iOS/older Android where it throws,
 * we show a friendly "not supported on this browser" toast instead of crashing.
 * The 🖥️ share button is shown on all devices but degrades gracefully.
 *
 * FEATURE 2 — Rotate camera (mobile only)
 * ──────────────────────────────────────────────────────────────────────────────
 * A 🔄 button appears only on touch devices (detected via 'ontouchstart' in window).
 * It toggles facingMode between "user" (front) and "environment" (rear), replaces
 * the video track on all active peer connections, and updates the local preview.
 *
 * FEATURE 3 — Shareable link with room pre-fill
 * ──────────────────────────────────────────────────────────────────────────────
 * When a room is created or joined, the URL is updated to include ?room=ROOMID.
 * On load, if ?room= is present the lobby auto-switches to the "Join" tab and
 * pre-fills the room code. Recipients just open the link, type their name (and
 * password if the room is private), and hit Join.
 * A "Copy Link" button in the call header lets the host share it instantly.
 */

import { useState, useEffect, useRef, useCallback } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
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
function diagnoseCameraEnv() {
  const issues = [];
  if (typeof window === "undefined") return issues;
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (location.protocol !== "https:" && !isLocalhost) issues.push("HTTPS_REQUIRED");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) issues.push("API_UNAVAILABLE");
  return issues;
}

// Detect touch/mobile device
function isMobileDevice() {
  return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
}

// Read ?room= from URL for shareable links
function getRoomFromUrl() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return (params.get("room") || "").toUpperCase();
}

// Update URL without reload
function setRoomInUrl(roomId) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  window.history.replaceState({}, "", url.toString());
}

function clearRoomFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url.toString());
}

function buildShareLink(roomId) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  return url.toString();
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #070a10;
    --surface: #0c1018;
    --surface2: rgba(255,255,255,0.04);
    --border: rgba(255,255,255,0.07);
    --accent: #3b82f6;
    --accent2: #93c5fd;
    --green: #10b981;
    --red: #ef4444;
    --amber: #f59e0b;
    --text: #e2e8f0;
    --text2: #94a3b8;
    --text3: #475569;
    --tile-radius: 14px;
  }

  html, body { height: 100%; overflow: hidden; background: var(--bg); }

  .vc-root {
    background: var(--bg);
    font-family: 'Syne', system-ui, sans-serif;
    color: var(--text);
    height: 100%;
  }

  /* ── TOAST ── */
  .vc-toast {
    position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
    background: rgba(15,23,42,0.95); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px; padding: 10px 18px;
    font-size: 13px; color: var(--text2);
    backdrop-filter: blur(12px);
    z-index: 9999; white-space: nowrap;
    animation: toastIn .2s ease;
    pointer-events: none;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  @keyframes toastIn { from { opacity:0; transform: translateX(-50%) translateY(8px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }

  /* ── LOBBY ── */
  .vc-lobby {
    height: 100%;
    overflow-y: auto;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 24px 16px 48px;
    background:
      radial-gradient(ellipse at 20% 10%, rgba(59,130,246,0.15) 0%, transparent 55%),
      radial-gradient(ellipse at 80% 90%, rgba(16,185,129,0.08) 0%, transparent 55%),
      var(--bg);
  }
  .vc-lobby__card {
    width: 100%; max-width: 440px;
    background: rgba(255,255,255,0.025);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 28px 24px;
    backdrop-filter: blur(12px);
  }
  .vc-lobby__brand { text-align: center; margin-bottom: 24px; }
  .vc-lobby__brand-icon { font-size: 38px; display: block; margin-bottom: 8px; }
  .vc-lobby__title { font-size: 24px; font-weight: 800; color: #f1f5f9; letter-spacing: -0.5px; }
  .vc-lobby__sub { font-size: 13px; color: var(--text3); margin-top: 3px; font-family: 'DM Mono', monospace; }

  .vc-preview {
    position: relative;
    width: 100%; aspect-ratio: 16/9;
    background: #0d131f;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 12px;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--border);
  }
  .vc-preview video {
    width: 100%; height: 100%;
    object-fit: cover; transform: scaleX(-1);
  }
  .vc-preview__overlay {
    display: flex; flex-direction: column;
    align-items: center; gap: 6px; padding: 20px; text-align: center;
  }
  .vc-preview__overlay-icon { font-size: 34px; }
  .vc-preview__overlay-text { font-size: 13px; color: var(--text3); }
  .vc-preview__overlay-sub { font-size: 12px; color: #334155; line-height: 1.5; }
  .vc-preview__btns {
    position: absolute; bottom: 10px; left: 50%;
    transform: translateX(-50%);
    display: flex; gap: 8px;
  }

  .vc-banner {
    border-radius: 10px; padding: 10px 13px;
    font-size: 13px; margin-bottom: 12px; line-height: 1.6;
  }
  .vc-banner--error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #f87171; }
  .vc-banner--warn { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); color: #fbbf24; }
  .vc-banner--ok { background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); color: #34d399; font-size: 12px; text-align: center; }
  .vc-banner__actions { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }

  .vc-field { margin-bottom: 13px; }
  .vc-label {
    display: block; font-size: 11px; font-weight: 700;
    color: var(--text3); margin-bottom: 5px;
    text-transform: uppercase; letter-spacing: 0.08em;
    font-family: 'DM Mono', monospace;
  }
  .vc-input {
    width: 100%; padding: 10px 13px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 10px; color: #f1f5f9;
    font-size: 14px; font-family: inherit; outline: none;
    transition: border-color .15s;
  }
  .vc-input:focus { border-color: rgba(59,130,246,0.5); }
  .vc-input::placeholder { color: #2d3748; }

  .vc-tabs {
    display: flex; background: rgba(255,255,255,0.03);
    border-radius: 10px; padding: 3px; margin-bottom: 16px;
  }
  .vc-tab {
    flex: 1; padding: 8px; border: none; border-radius: 8px;
    background: transparent; color: var(--text3);
    font-size: 13px; font-weight: 700; cursor: pointer;
    transition: all .15s; font-family: inherit;
  }
  .vc-tab.active { background: rgba(59,130,246,0.2); color: var(--accent2); }

  .vc-btn {
    width: 100%; padding: 12px; border: none; border-radius: 10px;
    font-size: 14px; font-weight: 700; cursor: pointer;
    font-family: inherit; transition: all .15s;
  }
  .vc-btn-primary { background: var(--accent); color: #fff; }
  .vc-btn-primary:hover:not(:disabled) { background: #2563eb; transform: translateY(-1px); }
  .vc-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .vc-btn-ghost {
    background: rgba(255,255,255,0.05); color: var(--text2);
    border: 1px solid var(--border);
  }
  .vc-btn-ghost:hover { background: rgba(255,255,255,0.09); color: var(--text); }
  .vc-btn-sm {
    padding: 6px 12px; border-radius: 8px;
    font-size: 12px; font-weight: 700; border: none;
    cursor: pointer; font-family: inherit; transition: all .15s; white-space: nowrap;
  }

  /* Shareable link banner in lobby */
  .vc-link-banner {
    display: flex; align-items: center; gap: 8px;
    background: rgba(59,130,246,0.07);
    border: 1px solid rgba(59,130,246,0.18);
    border-radius: 10px; padding: 9px 12px;
    margin-bottom: 14px;
  }
  .vc-link-banner__text {
    flex: 1; font-size: 12px; color: var(--accent2);
    font-family: 'DM Mono', monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .vc-link-banner__icon { font-size: 16px; flex-shrink: 0; }

  /* ── CALL LAYOUT ── */
  .vc-call {
    display: flex; flex-direction: column;
    height: 100%; overflow: hidden;
  }

  .vc-header {
    flex-shrink: 0;
    display: flex; align-items: center;
    justify-content: space-between;
    padding: 9px 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    gap: 8px; flex-wrap: wrap;
    min-height: 48px;
  }
  .vc-header__left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
  .vc-header__room {
    font-family: 'DM Mono', monospace;
    font-size: 12px; font-weight: 500; letter-spacing: 2px;
    background: rgba(59,130,246,0.12); color: var(--accent2);
    border-radius: 6px; padding: 3px 9px; cursor: pointer;
    border: 1px solid rgba(59,130,246,0.2); user-select: all;
    white-space: nowrap;
  }
  .vc-header__info { font-size: 11px; color: var(--text3); white-space: nowrap; }
  .vc-header__name { font-size: 12px; color: var(--text2); font-weight: 600; white-space: nowrap; }
  .vc-header__share-btn {
    padding: 4px 10px; border-radius: 6px; border: none;
    background: rgba(16,185,129,0.15); color: #34d399;
    font-size: 11px; font-weight: 700; cursor: pointer;
    font-family: 'DM Mono', monospace; white-space: nowrap;
    border: 1px solid rgba(16,185,129,0.2); transition: all .15s;
  }
  .vc-header__share-btn:hover { background: rgba(16,185,129,0.25); }

  .vc-body {
    flex: 1; display: flex;
    overflow: hidden; position: relative;
  }

  .vc-grid-wrap {
    flex: 1; padding: 12px;
    overflow-y: auto; min-width: 0;
    padding-bottom: 12px;
    display: flex; flex-direction: column; gap: 10px;
  }

  /* Pinned tile */
  .vc-pinned-wrap {
    width: 100%; flex-shrink: 0;
  }
  .vc-pinned-wrap .vc-tile {
    aspect-ratio: 16/9;
    border: 2px solid var(--accent);
    box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
  }

  .vc-grid {
    display: grid; gap: 10px; align-items: start;
  }
  .vc-grid[data-count="1"] { grid-template-columns: 1fr; }
  .vc-grid[data-count="2"] { grid-template-columns: repeat(2, 1fr); }
  .vc-grid[data-count="3"],
  .vc-grid[data-count="4"] { grid-template-columns: repeat(2, 1fr); }
  .vc-grid[data-count="5"],
  .vc-grid[data-count="6"] { grid-template-columns: repeat(3, 1fr); }

  @media (max-width: 640px) {
    .vc-grid[data-count="2"],
    .vc-grid[data-count="3"],
    .vc-grid[data-count="4"],
    .vc-grid[data-count="5"],
    .vc-grid[data-count="6"] { grid-template-columns: 1fr; }
  }
  @media (min-width: 641px) and (max-width: 900px) {
    .vc-grid[data-count="5"],
    .vc-grid[data-count="6"] { grid-template-columns: repeat(2, 1fr); }
  }

  /* ── VIDEO TILE ── */
  .vc-tile {
    position: relative;
    background: #0d131f;
    border-radius: var(--tile-radius);
    overflow: hidden;
    aspect-ratio: 4/3;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--border);
    cursor: pointer;
    transition: border-color .2s, box-shadow .2s;
  }
  .vc-tile:hover { border-color: rgba(59,130,246,0.4); }
  .vc-tile:hover .vc-tile__pin-hint { opacity: 1; }
  .vc-tile--screen { aspect-ratio: 16/9; }
  .vc-tile video { width: 100%; height: 100%; object-fit: cover; }
  .vc-tile video.mirror { transform: scaleX(-1); }

  .vc-tile__avatar {
    position: absolute;
    width: 52px; height: 52px; border-radius: 50%;
    background: rgba(59,130,246,0.15);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 800; color: var(--accent2);
    letter-spacing: 1px; font-family: 'Syne', sans-serif;
  }
  .vc-tile__label {
    position: absolute; bottom: 8px; left: 8px;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
    border-radius: 6px; padding: 3px 8px;
    font-size: 11px; color: var(--text);
    display: flex; align-items: center; gap: 5px;
    max-width: calc(100% - 16px);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-family: 'DM Mono', monospace;
  }
  .vc-tile__muted { color: #f87171; }

  .vc-tile__pin-hint {
    position: absolute; top: 8px; right: 8px;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
    border-radius: 6px; padding: 3px 7px;
    font-size: 11px; color: rgba(255,255,255,0.6);
    opacity: 0; transition: opacity .2s;
    pointer-events: none;
  }
  .vc-tile__unpin-btn {
    position: absolute; top: 8px; right: 8px;
    background: rgba(59,130,246,0.8); backdrop-filter: blur(4px);
    border: none; border-radius: 6px; padding: 4px 9px;
    font-size: 11px; color: #fff; cursor: pointer;
    font-family: 'DM Mono', monospace; font-weight: 500;
    transition: background .15s;
  }
  .vc-tile__unpin-btn:hover { background: rgba(59,130,246,1); }

  /* ── SIDEBAR ── */
  .vc-sidebar {
    width: 272px; flex-shrink: 0;
    background: var(--surface);
    border-left: 1px solid var(--border);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  @media (max-width: 768px) {
    .vc-sidebar {
      display: none;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      width: 100%;
      top: auto;
      height: 65vh;
      border-left: none;
      border-top: 1px solid var(--border);
      border-radius: 18px 18px 0 0;
      z-index: 200;
      box-shadow: 0 -20px 60px rgba(0,0,0,0.5);
    }
    .vc-sidebar.mobile-open { display: flex; }
  }
  .vc-sidebar__drag-handle {
    display: none;
    width: 36px; height: 4px;
    background: rgba(255,255,255,0.15);
    border-radius: 2px; margin: 10px auto 6px;
    flex-shrink: 0;
  }
  @media (max-width: 768px) { .vc-sidebar__drag-handle { display: block; } }

  .vc-sidebar__tab-bar {
    display: flex; border-bottom: 1px solid var(--border);
    flex-shrink: 0; align-items: center;
  }
  .vc-sidebar__tab {
    flex: 1; padding: 10px 6px; border: none; background: transparent;
    color: var(--text3); font-size: 12px; font-weight: 700;
    cursor: pointer; font-family: inherit;
    border-bottom: 2px solid transparent; transition: all .15s;
  }
  .vc-sidebar__tab.active { color: var(--accent2); border-bottom-color: var(--accent2); }
  .vc-sidebar__close {
    background: none; border: none; color: var(--text3);
    cursor: pointer; padding: 0 12px; font-size: 16px;
    flex-shrink: 0;
  }
  .vc-sidebar__body {
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column;
  }

  .vc-chat__messages {
    flex: 1; padding: 12px;
    display: flex; flex-direction: column; gap: 10px; overflow-y: auto;
  }
  .vc-chat__empty { color: var(--text3); font-size: 13px; text-align: center; margin-top: 24px; }
  .vc-chat__msg-name { font-size: 11px; color: var(--text3); margin-bottom: 2px; font-family: 'DM Mono', monospace; }
  .vc-chat__msg-bubble {
    background: rgba(255,255,255,0.04); border-radius: 8px;
    padding: 7px 10px; font-size: 13px; color: #cbd5e1; word-break: break-word;
    border: 1px solid var(--border);
  }
  .vc-chat__input-row {
    display: flex; gap: 6px; padding: 10px;
    border-top: 1px solid var(--border); flex-shrink: 0;
  }
  .vc-chat__input {
    flex: 1; padding: 8px 10px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; color: var(--text);
    font-size: 13px; font-family: inherit; outline: none;
  }
  .vc-chat__input:focus { border-color: rgba(59,130,246,0.4); }
  .vc-chat__send {
    padding: 8px 14px; background: var(--accent); color: #fff;
    border: none; border-radius: 8px; cursor: pointer;
    font-size: 14px; font-weight: 700; transition: background .15s;
  }
  .vc-chat__send:hover { background: #2563eb; }

  .vc-peers__list { padding: 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
  .vc-peer-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; background: rgba(255,255,255,0.03); border-radius: 8px;
  }
  .vc-peer-row__avatar {
    width: 30px; height: 30px; border-radius: 50%;
    background: rgba(59,130,246,0.15);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800; color: var(--accent2); flex-shrink: 0;
  }
  .vc-peer-row__name { font-size: 13px; color: #cbd5e1; flex: 1; }
  .vc-peer-row__you { font-size: 11px; color: var(--text3); font-family: 'DM Mono', monospace; }

  .vc-invite { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .vc-invite__desc { font-size: 12px; color: var(--text3); line-height: 1.5; }
  .vc-invite__link-box {
    display: flex; gap: 8px; align-items: center;
  }
  .vc-invite__link-input {
    flex: 1; padding: 8px 10px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; color: var(--text2);
    font-size: 11px; font-family: 'DM Mono', monospace; outline: none;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* ── CONTROLS ── */
  .vc-controls {
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    gap: 8px; padding: 12px 14px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .vc-ctrl-btn {
    width: 44px; height: 44px; border-radius: 50%; border: none;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 17px; transition: all .15s; flex-shrink: 0;
    position: relative;
  }
  .vc-ctrl-btn--normal { background: rgba(255,255,255,0.09); }
  .vc-ctrl-btn--normal:hover { background: rgba(255,255,255,0.16); }
  .vc-ctrl-btn--active { background: rgba(59,130,246,0.3); }
  .vc-ctrl-btn--off { background: rgba(239,68,68,0.25); }
  .vc-ctrl-btn--danger { background: var(--red); }
  .vc-ctrl-btn--danger:hover { background: #b91c1c; }
  .vc-ctrl-sep { width: 1px; height: 28px; background: rgba(255,255,255,0.08); }
  .vc-ctrl-badge {
    position: absolute; top: -2px; right: -2px;
    background: var(--accent); color: #fff; border-radius: 50%;
    width: 16px; height: 16px; font-size: 10px;
    display: flex; align-items: center; justify-content: center;
    font-family: 'DM Mono', monospace;
  }

  @media (max-width: 400px) {
    .vc-ctrl-btn { width: 40px; height: 40px; font-size: 15px; }
    .vc-controls { gap: 6px; padding: 10px 8px; }
  }

  /* ── Mobile overlay backdrop ── */
  .vc-backdrop {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 199;
  }
  @media (max-width: 768px) {
    .vc-backdrop.show { display: block; }
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

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message }) {
  if (!message) return null;
  return <div className="vc-toast">{message}</div>;
}

// ── VideoTile ─────────────────────────────────────────────────────────────────
function VideoTile({ stream, name, isLocal, micOn = true, videoOn = true, isScreen, isPinned, onPin, onUnpin }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream || null;
  }, [stream]);

  const showVideo = !!stream && (isScreen || videoOn);

  return (
    <div
      className={`vc-tile${isScreen ? " vc-tile--screen" : ""}`}
      onClick={isPinned ? onUnpin : onPin}
    >
      <video
        ref={videoRef}
        autoPlay playsInline muted={isLocal}
        className={isLocal && !isScreen ? "mirror" : ""}
        style={{ display: showVideo ? "block" : "none" }}
      />
      <div className="vc-tile__avatar" style={{ display: showVideo ? "none" : "flex" }}>
        {initials(name)}
      </div>
      <div className="vc-tile__label">
        {!micOn && <span className="vc-tile__muted">🔇</span>}
        {name}{isLocal ? " (you)" : ""}{isScreen ? " · screen" : ""}
      </div>
      {isPinned ? (
        <button className="vc-tile__unpin-btn" onClick={e => { e.stopPropagation(); onUnpin(); }}>
          ✕ Unpin
        </button>
      ) : (
        <div className="vc-tile__pin-hint">📌 Pin</div>
      )}
    </div>
  );
}

// ── MediaBanner ───────────────────────────────────────────────────────────────
function MediaBanner({ status, onRetry, onAudioOnly }) {
  if (status === "ok") return <div className="vc-banner vc-banner--ok">✅ Camera &amp; microphone ready</div>;
  if (status === "audio-only") return <div className="vc-banner vc-banner--ok">🎙️ Microphone only — you can still join</div>;
  if (status === "https") return (
    <div className="vc-banner vc-banner--warn">
      <b>Camera requires HTTPS.</b>
      <div className="vc-banner__actions">
        <button className="vc-btn-sm" onClick={onAudioOnly} style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>🎙️ Audio only</button>
      </div>
    </div>
  );
  if (status === "denied") return (
    <div className="vc-banner vc-banner--warn">
      <b>Permission denied.</b> Allow camera &amp; mic then reload.
      <div className="vc-banner__actions">
        <button className="vc-btn-sm" onClick={onRetry} style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>🔄 Retry</button>
        <button className="vc-btn-sm" onClick={onAudioOnly} style={{ background: "rgba(255,255,255,0.07)", color: "#94a3b8" }}>🎙️ Audio only</button>
      </div>
    </div>
  );
  if (status === "notfound") return (
    <div className="vc-banner vc-banner--warn">
      <b>No camera found.</b>
      <div className="vc-banner__actions">
        <button className="vc-btn-sm" onClick={onRetry} style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>🔄 Retry</button>
        <button className="vc-btn-sm" onClick={onAudioOnly} style={{ background: "rgba(255,255,255,0.07)", color: "#94a3b8" }}>🎙️ Audio only</button>
      </div>
    </div>
  );
  if (status === "unavailable") return (
    <div className="vc-banner vc-banner--error">
      ⚠️ Camera API unavailable. Use a modern browser over HTTPS.
      <div className="vc-banner__actions">
        <button className="vc-btn-sm" onClick={onAudioOnly} style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}>Continue anyway</button>
      </div>
    </div>
  );
  if (status === "loading") return (
    <div className="vc-banner" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", color: "var(--text3)", fontSize: 13, textAlign: "center" }}>
      ⏳ Requesting camera &amp; microphone…
    </div>
  );
  if (status === "error") return (
    <div className="vc-banner vc-banner--error">
      ⚠️ Could not access camera/mic.
      <div className="vc-banner__actions">
        <button className="vc-btn-sm" onClick={onRetry} style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}>🔄 Retry</button>
        <button className="vc-btn-sm" onClick={onAudioOnly} style={{ background: "rgba(255,255,255,0.07)", color: "#94a3b8" }}>🎙️ Audio only</button>
      </div>
    </div>
  );
  return null;
}

function CtrlBtn({ onClick, variant = "normal", title, icon, badge }) {
  return (
    <button className={`vc-ctrl-btn vc-ctrl-btn--${variant}`} onClick={onClick} title={title}>
      {icon}
      {badge && <span className="vc-ctrl-badge">{badge}</span>}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VideoCall({ backendUrl = "https://pdf-qna-backend.onrender.com" }) {
  // ── FEATURE 3: pre-fill room from URL ──────────────────────────────────────
  const urlRoom = getRoomFromUrl();

  const [tab, setTab]                       = useState(urlRoom ? "join" : "create");
  const [displayName, setDisplayName]       = useState("");
  const [roomInput, setRoomInput]           = useState(urlRoom);
  const [createPassword, setCreatePassword] = useState("");
  const [joinPassword, setJoinPassword]     = useState("");
  const [lobbyError, setLobbyError]         = useState("");

  const [mediaStatus, setMediaStatus]   = useState("loading");
  const [lobbyStream, setLobbyStream]   = useState(null);
  const [lobbyMic, setLobbyMic]         = useState(true);
  const [lobbyCam, setLobbyCam]         = useState(true);
  const streamRef = useRef(null);

  // ── FEATURE 2: camera facing mode ─────────────────────────────────────────
  const [facingMode, setFacingMode]         = useState("user"); // "user" | "environment"
  const isMobile                            = isMobileDevice();
  const rotatingRef                         = useRef(false);

  // Toast state
  const [toast, setToast] = useState("");
  const toastTimerRef     = useRef(null);

  function showToast(msg, ms = 2800) {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), ms);
  }

  const previewVideoRef = useCallback((el) => {
    if (el && streamRef.current) el.srcObject = streamRef.current;
  }, []);

  const [inCall, setInCall]               = useState(false);
  const [roomId, setRoomId]               = useState("");
  const [peerId]                          = useState(randomId);
  const [status, setStatus]               = useState("");
  const [localStream, setLocalStream]     = useState(null);
  const [screenStream, setScreenStream]   = useState(null);
  const [remoteStreams, setRemoteStreams]  = useState({});
  const [remoteNames, setRemoteNames]     = useState({});
  const [micOn, setMicOn]                 = useState(true);
  const [camOn, setCamOn]                 = useState(true);
  const [sharing, setSharing]             = useState(false);
  const [sidebarTab, setSidebarTab]       = useState("chat");
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [chatLog, setChatLog]             = useState([]);
  const [chatMsg, setChatMsg]             = useState("");
  const [unread, setUnread]               = useState(0);
  const [copied, setCopied]               = useState(false);
  const [copiedLink, setCopiedLink]       = useState(false);
  const [notifyTarget, setNotifyTarget]   = useState("");
  const [pushEnabled, setPushEnabled]     = useState(false);
  const [pushStatus, setPushStatus]       = useState("");
  const [pinnedId, setPinnedId]           = useState(null);

  const chatEndRef      = useRef(null);
  const wsRef           = useRef(null);
  const pcsRef          = useRef({});
  const iceQRef         = useRef({});
  const peerStreamsRef   = useRef({});
  const localStreamRef  = useRef(null);
  const sharingRef      = useRef(false);
  const screenTrackRef  = useRef(null);
  const screenStreamRef = useRef(null);
  const displayNameRef  = useRef("");
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

  // Escape key to unpin
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setPinnedId(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── media helpers ─────────────────────────────────────────────────────────

  function applyStream(s) {
    streamRef.current = s;
    setLobbyStream(s);
    const el = document.querySelector(".vc-preview video");
    if (el) el.srcObject = s;
  }

  async function requestMedia(facing = "user") {
    const envIssues = diagnoseCameraEnv();
    if (envIssues.includes("HTTPS_REQUIRED")) { setMediaStatus("https"); return; }
    if (envIssues.includes("API_UNAVAILABLE")) { setMediaStatus("unavailable"); return; }
    setMediaStatus("loading");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: true,
      });
      applyStream(s); setMediaStatus("ok");
    } catch (err) {
      const n = err.name;
      if (n === "NotAllowedError" || n === "PermissionDeniedError") {
        setMediaStatus("denied");
      } else if (n === "NotFoundError" || n === "DevicesNotFoundError") {
        setMediaStatus("notfound");
        await requestAudioOnly();
      } else {
        setMediaStatus("error");
        await requestAudioOnly();
      }
    }
  }

  async function requestAudioOnly() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      applyStream(s); setMediaStatus("audio-only"); setLobbyCam(false);
    } catch { setMediaStatus("error"); }
  }

  useEffect(() => {
    requestMedia("user");
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

  // ── FEATURE 2: rotate camera ──────────────────────────────────────────────
  // Works in lobby (replaces preview) and in-call (replaces local track on all PCs).
  async function rotateCamera() {
    if (rotatingRef.current) return;
    rotatingRef.current = true;
    const nextFacing = facingMode === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: nextFacing } },
        audio: true,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];

      if (inCall) {
        // Stop old video tracks on local stream
        localStreamRef.current?.getVideoTracks().forEach(t => t.stop());

        // Replace video track on all peer connections
        for (const pid of Object.keys(pcsRef.current)) {
          const pc = pcsRef.current[pid];
          const sender = pc.getSenders().find(s => s.track?.kind === "video");
          if (sender && newVideoTrack) await sender.replaceTrack(newVideoTrack);
        }

        // Build a new local stream with new video + existing audio
        const existingAudio = localStreamRef.current?.getAudioTracks()[0];
        const combined = new MediaStream([
          existingAudio || newAudioTrack,
          newVideoTrack,
        ].filter(Boolean));
        localStreamRef.current = combined;
        setLocalStream(combined);

        // Stop the extra audio track from newStream if we reused existing
        if (existingAudio) newAudioTrack?.stop();
      } else {
        // Lobby: just replace preview stream
        streamRef.current?.getTracks().forEach(t => t.stop());
        applyStream(newStream);
      }

      setFacingMode(nextFacing);
      showToast(nextFacing === "environment" ? "📷 Rear camera" : "🤳 Front camera");
    } catch (e) {
      // Some devices only have one camera or don't support exact constraint
      showToast("⚠️ Cannot switch camera");
      console.warn("rotateCamera failed:", e);
    }
    rotatingRef.current = false;
  }

  // ── join / create ─────────────────────────────────────────────────────────

  async function handleCreate() {
    const name = displayName.trim();
    if (!name) { setLobbyError("Please enter your name."); return; }
    setLobbyError("");
    try {
      const res = await fetch(`${urlBase(backendUrl)}/videocall/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: createPassword || null, host_id: peerId }),
      });
      const data = await res.json();
      await enterCall(data.room_id, createPassword);
    } catch { setLobbyError("Could not create room. Is the server running?"); }
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
    } catch { setLobbyError("Room not found or server unreachable."); return; }
    await enterCall(rid, joinPassword);
  }

  async function enterCall(rid, password) {
    let stream = streamRef.current;
    if (!stream) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); applyStream(stream); }
      catch {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }); applyStream(stream); }
        catch { stream = null; }
      }
    }
    if (stream) {
      stream.getAudioTracks().forEach(t => t.enabled = lobbyMic);
      stream.getVideoTracks().forEach(t => t.enabled = lobbyCam);
    }
    localStreamRef.current = stream;
    setLocalStream(stream); setMicOn(lobbyMic); setCamOn(lobbyCam);
    setRoomId(rid); setInCall(true); setStatus("Connecting…");

    // FEATURE 3: update URL so it's shareable
    setRoomInUrl(rid);

    const name = displayName.trim();
    const wsUrl = `${wsBase(backendUrl)}/ws/videocall/${rid}/${peerId}`
      + `?name=${encodeURIComponent(name)}`
      + (password ? `&password=${encodeURIComponent(password)}` : "");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen    = () => setStatus(`In room ${rid}`);
    ws.onmessage = (e) => handleMsg(JSON.parse(e.data));
    ws.onerror   = () => setStatus("Connection error");
    ws.onclose   = (e) => {
      if (e.code === 4003) setLobbyError("Wrong password — kicked from room.");
      setStatus("Disconnected");
    };
  }

  // ── signaling ─────────────────────────────────────────────────────────────

  function handleMsg(msg) {
    switch (msg.type) {
      case "peers":
        msg.peers.forEach(({ id, name }) => {
          setRemoteNames(p => ({ ...p, [id]: name }));
          initOffer(id);
        });
        break;
      case "peer_joined":
        setRemoteNames(p => ({ ...p, [msg.from]: msg.name }));
        setStatus(`${msg.name} joined`);
        break;
      case "peer_left":
        setStatus(`${msg.from} left`);
        pcsRef.current[msg.from]?.close();
        delete pcsRef.current[msg.from];
        delete peerStreamsRef.current[msg.from];
        setRemoteStreams(p => { const n = { ...p }; delete n[msg.from]; return n; });
        setRemoteNames(p => { const n = { ...p }; delete n[msg.from]; return n; });
        setPinnedId(prev => prev === msg.from ? null : prev);
        break;
      case "offer":  handleOffer(msg); break;
      case "answer":
        pcsRef.current[msg.from]?.setRemoteDescription(msg.payload)
          .then(() => flushIce(msg.from))
          .catch(console.error);
        break;
      case "ice": {
        const pc = pcsRef.current[msg.from];
        if (pc?.remoteDescription) {
          pc.addIceCandidate(msg.payload).catch(() => {});
        } else {
          (iceQRef.current[msg.from] ??= []).push(msg.payload);
        }
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

  function makePc(pid) {
    if (pcsRef.current[pid]) pcsRef.current[pid].close();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current[pid] = pc;

    const stream      = localStreamRef.current;
    const audioTrack  = stream?.getAudioTracks()[0] || null;
    const isSharing   = sharingRef.current && screenTrackRef.current;
    const videoTrack  = isSharing
      ? screenTrackRef.current
      : (stream?.getVideoTracks()[0] || null);
    const videoStream = isSharing ? screenStreamRef.current : stream;

    if (audioTrack) {
      pc.addTrack(audioTrack, stream);
    } else {
      pc.addTransceiver("audio", { direction: "sendrecv" });
    }

    if (videoTrack) {
      pc.addTrack(videoTrack, videoStream);
    } else {
      pc.addTransceiver("video", { direction: "sendrecv" });
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ice", to: pid, payload: candidate }));
      }
    };

    pc.ontrack = (event) => {
      if (!peerStreamsRef.current[pid]) peerStreamsRef.current[pid] = new MediaStream();
      const peerStream = peerStreamsRef.current[pid];
      const existingIds = peerStream.getTracks().map(t => t.id);
      if (!existingIds.includes(event.track.id)) peerStream.addTrack(event.track);
      const freshStream = new MediaStream(peerStream.getTracks());
      peerStreamsRef.current[pid] = freshStream;
      setRemoteStreams(prev => ({ ...prev, [pid]: freshStream }));
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        delete peerStreamsRef.current[pid];
        setRemoteStreams(p => { const n = { ...p }; delete n[pid]; return n; });
      }
    };

    return pc;
  }

  async function renegotiate(pid) {
    const pc = pcsRef.current[pid];
    if (!pc || pc.signalingState === "closed") return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "offer", to: pid, payload: offer }));
      }
    } catch (e) { console.warn("renegotiate failed for", pid, e); }
  }

  async function initOffer(pid) {
    const pc = makePc(pid);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "offer", to: pid, payload: offer }));
      }
    } catch (e) { console.error("initOffer failed", e); }
  }

  async function handleOffer(msg) {
    const pc = makePc(msg.from);
    try {
      await pc.setRemoteDescription(msg.payload);
      await flushIce(msg.from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "answer", to: msg.from, payload: answer }));
      }
    } catch (e) { console.error("handleOffer failed", e); }
  }

  async function flushIce(pid) {
    const pc = pcsRef.current[pid];
    if (!pc) return;
    for (const c of (iceQRef.current[pid] || [])) {
      try { await pc.addIceCandidate(c); } catch {}
    }
    iceQRef.current[pid] = [];
  }

  // ── controls ──────────────────────────────────────────────────────────────

  function toggleMic() {
    localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = !micOn);
    setMicOn(v => !v);
  }
  function toggleCam() {
    localStreamRef.current?.getVideoTracks().forEach(t => t.enabled = !camOn);
    setCamOn(v => !v);
  }

  // ── FEATURE 1: screen share with mobile-friendly error handling ───────────
  async function startShare() {
    // Android Chrome rule: getDisplayMedia MUST be called synchronously within
    // the user-gesture handler — zero awaits allowed before it, or Chrome
    // silently rejects with NotAllowedError / InvalidStateError on real devices
    // (even though DevTools device-emulation works fine because it relaxes this rule).

    // Quick sync checks — no awaits, so gesture chain is preserved
    if (!window.isSecureContext) {
      showToast("⚠️ Screen share needs HTTPS.", 4000);
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast("⚠️ Screen share not supported on this browser.", 4000);
      return;
    }

    // Call getDisplayMedia IMMEDIATELY — first thing after sync checks.
    // On Android Chrome the user-gesture token expires after the first await,
    // so this must happen before any async work.
    // Use the absolute minimum constraints: {video:true} only.
    // Android Chrome rejects audio:true in getDisplayMedia on many versions,
    // and any nested constraint object (e.g. {video:{cursor:'always'}}) also fails.
    let sc;
    try {
      sc = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (e) {
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        // User dismissed the picker — silent, expected
        return;
      }
      // Any other error: log full details so it's debuggable
      console.error("getDisplayMedia failed:", e.name, e.message, e);
      showToast(`⚠️ Screen share failed (${e.name}). Try again or use desktop Chrome.`, 5000);
      return;
    }

    const vt = sc.getVideoTracks()[0];
    if (!vt) {
      // Shouldn't happen, but guard anyway
      sc.getTracks().forEach(t => t.stop());
      showToast("⚠️ No video track in screen capture. Try again.", 4000);
      return;
    }

    sharingRef.current      = true;
    screenTrackRef.current  = vt;
    screenStreamRef.current = sc;

    setScreenStream(sc);
    setSharing(true);

    // Now we're past the gesture boundary — async work is fine here
    for (const pid of Object.keys(pcsRef.current)) {
      const pc = pcsRef.current[pid];
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(vt);
      } else {
        pc.addTrack(vt, sc);
        await renegotiate(pid);
      }
    }

    vt.onended = stopShare;
    showToast("🖥️ Screen sharing started");
  }

  async function stopShare() {
    sharingRef.current      = false;
    screenTrackRef.current  = null;
    screenStreamRef.current = null;

    screenStream?.getTracks().forEach(t => t.stop());
    setScreenStream(null);
    setSharing(false);
    setPinnedId(prev => prev === "screen" ? null : prev);

    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    for (const pid of Object.keys(pcsRef.current)) {
      const pc = pcsRef.current[pid];
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(cameraTrack);
    }
    showToast("🖥️ Screen sharing stopped");
  }

  function leaveCall() {
    wsRef.current?.send(JSON.stringify({ type: "leave" }));
    wsRef.current?.close(); wsRef.current = null;
    Object.values(pcsRef.current).forEach(pc => pc.close());
    pcsRef.current = {}; peerStreamsRef.current = {};
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStream?.getTracks().forEach(t => t.stop());
    streamRef.current       = null;
    sharingRef.current      = false;
    screenTrackRef.current  = null;
    screenStreamRef.current = null;
    setLocalStream(null); setScreenStream(null);
    setRemoteStreams({}); setRemoteNames({});
    setInCall(false); setSharing(false); setPinnedId(null);
    setMicOn(true); setCamOn(true);
    setLobbyStream(null); setStatus("");
    setFacingMode("user");
    // FEATURE 3: clear room from URL when leaving
    clearRoomFromUrl();
    requestMedia("user");
  }

  function sendChat() {
    if (!chatMsg.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "chat", payload: chatMsg.trim() }));
    setChatLog(l => [...l, { from: displayName + " (you)", text: chatMsg.trim() }]);
    setChatMsg("");
  }

  function copyRoom() {
    navigator.clipboard?.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // FEATURE 3: copy shareable link
  function copyLink() {
    const link = buildShareLink(roomId);
    navigator.clipboard?.writeText(link).then(() => {
      setCopiedLink(true);
      showToast("🔗 Link copied! Share it to invite others");
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }

  // FEATURE 3: native share (mobile)
  function shareLink() {
    const link = buildShareLink(roomId);
    if (navigator.share) {
      navigator.share({
        title: "Join my Quick Meet call",
        text: `Join room ${roomId} on Quick Meet`,
        url: link,
      }).catch(() => {});
    } else {
      copyLink();
    }
  }

  useEffect(() => {
    if (sidebarTab === "chat") setUnread(0);
  }, [sidebarTab, sidebarOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  async function enablePush() {
    setPushStatus("Requesting…");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setPushStatus("Permission denied"); return; }
    try {
      const kr = await fetch(`${urlBase(backendUrl)}/videocall/vapid-public-key`);
      if (!kr.ok) throw new Error("VAPID not configured");
      const { public_key } = await kr.json();
      const reg = await registerSW();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(public_key) });
      await fetch(`${urlBase(backendUrl)}/videocall/push/subscribe`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: peerId, subscription: sub.toJSON() }),
      });
      setPushEnabled(true); setPushStatus("Enabled ✓");
    } catch (e) { setPushStatus(`Failed: ${e.message}`); }
  }

  async function sendInvite() {
    if (!notifyTarget || !roomId) return;
    await fetch(`${urlBase(backendUrl)}/videocall/push/notify-room`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId, title: `${displayName} is calling`, body: `Join room ${roomId}`, user_ids: [notifyTarget] }),
    });
    setStatus(`Invite sent to ${notifyTarget}`);
    setNotifyTarget("");
  }

  const remotePeerIds = Object.keys(remoteStreams);
  const totalCount    = 1 + remotePeerIds.length;
  const hasVideo      = mediaStatus === "ok";

  function renderPinnedTile() {
    if (!pinnedId) return null;
    if (pinnedId === "screen" && sharing && screenStream) {
      return (
        <div className="vc-pinned-wrap">
          <VideoTile stream={screenStream} name={displayName} isLocal isScreen videoOn
            isPinned onUnpin={() => setPinnedId(null)} />
        </div>
      );
    }
    if (pinnedId === "local") {
      return (
        <div className="vc-pinned-wrap">
          <VideoTile stream={localStream} name={displayName} isLocal micOn={micOn} videoOn={camOn}
            isPinned onUnpin={() => setPinnedId(null)} />
        </div>
      );
    }
    if (remoteStreams[pinnedId]) {
      return (
        <div className="vc-pinned-wrap">
          <VideoTile stream={remoteStreams[pinnedId]} name={remoteNames[pinnedId] || pinnedId}
            micOn videoOn isPinned onUnpin={() => setPinnedId(null)} />
        </div>
      );
    }
    return null;
  }

  // ── LOBBY ─────────────────────────────────────────────────────────────────
  if (!inCall) return (
    <div className="vc-root">
      <style>{CSS}</style>
      <Toast message={toast} />
      <div className="vc-lobby">
        <div className="vc-lobby__card">
          <div className="vc-lobby__brand">
            <span className="vc-lobby__brand-icon">📹</span>
            <div className="vc-lobby__title">Quick Meet</div>
            <div className="vc-lobby__sub">HD video · screen share · no sign-up</div>
          </div>

          {/* FEATURE 3: if room pre-filled from URL, show a helpful banner */}
          {urlRoom && (
            <div className="vc-link-banner">
              <span className="vc-link-banner__icon">🔗</span>
              <span className="vc-link-banner__text">Joining room {urlRoom}</span>
            </div>
          )}

          <div className="vc-preview">
            {lobbyStream && hasVideo ? (
              <>
                <video ref={previewVideoRef} autoPlay playsInline muted
                  style={{ display: lobbyCam ? "block" : "none", width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
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
                <span className="vc-preview__overlay-icon">{mediaStatus === "loading" ? "⏳" : "🚫"}</span>
                <span className="vc-preview__overlay-text">{mediaStatus === "loading" ? "Requesting access…" : "Camera unavailable"}</span>
              </div>
            )}
            {lobbyStream && (
              <div className="vc-preview__btns">
                <button className="vc-btn-sm" onClick={lobbyToggleMic}
                  style={{ background: lobbyMic ? "rgba(0,0,0,0.65)" : "rgba(220,38,38,0.7)", color: "#fff" }}>
                  {lobbyMic ? "🎙️" : "🔇"}
                </button>
                {hasVideo && (
                  <button className="vc-btn-sm" onClick={lobbyToggleCam}
                    style={{ background: lobbyCam ? "rgba(0,0,0,0.65)" : "rgba(220,38,38,0.7)", color: "#fff" }}>
                    {lobbyCam ? "📷" : "📵"}
                  </button>
                )}
                {/* FEATURE 2: rotate camera button in lobby (mobile only) */}
                {isMobile && hasVideo && (
                  <button className="vc-btn-sm" onClick={rotateCamera}
                    style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}
                    title="Switch camera">
                    🔄
                  </button>
                )}
              </div>
            )}
          </div>

          <MediaBanner status={mediaStatus} onRetry={() => requestMedia(facingMode)} onAudioOnly={requestAudioOnly} />

          <div className="vc-field">
            <label className="vc-label">Your name</label>
            <input className="vc-input" value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Alice" maxLength={40} />
          </div>

          <div className="vc-tabs">
            <button className={`vc-tab${tab === "create" ? " active" : ""}`} onClick={() => setTab("create")}>+ New Room</button>
            <button className={`vc-tab${tab === "join" ? " active" : ""}`} onClick={() => setTab("join")}>Join Room</button>
          </div>

          {lobbyError && (
            <div className="vc-banner vc-banner--error">
              <div style={{ display: "flex", gap: 8 }}>⚠️ {lobbyError}</div>
            </div>
          )}

          {tab === "create" && (
            <>
              <div className="vc-field">
                <label className="vc-label">Room password <span style={{ color: "#475569", textTransform: "none", fontWeight: 400, fontFamily: "inherit" }}>(optional)</span></label>
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
                  onKeyDown={e => e.key === "Enter" && handleJoin()} />
              </div>
              <div className="vc-field">
                <label className="vc-label">Password <span style={{ color: "#475569", textTransform: "none", fontWeight: 400, fontFamily: "inherit" }}>(if private)</span></label>
                <input className="vc-input" type="password" value={joinPassword}
                  onChange={e => setJoinPassword(e.target.value)}
                  placeholder="Leave blank for public rooms"
                  onKeyDown={e => e.key === "Enter" && handleJoin()} />
              </div>
              <button className="vc-btn vc-btn-primary" onClick={handleJoin}>Join Room</button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ── IN CALL ───────────────────────────────────────────────────────────────
  return (
    <div className="vc-root">
      <style>{CSS}</style>
      <Toast message={toast} />
      <div className="vc-call">

        <div className="vc-header">
          <div className="vc-header__left">
            <span style={{ fontSize: 16 }}>📹</span>
            <span className="vc-header__room" onClick={copyRoom} title="Click to copy">{roomId}</span>
            {copied && <span style={{ fontSize: 11, color: "#34d399" }}>Copied!</span>}
            <span className="vc-header__info">{totalCount} · {status}</span>
            {/* FEATURE 3: Share link button in header */}
            <button className="vc-header__share-btn" onClick={shareLink} title="Share invite link">
              {copiedLink ? "✓ Copied!" : (isMobile ? "📤 Share" : "🔗 Copy Link")}
            </button>
          </div>
          <div className="vc-header__name">👤 {displayName}</div>
        </div>

        <div className="vc-body">
          <div className="vc-grid-wrap">
            {renderPinnedTile()}

            {sharing && screenStream && pinnedId !== "screen" && (
              <VideoTile stream={screenStream} name={displayName} isLocal isScreen videoOn
                isPinned={false}
                onPin={() => setPinnedId("screen")}
                onUnpin={() => setPinnedId(null)} />
            )}

            <div className="vc-grid" data-count={Math.min(totalCount, 6)}>
              {pinnedId !== "local" && (
                <VideoTile stream={localStream} name={displayName} isLocal micOn={micOn} videoOn={camOn}
                  isPinned={false}
                  onPin={() => setPinnedId("local")}
                  onUnpin={() => setPinnedId(null)} />
              )}
              {remotePeerIds.filter(pid => pid !== pinnedId).map(pid => (
                <VideoTile key={pid} stream={remoteStreams[pid]}
                  name={remoteNames[pid] || pid}
                  micOn videoOn
                  isPinned={false}
                  onPin={() => setPinnedId(pid)}
                  onUnpin={() => setPinnedId(null)} />
              ))}
            </div>

            {pinnedId && (
              <div style={{ textAlign: "center", fontSize: 11, color: "var(--text3)", paddingBottom: 4, fontFamily: "'DM Mono', monospace" }}>
                Press Esc or tap ✕ Unpin to return to grid
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className={`vc-sidebar${sidebarOpen ? " mobile-open" : ""}`}>
            <div className="vc-sidebar__drag-handle" />
            <div className="vc-sidebar__tab-bar">
              {["chat", "people", "invite"].map(t => (
                <button key={t} className={`vc-sidebar__tab${sidebarTab === t ? " active" : ""}`}
                  onClick={() => { setSidebarTab(t); if (t === "chat") setUnread(0); }}>
                  {t === "chat" ? "💬 Chat" : t === "people" ? "👥 People" : "🔔 Invite"}
                </button>
              ))}
              <button className="vc-sidebar__close" onClick={() => setSidebarOpen(false)}>✕</button>
            </div>
            <div className="vc-sidebar__body">
              {sidebarTab === "chat" && (
                <>
                  <div className="vc-chat__messages">
                    {chatLog.length === 0 && <div className="vc-chat__empty">No messages yet</div>}
                    {chatLog.map((m, i) => (
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
                      onKeyDown={e => e.key === "Enter" && sendChat()}
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
                      <div className="vc-peer-row__avatar">{initials(remoteNames[pid] || pid)}</div>
                      <div className="vc-peer-row__name">{remoteNames[pid] || pid}</div>
                    </div>
                  ))}
                </div>
              )}
              {sidebarTab === "invite" && (
                <div className="vc-invite">
                  <div className="vc-invite__desc">Share this link — recipients just enter their name and join.</div>

                  {/* FEATURE 3: Shareable link in invite tab */}
                  <div>
                    <div className="vc-label" style={{ marginBottom: 6 }}>Invite link</div>
                    <div className="vc-invite__link-box">
                      <input className="vc-invite__link-input" value={buildShareLink(roomId)} readOnly />
                      <button className="vc-btn-sm" onClick={shareLink}
                        style={{ background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(16,185,129,0.2)" }}>
                        {isMobile ? "📤" : (copiedLink ? "✓" : "Copy")}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="vc-label" style={{ marginBottom: 6 }}>Room code only</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="vc-input" value={roomId} readOnly style={{ flex: 1 }} />
                      <button className="vc-btn-sm" onClick={copyRoom}
                        style={{ background: "rgba(255,255,255,0.07)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}>
                        {copied ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div className="vc-label" style={{ marginBottom: 6 }}>Push notification</div>
                    {!pushEnabled ? (
                      <>
                        <button className="vc-btn vc-btn-ghost" style={{ marginBottom: 6 }} onClick={enablePush}>🔔 Enable Push</button>
                        {pushStatus && <div style={{ fontSize: 12, color: "#64748b" }}>{pushStatus}</div>}
                      </>
                    ) : (
                      <>
                        <input className="vc-input" value={notifyTarget}
                          onChange={e => setNotifyTarget(e.target.value)}
                          placeholder="Recipient user ID" style={{ marginBottom: 8 }} />
                        <button className="vc-btn vc-btn-primary" onClick={sendInvite}>Send Invite</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile backdrop */}
        <div className={`vc-backdrop${sidebarOpen ? " show" : ""}`} onClick={() => setSidebarOpen(false)} />

        <div className="vc-controls">
          <CtrlBtn onClick={toggleMic} variant={micOn ? "normal" : "off"} title={micOn ? "Mute" : "Unmute"} icon={micOn ? "🎙️" : "🔇"} />
          <CtrlBtn onClick={toggleCam} variant={camOn ? "normal" : "off"} title={camOn ? "Stop camera" : "Start camera"} icon={camOn ? "📷" : "📵"} />
          {/* FEATURE 2: rotate camera button — mobile only, in controls bar */}
          {isMobile && (
            <CtrlBtn onClick={rotateCamera} variant="normal" title="Switch camera" icon="🔄" />
          )}
          <CtrlBtn onClick={sharing ? stopShare : startShare} variant={sharing ? "active" : "normal"} title={sharing ? "Stop sharing" : "Share screen"} icon="🖥️" />
          <div className="vc-ctrl-sep" />
          <CtrlBtn
            onClick={() => { setSidebarOpen(o => !o); setSidebarTab("chat"); setUnread(0); }}
            variant={sidebarOpen ? "active" : "normal"} title="Chat" icon="💬"
            badge={unread > 0 ? unread : null} />
          <CtrlBtn onClick={leaveCall} variant="danger" title="Leave call" icon="📵" />
        </div>
      </div>
    </div>
  );
}