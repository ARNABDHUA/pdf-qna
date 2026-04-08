import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./services/Api";
import { useVoiceInput } from "./hooks/UseVoiceInput";
import "./App.css";

// ── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDERS = {
  ollama:    { label: "Ollama",   color: "#a78bfa", icon: "🦙", needsKey: false },
  openai:    { label: "ChatGPT",  color: "#10b981", icon: "✦",  needsKey: true  },
  anthropic: { label: "Claude",   color: "#f59e0b", icon: "◆",  needsKey: true  },
  gemini:    { label: "Gemini",   color: "#3b82f6", icon: "✧",  needsKey: true  },
  groq:      { label: "Groq",     color: "#f97316", icon: "⚡", needsKey: true  },
};

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = {
  Send:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Mic:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  MicOff:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  Upload:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  File:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Trash:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Bot:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" strokeLinecap="round"/><line x1="12" y1="16" x2="12" y2="16" strokeWidth="3" strokeLinecap="round"/><line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" strokeLinecap="round"/></svg>,
  User:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Key:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  Eye:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  ChevronDown: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Check:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Scale:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V2"/><path d="M5 12H2a10 10 0 0 0 10 10"/><path d="M19 12h3A10 10 0 0 1 12 22"/><path d="M2 7l10-5 10 5"/><path d="M2 7l5 5-5 5"/><path d="M22 7l-5 5 5 5"/></svg>,
  Chat:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Copy:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Globe:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  GlobeOff:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M10.68 10.68A3 3 0 0 0 12 15a3 3 0 0 0 2.32-4.68M6.09 6.09A10 10 0 0 0 2 12c0 5.52 4.48 10 10 10a10 10 0 0 0 5.91-1.91M22 12A10 10 0 0 0 12 2a10 10 0 0 0-1.91.18"/><line x1="2" y1="12" x2="22" y2="12"/></svg>,
  Bolt:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
};

// ── Sub-components ────────────────────────────────────────────────────────────
function TypingDots() {
  return <div className="typing-dots"><span/><span/><span/></div>;
}

function WebSearchingIndicator() {
  return (
    <div className="web-searching-indicator">
      <span className="web-searching-dot"/>
      <span className="web-searching-dot"/>
      <span className="web-searching-dot"/>
      <Icon.Globe />
      Searching the web…
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
      if (/^[═─]{3,}/.test(line)) return <div key={i} className="legal-divider"/>;
      if (line.includes("LEGAL ANALYSIS MEMORANDUM"))
        return <div key={i} className="legal-main-title">{line}</div>;
      if (/^(RE:|DATE:|PREPARED BY:)/.test(line.trim()))
        return <div key={i} className="legal-meta"><strong>{line.split(":")[0]}:</strong>{line.slice(line.indexOf(":")+1)}</div>;
      if (/^[IVX]+\.\s+[A-Z]/.test(line.trim()))
        return <div key={i} className="legal-section-header">{line.trim()}</div>;
      if (/^[A-C]\.\s+/.test(line.trim()) && line.trim().length < 60)
        return <div key={i} className="legal-sub-header">{line.trim()}</div>;
      if (/^[⚠✓]/.test(line.trim()))
        return <div key={i} className={`legal-risk ${line.includes("HIGH") ? "legal-risk--high" : line.includes("MEDIUM") ? "legal-risk--medium" : "legal-risk--low"}`}>{line.trim()}</div>;
      if (/^[•\-]\s/.test(line.trim()))
        return <div key={i} className="legal-bullet">{line.trim()}</div>;
      if (/^\d+\.\s/.test(line.trim()))
        return <div key={i} className="legal-numbered">{line.trim()}</div>;
      if (line.includes("DISCLAIMER"))
        return <div key={i} className="legal-disclaimer">{line}</div>;
      if (!line.trim()) return <div key={i} className="legal-spacer"/>;
      return <p key={i} className="legal-para">{line}</p>;
    });
  };

  return (
    <div className="legal-message">
      <div className="legal-message__header">
        <div className="legal-badge">
          <Icon.Scale/> Legal Analysis
        </div>
        <div className="legal-message__tags">
          {provider && <span className="tag" style={{color: prov.color, borderColor: prov.color+"44"}}>{prov.icon} {prov.label}</span>}
          {model && <span className="tag">{model}</span>}
        </div>
        <button className="legal-copy-btn" onClick={copyText} title="Copy full analysis">
          <Icon.Copy/> {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="legal-body">
        {renderContent(content)}
      </div>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  const prov   = PROVIDERS[msg.provider] || {};

  if (!isUser && msg.isSearching) {
    return (
      <div className="message message--ai">
        <div className="message__avatar" style={{background:`linear-gradient(135deg,${prov.color||"#5b8af0"},#a78bfa)`}}>
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
        <div className="message__avatar" style={{background:`linear-gradient(135deg,${prov.color||"#f59e0b"},#ef4444)`}}>
          <Icon.Scale />
        </div>
        <LegalMessage content={msg.content} provider={msg.provider} model={msg.model} />
      </div>
    );
  }

  return (
    <div className={`message ${isUser ? "message--user" : "message--ai"}`}>
      <div className="message__avatar" style={!isUser ? {background:`linear-gradient(135deg,${prov.color||"#5b8af0"},#a78bfa)`} : {}}>
        {isUser ? <Icon.User /> : <Icon.Bot />}
      </div>
      <div className="message__bubble">
        {msg.content === "..." ? <TypingDots /> : <p className="message__text">{msg.content}</p>}
        {msg.provider && !isUser && (
          <div className="message__tags">
            <span className="tag" style={{color: prov.color, borderColor: prov.color + "44"}}>
              {prov.icon} {prov.label}
            </span>
            {msg.model && <span className="tag">{msg.model}</span>}
            {msg.webSearched && <span className="tag tag--web"><Icon.Globe /> Web</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function DocCard({ doc, onDelete }) {
  return (
    <div className="doc-card">
      <div className="doc-card__icon"><Icon.File /></div>
      <div className="doc-card__info">
        <p className="doc-card__name">{doc.name}</p>
        <p className="doc-card__meta">{doc.pages} pages · {doc.chunks} chunks</p>
      </div>
      <button className="doc-card__delete" onClick={() => onDelete(doc.name)}><Icon.Trash /></button>
    </div>
  );
}

// ── Provider + Model selector panel ──────────────────────────────────────────
function ModelPanel({ providerData, selectedProvider, selectedModel, apiKeys,
                      onProviderChange, onModelChange, onApiKeyChange }) {
  const [showKey, setShowKey]       = useState({});
  const [openDropdown, setOpenDrop] = useState(false);
  const prov   = PROVIDERS[selectedProvider] || {};
  const pInfo  = providerData[selectedProvider] || {};
  const models = selectedProvider === "ollama"
    ? (pInfo.models || []).map(m => ({ id: m, label: m }))
    : (pInfo.models || []);

  return (
    <div className="model-panel">
      <label className="sidebar__label">Provider</label>
      <div className="provider-tabs">
        {Object.entries(PROVIDERS).map(([key, p]) => (
          <button
            key={key}
            className={`provider-tab ${selectedProvider === key ? "provider-tab--active" : ""}`}
            style={selectedProvider === key ? {borderColor: p.color, color: p.color, background: p.color + "18"} : {}}
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
            <button className="api-key-toggle"
              onClick={() => setShowKey(s => ({...s, [selectedProvider]: !s[selectedProvider]}))}>
              {showKey[selectedProvider] ? <Icon.EyeOff /> : <Icon.Eye />}
            </button>
          </div>
          {apiKeys[selectedProvider] && (
            <p className="api-key-set">✓ Key saved for this session</p>
          )}
        </div>
      )}

      {/* Groq badge — fast inference callout */}
      {selectedProvider === "groq" && (
        <div className="groq-badge">
          <Icon.Bolt /> Ultra-fast inference · Open source models
        </div>
      )}

      <label className="sidebar__label">Model</label>
      {models.length === 0 ? (
        <div className="models-error">
          {selectedProvider === "ollama"
            ? <>⚠️ No local models found.<br/><code>ollama pull qwen3</code></>
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
                <div key={m.id}
                  className={`model-option ${m.id === selectedModel ? "model-option--active" : ""}`}
                  onClick={() => { onModelChange(m.id); setOpenDrop(false); }}>
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
function WebSearchToggle({ enabled, onChange }) {
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
        <div className="web-search-toggle__thumb"/>
      </div>
    </div>
  );
}

// ── api.js queryStream update (inline helper for web_search_enabled) ──────────
// NOTE: your services/api.js needs to pass web_search_enabled to the backend.
// Updated queryStream signature: api.queryStream(question, provider, model, apiKey, mode, webSearchEnabled)

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [messages,          setMessages]          = useState([{
    id: 0, role: "ai", content: "Hello! Upload a PDF and ask me anything. Pick a provider in the sidebar — use local Ollama for free, or connect ChatGPT, Claude, Gemini, or Groq ⚡ with your API key. Enable Web Search to augment answers with live results.",
  }]);
  const [input,             setInput]             = useState("");
  const [isStreaming,       setIsStreaming]        = useState(false);
  const [mode,              setMode]              = useState("chat");
  const [documents,         setDocuments]         = useState([]);
  const [providerData,      setProviderData]      = useState({});
  const [selectedProvider,  setSelectedProvider]  = useState("ollama");
  const [selectedModel,     setSelectedModel]     = useState("");
  const [apiKeys,           setApiKeys]           = useState({});
  const [isUploading,       setIsUploading]       = useState(false);
  const [uploadStatus,      setUploadStatus]      = useState(null);
  const [ollamaOk,          setOllamaOk]          = useState(null);
  const [isDragging,        setIsDragging]        = useState(false);
  const [webSearchEnabled,  setWebSearchEnabled]  = useState(false);

  const messagesEndRef  = useRef(null);
  const fileInputRef    = useRef(null);
  const selectedProvRef = useRef(selectedProvider);
  const selectedModRef  = useRef(selectedModel);
  const apiKeysRef      = useRef(apiKeys);
  const handleSendRef   = useRef(null);
  const modeRef         = useRef("chat");
  const webSearchRef    = useRef(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { webSearchRef.current = webSearchEnabled; }, [webSearchEnabled]);
  useEffect(() => { selectedProvRef.current = selectedProvider; }, [selectedProvider]);
  useEffect(() => { selectedModRef.current  = selectedModel;    }, [selectedModel]);
  useEffect(() => { apiKeysRef.current      = apiKeys;          }, [apiKeys]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    api.getProviders().then(data => {
      setProviderData(data);
      const ollamaModels = data.ollama?.models || [];
      if (ollamaModels.length > 0) {
        setSelectedModel(ollamaModels[0]);
        selectedModRef.current = ollamaModels[0];
      }
    }).catch(() => {});
    api.getDocuments().then(({ documents }) => setDocuments(documents)).catch(() => {});
    api.checkHealth().then(h => setOllamaOk(h.ollama)).catch(() => setOllamaOk(false));
  }, []);

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

  const handleSend = useCallback(async (overrideText) => {
    const question = (overrideText || input).trim();
    if (!question || isStreaming) return;

    const provider      = selectedProvRef.current;
    const model         = selectedModRef.current;
    const apiKey        = apiKeysRef.current[provider] || "";
    const currMode      = modeRef.current;
    const useWebSearch  = webSearchRef.current;

    if (!model) return;

    // Allow sending without docs if web search is enabled in chat mode
    if (documents.length === 0 && !(useWebSearch && currMode === "chat")) return;

    setInput("");
    const userMsgId = Date.now();
    const aiMsgId   = userMsgId + 1;
    const userContent = currMode === "legal" && !question.trim()
      ? "Generate full legal analysis"
      : question;

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user",  content: userContent, mode: currMode },
      { id: aiMsgId,   role: "ai",    content: "...", provider, model, mode: currMode,
        webSearched: useWebSearch && currMode === "chat" },
    ]);
    setIsStreaming(true);

    try {
      let full = "";
      let isSearching = false;

      for await (const event of api.queryStream(question, provider, model, apiKey, currMode, useWebSearch)) {
        if (event.searching) {
          // Show the web-searching spinner in the bubble
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, isSearching: true, content: "..." } : m));
          isSearching = true;
          continue;
        }
        if (event.chunk !== undefined) {
          if (isSearching) {
            isSearching = false;
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, isSearching: false } : m));
          }
          full += event.chunk;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: full } : m));
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, content: `⚠️ ${err.message}`, isSearching: false } : m));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, documents]);

  handleSendRef.current = handleSend;

  const handleTranscript = useCallback((transcript) => {
    setInput(transcript);
    setTimeout(() => handleSendRef.current(transcript), 50);
  }, []);

  const { isListening, error: voiceError, startListening, stopListening } =
    useVoiceInput({ onTranscript: handleTranscript });

  const processFile = async (file) => {
    if (!file?.name.endsWith(".pdf")) {
      setUploadStatus({ error: "Please select a PDF file." }); return;
    }
    setIsUploading(true); setUploadStatus(null);
    try {
      const result = await api.uploadPDF(file);
      setUploadStatus(result.error ? { error: result.error } : { success: result.message });
      const { documents } = await api.getDocuments();
      setDocuments(documents);
    } catch (err) {
      setUploadStatus({ error: err.message });
    } finally { setIsUploading(false); }
  };

  const handleFileChange = (e) => { processFile(e.target.files[0]); e.target.value = ""; };
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); };
  const handleDeleteDoc = async (name) => {
    await api.deleteDocument(name);
    const { documents } = await api.getDocuments();
    setDocuments(documents);
  };

  const canSend = !isStreaming && !!selectedModel && (
    (mode === "legal" && documents.length > 0) ||
    (mode === "chat"  && (documents.length > 0 || webSearchEnabled) && input.trim())
  );

  return (
    <div className="app">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar__header">
          <div className="sidebar__logo">
            <div className="logo-icon"><Icon.Bot /></div>
            <div>
              <h1 className="sidebar__title">RAG Agent</h1>
              <p className="sidebar__sub">Multi-Provider AI</p>
            </div>
          </div>
          <div className={`status-pill ${ollamaOk ? "status-pill--ok" : "status-pill--err"}`}>
            <span className="status-dot-sm"/>
            Ollama {ollamaOk ? "online" : "offline"}
          </div>
        </div>

        <ModelPanel
          providerData={providerData}
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          apiKeys={apiKeys}
          onProviderChange={handleProviderChange}
          onModelChange={handleModelChange}
          onApiKeyChange={handleApiKeyChange}
        />

        {/* Web Search Toggle */}
        <WebSearchToggle enabled={webSearchEnabled} onChange={setWebSearchEnabled} />

        {/* Upload */}
        <div
          className={`upload-zone ${isDragging ? "upload-zone--drag" : ""} ${isUploading ? "upload-zone--loading" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input ref={fileInputRef} type="file" accept=".pdf" hidden onChange={handleFileChange}/>
          <div className="upload-zone__icon"><Icon.Upload /></div>
          {isUploading
            ? <p>Processing PDF…</p>
            : <><p className="upload-zone__primary">Drop PDF here</p><p className="upload-zone__secondary">or click to browse</p></>}
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
            : <div className="docs-list">{documents.map(d =>
                <DocCard key={d.name} doc={d} onDelete={handleDeleteDoc}/>)}</div>}
        </div>
      </aside>

      {/* ── Chat ──────────────────────────────────────────────────────── */}
      <main className="chat">
        <div className="chat__messages">
          {messages.map(msg => <Message key={msg.id} msg={msg}/>)}
          <div ref={messagesEndRef}/>
        </div>

        {voiceError && <div className="voice-error">{voiceError}</div>}

        <div className="chat__input-wrap">
          <div className="mode-toggle-wrap">
            <button
              className={`mode-btn ${mode === "chat" ? "mode-btn--active" : ""}`}
              onClick={() => { setMode("chat"); modeRef.current = "chat"; }}
            >
              <Icon.Chat /> Chat
            </button>
            <button
              className={`mode-btn mode-btn--legal ${mode === "legal" ? "mode-btn--active mode-btn--legal-active" : ""}`}
              onClick={() => { setMode("legal"); modeRef.current = "legal"; }}
            >
              <Icon.Scale /> Legal Analysis
            </button>
            {webSearchEnabled && mode === "chat" && (
              <span className="web-search-active-badge">
                <Icon.Globe /> Web search active
              </span>
            )}
            {mode === "legal" && (
              <span className="mode-hint">
                Upload a legal document, then click Send to generate a full legal draft analysis
              </span>
            )}
          </div>

          <div className={`chat__input-box ${isListening ? "chat__input-box--listening" : ""} ${mode === "legal" ? "chat__input-box--legal" : ""} ${webSearchEnabled ? "chat__input-box--websearch" : ""}`}>
            <textarea
              className="chat__textarea"
              placeholder={
                mode === "legal"
                  ? "Optional: add specific focus (e.g. 'focus on liability clauses') or leave empty for full analysis…"
                  : documents.length === 0 && !webSearchEnabled
                  ? "Upload a PDF first, or enable Web Search…"
                  : webSearchEnabled && documents.length === 0
                  ? "Ask anything — web search is active…"
                  : `Ask anything · ${PROVIDERS[selectedProvider]?.label} / ${selectedModel || "no model"}`
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1}
              disabled={isStreaming || (documents.length === 0 && !webSearchEnabled && mode !== "legal")}
            />
            <div className="chat__actions">
              <button
                className={`btn-voice ${isListening ? "btn-voice--active" : ""}`}
                onClick={isListening ? stopListening : startListening}
                disabled={documents.length === 0 && !webSearchEnabled}
                title={isListening ? "Stop" : "Voice input"}
              >
                {isListening ? <Icon.MicOff /> : <Icon.Mic />}
              </button>
              <button
                className="btn-send"
                style={canSend ? {background:`linear-gradient(135deg,${PROVIDERS[selectedProvider]?.color||"#5b8af0"},#a78bfa)`} : {}}
                onClick={() => handleSend()}
                disabled={!canSend}
              >
                <Icon.Send />
              </button>
            </div>
          </div>
          {isListening && <div className="listening-bar"><span className="pulse"/> Listening…</div>}
          <p className="chat__hint">
            {mode === "legal"
              ? `⚖ Legal mode · ${PROVIDERS[selectedProvider]?.icon} ${PROVIDERS[selectedProvider]?.label} · ${selectedModel || "pick a model"}`
              : webSearchEnabled
              ? `🌐 Web search ON · ${PROVIDERS[selectedProvider]?.icon} ${PROVIDERS[selectedProvider]?.label} · ${selectedModel || "pick a model"}`
              : documents.length > 0
              ? `${documents.length} doc${documents.length > 1 ? "s" : ""} · ${PROVIDERS[selectedProvider]?.icon} ${PROVIDERS[selectedProvider]?.label} · ${selectedModel || "pick a model"} · Enter to send`
              : "Upload a PDF or enable Web Search to start"}
          </p>
        </div>
      </main>
    </div>
  );
}
