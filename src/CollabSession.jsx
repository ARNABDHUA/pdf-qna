// CollabSession.jsx
// Drop this into your src/ folder.
// Route it in your router: <Route path="/collab/:sessionId" element={<CollabSession />} />
// Add the share button anywhere in App.jsx via the exported <ShareButton /> component.

import React, { useState, useEffect, useRef, useCallback } from "react";
import MarkdownRenderer from "./MarkdownRenderer"; // reuse your existing renderer

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = "https://pdf-qna-backend.onrender.com";

// ── Collab API helpers ────────────────────────────────────────────────────────
export const collabApi = {
  async createSession(title, owner, messages = []) {
    const res = await fetch(`${BASE_URL}/collab/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, owner, messages }),
    });
    if (!res.ok) throw new Error("Failed to create collaborative session");
    return res.json();
  },

  async getSession(sessionId) {
    const res = await fetch(`${BASE_URL}/collab/sessions/${sessionId}`);
    if (!res.ok) throw new Error(res.status === 404 ? "Session not found" : "Failed to load session");
    return res.json();
  },

  async addMessage(sessionId, message) {
    const res = await fetch(`${BASE_URL}/collab/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message }),
    });
    if (!res.ok) throw new Error("Failed to send message");
    return res.json();
  },

  async updateMessage(sessionId, msgId, content) {
    await fetch(`${BASE_URL}/collab/sessions/${sessionId}/messages/${msgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  },

  async poll(sessionId, since) {
    const url = `${BASE_URL}/collab/sessions/${sessionId}/poll${since ? `?since=${since}` : ""}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error("Poll failed");
    return res.json();
  },

  async joinSession(sessionId, name) {
    await fetch(`${BASE_URL}/collab/sessions/${sessionId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  },

  async updateTitle(sessionId, title) {
    await fetch(`${BASE_URL}/collab/sessions/${sessionId}/title`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  },
};

// ── Colour palette ─────────────────────────────────────────────────────────────
const PARTICIPANT_COLORS = [
  "#7c3aed", "#0891b2", "#059669", "#d97706",
  "#dc2626", "#7c3aed", "#db2777", "#0284c7",
];

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PARTICIPANT_COLORS[Math.abs(hash) % PARTICIPANT_COLORS.length];
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 28 }) {
  const color = colorForName(name || "?");
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 700, flexShrink: 0,
      fontFamily: "monospace",
    }}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "currentColor", opacity: 0.5,
          animation: `collab-bounce 1s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </span>
  );
}

// ── ShareButton — import this in App.jsx ──────────────────────────────────────
export function ShareButton({ messages, sessionTitle, currentUser }) {
  const [state, setState] = useState("idle"); // idle | loading | copied | error
  const [shareUrl, setShareUrl] = useState(null);

  const handleShare = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
      return;
    }
    setState("loading");
    try {
      const exportMsgs = (messages || []).map(m => ({
        role:      m.role,
        content:   m.content || "",
        author:    m.role === "user" ? (currentUser || "Me") : "AI",
        provider:  m.provider,
        model:     m.model,
        mode:      m.mode || "chat",
        timestamp: Date.now() / 1000,
        msg_id:    m.id ? String(m.id) : String(Math.random()),
      }));

      const data = await collabApi.createSession(
        sessionTitle || "Shared Session",
        currentUser || "Anonymous",
        exportMsgs
      );

      const url = `${window.location.origin}/collab/${data.session_id}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 3000);
    } catch (e) {
      console.error(e);
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  };

  const label = {
    idle:    "Share Session",
    loading: "Creating link…",
    copied:  "Link copied!",
    error:   "Error — retry",
  }[state];

  const icon = {
    idle:    <ShareIcon />,
    loading: <SpinnerIcon />,
    copied:  <CheckIcon />,
    error:   <WarnIcon />,
  }[state];

  return (
    <button
      onClick={handleShare}
      disabled={state === "loading"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "7px 14px", borderRadius: 8, border: "1px solid",
        borderColor: state === "copied" ? "#059669" : state === "error" ? "#dc2626" : "#6366f1",
        background:  state === "copied" ? "#d1fae5" : state === "error" ? "#fee2e2" : "#eef2ff",
        color:       state === "copied" ? "#065f46" : state === "error" ? "#991b1b" : "#4338ca",
        fontSize: 13, fontWeight: 600, cursor: state === "loading" ? "wait" : "pointer",
        transition: "all 0.2s", fontFamily: "inherit",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      {icon}
      {label}
      {shareUrl && state !== "copied" && (
        <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 2 }}>· click to copy again</span>
      )}
    </button>
  );
}

// ── CollabSession page ────────────────────────────────────────────────────────
export default function CollabSession() {
  // Extract sessionId from URL
  const sessionId = window.location.pathname.split("/collab/")[1]?.split("/")[0];

  const [session,      setSession]      = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [input,        setInput]        = useState("");
  const [username,     setUsername]     = useState("");
  const [joined,       setJoined]       = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isStreaming,  setIsStreaming]   = useState(false);
  const [lastSince,    setLastSince]    = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft,   setTitleDraft]   = useState("");
  const [copied,       setCopied]       = useState(false);
  const [activeNow,    setActiveNow]    = useState(1);

  const messagesEndRef = useRef(null);
  const pollRef        = useRef(null);
  const mountedRef     = useRef(true);

  // Load session
  useEffect(() => {
    if (!sessionId) { setError("No session ID in URL"); setLoading(false); return; }
    collabApi.getSession(sessionId)
      .then(data => {
        setSession(data);
        setMessages(data.messages || []);
        setParticipants(data.participants || []);
        setTitleDraft(data.title || "Collaborative Session");
        const ts = (data.messages || []).reduce((max, m) => Math.max(max, m.timestamp || 0), 0);
        setLastSince(ts || null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    return () => { mountedRef.current = false; };
  }, [sessionId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Long-poll loop
  useEffect(() => {
    if (!joined || !sessionId) return;
    let cancelled = false;

    const doPoll = async () => {
      while (!cancelled && mountedRef.current) {
        try {
          const data = await collabApi.poll(sessionId, lastSince);
          if (cancelled || !mountedRef.current) break;

          if (data.messages?.length > 0) {
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.msg_id));
              const newMsgs = data.messages.filter(m => !existingIds.has(m.msg_id));
              if (newMsgs.length === 0) return prev;
              const merged = [...prev, ...newMsgs].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
              return merged;
            });
            const maxTs = Math.max(...data.messages.map(m => m.timestamp || 0));
            setLastSince(prev => Math.max(prev || 0, maxTs));
          }

          if (data.title) setTitleDraft(data.title);
        } catch (e) {
          if (!cancelled) await new Promise(r => setTimeout(r, 3000));
        }
      }
    };

    doPoll();
    return () => { cancelled = true; };
  }, [joined, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Simulate "active users" wiggle
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => {
      setActiveNow(participants.length + Math.floor(Math.random() * 2));
    }, 15000);
    return () => clearInterval(t);
  }, [joined, participants.length]);

  const handleJoin = async () => {
    const name = username.trim();
    if (!name) return;
    await collabApi.joinSession(sessionId, name);
    setParticipants(prev => [...new Set([...prev, name])]);
    setActiveNow(participants.length + 1);
    setJoined(true);
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput("");
    setIsStreaming(true);

    const userMsg = {
      role:      "user",
      content:   text,
      author:    username,
      mode:      "chat",
      timestamp: Date.now() / 1000,
      msg_id:    `user_${Date.now()}`,
    };

    // Optimistic
    setMessages(prev => [...prev, userMsg]);
    setLastSince(userMsg.timestamp);

    try {
      await collabApi.addMessage(sessionId, userMsg);
    } catch (e) {
      console.error(e);
    } finally {
      setIsStreaming(false);
    }
  };

  const copyShareUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTitleSave = async () => {
    setEditingTitle(false);
    if (titleDraft.trim() && titleDraft !== session?.title) {
      await collabApi.updateTitle(sessionId, titleDraft.trim());
      setSession(prev => ({ ...prev, title: titleDraft.trim() }));
    }
  };

  // ── Join screen ────────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <>
        <style>{CSS}</style>
        <div className="collab-join-screen">
          <div className="collab-join-card">
            <div className="collab-join-logo">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="20" fill="#6366f1" opacity="0.15"/>
                <path d="M12 20c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8-8-3.582-8-8z" fill="#6366f1" opacity="0.3"/>
                <circle cx="14" cy="20" r="3" fill="#6366f1"/>
                <circle cx="20" cy="16" r="3" fill="#6366f1"/>
                <circle cx="26" cy="20" r="3" fill="#6366f1"/>
                <path d="M14 20 Q17 14 20 16 Q23 18 26 20" stroke="#6366f1" strokeWidth="1.5" fill="none"/>
              </svg>
            </div>

            {loading ? (
              <div className="collab-join-loading">
                <div className="collab-spinner" />
                <p>Loading session…</p>
              </div>
            ) : error ? (
              <div className="collab-join-error">
                <WarnIcon />
                <h2>Session unavailable</h2>
                <p>{error}</p>
                <a href="/" className="collab-btn collab-btn--primary">← Back to QNA-AI</a>
              </div>
            ) : (
              <>
                <h1 className="collab-join-title">Join Collaborative Session</h1>
                <p className="collab-join-subtitle">
                  <strong>{session?.title || "Shared Session"}</strong>
                </p>
                <p className="collab-join-meta">
                  Started by <strong>{session?.owner || "Someone"}</strong>
                  {participants.length > 0 && ` · ${participants.length} participant${participants.length !== 1 ? "s" : ""}`}
                  {session?.expires_at && ` · expires ${new Date(session.expires_at).toLocaleDateString()}`}
                </p>

                {participants.length > 0 && (
                  <div className="collab-join-participants">
                    {participants.slice(0, 5).map(p => (
                      <Avatar key={p} name={p} size={32} />
                    ))}
                    {participants.length > 5 && (
                      <span className="collab-join-more">+{participants.length - 5}</span>
                    )}
                  </div>
                )}

                <div className="collab-join-form">
                  <input
                    className="collab-input"
                    placeholder="Your name or nickname"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleJoin()}
                    autoFocus
                    maxLength={32}
                  />
                  <button
                    className="collab-btn collab-btn--primary"
                    onClick={handleJoin}
                    disabled={!username.trim()}
                  >
                    Join Session →
                  </button>
                </div>

                {messages.length > 0 && (
                  <p className="collab-join-preview">
                    {messages.length} message{messages.length !== 1 ? "s" : ""} in this session
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── Main collab UI ─────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="collab-app">
        {/* Header */}
        <header className="collab-header">
          <div className="collab-header-left">
            <a href="/" className="collab-back-btn" title="Back to QNA-AI">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </a>
            <div className="collab-header-logo">
              <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="20" fill="#6366f1" opacity="0.2"/>
                <circle cx="14" cy="20" r="4" fill="#6366f1"/>
                <circle cx="26" cy="20" r="4" fill="#6366f1"/>
                <path d="M14 20 Q20 14 26 20" stroke="#6366f1" strokeWidth="2" fill="none"/>
              </svg>
            </div>

            {editingTitle ? (
              <input
                className="collab-title-input"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => { if (e.key === "Enter") handleTitleSave(); if (e.key === "Escape") setEditingTitle(false); }}
                autoFocus
              />
            ) : (
              <h1
                className="collab-header-title"
                onClick={() => setEditingTitle(true)}
                title="Click to rename"
              >
                {titleDraft}
                <span className="collab-edit-icon">✏</span>
              </h1>
            )}
          </div>

          <div className="collab-header-right">
            {/* Active users */}
            <div className="collab-active-badge">
              <span className="collab-active-dot" />
              <div className="collab-avatars-row">
                {participants.slice(0, 4).map(p => (
                  <div key={p} className="collab-avatar-mini" title={p}>
                    <Avatar name={p} size={24} />
                  </div>
                ))}
              </div>
              <span className="collab-active-count">{activeNow} online</span>
            </div>

            {/* Share button */}
            <button className="collab-share-btn" onClick={copyShareUrl}>
              {copied ? <CheckIcon /> : <ShareIcon />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="collab-body">
          {/* Participants sidebar */}
          <aside className="collab-sidebar">
            <div className="collab-sidebar-section">
              <p className="collab-sidebar-label">Session</p>
              <div className="collab-session-id">
                <span>{sessionId.slice(0, 8)}…</span>
                <button className="collab-copy-id-btn" onClick={copyShareUrl} title="Copy share link">
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
              <p className="collab-sidebar-sublabel">
                Expires {session?.expires_at ? new Date(session.expires_at).toLocaleDateString() : "in 7 days"}
              </p>
            </div>

            <div className="collab-sidebar-section">
              <p className="collab-sidebar-label">Participants ({participants.length})</p>
              <div className="collab-participants-list">
                {participants.map(p => (
                  <div key={p} className={`collab-participant-row ${p === username ? "collab-participant-row--me" : ""}`}>
                    <Avatar name={p} size={26} />
                    <span className="collab-participant-name">
                      {p} {p === username && <span className="collab-you-badge">you</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="collab-sidebar-section">
              <p className="collab-sidebar-label">Stats</p>
              <div className="collab-stat-row">
                <span>Messages</span>
                <strong>{messages.length}</strong>
              </div>
              <div className="collab-stat-row">
                <span>Session age</span>
                <strong>
                  {session?.created_at
                    ? Math.round((Date.now() - new Date(session.created_at)) / 60000) + " min"
                    : "—"}
                </strong>
              </div>
            </div>

            <div className="collab-sidebar-section">
              <p className="collab-sidebar-hint">
                💡 Share the URL with teammates — they can join and see the full conversation in real time.
              </p>
            </div>
          </aside>

          {/* Chat pane */}
          <main className="collab-chat">
            <div className="collab-messages">
              {messages.length === 0 && (
                <div className="collab-empty">
                  <div className="collab-empty-icon">💬</div>
                  <p>No messages yet. Start the conversation!</p>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isMe  = msg.author === username;
                const isAI  = msg.role === "ai";
                const color = isAI ? "#6366f1" : colorForName(msg.author || "?");

                return (
                  <div
                    key={msg.msg_id || idx}
                    className={`collab-msg ${isMe ? "collab-msg--me" : ""} ${isAI ? "collab-msg--ai" : ""}`}
                  >
                    {/* Avatar */}
                    {!isMe && (
                      <div className="collab-msg-avatar">
                        {isAI
                          ? <div className="collab-ai-avatar">✦</div>
                          : <Avatar name={msg.author || "?"} size={30} />
                        }
                      </div>
                    )}

                    <div className="collab-msg-body">
                      {/* Author + timestamp */}
                      <div className={`collab-msg-meta ${isMe ? "collab-msg-meta--right" : ""}`}>
                        {isAI
                          ? <span style={{ color: "#6366f1", fontWeight: 700 }}>
                              {msg.provider ? `${msg.provider} / ${msg.model || "AI"}` : "AI"}
                            </span>
                          : <span style={{ color, fontWeight: 600 }}>{msg.author || "User"}</span>
                        }
                        {msg.timestamp && (
                          <span className="collab-msg-time">
                            {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {msg.mode && msg.mode !== "chat" && (
                          <span className="collab-mode-tag">{msg.mode}</span>
                        )}
                      </div>

                      {/* Bubble */}
                      <div className={`collab-bubble ${isMe ? "collab-bubble--me" : isAI ? "collab-bubble--ai" : "collab-bubble--other"}`}
                        style={!isMe && !isAI ? { borderLeft: `3px solid ${color}` } : {}}>
                        {msg.content === "..." ? (
                          <TypingDots />
                        ) : isAI ? (
                          <MarkdownRenderer content={msg.content} />
                        ) : (
                          <p className="collab-bubble-text">{msg.content}</p>
                        )}
                      </div>
                    </div>

                    {isMe && (
                      <div className="collab-msg-avatar">
                        <Avatar name={username} size={30} />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="collab-input-area">
              <div className="collab-input-row">
                <Avatar name={username} size={32} />
                <div className="collab-input-box">
                  <textarea
                    className="collab-textarea"
                    placeholder={`Message as ${username}… (Enter to send, Shift+Enter for newline)`}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={1}
                    disabled={isStreaming}
                  />
                  <button
                    className={`collab-send-btn ${input.trim() && !isStreaming ? "collab-send-btn--active" : ""}`}
                    onClick={handleSend}
                    disabled={!input.trim() || isStreaming}
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>
              <p className="collab-input-hint">
                Messages are visible to all participants in real time · Session expires in 7 days
              </p>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

// ── Tiny SVG icons ─────────────────────────────────────────────────────────────
function ShareIcon()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>; }
function CheckIcon()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>; }
function WarnIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }
function SpinnerIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "collab-spin 0.8s linear infinite" }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>; }
function CopyIcon()    { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>; }
function SendIcon()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>; }

// ── CSS (injected via <style> tag) ─────────────────────────────────────────────
const CSS = `
@keyframes collab-bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
@keyframes collab-spin { to { transform: rotate(360deg); } }
@keyframes collab-fade-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

/* ── Join Screen ── */
.collab-join-screen {
  min-height: 100vh;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  display: flex; align-items: center; justify-content: center;
  padding: 24px; font-family: system-ui, -apple-system, sans-serif;
}
.collab-join-card {
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  padding: 40px 36px;
  max-width: 440px; width: 100%;
  text-align: center;
  animation: collab-fade-in 0.4s ease;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
}
.collab-join-logo { margin-bottom: 20px; }
.collab-join-title {
  font-size: 22px; font-weight: 800; color: #fff; margin: 0 0 8px;
  letter-spacing: -0.5px;
}
.collab-join-subtitle {
  font-size: 15px; color: rgba(255,255,255,0.6); margin: 0 0 6px;
}
.collab-join-meta {
  font-size: 12px; color: rgba(255,255,255,0.4); margin: 0 0 20px;
}
.collab-join-participants {
  display: flex; align-items: center; justify-content: center;
  gap: -4px; margin-bottom: 20px;
}
.collab-join-participants > * { margin-left: -6px; }
.collab-join-more {
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7);
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  margin-left: -6px;
}
.collab-join-form {
  display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;
}
.collab-input {
  padding: 11px 16px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.07);
  color: #fff; font-size: 14px; font-family: inherit;
  outline: none; transition: border-color 0.2s;
}
.collab-input:focus { border-color: #6366f1; }
.collab-input::placeholder { color: rgba(255,255,255,0.3); }
.collab-btn {
  padding: 11px 20px; border-radius: 10px; border: none;
  font-size: 14px; font-weight: 700; cursor: pointer;
  font-family: inherit; transition: all 0.18s; text-decoration: none;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.collab-btn--primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  box-shadow: 0 4px 16px rgba(99,102,241,0.4);
}
.collab-btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99,102,241,0.5);
}
.collab-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }
.collab-join-preview { font-size: 12px; color: rgba(255,255,255,0.3); margin: 0; }
.collab-join-loading { display: flex; flex-direction: column; align-items: center; gap: 16px; color: rgba(255,255,255,0.5); }
.collab-join-error { display: flex; flex-direction: column; align-items: center; gap: 12px; color: #f87171; }
.collab-join-error h2 { margin: 0; color: #fff; font-size: 18px; }
.collab-join-error p  { margin: 0; font-size: 14px; }
.collab-spinner {
  width: 28px; height: 28px; border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #6366f1; border-radius: 50%;
  animation: collab-spin 0.8s linear infinite;
}

/* ── Main App ── */
.collab-app {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif;
  background: #0d0d14; color: #e2e8f0;
}

/* Header */
.collab-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(13,13,20,0.95); backdrop-filter: blur(12px);
  position: sticky; top: 0; z-index: 50; flex-shrink: 0;
  gap: 16px;
}
.collab-header-left  { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.collab-header-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.collab-back-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.5); text-decoration: none;
  transition: all 0.15s;
}
.collab-back-btn:hover { background: rgba(255,255,255,0.06); color: #fff; }
.collab-header-logo { flex-shrink: 0; }
.collab-header-title {
  font-size: 15px; font-weight: 700; color: #fff;
  margin: 0; cursor: pointer; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 280px;
  display: flex; align-items: center; gap: 6px;
  transition: color 0.15s;
}
.collab-header-title:hover { color: #a5b4fc; }
.collab-edit-icon { font-size: 11px; opacity: 0.4; }
.collab-title-input {
  font-size: 15px; font-weight: 700;
  background: rgba(255,255,255,0.06); border: 1px solid #6366f1;
  border-radius: 6px; color: #fff; padding: 4px 10px;
  font-family: inherit; outline: none; max-width: 300px;
}
.collab-active-badge {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 12px; border-radius: 20px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 12px; color: rgba(255,255,255,0.6);
}
.collab-active-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 6px #4ade80;
  animation: collab-bounce 2s ease-in-out infinite;
}
.collab-avatars-row { display: flex; }
.collab-avatar-mini { margin-left: -6px; }
.collab-active-count { font-weight: 600; }
.collab-share-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff; border: none; font-size: 13px; font-weight: 700;
  cursor: pointer; font-family: inherit; transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(99,102,241,0.3);
}
.collab-share-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(99,102,241,0.4); }

/* Body layout */
.collab-body {
  display: flex; flex: 1; overflow: hidden;
}

/* Sidebar */
.collab-sidebar {
  width: 220px; flex-shrink: 0;
  border-right: 1px solid rgba(255,255,255,0.06);
  overflow-y: auto; padding: 16px 14px;
  display: flex; flex-direction: column; gap: 20px;
  background: rgba(255,255,255,0.01);
}
.collab-sidebar-section { display: flex; flex-direction: column; gap: 8px; }
.collab-sidebar-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: rgba(255,255,255,0.3);
  margin: 0;
}
.collab-sidebar-sublabel { font-size: 11px; color: rgba(255,255,255,0.25); margin: 0; }
.collab-session-id {
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 7px; padding: 6px 10px;
  font-family: monospace; font-size: 12px; color: rgba(255,255,255,0.5);
}
.collab-copy-id-btn {
  background: none; border: none; color: rgba(255,255,255,0.4);
  cursor: pointer; padding: 0; line-height: 1;
  transition: color 0.15s;
}
.collab-copy-id-btn:hover { color: #a5b4fc; }
.collab-participants-list { display: flex; flex-direction: column; gap: 6px; }
.collab-participant-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px; border-radius: 7px;
  transition: background 0.15s;
}
.collab-participant-row:hover { background: rgba(255,255,255,0.04); }
.collab-participant-row--me { background: rgba(99,102,241,0.08); }
.collab-participant-name { font-size: 13px; color: rgba(255,255,255,0.75); }
.collab-you-badge {
  font-size: 9px; background: rgba(99,102,241,0.2); color: #a5b4fc;
  padding: 1px 5px; border-radius: 4px; font-weight: 700;
}
.collab-stat-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; color: rgba(255,255,255,0.5);
}
.collab-stat-row strong { color: rgba(255,255,255,0.85); }
.collab-sidebar-hint {
  font-size: 11px; color: rgba(255,255,255,0.3);
  line-height: 1.5; margin: 0;
  padding: 10px; background: rgba(255,255,255,0.03);
  border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);
}

/* Chat pane */
.collab-chat {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
}
.collab-messages {
  flex: 1; overflow-y: auto; padding: 20px 24px;
  display: flex; flex-direction: column; gap: 16px;
  scroll-behavior: smooth;
}
.collab-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px;
  color: rgba(255,255,255,0.25); text-align: center; margin: auto;
}
.collab-empty-icon { font-size: 40px; }
.collab-empty p { font-size: 14px; margin: 0; }

/* Messages */
.collab-msg {
  display: flex; gap: 10px; align-items: flex-start;
  animation: collab-fade-in 0.25s ease;
  max-width: 100%;
}
.collab-msg--me { flex-direction: row-reverse; }
.collab-msg-avatar { flex-shrink: 0; margin-top: 2px; }
.collab-ai-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: #fff; font-weight: 700;
}
.collab-msg-body { display: flex; flex-direction: column; gap: 3px; max-width: 75%; }
.collab-msg--me .collab-msg-body { align-items: flex-end; }
.collab-msg-meta {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; color: rgba(255,255,255,0.35);
}
.collab-msg-meta--right { flex-direction: row-reverse; }
.collab-msg-time { font-size: 10px; opacity: 0.7; }
.collab-mode-tag {
  font-size: 9px; padding: 1px 6px; border-radius: 4px;
  background: rgba(99,102,241,0.15); color: #a5b4fc;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.collab-bubble {
  padding: 10px 14px; border-radius: 12px;
  line-height: 1.55; font-size: 14px; word-break: break-word;
}
.collab-bubble--ai {
  background: rgba(99,102,241,0.1);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 4px 12px 12px 12px;
  color: #e2e8f0;
}
.collab-bubble--me {
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  color: #fff; border-radius: 12px 4px 12px 12px;
}
.collab-bubble--other {
  background: rgba(255,255,255,0.06);
  border-radius: 4px 12px 12px 12px;
  padding-left: 11px;
  color: #e2e8f0;
}
.collab-bubble-text { margin: 0; }

/* Input area */
.collab-input-area {
  padding: 16px 24px;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(13,13,20,0.8); backdrop-filter: blur(8px);
}
.collab-input-row { display: flex; align-items: flex-end; gap: 10px; }
.collab-input-box {
  flex: 1; display: flex; align-items: flex-end; gap: 8px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px; padding: 8px 12px;
  transition: border-color 0.2s;
}
.collab-input-box:focus-within { border-color: #6366f1; }
.collab-textarea {
  flex: 1; background: none; border: none; color: #e2e8f0;
  font-size: 14px; font-family: inherit; resize: none; outline: none;
  max-height: 120px; overflow-y: auto; line-height: 1.5;
  padding: 0;
}
.collab-textarea::placeholder { color: rgba(255,255,255,0.25); }
.collab-send-btn {
  width: 34px; height: 34px; border-radius: 8px;
  background: rgba(99,102,241,0.2); border: none;
  color: rgba(99,102,241,0.5); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.18s;
}
.collab-send-btn--active {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff; box-shadow: 0 2px 8px rgba(99,102,241,0.4);
}
.collab-send-btn--active:hover { transform: scale(1.05); }
.collab-input-hint {
  font-size: 11px; color: rgba(255,255,255,0.2);
  margin: 8px 0 0; text-align: center;
}

/* Scrollbar */
.collab-messages::-webkit-scrollbar,
.collab-sidebar::-webkit-scrollbar { width: 4px; }
.collab-messages::-webkit-scrollbar-track,
.collab-sidebar::-webkit-scrollbar-track { background: transparent; }
.collab-messages::-webkit-scrollbar-thumb,
.collab-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }

/* Mobile */
@media (max-width: 640px) {
  .collab-sidebar { display: none; }
  .collab-header-title { max-width: 140px; font-size: 13px; }
  .collab-active-badge { display: none; }
  .collab-messages { padding: 14px 14px; }
  .collab-input-area { padding: 12px 14px; }
  .collab-msg-body { max-width: 90%; }
}
`;
