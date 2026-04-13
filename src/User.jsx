import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useVoiceInput } from "./hooks/UseVoiceInput";
import { useTTS } from "./hooks/UseTTS";
import { useChatSessions } from "./hooks/UseChatSessions";
import MarkdownRenderer from "./MarkdownRenderer";
import "./User.css";

// ── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDERS = {
  ollama:    { label: "Ollama",  color: "#a78bfa", icon: "🦙", needsKey: false },
  openai:    { label: "ChatGPT", color: "#10b981", icon: "✦",  needsKey: true  },
  anthropic: { label: "Claude",  color: "#f59e0b", icon: "◆",  needsKey: true  },
  gemini:    { label: "Gemini",  color: "#3b82f6", icon: "✧",  needsKey: true  },
  groq:      { label: "Groq",    color: "#f97316", icon: "⚡", needsKey: true  },
};

const OLLAMA_BASE_URL = "http://localhost:11434";

// ── File types we index ───────────────────────────────────────────────────────
const TEXT_EXTENSIONS = new Set([
  "js","jsx","ts","tsx","py","java","c","cpp","cs","go","rs","rb","php",
  "swift","kt","scala","sh","bash","html","htm","css","scss","json","yaml",
  "yml","toml","ini","conf","sql","graphql","gql","md","txt","vue","svelte",
  "dart","ex","exs","erl","hs","lua","pl","sol","dockerfile","makefile",
  "tf","tfvars","env","properties","gradle","cmake","proto","astro",
]);

const IGNORE_DIRS = new Set([
  "node_modules",".git",".svn","dist","build","out","target","__pycache__",
  ".cache",".next",".nuxt","coverage","vendor","venv",".venv","env",
  ".tox",".pytest_cache",".mypy_cache","htmlcov",".DS_Store",
]);

// ── System prompts ─────────────────────────────────────────────────────────────
const CODING_SYSTEM_PROMPT = `You are an expert coding assistant. You ONLY answer coding and programming-related questions.

Your expertise covers all major languages (Python, JavaScript, TypeScript, Java, C/C++, Go, Rust, etc.), web development (React, Vue, Node.js, FastAPI, Django, etc.), algorithms, data structures, system design, debugging, code review, performance optimization, DevOps, databases, APIs, cloud infrastructure, and AI/ML engineering.

RULES:
1. If the question is NOT about coding or programming, politely decline and redirect to coding topics.
2. Always provide clean, well-commented code examples when relevant.
3. For code reviews, analyze: bugs, security, performance, readability, and best practices.
4. Be concise but thorough. Prefer code over lengthy explanations.
5. Give the score of the code out of 10 base on analysis.`;


const makeCodebasePrompt = (name, count) =>
  `You are an expert code analyst. The user has uploaded a codebase called "${name}" (${count} files indexed).

Your job:
1. Answer questions with precision — reference actual file paths when relevant.
2. Explain code structure, architecture, patterns, and dependencies clearly.
3. Identify bugs, security issues, or improvements when asked.
4. When explaining a file, cover: purpose, imports, key functions/classes, data flow.
5. Cite source files using the format [filename.ext].
6. If a question cannot be answered from the provided context, say so explicitly.
Be direct, technical, and thorough.`;

// ── Cloud model lists ─────────────────────────────────────────────────────────
const CLOUD_MODELS = {
  openai: [
    { id: "gpt-4o",        label: "GPT-4o" },
    { id: "gpt-4o-mini",   label: "GPT-4o Mini" },
    { id: "gpt-4-turbo",   label: "GPT-4 Turbo" },
    { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  anthropic: [
    { id: "claude-opus-4-5",           label: "Claude Opus 4.5" },
    { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6" },
    { id: "claude-sonnet-4-5",         label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  gemini: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "Gemini 2.5 Flash Lite", label: "Gemini 2.5 Flash Lite" },
    { id: "Gemma 4 31B", label: "Gemma 4 31B" },
    { id: "Gemma 3 2B", label: "Gemma 3 2B" },
    { id: "Gemini 3.1 Flash Lite", label: "Gemini 3.1 Flash Lite" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-1.5-pro",   label: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile",       label: "LLaMA 3.3 70B" },
    { id: "moonshotai/kimi-k2-instruct",       label: "kimi-k2-instruct" },
    { id: "moonshotai/kimi-k2-instruct-0905",       label: "kimi-k2-instruct-0905" },
    { id: "groq/compound",       label: "groq/compound" },
    { id: "groq/compound-mini",       label: "groq/compound-mini" },
    { id: "llama-3.1-8b-instant",          label: "LLaMA 3.1 8B Instant" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct",                label: "llama-4" },
    { id: "mixtral-8x7b-32768",            label: "Mixtral 8x7B" },
    { id: "gemma2-9b-it",                  label: "Gemma2 9B" },
    { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 70B" },
    { id: "qwen-qwq-32b",                  label: "Qwen QwQ 32B" },
  ],
};

// ── TF-IDF retrieval (runs entirely in the browser) ──────────────────────────
function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9_$]{2,}/g) || [];
}

function buildTfIdfIndex(files) {
  const tf = [];
  const df = {};
  const N  = files.length;
  for (const file of files) {
    const tokens = tokenize(file.content);
    const freq   = {};
    for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
    tf.push(freq);
    for (const t of Object.keys(freq)) df[t] = (df[t] || 0) + 1;
  }
  return { tf, df, N };
}

function retrieveTopFiles(query, files, index, topK = 6) {
  if (!files.length) return [];
  const { tf, df, N } = index;
  const qTokens = [...new Set(tokenize(query))];
  const scores  = files.map((_, i) => {
    let score = 0;
    for (const t of qTokens) {
      const freq = tf[i][t] || 0;
      if (!freq) continue;
      const idf = Math.log((N + 1) / ((df[t] || 0) + 1));
      score += freq * idf;
    }
    return score;
  });
  return files
    .map((f, i) => ({ ...f, score: scores[i] }))
    .filter(f => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function buildCodebaseContext(relevant, allFiles) {
  const tree = `PROJECT STRUCTURE (${allFiles.length} files):\n` +
    allFiles.map(f => `  ${f.path}`).join("\n");

  const fileBlocks = relevant.map(f => {
    const lines = f.content.split("\n").length;
    const header = `${"═".repeat(55)}\nFILE: ${f.path}  (${lines} lines, relevance: ${f.score.toFixed(1)})\n${"═".repeat(55)}`;
    // Truncate very large files to first 300 lines
    const content = f.content.split("\n").slice(0, 300).join("\n");
    const truncated = f.content.split("\n").length > 300 ? "\n... [truncated to 300 lines]" : "";
    return `${header}\n${content}${truncated}`;
  }).join("\n\n");

  return `${tree}\n\nMOST RELEVANT FILES:\n${fileBlocks}`;
}

// ── Provider streaming ────────────────────────────────────────────────────────
async function* streamFromProvider(provider, model, apiKey, history, systemPrompt) {
  const sys = systemPrompt || CODING_SYSTEM_PROMPT;

  if (provider === "ollama") {
    const prompt = `${sys}\n\n` +
      history.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n") +
      "\nAssistant:";
    let res;
    try {
      res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: true, options: { temperature: 0.1, num_predict: 8192 } }),
        signal: AbortSignal.timeout(180000),
      });
    } catch { throw new Error("Cannot connect to Ollama. Make sure it is running on port 11434."); }
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const reader = res.body.getReader(); const dec = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      for (const line of dec.decode(value, { stream: true }).split("\n")) {
        if (!line.trim()) continue;
        try { const d = JSON.parse(line); if (d.response) yield d.response; if (d.done) return; } catch { }
      }
    }
    return;
  }

  if (provider === "openai" || provider === "groq") {
    if (!apiKey) throw new Error(`${PROVIDERS[provider].label} API key is required.`);
    const url = provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true, temperature: 0.1, max_tokens: 8192, messages: [{ role: "system", content: sys }, ...history] }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) { const b = await res.text(); throw new Error(`${PROVIDERS[provider].label} ${res.status}: ${b.slice(0, 200)}`); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const c = line.slice(6); if (c.trim() === "[DONE]") return;
        try { const d = JSON.parse(c).choices[0].delta.content || ""; if (d) yield d; } catch { }
      }
    }
    return;
  }

  if (provider === "anthropic") {
    if (!apiKey) throw new Error("Anthropic API key is required.");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 8192, stream: true, system: sys, messages: history }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) { const b = await res.text(); throw new Error(`Anthropic ${res.status}: ${b.slice(0, 200)}`); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try { const d = JSON.parse(line.slice(6)); if (d.type === "content_block_delta") yield d.delta?.text || ""; } catch { }
      }
    }
    return;
  }

  if (provider === "gemini") {
    if (!apiKey) throw new Error("Gemini API key is required.");
    const gm = history.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: gm, systemInstruction: { parts: [{ text: sys }] }, generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) { const b = await res.text(); throw new Error(`Gemini ${res.status}: ${b.slice(0, 200)}`); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try { const d = JSON.parse(line.slice(6)); const t = d.candidates?.[0]?.content?.parts?.[0]?.text || ""; if (t) yield t; } catch { }
      }
    }
    return;
  }

  throw new Error(`Unknown provider: ${provider}`);
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = {
  Send:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Mic:          () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  MicOff:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  Bot:          () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" strokeLinecap="round"/><line x1="12" y1="16" x2="12" y2="16" strokeWidth="3" strokeLinecap="round"/><line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" strokeLinecap="round"/></svg>,
  User:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Key:          () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  Eye:          () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  ChevronDown:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  ChevronLeft:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevronRight: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Check:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Speaker:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  SpeakerOff:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>,
  Plus:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Edit:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  MessageSquare:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Bolt:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Menu:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  X:            () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Code:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  Home:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Folder:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  FolderOpen:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="2 10 22 10"/></svg>,
  FileCode:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 13 8 15 10 17"/><polyline points="14 13 16 15 14 17"/></svg>,
  Search:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  AlertCircle:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
};

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return <div className="typing-dots"><span /><span /><span /></div>;
}

// ── Session Panel ─────────────────────────────────────────────────────────────
function SessionPanel({ sessionList, activeSessionId, onCreate, onSwitch, onRename, onDelete, onClearAll }) {
  const [editingId, setEditingId] = useState(null);
  const [editVal,   setEditVal]   = useState("");
  return (
    <div className="session-panel">
      <div className="session-panel__header">
        <label className="sidebar__label"><Icon.MessageSquare /> Sessions</label>
        <button className="session-new-btn" onClick={() => onCreate()} title="New chat"><Icon.Plus /></button>
      </div>
      <div className="session-list">
        {sessionList.length === 0 && <p className="docs-empty">No sessions yet</p>}
        {sessionList.map(s => (
          <div key={s.id} className={`session-card ${s.id === activeSessionId ? "session-card--active" : ""}`} onClick={() => onSwitch(s.id)}>
            {editingId === s.id ? (
              <input className="session-rename-input" value={editVal} autoFocus
                onChange={e => setEditVal(e.target.value)}
                onBlur={() => { onRename(s.id, editVal); setEditingId(null); }}
                onKeyDown={e => { if (e.key === "Enter") { onRename(s.id, editVal); setEditingId(null); } if (e.key === "Escape") setEditingId(null); }}
                onClick={e => e.stopPropagation()} />
            ) : (
              <>
                <span className="session-card__name" title={s.name}>{s.name}</span>
                <div className="session-card__actions">
                  <button className="session-action-btn" onClick={e => { e.stopPropagation(); setEditingId(s.id); setEditVal(s.name); }}><Icon.Edit /></button>
                  <button className="session-action-btn session-action-btn--del" onClick={e => { e.stopPropagation(); onDelete(s.id); }}><Icon.Trash /></button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {sessionList.length > 1 && <button className="session-clear-btn" onClick={onClearAll}>Clear all sessions</button>}
    </div>
  );
}

// ── Model Panel ───────────────────────────────────────────────────────────────
function ModelPanel({ providerData, selectedProvider, selectedModel, apiKeys,
                      onProviderChange, onModelChange, onApiKeyChange, collapsed }) {
  const [showKey, setShowKey]   = useState({});
  const [openDrop, setOpenDrop] = useState(false);
  const prov   = PROVIDERS[selectedProvider] || {};
  const models = selectedProvider === "ollama"
    ? (providerData.ollama?.models || []).map(m => ({ id: m, label: m }))
    : (CLOUD_MODELS[selectedProvider] || []);
  if (collapsed) return null;
  return (
    <div className="model-panel">
      <label className="sidebar__label">Provider</label>
      <div className="provider-tabs">
        {Object.entries(PROVIDERS).map(([key, p]) => (
          <button key={key} className={`provider-tab ${selectedProvider === key ? "provider-tab--active" : ""}`}
            style={selectedProvider === key ? { borderColor: p.color, color: p.color, background: p.color + "18" } : {}}
            onClick={() => { onProviderChange(key); setOpenDrop(false); }}>
            <span>{p.icon}</span><span>{p.label}</span>
          </button>
        ))}
      </div>
      {prov.needsKey && (
        <div className="api-key-wrap">
          <label className="sidebar__label"><Icon.Key /> {prov.label} API Key</label>
          <div className="api-key-input-wrap">
            <input className="api-key-input" type={showKey[selectedProvider] ? "text" : "password"}
              placeholder={`Paste your ${prov.label} key…`} value={apiKeys[selectedProvider] || ""}
              onChange={e => onApiKeyChange(selectedProvider, e.target.value)} />
            <button className="api-key-toggle" onClick={() => setShowKey(s => ({ ...s, [selectedProvider]: !s[selectedProvider] }))}>
              {showKey[selectedProvider] ? <Icon.EyeOff /> : <Icon.Eye />}
            </button>
          </div>
          {apiKeys[selectedProvider] && <p className="api-key-set">✓ Key saved for this session</p>}
        </div>
      )}
      {selectedProvider === "groq" && <div className="groq-badge"><Icon.Bolt /> Ultra-fast inference</div>}
      <label className="sidebar__label">Model</label>
      {models.length === 0 ? (
        <div className="models-error">
          {selectedProvider === "ollama" ? <><span>⚠️ No local models.</span><br /><code>ollama pull qwen3</code></> : "Models load automatically"}
        </div>
      ) : (
        <div className="model-select-wrap">
          <div className="model-select" onClick={() => setOpenDrop(o => !o)}>
            <span>{models.find(m => m.id === selectedModel)?.label || selectedModel || "Select model"}</span>
            <span className="chevron"><Icon.ChevronDown /></span>
          </div>
          {openDrop && (
            <div className="model-dropdown">
              {models.map(m => (
                <div key={m.id} className={`model-option ${m.id === selectedModel ? "model-option--active" : ""}`}
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

// ── Codebase Sidebar Panel ────────────────────────────────────────────────────
function CodebasePanel({ codebase, onUpload, onClear, collapsed }) {
  const inputRef = useRef(null);
  if (collapsed) {
    return (
      <div style={{ padding: "4px 0" }}>
        <button className="sidebar-icon-btn" title="Upload folder" onClick={() => inputRef.current?.click()}>
          <Icon.FolderOpen />
          <input ref={inputRef} type="file" webkitdirectory="" mozdirectory="" directory="" multiple hidden onChange={onUpload} />
        </button>
      </div>
    );
  }
  return (
    <div className="codebase-panel">
      <label className="sidebar__label"><Icon.Folder /> Codebase Explorer</label>
      {!codebase ? (
        <div className="codebase-drop-zone" onClick={() => inputRef.current?.click()}>
          <input ref={inputRef} type="file" webkitdirectory="" mozdirectory="" directory="" multiple hidden onChange={onUpload} />
          <Icon.FolderOpen />
          <p className="codebase-drop-zone__title">Upload a folder</p>
          <p className="codebase-drop-zone__sub">All code files are parsed in-browser · nothing uploaded to a server</p>
        </div>
      ) : (
        <div className="codebase-loaded">
          <div className="codebase-loaded__header">
            <div className="codebase-loaded__icon"><Icon.Folder /></div>
            <div className="codebase-loaded__info">
              <span className="codebase-loaded__name">{codebase.name}</span>
              <span className="codebase-loaded__meta">{codebase.files.length} files · {(codebase.totalBytes / 1024).toFixed(0)} KB</span>
            </div>
            <button className="codebase-loaded__clear" onClick={onClear} title="Remove codebase"><Icon.X /></button>
          </div>
          {/* Extension breakdown */}
          <div className="codebase-ext-bar">
            {Object.entries(
              codebase.files.reduce((acc, f) => { acc[f.ext] = (acc[f.ext] || 0) + 1; return acc; }, {})
            ).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ext, count]) => (
              <span key={ext} className="codebase-ext-pill">.{ext} {count}</span>
            ))}
          </div>
          {/* File tree */}
          <div className="codebase-tree">
            {codebase.files.slice(0, 15).map(f => (
              <div key={f.path} className="codebase-tree__item" title={f.path}>
                <Icon.FileCode />
                <span>{f.path.split("/").slice(-2).join("/")}</span>
              </div>
            ))}
            {codebase.files.length > 15 && (
              <div className="codebase-tree__more">+{codebase.files.length - 15} more files</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Message ───────────────────────────────────────────────────────────────────
function Message({ msg }) {
  const isUser = msg.role === "user";
  const prov   = PROVIDERS[msg.provider] || {};
  return (
    <div className={`message ${isUser ? "message--user" : "message--ai"}`}>
      <div className="message__avatar"
        style={!isUser ? { background: `linear-gradient(135deg,${prov.color || "#5b8af0"},#a78bfa)` } : {}}>
        {isUser ? <Icon.User /> : <Icon.Bot />}
      </div>
      <div className="message__bubble">
        {/* Context files used */}
        {!isUser && msg.usedFiles?.length > 0 && (
          <div className="msg-context-files">
            <Icon.Search />
            <span>Referenced:</span>
            {msg.usedFiles.map(f => (
              <span key={f} className="msg-context-file">{f.split("/").pop()}</span>
            ))}
          </div>
        )}
        {isUser
          ? (msg.content === "..." ? <TypingDots /> : <p className="message__text">{msg.content}</p>)
          : (msg.content === "..." ? <TypingDots /> : <MarkdownRenderer content={msg.content} />)
        }
        {!isUser && msg.provider && (
          <div className="message__tags">
            <span className="tag" style={{ color: prov.color, borderColor: prov.color + "44" }}>{prov.icon} {prov.label}</span>
            {msg.model && <span className="tag">{msg.model}</span>}
            {msg.mode === "codebase" && (
              <span className="tag" style={{ color: "#34d399", borderColor: "#34d39944" }}>
                <Icon.Folder /> Codebase
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function User() {
  const navigate = useNavigate();

  const [input,            setInput]           = useState("");
  const [isStreaming,      setIsStreaming]      = useState(false);
  const [providerData,     setProviderData]     = useState({ ollama: { models: [] } });
  const [selectedProvider, setSelectedProvider] = useState("ollama");
  const [selectedModel,    setSelectedModel]    = useState("");
  const [apiKeys,          setApiKeys]          = useState({});
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mode,             setMode]             = useState("chat"); // "chat" | "codebase"

  // Codebase state (in-memory only — not persisted)
  const [codebase,   setCodebase]   = useState(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexError, setIndexError] = useState(null);

  const historyRef     = useRef({});
  const selectedProvRef = useRef(selectedProvider);
  const selectedModRef  = useRef(selectedModel);
  const apiKeysRef      = useRef(apiKeys);
  const codebaseRef     = useRef(codebase);
  const modeRef         = useRef(mode);
  const handleSendRef   = useRef(null);
  const messagesEndRef  = useRef(null);

  const { sessionList, activeSessionId, messages, createSession, switchSession,
          renameSession, deleteSession, setMessages, clearAll } = useChatSessions("user");
  const { ttsEnabled, isSpeaking, speak, stopSpeaking, toggleTTS } = useTTS();

  useEffect(() => { selectedProvRef.current = selectedProvider; }, [selectedProvider]);
  useEffect(() => { selectedModRef.current  = selectedModel;    }, [selectedModel]);
  useEffect(() => { apiKeysRef.current      = apiKeys;          }, [apiKeys]);
  useEffect(() => { codebaseRef.current     = codebase;         }, [codebase]);
  useEffect(() => { modeRef.current         = mode;             }, [mode]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (sessionList.length === 0) createSession("New Chat");
    fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5000) })
      .then(r => r.ok ? r.json() : { models: [] })
      .then(data => {
        const models = (data.models || []).map(m => m.name);
        setProviderData(prev => ({ ...prev, ollama: { models } }));
        if (models.length > 0) { setSelectedModel(models[0]); selectedModRef.current = models[0]; }
      }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Folder upload handler ─────────────────────────────────────────────────
  const handleFolderUpload = useCallback(async (e) => {
    const fileList = Array.from(e.target.files || []);
    if (!fileList.length) return;
    e.target.value = "";
    setIsIndexing(true);
    setIndexError(null);

    try {
      const folderName = fileList[0].webkitRelativePath?.split("/")[0] || "codebase";
      const parsedFiles = [];
      let totalBytes = 0;

      for (const file of fileList) {
        const relPath = file.webkitRelativePath || file.name;
        const parts   = relPath.split("/");
        // Skip ignored dirs and binary/huge files
        if (parts.some(p => IGNORE_DIRS.has(p))) continue;
        if (file.size > 400 * 1024) continue;
        const ext = file.name.split(".").pop().toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext)) continue;
        try {
          const content = await file.text();
          parsedFiles.push({ path: relPath, content, ext, size: file.size });
          totalBytes += file.size;
        } catch { /* skip unreadable */ }
      }

      if (parsedFiles.length === 0) {
        setIndexError("No readable code files found. Try a different folder.");
        setIsIndexing(false);
        return;
      }

      const index = buildTfIdfIndex(parsedFiles);
      const cb    = { name: folderName, files: parsedFiles, index, totalBytes };
      setCodebase(cb);
      codebaseRef.current = cb;
      setMode("codebase");
      modeRef.current = "codebase";

      // Extension summary
      const extMap   = parsedFiles.reduce((acc, f) => { acc[f.ext] = (acc[f.ext] || 0) + 1; return acc; }, {});
      const extSummary = Object.entries(extMap).sort((a, b) => b[1] - a[1])
        .slice(0, 6).map(([e, c]) => `.${e}×${c}`).join("  ");

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "ai",
        mode: "codebase",
        content: `## 📁 "${folderName}" indexed successfully\n\n**${parsedFiles.length} files** · ${(totalBytes / 1024).toFixed(0)} KB\n\n\`${extSummary}\`\n\n**Try asking:**\n- *"Give me an overview of this codebase"*\n- *"Explain the main entry point"*\n- *"What does [filename] do?"*\n- *"Are there any security issues?"*\n- *"How is state managed in this project?"*\n- *"List all API endpoints"*`,
      }]);
    } catch (err) {
      setIndexError(`Failed to index: ${err.message}`);
    } finally {
      setIsIndexing(false);
    }
  }, [setMessages]);

  const handleClearCodebase = useCallback(() => {
    setCodebase(null);
    codebaseRef.current = null;
    setMode("chat");
    modeRef.current = "chat";
  }, []);

  // ── Provider handlers ─────────────────────────────────────────────────────
  const handleProviderChange = useCallback((prov) => {
    setSelectedProvider(prov); selectedProvRef.current = prov;
    const models = prov === "ollama"
      ? (providerData.ollama?.models || []).map(m => ({ id: m }))
      : (CLOUD_MODELS[prov] || []);
    if (models.length > 0) { setSelectedModel(models[0].id); selectedModRef.current = models[0].id; }
    else { setSelectedModel(""); selectedModRef.current = ""; }
  }, [providerData]);

  const handleModelChange  = useCallback((id) => { setSelectedModel(id); selectedModRef.current = id; }, []);
  const handleApiKeyChange = useCallback((prov, key) => {
    setApiKeys(prev => { const next = { ...prev, [prov]: key }; apiKeysRef.current = next; return next; });
  }, []);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (overrideText) => {
    const question = (overrideText || input).trim();
    if (!question || isStreaming || !selectedModRef.current) return;

    const provider = selectedProvRef.current;
    const model    = selectedModRef.current;
    const apiKey   = apiKeysRef.current[provider] || "";
    const currMode = modeRef.current;
    const cb       = codebaseRef.current;

    setInput("");
    const userMsgId = Date.now();
    const aiMsgId   = userMsgId + 1;

    let systemPrompt = CODING_SYSTEM_PROMPT;
    let userContent  = question;
    let usedFiles    = [];

    if (currMode === "codebase" && cb) {
      systemPrompt = makeCodebasePrompt(cb.name, cb.files.length);
      const relevant = retrieveTopFiles(question, cb.files, cb.index, 6);
      usedFiles  = relevant.map(f => f.path);
      userContent = `CODEBASE CONTEXT:\n${buildCodebaseContext(relevant, cb.files)}\n\nQUESTION: ${question}`;
    }

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user", content: question },
      { id: aiMsgId,   role: "ai",   content: "...", provider, model, mode: currMode, usedFiles },
    ]);
    setIsStreaming(true);

    const sid = activeSessionId;
    if (!historyRef.current[sid]) historyRef.current[sid] = [];
    historyRef.current[sid].push({ role: "user", content: userContent });

    try {
      let full = "";
      for await (const chunk of streamFromProvider(provider, model, apiKey, historyRef.current[sid], systemPrompt)) {
        full += chunk;
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: full } : m));
      }
      historyRef.current[sid].push({ role: "assistant", content: full });
      if (full) speak(full);
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: `⚠️ ${err.message}` } : m));
      historyRef.current[sid]?.pop();
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, activeSessionId, speak, setMessages]);

  handleSendRef.current = handleSend;

  const handleTranscript = useCallback((t) => {
    setInput(t);
    setTimeout(() => handleSendRef.current(t), 50);
  }, []);

  const { isListening, error: voiceError, startListening, stopListening } =
    useVoiceInput({ onTranscript: handleTranscript });

  const prov     = PROVIDERS[selectedProvider] || {};
  const canSend  = !isStreaming && !!selectedModel && !!input.trim();
  const username = localStorage.getItem("username") || "User";

  return (
    <div className="app">
      <div className={`sidebar-overlay${sidebarOpen ? "" : " hidden"}`} onClick={() => setSidebarOpen(false)} />

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
        <div className="sidebar__header">
          {!sidebarCollapsed ? (
            <div className="sidebar__logo">
              <div className="logo-icon"><Icon.Bot /></div>
              <div>
                <h1 className="sidebar__title" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>QNA-AI</h1>
                <p className="sidebar__sub">Coding Assistant</p>
              </div>
              <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><Icon.X /></button>
            </div>
          ) : (
            <div className="sidebar__logo-collapsed"><div className="logo-icon logo-icon--sm"><Icon.Bot /></div></div>
          )}
          <button className="sidebar-collapse-btn" onClick={() => setSidebarCollapsed(c => !c)}>
            {sidebarCollapsed ? <Icon.ChevronRight /> : <Icon.ChevronLeft />}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="u-sidebar-user">
            <div className="u-sidebar-user__avatar">{username.charAt(0).toUpperCase()}</div>
            <span className="u-sidebar-user__name">{username}</span>
            <button className="u-home-btn" onClick={() => navigate("/")} title="Main app"><Icon.Home /></button>
          </div>
        )}

        {!sidebarCollapsed && (
          <div className="u-coding-badge"><Icon.Code /> Coding-only · no PDF required</div>
        )}

        {!sidebarCollapsed && (
          <SessionPanel sessionList={sessionList} activeSessionId={activeSessionId}
            onCreate={createSession} onSwitch={switchSession} onRename={renameSession}
            onDelete={deleteSession} onClearAll={clearAll} />
        )}
        {sidebarCollapsed && (
          <button className="sidebar-icon-btn" onClick={() => createSession()} title="New chat"><Icon.Plus /></button>
        )}

        <ModelPanel providerData={providerData} selectedProvider={selectedProvider}
          selectedModel={selectedModel} apiKeys={apiKeys} onProviderChange={handleProviderChange}
          onModelChange={handleModelChange} onApiKeyChange={handleApiKeyChange} collapsed={sidebarCollapsed} />

        {sidebarCollapsed && (
          <div className="collapsed-provider-badge" title={prov.label}>
            <span style={{ fontSize: 20 }}>{prov.icon}</span>
          </div>
        )}

        {/* Codebase panel */}
        <CodebasePanel codebase={codebase} onUpload={handleFolderUpload}
          onClear={handleClearCodebase} collapsed={sidebarCollapsed} />

        {isIndexing && !sidebarCollapsed && (
          <div className="codebase-indexing">
            <div className="cb-spinner" />
            <span>Indexing files…</span>
          </div>
        )}
        {indexError && !sidebarCollapsed && (
          <div className="codebase-error"><Icon.AlertCircle /> {indexError}</div>
        )}
      </aside>

      {/* ── Chat ────────────────────────────────────────────────────────── */}
      <main className="chat">
        <div className="chat__topbar">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)}><Icon.Menu /></button>
          <span className="chat__topbar-title">
            {mode === "codebase" && codebase ? `📁 ${codebase.name}` : "QNA-AI · Coding"}
          </span>
          <span className="chat__topbar-status">{prov.icon} {selectedModel || "no model"}</span>
        </div>

        {/* Mode bar */}
        <div className="u-mode-bar">
          <button className={`u-mode-bar__btn ${mode === "chat" ? "u-mode-bar__btn--active" : ""}`}
            onClick={() => { setMode("chat"); modeRef.current = "chat"; }}>
            <Icon.Code /> Chat
          </button>
          <button
            className={`u-mode-bar__btn u-mode-bar__btn--folder ${mode === "codebase" ? "u-mode-bar__btn--active u-mode-bar__btn--folder-active" : ""}`}
            onClick={() => { if (codebase) { setMode("codebase"); modeRef.current = "codebase"; } }}
            disabled={!codebase}
            title={!codebase ? "Upload a folder from the sidebar first" : "Switch to codebase mode"}>
            <Icon.FolderOpen />
            {codebase ? `${codebase.name} · ${codebase.files.length} files` : "No codebase loaded"}
          </button>
          {isIndexing && (
            <span className="u-mode-bar__indexing"><div className="cb-spinner" /> Indexing…</span>
          )}
        </div>

        <div className="chat__messages">
          {messages.map(msg => <Message key={msg.id} msg={msg} />)}
          <div ref={messagesEndRef} />
        </div>

        {voiceError && <div className="voice-error">{voiceError}</div>}

        <div className="chat__input-wrap">
          <div className={`chat__input-box ${isListening ? "chat__input-box--listening" : ""} ${mode === "codebase" ? "chat__input-box--codebase" : ""}`}>
            <textarea className="chat__textarea"
              placeholder={
                !selectedModel ? "Select a model from the sidebar…"
                : mode === "codebase" && codebase
                  ? `Ask anything about "${codebase.name}" — files, bugs, architecture…`
                  : "Ask any coding question…"
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1} disabled={isStreaming || !selectedModel} />
            <div className="chat__actions">
              <button className={`btn-voice ${ttsEnabled ? "btn-voice--active" : ""} ${isSpeaking ? "btn-voice--speaking" : ""}`}
                onClick={isSpeaking ? stopSpeaking : toggleTTS}>
                {ttsEnabled ? <Icon.Speaker /> : <Icon.SpeakerOff />}
              </button>
              <button className={`btn-voice ${isListening ? "btn-voice--active" : ""}`}
                onClick={isListening ? stopListening : startListening} disabled={!selectedModel}>
                {isListening ? <Icon.MicOff /> : <Icon.Mic />}
              </button>
              <button className="btn-send"
                style={canSend ? { background: `linear-gradient(135deg,${prov.color || "#5b8af0"},#a78bfa)` } : {}}
                onClick={() => handleSend()} disabled={!canSend}>
                <Icon.Send />
              </button>
            </div>
          </div>
          {isListening && <div className="listening-bar"><span className="pulse" /> Listening…</div>}
          <p className="chat__hint">
            {mode === "codebase" && codebase
              ? `📁 Codebase mode · ${codebase.files.length} files indexed · ${prov.icon} ${selectedModel} · Enter to send`
              : selectedModel
              ? `${prov.icon} ${prov.label} · ${selectedModel} · coding only · Enter to send`
              : "Pick a provider and model from the sidebar to start"}
          </p>
        </div>
      </main>
    </div>
  );
}
