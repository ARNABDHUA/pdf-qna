import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./services/api";
import { useVoiceInput } from "./hooks/useVoiceInput";
import "./User.css";

// ── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDERS = {
  ollama:    { label: "Ollama",  color: "#a78bfa", icon: "🦙", needsKey: false },
  openai:    { label: "ChatGPT", color: "#10b981", icon: "✦",  needsKey: true  },
  anthropic: { label: "Claude",  color: "#f59e0b", icon: "◆",  needsKey: true  },
  gemini:    { label: "Gemini",  color: "#3b82f6", icon: "✧",  needsKey: true  },
};

// ── Icons ─────────────────────────────────────────────────────────────────────
const UIcon = {
  Send: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  Mic: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ),
  MicOff: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
      <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ),
  Bot: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/>
      <path d="M12 7v4"/>
      <line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" strokeLinecap="round"/>
      <line x1="12" y1="16" x2="12" y2="16" strokeWidth="3" strokeLinecap="round"/>
      <line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  ),
  User: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Code: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  Chat: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
};

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="u-typing-dots">
      <span /><span /><span />
    </div>
  );
}

// ── Message ───────────────────────────────────────────────────────────────────
function UMessage({ msg }) {
  const isUser = msg.role === "user";
  const prov   = PROVIDERS[msg.provider] || {};

  return (
    <div className={`u-message ${isUser ? "u-message--user" : "u-message--ai"}`}>
      <div className="u-message__avatar"
        style={!isUser ? { background: `linear-gradient(135deg,${prov.color || "#5b8af0"},#a78bfa)` } : {}}>
        {isUser ? <UIcon.User /> : <UIcon.Bot />}
      </div>
      <div className="u-message__bubble">
        {/* Show mode badge for code review messages */}
        {msg.mode === "code_review" && !isUser && (
          <span className="u-mode-badge">⌥ Code Review</span>
        )}
        {msg.content === "..." ? <TypingDots /> : <p className="u-message__text">{msg.content}</p>}
      </div>
    </div>
  );
}

// ── Mode Toggle ───────────────────────────────────────────────────────────────
function ModeToggle({ mode, onChange, disabled }) {
  return (
    <div className="u-mode-toggle">
      <span className="u-mode-toggle__label">Mode</span>
      <button
        className={`u-mode-toggle__btn ${mode === "chat" ? "u-mode-toggle__btn--active" : ""}`}
        onClick={() => onChange("chat")}
        disabled={disabled}
        title="Chat mode — ask questions about your documents"
      >
        <UIcon.Chat />
        Chat
      </button>
      <button
        className={`u-mode-toggle__btn u-mode-toggle__btn--code ${mode === "code_review" ? "u-mode-toggle__btn--active u-mode-toggle__btn--code-active" : ""}`}
        onClick={() => onChange("code_review")}
        disabled={disabled}
        title="Code Review mode — paste code for AI analysis"
      >
        <UIcon.Code />
        Code Review
      </button>
    </div>
  );
}

// ── Code Review Panel ─────────────────────────────────────────────────────────
function CodeReviewPanel({ useCase, code, onUseCaseChange, onCodeChange, disabled }) {
  return (
    <div className="u-code-panel">
      <div className="u-code-panel__header">
        <label className="u-code-panel__usecase-label">Use-case</label>
        <input
          className="u-code-panel__usecase-input"
          placeholder="e.g. JWT auth middleware, REST API endpoint, database query, React component…"
          value={useCase}
          onChange={e => onUseCaseChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      <textarea
        className="u-code-panel__textarea"
        placeholder={"Paste your code here…\n\nThe AI will review it for bugs, security issues, performance, and best practices based on the use-case above."}
        value={code}
        onChange={e => onCodeChange(e.target.value)}
        rows={7}
        disabled={disabled}
        spellCheck={false}
      />
    </div>
  );
}

// ── Main User Page ────────────────────────────────────────────────────────────
export default function User() {
  const [messages, setMessages] = useState([{
    id: 0, role: "ai",
    content: "Ask any query related to AI Friday.",
  }]);
  const [input,            setInput]           = useState("");
  const [isStreaming,      setIsStreaming]      = useState(false);
  const [documents,        setDocuments]        = useState([]);
  const [providerData,     setProviderData]     = useState({});
  const [selectedProvider, setSelectedProvider] = useState("ollama");
  const [selectedModel,    setSelectedModel]    = useState("");
  const [apiKeys]                               = useState({});

  // ── NEW: mode, code review state ──────────────────────────────────────────
  const [mode,     setMode]     = useState("chat");         // "chat" | "code_review"
  const [useCase,  setUseCase]  = useState("");             // user-described use-case
  const [code,     setCode]     = useState("");             // pasted code

  const messagesEndRef  = useRef(null);
  const selectedProvRef = useRef(selectedProvider);
  const selectedModRef  = useRef(selectedModel);
  const apiKeysRef      = useRef(apiKeys);
  const handleSendRef   = useRef(null);

  useEffect(() => { selectedProvRef.current = selectedProvider; }, [selectedProvider]);
  useEffect(() => { selectedModRef.current  = selectedModel;    }, [selectedModel]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    api.getProviders().then(data => {
      setProviderData(data);
      const ollamaModels = data.ollama?.models || [];
      if (ollamaModels.length > 0) {
        setSelectedModel(ollamaModels[0]);
        selectedModRef.current = ollamaModels[0];
      } else {
        for (const prov of ["anthropic", "openai", "gemini"]) {
          const models = data[prov]?.models || [];
          if (models.length > 0) {
            setSelectedProvider(prov);
            selectedProvRef.current = prov;
            setSelectedModel(models[0].id);
            selectedModRef.current = models[0].id;
            break;
          }
        }
      }
    }).catch(() => {});
    api.getDocuments().then(({ documents }) => setDocuments(documents)).catch(() => {});
  }, []);

  // ── Send handler (mode-aware) ──────────────────────────────────────────────
  const handleSend = useCallback(async (overrideText) => {
    const currentMode = mode;
    const provider    = selectedProvRef.current;
    const modelId     = selectedModRef.current;
    const apiKey      = apiKeysRef.current[provider] || "";

    if (!modelId) return;
    if (isStreaming) return;

    let question = "";

    if (currentMode === "code_review") {
      // Code review: code is required; use-case + optional follow-up question
      const trimmedCode = code.trim();
      if (!trimmedCode) return;
      const trimmedUseCase = useCase.trim();
      const followUp       = (overrideText || input).trim();
      // Build the question string that the backend will receive
      question = [
        trimmedUseCase ? `USE-CASE: ${trimmedUseCase}` : "",
        `CODE:\n\`\`\`\n${trimmedCode}\n\`\`\``,
        followUp ? `ADDITIONAL INSTRUCTIONS: ${followUp}` : "",
      ].filter(Boolean).join("\n\n");
    } else {
      question = (overrideText || input).trim();
      if (!question) return;
    }

    setInput("");
    const userMsgId = Date.now();
    const aiMsgId   = userMsgId + 1;

    // Build a readable preview for the user bubble
    const userBubbleText =
      currentMode === "code_review"
        ? `[Code Review${useCase.trim() ? ` — ${useCase.trim()}` : ""}]\n${code.trim().slice(0, 120)}${code.trim().length > 120 ? "…" : ""}`
        : question;

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user", content: userBubbleText, mode: currentMode },
      { id: aiMsgId,   role: "ai",   content: "...", provider, model: modelId, mode: currentMode },
    ]);
    setIsStreaming(true);

    try {
      let full = "";
      for await (const event of api.queryStream(question, provider, modelId, apiKey, currentMode)) {
        if (event.searching) continue; // optional: show a "Searching…" status
        if (event.done) break;
        if (event.chunk) {
          full += event.chunk;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: full } : m));
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, content: `⚠️ ${err.message}` } : m));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, mode, code, useCase]);

  handleSendRef.current = handleSend;

  const handleTranscript = useCallback((transcript) => {
    setInput(transcript);
    setTimeout(() => handleSendRef.current(transcript), 50);
  }, []);

  const { isListening, error: voiceError, startListening, stopListening } =
    useVoiceInput({ onTranscript: handleTranscript });

  const prov = PROVIDERS[selectedProvider] || {};

  // Can-send logic differs by mode
  const canSend = !isStreaming && !!selectedModel && (
    mode === "code_review"
      ? code.trim().length > 0
      : input.trim() && documents.length > 0
  );

  const username = localStorage.getItem("username") || "User";

  return (
    <div className="u-app">

      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <header className="u-topbar">
        <div className="u-topbar__left">
          <div className="u-logo-icon"><UIcon.Bot /></div>
          <div>
            <h1 className="u-topbar__title">AI Friday</h1>
            <p className="u-topbar__sub">Your AI Assistant</p>
          </div>
        </div>
        <div className="u-topbar__right">
          <div className="u-user-badge">
            <div className="u-user-badge__avatar">
              {username.charAt(0).toUpperCase()}
            </div>
            <span className="u-user-badge__name">{username}</span>
          </div>
        </div>
      </header>

      {/* ── Chat ──────────────────────────────────────────────────────── */}
      <main className="u-chat">
        <div className="u-chat__messages">
          {messages.map(msg => <UMessage key={msg.id} msg={msg} />)}
          <div ref={messagesEndRef} />
        </div>

        {voiceError && <div className="u-voice-error">{voiceError}</div>}

        <div className="u-chat__input-wrap">

          {/* ── Mode toggle (NEW) ───────────────────────────────────── */}
          <ModeToggle
            mode={mode}
            onChange={setMode}
            disabled={isStreaming}
          />

          {/* ── Code Review panel (NEW — only visible in code_review mode) ── */}
          {mode === "code_review" && (
            <CodeReviewPanel
              useCase={useCase}
              code={code}
              onUseCaseChange={setUseCase}
              onCodeChange={setCode}
              disabled={isStreaming}
            />
          )}

          {/* ── Text input (always visible; label changes by mode) ─── */}
          <div className={`u-chat__input-box ${isListening ? "u-chat__input-box--listening" : ""}`}>
            <textarea
              className="u-chat__textarea"
              placeholder={
                mode === "code_review"
                  ? "Optional: add focus areas or specific questions about the code…"
                  : documents.length === 0
                  ? "No documents loaded yet…"
                  : "Ask anything about AI Friday…"
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1}
              disabled={isStreaming || (mode === "chat" && documents.length === 0)}
            />
            <div className="u-chat__actions">
              <button
                className={`u-btn-voice ${isListening ? "u-btn-voice--active" : ""}`}
                onClick={isListening ? stopListening : startListening}
                disabled={mode === "chat" && documents.length === 0}
                title={isListening ? "Stop" : "Voice input"}
              >
                {isListening ? <UIcon.MicOff /> : <UIcon.Mic />}
              </button>
              <button
                className="u-btn-send"
                style={canSend ? { background: `linear-gradient(135deg,${prov.color || "#5b8af0"},#a78bfa)` } : {}}
                onClick={() => handleSend()}
                disabled={!canSend}
              >
                <UIcon.Send />
              </button>
            </div>
          </div>

          {isListening && (
            <div className="u-listening-bar">
              <span className="u-pulse" /> Listening…
            </div>
          )}

          <p className="u-chat__hint">
            {mode === "code_review"
              ? "Paste code above · Enter to send · Shift+Enter for new line"
              : documents.length > 0
              ? "Enter to send · Shift+Enter for new line"
              : "Documents not loaded — contact admin"}
          </p>
        </div>
      </main>
    </div>
  );
}
