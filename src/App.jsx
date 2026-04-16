import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./services/Api";
import { useVoiceInput } from "./hooks/UseVoiceInput";
import { useTTS } from "./hooks/UseTTS";
import { useChatSessions } from "./hooks/UseChatSessions";
import { useFollowUps } from "./hooks/UseFollowUps";
import MarkdownRenderer from "./MarkdownRenderer";
import { ShareButton } from "./CollabSession";
import "./App.css";

// ── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDERS = {
  ollama:    { label: "Ollama",  color: "#a78bfa", icon: "🦙", needsKey: false },
  openai:    { label: "ChatGPT", color: "#10b981", icon: "✦",  needsKey: true  },
  anthropic: { label: "Claude",  color: "#f59e0b", icon: "◆",  needsKey: true  },
  gemini:    { label: "Gemini",  color: "#3b82f6", icon: "✧",  needsKey: true  },
  groq:      { label: "Groq",    color: "#f97316", icon: "⚡", needsKey: true  },
};

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = {
  Send:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Mic:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  MicOff:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  Upload:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  File:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Trash:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Bot:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" strokeLinecap="round"/><line x1="12" y1="16" x2="12" y2="16" strokeWidth="3" strokeLinecap="round"/><line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" strokeLinecap="round"/></svg>,
  User:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Key:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  Eye:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  ChevronDown: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  ChevronLeft: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevronRight:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Check:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Scale:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V2"/><path d="M5 12H2a10 10 0 0 0 10 10"/><path d="M19 12h3A10 10 0 0 1 12 22"/><path d="M2 7l10-5 10 5"/><path d="M2 7l5 5-5 5"/><path d="M22 7l-5 5 5 5"/></svg>,
  Chat:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Copy:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Globe:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  GlobeOff:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M10.68 10.68A3 3 0 0 0 12 15a3 3 0 0 0 2.32-4.68M6.09 6.09A10 10 0 0 0 2 12c0 5.52 4.48 10 10 10a10 10 0 0 0 5.91-1.91M22 12A10 10 0 0 0 12 2a10 10 0 0 0-1.91.18"/><line x1="2" y1="12" x2="22" y2="12"/></svg>,
  Bolt:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Menu:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  X:           () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Code:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  Shuffle:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
  ExternalLink:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  Speaker:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  SpeakerOff:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>,
  Plus:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Edit:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  MessageSquare: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  // New icons for drafting and brief modes
  PenTool:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>,
  BookOpen:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  YouTube: () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: "100%", height: "100%" }}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
),
};

// ── Sub-components ────────────────────────────────────────────────────────────
function TypingDots() {
  return <div className="typing-dots"><span /><span /><span /></div>;
}

function WebSearchingIndicator() {
  return (
    <div className="web-searching-indicator">
      <span className="web-searching-dot" />
      <span className="web-searching-dot" />
      <span className="web-searching-dot" />
      <Icon.Globe />
      Searching the web…
    </div>
  );
}

// ── Follow-up Suggestions ─────────────────────────────────────────────────────
function FollowUpSuggestions({ suggestions, loading, onSelect }) {
  if (loading) {
    return (
      <div className="followups-wrap">
        <span className="followups-label">Thinking of follow-ups…</span>
        <TypingDots />
      </div>
    );
  }
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div className="followups-wrap">
      <span className="followups-label">You might also ask:</span>
      <div className="followups-list">
        {suggestions.map((q, i) => (
          <button key={i} className="followup-btn" onClick={() => onSelect(q)}>
            <span className="followup-arrow">→</span> {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Session Panel ─────────────────────────────────────────────────────────────
function SessionPanel({ sessionList, activeSessionId, onCreate, onSwitch, onRename, onDelete, onClearAll }) {
  const [editingId, setEditingId] = useState(null);
  const [editVal,   setEditVal]   = useState("");

  return (
    <div className="session-panel">
      <div className="session-panel__header">
        <label className="sidebar__label">
          <Icon.MessageSquare /> Sessions
        </label>
        <button className="session-new-btn" onClick={() => onCreate()} title="New chat">
          <Icon.Plus />
        </button>
      </div>

      <div className="session-list">
        {sessionList.length === 0 && (
          <p className="docs-empty">No sessions yet</p>
        )}
        {sessionList.map(s => (
          <div
            key={s.id}
            className={`session-card ${s.id === activeSessionId ? "session-card--active" : ""}`}
            onClick={() => onSwitch(s.id)}
          >
            {editingId === s.id ? (
              <input
                className="session-rename-input"
                value={editVal}
                autoFocus
                onChange={e => setEditVal(e.target.value)}
                onBlur={() => { onRename(s.id, editVal); setEditingId(null); }}
                onKeyDown={e => {
                  if (e.key === "Enter")  { onRename(s.id, editVal); setEditingId(null); }
                  if (e.key === "Escape") { setEditingId(null); }
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="session-card__name" title={s.name}>{s.name}</span>
                <div className="session-card__actions">
                  <button
                    className="session-action-btn"
                    title="Rename"
                    onClick={e => {
                      e.stopPropagation();
                      setEditingId(s.id);
                      setEditVal(s.name);
                    }}
                  >
                    <Icon.Edit />
                  </button>
                  <button
                    className="session-action-btn session-action-btn--del"
                    title="Delete"
                    onClick={e => { e.stopPropagation(); onDelete(s.id); }}
                  >
                    <Icon.Trash />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {sessionList.length > 1 && (
        <button className="session-clear-btn" onClick={onClearAll}>
          Clear all sessions
        </button>
      )}
    </div>
  );
}

// ── Legal draft renderer ──────────────────────────────────────────────────────
function LegalMessage({ content, provider, model }) {
  const [copied, setCopied] = React.useState(false);
  const prov = PROVIDERS[provider] || {};

  const copyText = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderContent = (text) => {
    if (!text || text === "...") return <TypingDots />;
    const lines = text.split("\n");
    return lines.map((line, i) => {
      if (/^[═─]{3,}/.test(line))
        return <div key={i} className="legal-divider" />;
      if (line.includes("LEGAL ANALYSIS MEMORANDUM"))
        return <div key={i} className="legal-main-title">{line}</div>;
      if (/^(RE:|DATE:|PREPARED BY:)/.test(line.trim()))
        return (
          <div key={i} className="legal-meta">
            <strong>{line.split(":")[0]}:</strong>
            {line.slice(line.indexOf(":") + 1)}
          </div>
        );
      if (/^[IVX]+\.\s+[A-Z]/.test(line.trim()))
        return <div key={i} className="legal-section-header">{line.trim()}</div>;
      if (/^[A-C]\.\s+/.test(line.trim()) && line.trim().length < 60)
        return <div key={i} className="legal-sub-header">{line.trim()}</div>;
      if (/^[⚠✓]/.test(line.trim()))
        return (
          <div key={i} className={`legal-risk ${line.includes("HIGH") ? "legal-risk--high" : line.includes("MEDIUM") ? "legal-risk--medium" : "legal-risk--low"}`}>
            {line.trim()}
          </div>
        );
      if (/^[•\-]\s/.test(line.trim()))
        return <div key={i} className="legal-bullet">{line.trim()}</div>;
      if (/^\d+\.\s/.test(line.trim()))
        return <div key={i} className="legal-numbered">{line.trim()}</div>;
      if (line.includes("DISCLAIMER"))
        return <div key={i} className="legal-disclaimer">{line}</div>;
      if (!line.trim()) return <div key={i} className="legal-spacer" />;
      return <p key={i} className="legal-para">{line}</p>;
    });
  };

  return (
    <div className="legal-message">
      <div className="legal-message__header">
        <div className="legal-badge">
          <Icon.Scale /> Legal Analysis
        </div>
        <div className="legal-message__tags">
          {provider && (
            <span className="tag" style={{ color: prov.color, borderColor: prov.color + "44" }}>
              {prov.icon} {prov.label}
            </span>
          )}
          {model && <span className="tag">{model}</span>}
        </div>
        <button className="legal-copy-btn" onClick={copyText} title="Copy full analysis">
          <Icon.Copy /> {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="legal-body">{renderContent(content)}</div>
    </div>
  );
}

// ── Drafting message renderer ─────────────────────────────────────────────────
function DraftingMessage({ content, provider, model }) {
  const [copied, setCopied] = React.useState(false);
  const prov = PROVIDERS[provider] || {};

  const copyText = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderContent = (text) => {
    if (!text || text === "...") return <TypingDots />;
    const lines = text.split("\n");
    return lines.map((line, i) => {
      if (/^[═─]{3,}/.test(line))
        return <div key={i} className="legal-divider" />;
      // Document title (e.g., PLAINT / WRIT PETITION / SALE DEED)
      if (/^\[.*\]$/.test(line.trim()) || /^(PLAINT|WRIT PETITION|BAIL APPLICATION|SALE DEED|LEASE DEED|GIFT DEED|MORTGAGE DEED|PETITION|APPLICATION|COMPLAINT|CAVEAT|WRITTEN STATEMENT)/i.test(line.trim()))
        return <div key={i} className="legal-main-title">{line.trim()}</div>;
      // Court header lines
      if (/^IN THE /i.test(line.trim()) || /^BETWEEN:/i.test(line.trim()))
        return <div key={i} className="legal-section-header" style={{ textAlign: "center" }}>{line.trim()}</div>;
      // MOST RESPECTFULLY SHOWETH / PRAYER / VERIFICATION headings
      if (/^(MOST RESPECTFULLY SHOWETH|PRAYER|VERIFICATION|PLACE:|DATE:)/i.test(line.trim()))
        return <div key={i} className="legal-sub-header">{line.trim()}</div>;
      // versus line
      if (/^\s*\.{3,}\s*(Petitioner|Plaintiff|Respondent|Defendant|Appellant)/i.test(line))
        return <div key={i} className="legal-para" style={{ paddingLeft: "2rem", fontStyle: "italic" }}>{line}</div>;
      if (/^\s*versus\s*$/i.test(line.trim()))
        return <div key={i} className="legal-section-header" style={{ textAlign: "center" }}>— versus —</div>;
      // Roman numeral or lettered sections
      if (/^[IVX]+\.\s+[A-Z]/.test(line.trim()))
        return <div key={i} className="legal-section-header">{line.trim()}</div>;
      if (/^[A-D]\.\s+/.test(line.trim()) && line.trim().length < 80)
        return <div key={i} className="legal-sub-header">{line.trim()}</div>;
      // Numbered paragraphs
      if (/^\d+\.\s/.test(line.trim()))
        return <div key={i} className="legal-numbered">{line.trim()}</div>;
      // Sub-numbered (a), (b), (c)
      if (/^\([a-z]\)\s/.test(line.trim()))
        return <div key={i} className="legal-bullet" style={{ paddingLeft: "1.5rem" }}>{line.trim()}</div>;
      // Bullet points
      if (/^[•\-]\s/.test(line.trim()))
        return <div key={i} className="legal-bullet">{line.trim()}</div>;
      // DISCLAIMER
      if (line.includes("DISCLAIMER"))
        return <div key={i} className="legal-disclaimer">{line}</div>;
      // TO BE FILLED placeholders
      if (line.includes("[TO BE FILLED"))
        return <div key={i} className="legal-para" style={{ color: "var(--color-text-warning, #f59e0b)", fontStyle: "italic" }}>{line}</div>;
      if (!line.trim()) return <div key={i} className="legal-spacer" />;
      return <p key={i} className="legal-para">{line}</p>;
    });
  };

  return (
    <div className="legal-message">
      <div className="legal-message__header">
        <div className="legal-badge" style={{ background: "var(--color-background-success, #d1fae5)", color: "var(--color-text-success, #065f46)" }}>
          <Icon.PenTool /> Legal Draft
        </div>
        <div className="legal-message__tags">
          {provider && (
            <span className="tag" style={{ color: prov.color, borderColor: prov.color + "44" }}>
              {prov.icon} {prov.label}
            </span>
          )}
          {model && <span className="tag">{model}</span>}
        </div>
        <button className="legal-copy-btn" onClick={copyText} title="Copy full draft">
          <Icon.Copy /> {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="legal-body">{renderContent(content)}</div>
    </div>
  );
}

// ── Case Brief message renderer ───────────────────────────────────────────────
function BriefMessage({ content, provider, model }) {
  const [copied, setCopied] = React.useState(false);
  const prov = PROVIDERS[provider] || {};

  const copyText = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderContent = (text) => {
    if (!text || text === "...") return <TypingDots />;
    const lines = text.split("\n");
    return lines.map((line, i) => {
      if (/^[═─]{3,}/.test(line))
        return <div key={i} className="legal-divider" />;
      if (line.trim() === "CASE BRIEF")
        return <div key={i} className="legal-main-title">{line.trim()}</div>;
      // Roman numeral section headers (I. HEADING, II. STATEMENT OF FACTS, etc.)
      if (/^[IVX]+\.\s+[A-Z]/.test(line.trim()))
        return <div key={i} className="legal-section-header">{line.trim()}</div>;
      // Lettered sub-sections (A. Parties, B. Legally Relevant Facts, etc.)
      if (/^[A-D]\.\s+/.test(line.trim()) && line.trim().length < 100)
        return <div key={i} className="legal-sub-header">{line.trim()}</div>;
      // Metadata fields (Case Name:, Court:, Citation:, etc.)
      if (/^(Case Name|Court|Date Decided|Citation|Coram|Subject Area|Cause of Action|Relief Sought|Defence Raised|Trial Court|Holding on Issue|Issue \d+)\s*:/.test(line.trim()))
        return (
          <div key={i} className="legal-meta">
            <strong>{line.split(":")[0]}:</strong>
            {line.slice(line.indexOf(":") + 1)}
          </div>
        );
      // Issue lines
      if (/^Issue \d+:/i.test(line.trim()))
        return <div key={i} className="legal-numbered" style={{ fontStyle: "italic" }}>{line.trim()}</div>;
      // Numbered items
      if (/^\d+\.\s/.test(line.trim()))
        return <div key={i} className="legal-numbered">{line.trim()}</div>;
      // Bullet points
      if (/^[•\-]\s/.test(line.trim()))
        return <div key={i} className="legal-bullet">{line.trim()}</div>;
      // Concurring / Dissenting labels
      if (/^(Concurring|Dissenting)\s*—/.test(line.trim()))
        return (
          <div key={i} className={`legal-risk ${line.includes("Dissenting") ? "legal-risk--high" : "legal-risk--low"}`}>
            {line.trim()}
          </div>
        );
      // DISCLAIMER
      if (line.includes("DISCLAIMER"))
        return <div key={i} className="legal-disclaimer">{line}</div>;
      // "Not ascertainable" placeholders
      if (line.includes("Not ascertainable"))
        return <div key={i} className="legal-para" style={{ color: "var(--color-text-secondary)", fontStyle: "italic" }}>{line}</div>;
      if (!line.trim()) return <div key={i} className="legal-spacer" />;
      return <p key={i} className="legal-para">{line}</p>;
    });
  };

  return (
    <div className="legal-message">
      <div className="legal-message__header">
        <div className="legal-badge" style={{ background: "var(--color-background-info, #dbeafe)", color: "var(--color-text-info, #1e40af)" }}>
          <Icon.BookOpen /> Case Brief
        </div>
        <div className="legal-message__tags">
          {provider && (
            <span className="tag" style={{ color: prov.color, borderColor: prov.color + "44" }}>
              {prov.icon} {prov.label}
            </span>
          )}
          {model && <span className="tag">{model}</span>}
        </div>
        <button className="legal-copy-btn" onClick={copyText} title="Copy full brief">
          <Icon.Copy /> {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="legal-body">{renderContent(content)}</div>
    </div>
  );
}

// ── Message ───────────────────────────────────────────────────────────────────
function Message({ msg }) {
  const isUser = msg.role === "user";
  const prov   = PROVIDERS[msg.provider] || {};

  if (!isUser && msg.isSearching) {
    return (
      <div className="message message--ai">
        <div className="message__avatar" style={{ background: `linear-gradient(135deg,${prov.color || "#5b8af0"},#a78bfa)` }}>
          <Icon.Globe />
        </div>
        <div className="message__bubble">
          <WebSearchingIndicator />
        </div>
      </div>
    );
  }

  if (!isUser && msg.mode === "legal") {
    return (
      <div className="message message--ai">
        <div className="message__avatar" style={{ background: `linear-gradient(135deg,${prov.color || "#f59e0b"},#ef4444)` }}>
          <Icon.Scale />
        </div>
        <LegalMessage content={msg.content} provider={msg.provider} model={msg.model} />
      </div>
    );
  }

  if (!isUser && msg.mode === "drafting") {
    return (
      <div className="message message--ai">
        <div className="message__avatar" style={{ background: "linear-gradient(135deg,#10b981,#065f46)" }}>
          <Icon.PenTool />
        </div>
        <DraftingMessage content={msg.content} provider={msg.provider} model={msg.model} />
      </div>
    );
  }

  if (!isUser && msg.mode === "brief") {
    return (
      <div className="message message--ai">
        <div className="message__avatar" style={{ background: "linear-gradient(135deg,#3b82f6,#1e40af)" }}>
          <Icon.BookOpen />
        </div>
        <BriefMessage content={msg.content} provider={msg.provider} model={msg.model} />
      </div>
    );
  }

  return (
    <div className={`message ${isUser ? "message--user" : "message--ai"}`}>
      <div
        className="message__avatar"
        style={!isUser ? { background: `linear-gradient(135deg,${prov.color || "#5b8af0"},#a78bfa)` } : {}}
      >
        {isUser ? <Icon.User /> : <Icon.Bot />}
      </div>
      <div className="message__bubble">
        {msg.content === "..."
  ? <TypingDots />
  : <MarkdownRenderer content={msg.content} />}
        {msg.provider && !isUser && (
          <div className="message__tags">
            <span className="tag" style={{ color: prov.color, borderColor: prov.color + "44" }}>
              {prov.icon} {prov.label}
            </span>
            {msg.model && <span className="tag">{msg.model}</span>}
            {msg.webSearched && (
              <span className="tag tag--web">
                <Icon.Globe /> Web
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Doc Card ──────────────────────────────────────────────────────────────────
function DocCard({ doc, onDelete }) {
  return (
    <div className="doc-card">
      <div className="doc-card__icon"><Icon.File /></div>
      <div className="doc-card__info">
        <p className="doc-card__name">{doc.name}</p>
        <p className="doc-card__meta">{doc.pages} pages · {doc.chunks} chunks</p>
      </div>
      <button className="doc-card__delete" onClick={() => onDelete(doc.name)}>
        <Icon.Trash />
      </button>
    </div>
  );
}

// ── Model Panel ───────────────────────────────────────────────────────────────
function ModelPanel({ providerData, selectedProvider, selectedModel, apiKeys,
                      onProviderChange, onModelChange, onApiKeyChange, collapsed }) {
  const [showKey,      setShowKey]  = useState({});
  const [openDropdown, setOpenDrop] = useState(false);
  const prov   = PROVIDERS[selectedProvider] || {};
  const pInfo  = providerData[selectedProvider] || {};
  const models = selectedProvider === "ollama"
    ? (pInfo.models || []).map(m => ({ id: m, label: m }))
    : (pInfo.models || []);

  if (collapsed) return null;

  return (
    <div className="model-panel">
      <label className="sidebar__label">Provider</label>
      <div className="provider-tabs">
        {Object.entries(PROVIDERS).map(([key, p]) => (
          <button
            key={key}
            className={`provider-tab ${selectedProvider === key ? "provider-tab--active" : ""}`}
            style={selectedProvider === key ? { borderColor: p.color, color: p.color, background: p.color + "18" } : {}}
            onClick={() => { onProviderChange(key); setOpenDrop(false); }}
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {prov.needsKey && (
        <div className="api-key-wrap">
          <label className="sidebar__label"><Icon.Key /> {prov.label} API Key</label>
          <div className="api-key-input-wrap">
            <input
              className="api-key-input"
              type={showKey[selectedProvider] ? "text" : "password"}
              placeholder={`Paste your ${prov.label} key…`}
              value={apiKeys[selectedProvider] || ""}
              onChange={e => onApiKeyChange(selectedProvider, e.target.value)}
            />
            <button
              className="api-key-toggle"
              onClick={() => setShowKey(s => ({ ...s, [selectedProvider]: !s[selectedProvider] }))}
            >
              {showKey[selectedProvider] ? <Icon.EyeOff /> : <Icon.Eye />}
            </button>
          </div>
          {apiKeys[selectedProvider] && (
            <p className="api-key-set">✓ Key saved for this session</p>
          )}
        </div>
      )}

      {selectedProvider === "groq" && (
        <div className="groq-badge">
          <Icon.Bolt /> Ultra-fast inference · Open source models
        </div>
      )}

      <label className="sidebar__label">Model</label>
      {models.length === 0 ? (
        <div className="models-error">
          {selectedProvider === "ollama"
            ? <><span>⚠️ No local models found.</span><br /><code>ollama pull qwen3</code></>
            : "Models load automatically"}
        </div>
      ) : (
        <div className="model-select-wrap">
          <div className="model-select" onClick={() => setOpenDrop(o => !o)}>
            <span>{models.find(m => m.id === selectedModel)?.label || selectedModel || "Select model"}</span>
            <span className="chevron"><Icon.ChevronDown /></span>
          </div>
          {openDropdown && (
            <div className="model-dropdown">
              {models.map(m => (
                <div
                  key={m.id}
                  className={`model-option ${m.id === selectedModel ? "model-option--active" : ""}`}
                  onClick={() => { onModelChange(m.id); setOpenDrop(false); }}
                >
                  {m.id === selectedModel && <span className="model-check"><Icon.Check /></span>}
                  <span>{m.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Web Search Toggle ─────────────────────────────────────────────────────────
function WebSearchToggle({ enabled, onChange, collapsed }) {
  if (collapsed) {
    return (
      <button
        className={`sidebar-icon-btn ${enabled ? "sidebar-icon-btn--teal" : ""}`}
        onClick={() => onChange(!enabled)}
        title={enabled ? "Web Search ON — click to disable" : "Web Search OFF — click to enable"}
      >
        {enabled ? <Icon.Globe /> : <Icon.GlobeOff />}
      </button>
    );
  }
  return (
    <div
      className={`web-search-toggle ${enabled ? "web-search-toggle--on" : ""}`}
      onClick={() => onChange(!enabled)}
      title={enabled ? "Disable web search" : "Enable web search augmentation"}
    >
      <div className="web-search-toggle__icon">
        {enabled ? <Icon.Globe /> : <Icon.GlobeOff />}
      </div>
      <div className="web-search-toggle__text">
        <span className="web-search-toggle__label">Web Search</span>
        <span className="web-search-toggle__status">{enabled ? "ON" : "OFF"}</span>
      </div>
      <div className={`web-search-toggle__pill ${enabled ? "web-search-toggle__pill--on" : ""}`}>
        <div className="web-search-toggle__thumb" />
      </div>
    </div>
  );
}

// ── Nav Links ─────────────────────────────────────────────────────────────────
function NavLinks({ collapsed }) {
  const links = [
    { label: "Code Review",    path: "/review",    icon: <Icon.Code />,    color: "#34d399", desc: "AI-powered review"  },
    { label: "File Converter", path: "/converter", icon: <Icon.Shuffle />, color: "#a78bfa", desc: "Convert any format" },
    { label: "YouTube → PDF", path: "/youtube", icon: <Icon.YouTube />, color: "#e53e3e", desc: "Transcribe & export" },
  ];

  if (collapsed) {
    return (
      <div className="nav-links-collapsed">
        {links.map(link => (
          <a key={link.path} href={link.path} className="sidebar-icon-btn" title={link.label} style={{ "--btn-color": link.color }}>
            {link.icon}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="nav-links">
      <label className="sidebar__label">Quick Access</label>
      {links.map(link => (
        <a key={link.path} href={link.path} className="nav-link-card" style={{ "--link-color": link.color }}>
          <span className="nav-link-card__icon" style={{ color: link.color, background: link.color + "18", borderColor: link.color + "44" }}>
            {link.icon}
          </span>
          <span className="nav-link-card__text">
            <span className="nav-link-card__label">{link.label}</span>
            <span className="nav-link-card__desc">{link.desc}</span>
          </span>
          <span className="nav-link-card__arrow"><Icon.ExternalLink /></span>
        </a>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [input,            setInput]           = useState("");
  const [isStreaming,      setIsStreaming]      = useState(false);
  const [mode,             setMode]            = useState("chat");
  const [documents,        setDocuments]       = useState([]);
  const [providerData,     setProviderData]    = useState({});
  const [selectedProvider, setSelectedProvider]= useState("ollama");
  const [selectedModel,    setSelectedModel]   = useState("");
  const [apiKeys,          setApiKeys]         = useState({});
  const [isUploading,      setIsUploading]     = useState(false);
  const [uploadStatus,     setUploadStatus]    = useState(null);
  const [ollamaOk,         setOllamaOk]        = useState(null);
  const [isDragging,       setIsDragging]      = useState(false);
  const [webSearchEnabled, setWebSearchEnabled]= useState(false);
  const [sidebarOpen,      setSidebarOpen]     = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed]= useState(false);

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const {
    sessionList,
    activeSessionId,
    messages,
    createSession,
    switchSession,
    renameSession,
    deleteSession,
    setMessages,
    clearAll,
  } = useChatSessions("app");

  const { ttsEnabled, isSpeaking, speak, stopSpeaking, toggleTTS } = useTTS();

  const {
    followUps,
    loading: followUpsLoading,
    generateFollowUps,
    clearFollowUps,
  } = useFollowUps();

  // ── Refs ───────────────────────────────────────────────────────────────────
  const messagesEndRef  = useRef(null);
  const fileInputRef    = useRef(null);
  const selectedProvRef = useRef(selectedProvider);
  const selectedModRef  = useRef(selectedModel);
  const apiKeysRef      = useRef(apiKeys);
  const handleSendRef   = useRef(null);
  const modeRef         = useRef("chat");
  const webSearchRef    = useRef(false);

  useEffect(() => { modeRef.current      = mode;             }, [mode]);
  useEffect(() => { webSearchRef.current = webSearchEnabled; }, [webSearchEnabled]);
  useEffect(() => { selectedProvRef.current = selectedProvider; }, [selectedProvider]);
  useEffect(() => { selectedModRef.current  = selectedModel;    }, [selectedModel]);
  useEffect(() => { apiKeysRef.current      = apiKeys;          }, [apiKeys]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 769px)");
    const handle = (e) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);

  useEffect(() => {
    if (sessionList.length === 0) createSession("New Chat");

    api.getProviders().then(data => {
      setProviderData(data);
      const ollamaModels = data.ollama?.models || [];
      if (ollamaModels.length > 0) {
        setSelectedModel(ollamaModels[0]);
        selectedModRef.current = ollamaModels[0];
      }
    }).catch(() => {});

    api.getDocuments()
      .then(({ documents }) => setDocuments(documents))
      .catch(() => {});

    api.checkHealth()
      .then(h => setOllamaOk(h.ollama))
      .catch(() => setOllamaOk(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Provider / model / key handlers ───────────────────────────────────────
  const handleProviderChange = useCallback((prov) => {
    setSelectedProvider(prov);
    selectedProvRef.current = prov;
    setProviderData(prev => {
      const pInfo  = prev[prov] || {};
      const models = prov === "ollama"
        ? (pInfo.models || []).map(m => ({ id: m }))
        : (pInfo.models || []);
      if (models.length > 0) {
        setSelectedModel(models[0].id);
        selectedModRef.current = models[0].id;
      } else {
        setSelectedModel("");
        selectedModRef.current = "";
      }
      return prev;
    });
  }, []);

  const handleModelChange = useCallback((modelId) => {
    setSelectedModel(modelId);
    selectedModRef.current = modelId;
  }, []);

  const handleApiKeyChange = useCallback((provider, key) => {
    setApiKeys(prev => {
      const next = { ...prev, [provider]: key };
      apiKeysRef.current = next;
      return next;
    });
  }, []);

  // ── Send / stream ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async (overrideText) => {
    const question = (overrideText || input).trim();

    // Legal, drafting, brief modes: allow empty question (full auto-analysis)
    const isDocMode = ["legal", "drafting", "brief"].includes(modeRef.current);
    if (!isDocMode && !question) return;
    if (isStreaming) return;

    const provider     = selectedProvRef.current;
    const model        = selectedModRef.current;
    const apiKey       = apiKeysRef.current[provider] || "";
    const currMode     = modeRef.current;
    const useWebSearch = webSearchRef.current;

    if (!model) return;
    if (documents.length === 0 && !(useWebSearch && currMode === "chat")) return;

    clearFollowUps();
    setInput("");

    const userMsgId = Date.now();
    const aiMsgId   = userMsgId + 1;

    const userContent = isDocMode && !question
      ? currMode === "drafting"
        ? "Draft a complete court-ready legal document from the uploaded material"
        : currMode === "brief"
        ? "Prepare a complete professional case brief from the uploaded material"
        : "Generate full legal analysis"
      : question;

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user",  content: userContent, mode: currMode },
      { id: aiMsgId,   role: "ai",    content: "...", provider, model, mode: currMode,
        webSearched: useWebSearch && currMode === "chat" },
    ]);
    setIsStreaming(true);

    try {
      let full        = "";
      let isSearching = false;

      for await (const event of api.queryStream(
        question, provider, model, apiKey, currMode, useWebSearch
      )) {
        if (event.searching) {
          setMessages(prev =>
            prev.map(m => m.id === aiMsgId ? { ...m, isSearching: true, content: "..." } : m)
          );
          isSearching = true;
          continue;
        }
        if (event.chunk !== undefined) {
          if (isSearching) {
            isSearching = false;
            setMessages(prev =>
              prev.map(m => m.id === aiMsgId ? { ...m, isSearching: false } : m)
            );
          }
          full += event.chunk;
          setMessages(prev =>
            prev.map(m => m.id === aiMsgId ? { ...m, content: full } : m)
          );
        }
      }

      if (full) speak(full);

      // Follow-ups only in chat mode
      if (full && currMode === "chat") {
        generateFollowUps(question, full, provider, model, apiKey);
      }

    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === aiMsgId ? { ...m, content: `⚠️ ${err.message}`, isSearching: false } : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, documents, speak, clearFollowUps, generateFollowUps, setMessages]);

  handleSendRef.current = handleSend;

  // ── Voice input ────────────────────────────────────────────────────────────
  const handleTranscript = useCallback((transcript) => {
    setInput(transcript);
    setTimeout(() => handleSendRef.current(transcript), 50);
  }, []);

  const { isListening, error: voiceError, startListening, stopListening } =
    useVoiceInput({ onTranscript: handleTranscript });

  // ── File handling ──────────────────────────────────────────────────────────
  const processFile = async (file) => {
    if (!file?.name.endsWith(".pdf")) {
      setUploadStatus({ error: "Please select a PDF file." });
      return;
    }
    setIsUploading(true);
    setUploadStatus(null);
    try {
      const result = await api.uploadPDF(file);
      setUploadStatus(result.error ? { error: result.error } : { success: result.message });
      const { documents } = await api.getDocuments();
      setDocuments(documents);
    } catch (err) {
      setUploadStatus({ error: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e) => { processFile(e.target.files[0]); e.target.value = ""; };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFile(e.dataTransfer.files[0]);
  };
  const handleDeleteDoc = async (name) => {
    await api.deleteDocument(name);
    const { documents } = await api.getDocuments();
    setDocuments(documents);
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const isDocMode = ["legal", "drafting", "brief"].includes(mode);

  const canSend = !isStreaming && !!selectedModel && (
    (isDocMode && documents.length > 0) ||
    (mode === "chat" && (documents.length > 0 || webSearchEnabled) && input.trim())
  );

  const closeSidebar  = () => setSidebarOpen(false);
  const toggleCollapse = () => setSidebarCollapsed(c => !c);

  // ── Mode config ────────────────────────────────────────────────────────────
  const modeConfig = {
    chat: {
      label:       "Chat",
      icon:        <Icon.Chat />,
      btnClass:    "mode-btn",
      hint:        `Upload a PDF or enable Web Search to start`,
      activeHint:  `${documents.length} doc${documents.length !== 1 ? "s" : ""} · ${PROVIDERS[selectedProvider]?.icon} ${PROVIDERS[selectedProvider]?.label} · ${selectedModel || "pick a model"} · Enter to send`,
      placeholder: documents.length === 0 && !webSearchEnabled
        ? "Upload a PDF first, or enable Web Search…"
        : webSearchEnabled && documents.length === 0
        ? "Ask anything — web search is active…"
        : `Ask anything · ${PROVIDERS[selectedProvider]?.label} / ${selectedModel || "no model"}`,
    },
    legal: {
      label:       "Legal Analysis",
      icon:        <Icon.Scale />,
      btnClass:    "mode-btn mode-btn--legal",
      activeClass: "mode-btn--active mode-btn--legal-active",
      hint:        "Upload a legal document, then click Send to generate a full legal draft analysis",
      activeHint:  `⚖ Legal mode · ${PROVIDERS[selectedProvider]?.icon} ${PROVIDERS[selectedProvider]?.label} · ${selectedModel || "pick a model"}`,
      placeholder: "Optional: add specific focus (e.g. 'focus on liability clauses') or leave empty for full analysis…",
    },
    drafting: {
      label:       "Drafting",
      icon:        <Icon.PenTool />,
      btnClass:    "mode-btn mode-btn--legal",
      activeClass: "mode-btn--active mode-btn--legal-active",
      hint:        "Upload case facts / instructions PDF, then describe the document to draft or leave empty for auto-draft",
      activeHint:  `✍ Drafting mode · ${PROVIDERS[selectedProvider]?.icon} ${PROVIDERS[selectedProvider]?.label} · ${selectedModel || "pick a model"}`,
      placeholder: "e.g. 'Draft a plaint for recovery of money' or leave empty to auto-draft from the uploaded facts…",
    },
    brief: {
      label:       "Case Brief",
      icon:        <Icon.BookOpen />,
      btnClass:    "mode-btn mode-btn--legal",
      activeClass: "mode-btn--active mode-btn--legal-active",
      hint:        "Upload a judgment or case material PDF, then click Send to generate a professional case brief",
      activeHint:  `📖 Case Brief mode · ${PROVIDERS[selectedProvider]?.icon} ${PROVIDERS[selectedProvider]?.label} · ${selectedModel || "pick a model"}`,
      placeholder: "Optional: e.g. 'Focus on ratio decidendi and dissenting opinion' or leave empty for full brief…",
    },
  };

  const currentMode = modeConfig[mode] || modeConfig.chat;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay${sidebarOpen ? "" : " hidden"}`}
        onClick={closeSidebar}
      />

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>

        {/* Header */}
        <div className="sidebar__header">
          {!sidebarCollapsed ? (
            <div className="sidebar__logo">
              <div className="logo-icon"><Icon.Bot /></div>
              <div>
                <h1 className="sidebar__title">QNA-AI</h1>
                <p className="sidebar__sub">Multi-Provider AI</p>
              </div>
              <button className="sidebar-close" onClick={closeSidebar} aria-label="Close sidebar">
                <Icon.X />
              </button>
            </div>
          ) : (
            <div className="sidebar__logo-collapsed">
              <div className="logo-icon logo-icon--sm"><Icon.Bot /></div>
            </div>
          )}
          <button
            className="sidebar-collapse-btn"
            onClick={toggleCollapse}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <Icon.ChevronRight /> : <Icon.ChevronLeft />}
          </button>
        </div>

        {/* Ollama status */}
        {!sidebarCollapsed && (
          <div className={`status-pill ${ollamaOk ? "status-pill--ok" : "status-pill--err"}`}>
            <span className="status-dot-sm" />
            Ollama {ollamaOk ? "online" : "offline"}
          </div>
        )}
        {sidebarCollapsed && (
          <div
            className={`status-dot-centered ${ollamaOk ? "status-dot-centered--ok" : "status-dot-centered--err"}`}
            title={`Ollama ${ollamaOk ? "online" : "offline"}`}
          />
        )}

        {/* Sessions panel */}
        {!sidebarCollapsed && (
          <SessionPanel
            sessionList={sessionList}
            activeSessionId={activeSessionId}
            onCreate={createSession}
            onSwitch={switchSession}
            onRename={renameSession}
            onDelete={deleteSession}
            onClearAll={clearAll}
          />
        )}

        {sidebarCollapsed && (
          <button
            className="sidebar-icon-btn"
            onClick={() => createSession()}
            title="New chat session"
          >
            <Icon.Plus />
          </button>
        )}

        {/* Model panel */}
        <ModelPanel
          providerData={providerData}
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          apiKeys={apiKeys}
          onProviderChange={handleProviderChange}
          onModelChange={handleModelChange}
          onApiKeyChange={handleApiKeyChange}
          collapsed={sidebarCollapsed}
        />

        {sidebarCollapsed && (
          <div className="collapsed-provider-badge" title={PROVIDERS[selectedProvider]?.label}>
            <span style={{ fontSize: 20 }}>{PROVIDERS[selectedProvider]?.icon}</span>
          </div>
        )}

        {/* Web search toggle */}
        <WebSearchToggle
          enabled={webSearchEnabled}
          onChange={setWebSearchEnabled}
          collapsed={sidebarCollapsed}
        />

        {/* Nav links */}
        <NavLinks collapsed={sidebarCollapsed} />

        {/* Upload zone */}
        {!sidebarCollapsed && (
          <>
            <div
              className={`upload-zone ${isDragging ? "upload-zone--drag" : ""} ${isUploading ? "upload-zone--loading" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input ref={fileInputRef} type="file" accept=".pdf" hidden onChange={handleFileChange} />
              <div className="upload-zone__icon"><Icon.Upload /></div>
              {isUploading ? (
                <p>Processing PDF…</p>
              ) : (
                <>
                  <p className="upload-zone__primary">Drop PDF here</p>
                  <p className="upload-zone__secondary">or click to browse</p>
                </>
              )}
            </div>

            {uploadStatus && (
              <div className={`upload-status ${uploadStatus.error ? "upload-status--err" : "upload-status--ok"}`}>
                {uploadStatus.error || uploadStatus.success}
              </div>
            )}

            <div className="docs-section">
              <label className="sidebar__label">
                Documents <span className="docs-count">{documents.length}</span>
              </label>
              {documents.length === 0
                ? <p className="docs-empty">No documents yet</p>
                : (
                  <div className="docs-list">
                    {documents.map(d => (
                      <DocCard key={d.name} doc={d} onDelete={handleDeleteDoc} />
                    ))}
                  </div>
                )}
            </div>
          </>
        )}

        {sidebarCollapsed && (
          <button className="sidebar-icon-btn" onClick={() => fileInputRef.current?.click()} title="Upload PDF">
            <Icon.Upload />
            <input ref={fileInputRef} type="file" accept=".pdf" hidden onChange={handleFileChange} />
          </button>
        )}
      </aside>

      {/* ── Chat area ───────────────────────────────────────────────────── */}
      <main className="chat">
        {/* Mobile top bar */}
        {/* <div className="chat__topbar">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            <Icon.Menu />
          </button>
          <ShareButton messages={messages} sessionTitle="QNA-AI Session" currentUser="Me" />
          <span className="chat__topbar-title">QNA-AI</span>
          <span className="chat__topbar-status">
            {PROVIDERS[selectedProvider]?.icon} {selectedModel || "no model"}
          </span>
        </div> */}
        <div className="chat__topbar">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)}>
            <Icon.Menu />
          </button>
          <span className="chat__topbar-title">QNA-AI</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="chat__topbar-status">
              {PROVIDERS[selectedProvider]?.icon} {selectedModel || "no model"}
            </span>
            {/* ADD THIS ↓ */}
            <ShareButton
              messages={messages}
              sessionTitle={`${PROVIDERS[selectedProvider]?.label} / ${selectedModel}`}
              currentUser={localStorage.getItem("username") || "Me"}
            />
          </div>
        </div>

        {/* Messages */}
        <div className="chat__messages">
          {messages.map(msg => <Message key={msg.id} msg={msg} />)}
          <div ref={messagesEndRef} />
        </div>

        {voiceError && <div className="voice-error">{voiceError}</div>}

        {/* Input area */}
        <div className="chat__input-wrap">

          {/* Follow-up suggestions — only in chat mode */}
          {mode === "chat" && (
            <FollowUpSuggestions
              suggestions={followUps}
              loading={followUpsLoading}
              onSelect={(q) => {
                setInput(q);
                setTimeout(() => handleSendRef.current(q), 50);
              }}
            />
          )}

          {/* Mode toggle row */}
          <div className="mode-toggle-wrap">
            {/* Chat */}
            <button
              className={`mode-btn ${mode === "chat" ? "mode-btn--active" : ""}`}
              onClick={() => { setMode("chat"); modeRef.current = "chat"; }}
            >
              <Icon.Chat /> Chat
            </button>

            {/* Legal Analysis */}
            <button
              className={`mode-btn mode-btn--legal ${mode === "legal" ? "mode-btn--active mode-btn--legal-active" : ""}`}
              onClick={() => { setMode("legal"); modeRef.current = "legal"; }}
            >
              <Icon.Scale /> Legal Analysis
            </button>

            {/* Drafting */}
            <button
              className={`mode-btn mode-btn--legal ${mode === "drafting" ? "mode-btn--active mode-btn--legal-active" : ""}`}
              onClick={() => { setMode("drafting"); modeRef.current = "drafting"; }}
              style={mode === "drafting" ? { borderColor: "#10b981", color: "#10b981", background: "#10b98118" } : {}}
            >
              <Icon.PenTool /> Drafting
            </button>

            {/* Case Brief */}
            <button
              className={`mode-btn mode-btn--legal ${mode === "brief" ? "mode-btn--active mode-btn--legal-active" : ""}`}
              onClick={() => { setMode("brief"); modeRef.current = "brief"; }}
              style={mode === "brief" ? { borderColor: "#3b82f6", color: "#3b82f6", background: "#3b82f618" } : {}}
            >
              <Icon.BookOpen /> Case Brief
            </button>

            {/* Active-mode badges */}
            {webSearchEnabled && mode === "chat" && (
              <span className="web-search-active-badge">
                <Icon.Globe /> Web search active
              </span>
            )}
            {mode !== "chat" && (
              <span className="mode-hint">
                {currentMode.hint}
              </span>
            )}
          </div>

          {/* Input box */}
          <div className={`chat__input-box ${isListening ? "chat__input-box--listening" : ""} ${isDocMode ? "chat__input-box--legal" : ""} ${webSearchEnabled ? "chat__input-box--websearch" : ""}`}>
            <textarea
              className="chat__textarea"
              placeholder={currentMode.placeholder}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              rows={1}
              disabled={isStreaming || (documents.length === 0 && !webSearchEnabled && mode === "chat")}
            />
            <div className="chat__actions">
              {/* TTS toggle */}
              <button
                className={`btn-voice ${ttsEnabled ? "btn-voice--active" : ""} ${isSpeaking ? "btn-voice--speaking" : ""}`}
                onClick={isSpeaking ? stopSpeaking : toggleTTS}
                title={isSpeaking ? "Stop speaking" : ttsEnabled ? "Voice output ON — click to disable" : "Voice output OFF — click to enable"}
              >
                {ttsEnabled ? <Icon.Speaker /> : <Icon.SpeakerOff />}
              </button>

              {/* Voice input */}
              <button
                className={`btn-voice ${isListening ? "btn-voice--active" : ""}`}
                onClick={isListening ? stopListening : startListening}
                disabled={documents.length === 0 && !webSearchEnabled}
                title={isListening ? "Stop" : "Voice input"}
              >
                {isListening ? <Icon.MicOff /> : <Icon.Mic />}
              </button>

              {/* Send */}
              <button
                className="btn-send"
                style={canSend ? { background: `linear-gradient(135deg,${PROVIDERS[selectedProvider]?.color || "#5b8af0"},#a78bfa)` } : {}}
                onClick={() => handleSend()}
                disabled={!canSend}
              >
                <Icon.Send />
              </button>
            </div>
          </div>

          {isListening && (
            <div className="listening-bar">
              <span className="pulse" /> Listening…
            </div>
          )}

          <p className="chat__hint">
            {isDocMode
              ? currentMode.activeHint
              : webSearchEnabled
              ? `🌐 Web search ON · ${PROVIDERS[selectedProvider]?.icon} ${PROVIDERS[selectedProvider]?.label} · ${selectedModel || "pick a model"}`
              : documents.length > 0
              ? currentMode.activeHint
              : currentMode.hint}
          </p>
        </div>
      </main>
    </div>
  );
}
