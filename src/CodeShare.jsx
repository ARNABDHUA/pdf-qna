/**
 * CodeShare.jsx  —  v8
 *
 * New in v8:
 *  - Multi-file snippet mode: users can add multiple files (e.g. LandingPage.jsx,
 *    UserDashboard.jsx, AdminSection.jsx) inside a single snippet.
 *  - File tabs in viewer: click tabs to switch between files.
 *  - Edit mode supports adding/removing/reordering files with edit key auth.
 *  - Fully backward-compatible with v7 single-file snippets.
 *  - All v7 edit-key, delete, owner/collaborator logic preserved.
 *
 * Fix: code snippet text is now always left-aligned.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import NavBar from "./NavBar";

// ── highlight.js — lazy-loaded ────────────────────────────────────────────────
let hljs        = null;
let hljsReady   = false;
let hljsLoading = null;

async function loadHljs() {
  if (hljsReady) return hljs;
  if (hljsLoading) return hljsLoading;
  hljsLoading = (async () => {
    try {
      const core = await import("highlight.js/lib/core");
      const h    = core.default;
      const langs = await Promise.all([
        import("highlight.js/lib/languages/python"),
        import("highlight.js/lib/languages/javascript"),
        import("highlight.js/lib/languages/typescript"),
        import("highlight.js/lib/languages/bash"),
        import("highlight.js/lib/languages/c"),
        import("highlight.js/lib/languages/cpp"),
        import("highlight.js/lib/languages/csharp"),
        import("highlight.js/lib/languages/go"),
        import("highlight.js/lib/languages/css"),
        import("highlight.js/lib/languages/xml"),
        import("highlight.js/lib/languages/java"),
        import("highlight.js/lib/languages/json"),
        import("highlight.js/lib/languages/kotlin"),
        import("highlight.js/lib/languages/php"),
        import("highlight.js/lib/languages/ruby"),
        import("highlight.js/lib/languages/rust"),
        import("highlight.js/lib/languages/sql"),
        import("highlight.js/lib/languages/yaml"),
        import("highlight.js/lib/languages/swift"),
      ]);
      const [
        python, javascript, typescript, bash, c, cpp, csharp, go,
        css, xml, java, json, kotlin, php, ruby, rust, sql, yaml, swift,
      ] = langs.map(m => m.default);
      h.registerLanguage("python",     python);
      h.registerLanguage("javascript", javascript);
      h.registerLanguage("jsx",        javascript);
      h.registerLanguage("typescript", typescript);
      h.registerLanguage("tsx",        typescript);
      h.registerLanguage("bash",       bash);
      h.registerLanguage("sh",         bash);
      h.registerLanguage("c",          c);
      h.registerLanguage("cpp",        cpp);
      h.registerLanguage("csharp",     csharp);
      h.registerLanguage("go",         go);
      h.registerLanguage("css",        css);
      h.registerLanguage("html",       xml);
      h.registerLanguage("xml",        xml);
      h.registerLanguage("vue",        xml);
      h.registerLanguage("java",       java);
      h.registerLanguage("json",       json);
      h.registerLanguage("kotlin",     kotlin);
      h.registerLanguage("php",        php);
      h.registerLanguage("ruby",       ruby);
      h.registerLanguage("rust",       rust);
      h.registerLanguage("sql",        sql);
      h.registerLanguage("yaml",       yaml);
      h.registerLanguage("swift",      swift);
      hljs = h; hljsReady = true; return hljs;
    } catch {
      hljsReady = true; return null;
    }
  })();
  return hljsLoading;
}

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = "https://pdf-qna-backend.onrender.com" ?? "";

// ── User identity ─────────────────────────────────────────────────────────────
function getUserId() {
  let id = localStorage.getItem("cs_user_id");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    localStorage.setItem("cs_user_id", id);
  }
  return id;
}
function getUserSnippetIds() {
  try { return JSON.parse(localStorage.getItem("cs_snippet_ids") || "[]"); }
  catch { return []; }
}
function addUserSnippetId(id) {
  const ids = getUserSnippetIds();
  if (!ids.includes(id)) { ids.unshift(id); localStorage.setItem("cs_snippet_ids", JSON.stringify(ids.slice(0, 200))); }
}
function removeUserSnippetId(id) {
  localStorage.setItem("cs_snippet_ids", JSON.stringify(getUserSnippetIds().filter(i => i !== id)));
}

// ── Edit Key storage ──────────────────────────────────────────────────────────
function getStoredEditKeys() {
  try { return JSON.parse(localStorage.getItem("cs_edit_keys") || "{}"); }
  catch { return {}; }
}
function storeEditKey(snippetId, key, isOwner = false) {
  const keys = getStoredEditKeys();
  keys[snippetId] = key;
  localStorage.setItem("cs_edit_keys", JSON.stringify(keys));
  if (isOwner) {
    const owners = getOwnerSnippetIds();
    if (!owners.includes(snippetId)) { owners.unshift(snippetId); localStorage.setItem("cs_owner_ids", JSON.stringify(owners)); }
  }
}
function getEditKey(snippetId) { return getStoredEditKeys()[snippetId] || null; }
function getOwnerSnippetIds() {
  try { return JSON.parse(localStorage.getItem("cs_owner_ids") || "[]"); }
  catch { return []; }
}
function isOwnerOfSnippet(snippetId) { return getOwnerSnippetIds().includes(snippetId); }

// ── Snippet data cache ────────────────────────────────────────────────────────
function cacheSnippetData(snippetId, data) {
  try {
    const cache = JSON.parse(localStorage.getItem("cs_snippet_cache") || "{}");
    cache[snippetId] = { ...data, _cachedAt: Date.now() };
    const entries = Object.entries(cache);
    if (entries.length > 100) {
      entries.sort((a, b) => (a[1]._cachedAt || 0) - (b[1]._cachedAt || 0));
      localStorage.setItem("cs_snippet_cache", JSON.stringify(Object.fromEntries(entries.slice(-100))));
    } else {
      localStorage.setItem("cs_snippet_cache", JSON.stringify(cache));
    }
  } catch { /* storage full */ }
}
function getCachedSnippetData(snippetId) {
  try { return JSON.parse(localStorage.getItem("cs_snippet_cache") || "{}")[snippetId] || null; }
  catch { return null; }
}

// ── Languages ─────────────────────────────────────────────────────────────────
const LANGUAGES = [
  { id: "auto",       label: "Auto",       ext: ""      },
  { id: "bash",       label: "Bash",       ext: ".sh"   },
  { id: "c",          label: "C",          ext: ".c"    },
  { id: "csharp",     label: "C#",         ext: ".cs"   },
  { id: "cpp",        label: "C++",        ext: ".cpp"  },
  { id: "css",        label: "CSS",        ext: ".css"  },
  { id: "go",         label: "Go",         ext: ".go"   },
  { id: "html",       label: "HTML",       ext: ".html" },
  { id: "java",       label: "Java",       ext: ".java" },
  { id: "javascript", label: "JavaScript", ext: ".js"   },
  { id: "json",       label: "JSON",       ext: ".json" },
  { id: "jsx",        label: "JSX",        ext: ".jsx"  },
  { id: "kotlin",     label: "Kotlin",     ext: ".kt"   },
  { id: "php",        label: "PHP",        ext: ".php"  },
  { id: "python",     label: "Python",     ext: ".py"   },
  { id: "ruby",       label: "Ruby",       ext: ".rb"   },
  { id: "rust",       label: "Rust",       ext: ".rs"   },
  { id: "sql",        label: "SQL",        ext: ".sql"  },
  { id: "swift",      label: "Swift",      ext: ".swift"},
  { id: "text",       label: "Plain Text", ext: ".txt"  },
  { id: "typescript", label: "TypeScript", ext: ".ts"   },
  { id: "vue",        label: "Vue",        ext: ".vue"  },
  { id: "yaml",       label: "YAML",       ext: ".yaml" },
];

const LANG_COLORS = {
  python: "#3b82f6", javascript: "#f59e0b", typescript: "#3b82f6",
  jsx: "#61dafb", bash: "#22c55e", c: "#6b7280", cpp: "#ef4444",
  csharp: "#a78bfa", go: "#06b6d4", css: "#ec4899", html: "#f97316",
  java: "#ef4444", json: "#fbbf24", kotlin: "#a78bfa", php: "#818cf8",
  ruby: "#f43f5e", rust: "#f97316", sql: "#06b6d4", swift: "#f97316",
  vue: "#10b981", yaml: "#facc15", text: "#9ca3af", auto: "#9ca3af",
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function escapeHtml(str = "") {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const LANG_ALIAS_MAP = {
  "py":"python","js":"javascript","ts":"typescript","sh":"bash","shell":"bash",
  "zsh":"bash","cs":"csharp","c#":"csharp","c++":"cpp","htm":"html","yml":"yaml",
  "rb":"ruby","rs":"rust","kt":"kotlin","plaintext":"text","plain":"text","txt":"text",
};
function normalizeLanguage(lang) {
  if (!lang) return "auto";
  const lower = lang.toLowerCase().trim();
  return LANG_ALIAS_MAP[lower] ?? lower;
}
async function highlight(code, lang) {
  const h = await loadHljs();
  if (!h || !code) return escapeHtml(code);
  const normalized = normalizeLanguage(lang);
  try {
    if (normalized && normalized !== "auto" && normalized !== "text" && h.getLanguage(normalized))
      return h.highlight(code, { language: normalized }).value;
    if (normalized === "text") return escapeHtml(code);
    return h.highlightAuto(code).value;
  } catch { return escapeHtml(code); }
}
function splitHighlightedHtml(html) {
  const lines = []; let current = ""; const stack = []; let i = 0;
  while (i < html.length) {
    if (html[i] === "<" && html[i + 1] !== "/") {
      const end = html.indexOf(">", i);
      if (end === -1) { current += html.slice(i); break; }
      const tag = html.slice(i, end + 1);
      if (tag.startsWith("<span")) { stack.push(tag); current += tag; i = end + 1; }
      else { current += tag; i = end + 1; }
      continue;
    }
    if (html[i] === "<" && html[i + 1] === "/") {
      const end = html.indexOf(">", i);
      if (end === -1) { current += html.slice(i); break; }
      const tag = html.slice(i, end + 1);
      if (tag === "</span>" && stack.length) stack.pop();
      current += tag; i = end + 1; continue;
    }
    if (html[i] === "\n") {
      lines.push(current + stack.map(() => "</span>").join(""));
      current = stack.join(""); i++; continue;
    }
    current += html[i]; i++;
  }
  if (current || lines.length === 0) lines.push(current + stack.map(() => "</span>").join(""));
  return lines;
}
function timeAgo(isoStr) {
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
function guessLangFromFilename(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map = {
    js:"javascript", jsx:"jsx", ts:"typescript", tsx:"typescript",
    py:"python", css:"css", html:"html", json:"json", yaml:"yaml",
    yml:"yaml", sh:"bash", bash:"bash", go:"go", rs:"rust", rb:"ruby",
    java:"java", cs:"csharp", cpp:"cpp", c:"c", kt:"kotlin", php:"php",
    swift:"swift", sql:"sql", vue:"vue", txt:"text", md:"text",
  };
  return map[ext] || "auto";
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiPost(body) {
  const r = await fetch(`${API_BASE}/codeshare`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiGet(id) {
  const r = await fetch(`${API_BASE}/codeshare/${id}`);
  if (!r.ok) throw new Error("Snippet not found");
  return r.json();
}
async function apiList(ids = []) {
  const url = ids.length ? `${API_BASE}/codeshare?ids=${ids.join(",")}` : `${API_BASE}/codeshare`;
  const r = await fetch(url);
  if (!r.ok) return [];
  return r.json();
}
async function apiDelete(id) {
  const r = await fetch(`${API_BASE}/codeshare/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Could not delete snippet");
  return r.json();
}
async function apiUpdate(id, body) {
  const r = await fetch(`${API_BASE}/codeshare/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const msg = await r.text(); throw new Error(msg || "Update failed"); }
  return r.json();
}

// ── CodeBlock ─────────────────────────────────────────────────────────────────
function CodeBlock({ code, language, lineNumbers = true }) {
  const normalizedLang = normalizeLanguage(language);
  const rawLines = code.split("\n");
  const [lineHtmls, setLineHtmls] = useState(() => rawLines.map(l => escapeHtml(l)));
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHighlighted(false);
    setLineHtmls(rawLines.map(l => escapeHtml(l)));
    highlight(code, normalizedLang).then(fullHtml => {
      if (!cancelled) { setLineHtmls(splitHighlightedHtml(fullHtml)); setHighlighted(true); }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, normalizedLang]);

  return (
    <div className={`cs-codeblock${highlighted ? " cs-codeblock--ready" : ""}`}>
      {lineNumbers && (
        <div className="cs-codeblock__gutter" aria-hidden="true">
          {rawLines.map((_, i) => <div key={i} className="cs-line-num">{i + 1}</div>)}
        </div>
      )}
      <pre className="cs-codeblock__pre">
        <code className={`cs-codeblock__code language-${normalizedLang}`}>
          {lineHtmls.map((lineHtml, i) => (
            <div key={i} className="cs-code-line" dangerouslySetInnerHTML={{ __html: lineHtml || "\u200B" }} />
          ))}
        </code>
      </pre>
    </div>
  );
}

// ── LangPicker ────────────────────────────────────────────────────────────────
function LangPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = LANGUAGES.find(l => l.id === value) || LANGUAGES[0];

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="cs-langpicker" ref={ref}>
      <button className="cs-langpicker__btn" onClick={() => setOpen(o => !o)}>
        <span className="cs-langpicker__dot" style={{ background: LANG_COLORS[cur.id] || "#9ca3af" }} />
        {cur.label}
        <svg className="cs-langpicker__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="cs-langpicker__dropdown">
          {LANGUAGES.map(l => (
            <button key={l.id} className={`cs-langpicker__opt ${l.id === value ? "cs-langpicker__opt--active" : ""}`}
              onClick={() => { onChange(l.id); setOpen(false); }}>
              <span className="cs-langpicker__dot" style={{ background: LANG_COLORS[l.id] || "#9ca3af" }} />
              {l.label}
              {l.id === value && (
                <svg className="cs-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FileEditor — one file panel inside the multi-file editor ─────────────────
function FileEditor({ file, index, total, onChange, onRemove, onMoveUp, onMoveDown }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxH = window.innerHeight * 0.45;
    ta.style.height = Math.min(Math.max(180, ta.scrollHeight), maxH) + "px";
  }, [file.code]);

  const handleTabKey = e => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart, end = ta.selectionEnd;
      const next = file.code.substring(0, start) + "  " + file.code.substring(end);
      onChange({ ...file, code: next });
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  };

  const handleFilenameChange = e => {
    const name = e.target.value;
    const guessed = guessLangFromFilename(name);
    onChange({ ...file, filename: name, language: guessed });
  };

  return (
    <div className="cs-file-editor">
      <div className="cs-file-editor__header">
        <div className="cs-file-editor__index">{index + 1}</div>
        <input
          className="cs-file-editor__name-input"
          placeholder="filename.jsx"
          value={file.filename}
          onChange={handleFilenameChange}
          spellCheck={false}
        />
        <LangPicker value={file.language} onChange={lang => onChange({ ...file, language: lang })} />
        <div className="cs-file-editor__reorder">
          <button className="cs-file-editor__reorder-btn" onClick={onMoveUp} disabled={index === 0} title="Move up">↑</button>
          <button className="cs-file-editor__reorder-btn" onClick={onMoveDown} disabled={index === total - 1} title="Move down">↓</button>
        </div>
        {total > 1 && (
          <button className="cs-file-editor__remove" onClick={onRemove} title="Remove file">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
      <div className="cs-file-editor__label">
        <span className="cs-editor__label-dot" style={{ background: LANG_COLORS[file.language] || "#9ca3af" }} />
        {LANGUAGES.find(l => l.id === file.language)?.label || "Auto"}
        <span className="cs-file-editor__stats">
          {file.code.split("\n").length} lines · {file.code.length.toLocaleString()} chars
        </span>
      </div>
      <textarea
        ref={textareaRef}
        className="cs-editor__textarea cs-file-editor__textarea"
        placeholder={`// ${file.filename || "paste code here"}…`}
        value={file.code}
        onChange={e => onChange({ ...file, code: e.target.value })}
        onKeyDown={handleTabKey}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}

// ── SnippetEditor (v8 — multi-file) ──────────────────────────────────────────
function SnippetEditor({ onSnippetCreated }) {
  const [title,     setTitle]     = useState("");
  const [author,    setAuthor]    = useState(() => localStorage.getItem("cs_author") || "");
  const [saving,    setSaving]    = useState(false);
  const [shareUrl,  setShareUrl]  = useState("");
  const [editKey,   setEditKey]   = useState("");
  const [copied,    setCopied]    = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [error,     setError]     = useState("");

  // Multi-file state
  const [files, setFiles] = useState([{ filename: "", language: "auto", code: "" }]);

  const addFile = () => {
    if (files.length >= 20) return;
    setFiles(f => [...f, { filename: "", language: "auto", code: "" }]);
  };

  const removeFile = idx => setFiles(f => f.filter((_, i) => i !== idx));

  const updateFile = (idx, updated) => setFiles(f => f.map((file, i) => i === idx ? updated : file));

  const moveFile = (idx, dir) => {
    const next = [...files];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setFiles(next);
  };

  const handleSave = async () => {
    const validFiles = files.filter(f => f.code.trim());
    if (!validFiles.length) { setError("Add at least one file with code."); return; }
    setSaving(true); setError("");
    try {
      localStorage.setItem("cs_author", author);
      const payload = {
        title:  title.trim() || "Untitled Snippet",
        author: author.trim() || "Anonymous",
        files:  validFiles.map(f => ({
          filename: f.filename.trim() || "untitled",
          language: normalizeLanguage(f.language),
          code:     f.code,
        })),
      };
      const { id, edit_key } = await apiPost(payload);
      addUserSnippetId(id);
      if (edit_key) storeEditKey(id, edit_key, true);
      cacheSnippetData(id, {
        id,
        title:      payload.title,
        language:   normalizeLanguage(validFiles[0].language),
        code:       validFiles[0].code,
        author:     payload.author,
        created_at: new Date().toISOString(),
        views:      0,
        files:      payload.files,
      });
      setShareUrl(`${window.location.origin}/codeshare/${id}`);
      setEditKey(edit_key || "");
      if (onSnippetCreated) onSnippetCreated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy    = () => { navigator.clipboard.writeText(shareUrl);  setCopied(true);    setTimeout(() => setCopied(false),    2000); };
  const handleKeyCopy = () => { navigator.clipboard.writeText(editKey);   setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); };

  return (
    <div className="cs-editor">
      {/* Top toolbar */}
      <div className="cs-editor__toolbar">
        <div className="cs-editor__toolbar-row">
          <input className="cs-editor__title-input" placeholder="Snippet title (e.g. E-commerce Store)…"
            value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />
          <input className="cs-editor__author-input" placeholder="Your name (optional)"
            value={author} onChange={e => setAuthor(e.target.value)} maxLength={60} />
        </div>
        <div className="cs-editor__toolbar-row cs-editor__toolbar-row--meta">
          <span className="cs-files-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            {files.length} file{files.length !== 1 ? "s" : ""}
          </span>
          <span className="cs-files-hint">Each file gets its own tab · max 20 files · 2 MB total</span>
        </div>
      </div>

      {/* File editors */}
      <div className="cs-files-list">
        {files.map((file, idx) => (
          <FileEditor
            key={idx}
            file={file}
            index={idx}
            total={files.length}
            onChange={updated => updateFile(idx, updated)}
            onRemove={() => removeFile(idx)}
            onMoveUp={() => moveFile(idx, -1)}
            onMoveDown={() => moveFile(idx, 1)}
          />
        ))}
      </div>

      {/* Add file button */}
      <div className="cs-files-add-row">
        <button className="cs-files-add-btn" onClick={addFile} disabled={files.length >= 20}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add File
          {files.length >= 20 && <span className="cs-files-limit"> (max 20)</span>}
        </button>
      </div>

      {/* Footer */}
      <div className="cs-editor__footer">
        <div className="cs-editor__stats">
          <span className="cs-stat">{files.length} <span className="cs-stat-label">files</span></span>
          <span className="cs-stat-sep">·</span>
          <span className="cs-stat">{files.reduce((s, f) => s + f.code.split("\n").length, 0).toLocaleString()} <span className="cs-stat-label">total lines</span></span>
        </div>
        {error && <span className="cs-editor__error">⚠ {error}</span>}
        <button className={`cs-btn cs-btn--primary ${saving ? "cs-btn--loading" : ""}`}
          onClick={handleSave} disabled={saving}>
          {saving ? <><span className="cs-btn-spinner" /> Saving…</> : <>Share Snippet <span className="cs-btn-arrow">→</span></>}
        </button>
      </div>

      {/* Share banner */}
      {shareUrl && (
        <div className="cs-share-banner">
          <div className="cs-share-banner__inner">
            <div className="cs-share-banner__icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </div>
            <div className="cs-share-banner__content">
              <span className="cs-share-banner__label">✓ Snippet live</span>
              <a className="cs-share-banner__url" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
            </div>
            <button className="cs-share-banner__copy" onClick={handleCopy}>{copied ? "✓ Copied!" : "Copy link"}</button>
          </div>
          {editKey && (
            <div className="cs-share-banner__editkey">
              <div className="cs-editkey-row">
                <div className="cs-editkey-info">
                  <span className="cs-editkey-icon">🔑</span>
                  <div>
                    <div className="cs-editkey-label">Your Edit Key</div>
                    <div className="cs-editkey-hint">
                      Share this with collaborators so they can edit the snippet.
                      <strong> Shown only once here</strong> — save it.
                    </div>
                  </div>
                </div>
                <div className="cs-editkey-value-wrap">
                  <code className="cs-editkey-value">{editKey}</code>
                  <button className="cs-share-banner__copy cs-editkey-copy-btn" onClick={handleKeyCopy}>
                    {keyCopied ? "✓ Copied!" : "Copy key"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FileTabs — viewer tab bar ─────────────────────────────────────────────────
function FileTabs({ files, activeIdx, onSelect }) {
  const scrollRef = useRef(null);
  return (
    <div className="cs-filetabs" ref={scrollRef}>
      <div className="cs-filetabs__inner">
        {files.map((f, i) => {
          const lang = normalizeLanguage(f.language);
          const color = LANG_COLORS[lang] || "#9ca3af";
          return (
            <button
              key={i}
              className={`cs-filetab ${i === activeIdx ? "cs-filetab--active" : ""}`}
              onClick={() => onSelect(i)}
              style={i === activeIdx ? { "--tab-color": color } : {}}
            >
              <span className="cs-filetab__dot" style={{ background: color }} />
              <span className="cs-filetab__name">{f.filename || `file_${i + 1}`}</span>
              {i === activeIdx && <span className="cs-filetab__lang">{LANGUAGES.find(l => l.id === lang)?.label || lang}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── EditKeyModal ──────────────────────────────────────────────────────────────
function EditKeyModal({ onConfirm, onCancel }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
    const handler = e => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  const handleSubmit = () => {
    const trimmed = key.trim();
    if (!trimmed) { setErr("Please enter the edit key."); return; }
    if (!trimmed.startsWith("ek_")) { setErr('Invalid format. Edit keys start with "ek_".'); return; }
    onConfirm(trimmed);
  };

  return (
    <div className="cs-modal-overlay" onClick={onCancel}>
      <div className="cs-modal cs-modal--editkey" onClick={e => e.stopPropagation()}>
        <div className="cs-modal__icon cs-modal__icon--key">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="8" cy="15" r="4"/><path d="M12 11.5l8-8"/><path d="M17 7l2 2"/>
          </svg>
        </div>
        <h3 className="cs-modal__title">Enter Edit Key</h3>
        <p className="cs-modal__message">Paste the edit key shared by the snippet creator to unlock editing.</p>
        <input ref={inputRef} className="cs-editkey-modal-input" placeholder="ek_a1b2c3d4…"
          value={key} onChange={e => { setKey(e.target.value); setErr(""); }}
          onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} spellCheck={false} />
        {err && <span className="cs-modal__field-err">⚠ {err}</span>}
        <div className="cs-modal__actions">
          <button className="cs-btn cs-btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="cs-btn cs-btn--primary" onClick={handleSubmit}>
            Unlock Edit <span className="cs-btn-arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SnippetViewer (v8 — multi-file with full edit support) ───────────────────
function SnippetViewer({ snippetId }) {
  const [snippet,        setSnippet]        = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState("");
  const [copied,         setCopied]         = useState(false);
  const [rawCopied,      setRawCopied]      = useState(false);
  const [activeFileIdx,  setActiveFileIdx]  = useState(0);

  const [isOwner,        setIsOwner]        = useState(() => isOwnerOfSnippet(snippetId));
  const [storedEditKey,  setStoredEditKey]  = useState(() => getEditKey(snippetId) || "");

  const [showKeyModal,   setShowKeyModal]   = useState(false);
  const [editMode,       setEditMode]       = useState(false);
  const [showKeyBanner,  setShowKeyBanner]  = useState(false);
  const [keyCopied,      setKeyCopied]      = useState(false);

  // Edit state (mirrors full snippet)
  const [editTitle,      setEditTitle]      = useState("");
  const [editAuthor,     setEditAuthor]     = useState("");
  const [editFiles,      setEditFiles]      = useState([]);
  const [editActiveIdx,  setEditActiveIdx]  = useState(0);
  const [preview,        setPreview]        = useState(false);

  const [saving,         setSaving]         = useState(false);
  const [saveError,      setSaveError]      = useState("");
  const [saveOk,         setSaveOk]         = useState(false);

  // Resolve files array — backward compat with old single-file snippets
  function resolveFiles(s) {
    if (s.files && s.files.length > 0) return s.files;
    return [{ filename: "snippet", language: s.language || "auto", code: s.code || "" }];
  }

  useEffect(() => {
    const cached = getCachedSnippetData(snippetId);
    if (cached) {
      const s = { ...cached, language: normalizeLanguage(cached.language) };
      setSnippet(s);
      setEditTitle(s.title); setEditAuthor(s.author);
      setEditFiles(resolveFiles(s).map(f => ({ ...f, language: normalizeLanguage(f.language) })));
      setLoading(false);
    }
    apiGet(snippetId)
      .then(data => {
        const s = { ...data, language: normalizeLanguage(data.language) };
        setSnippet(s);
        setEditTitle(s.title); setEditAuthor(s.author);
        setEditFiles(resolveFiles(s).map(f => ({ ...f, language: normalizeLanguage(f.language) })));
        cacheSnippetData(snippetId, s);
      })
      .catch(e => { if (!cached) setError(e.message); })
      .finally(() => setLoading(false));
  }, [snippetId]);

  const copyLink  = () => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const copyRaw   = () => {
    const files = resolveFiles(snippet);
    const active = files[activeFileIdx] || files[0];
    navigator.clipboard.writeText(active?.code || "");
    setRawCopied(true); setTimeout(() => setRawCopied(false), 2000);
  };
  const download  = () => {
    const files = resolveFiles(snippet);
    const active = files[activeFileIdx] || files[0];
    const lang = LANGUAGES.find(l => l.id === normalizeLanguage(active?.language));
    const blob = new Blob([active?.code || ""], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (active?.filename || snippet?.title || "snippet").replace(/\s+/g, "_") + (lang?.ext || ".txt");
    a.click();
  };

  const handleOwnerEdit = () => { setSaveError(""); setEditMode(true); setEditActiveIdx(activeFileIdx); };
  const handleCollaboratorEditClick = () => {
    if (storedEditKey) { setSaveError(""); setEditMode(true); setEditActiveIdx(activeFileIdx); }
    else setShowKeyModal(true);
  };
  const handleKeyConfirm = key => {
    storeEditKey(snippetId, key, false);
    setStoredEditKey(key);
    setShowKeyModal(false); setSaveError(""); setEditMode(true); setEditActiveIdx(activeFileIdx);
  };
  const handleKeyCopy = () => { navigator.clipboard.writeText(storedEditKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); };

  const handleCancelEdit = () => {
    setEditMode(false);
    if (snippet) {
      setEditTitle(snippet.title); setEditAuthor(snippet.author);
      setEditFiles(resolveFiles(snippet).map(f => ({ ...f, language: normalizeLanguage(f.language) })));
    }
    setSaveError(""); setPreview(false);
  };

  const handleUpdate = async () => {
    const validFiles = editFiles.filter(f => f.code.trim());
    if (!validFiles.length) { setSaveError("At least one file must have code."); return; }
    if (!storedEditKey) { setSaveError("No edit key found."); setEditMode(false); return; }
    setSaving(true); setSaveError(""); setSaveOk(false);
    try {
      const updated = await apiUpdate(snippetId, {
        edit_key: storedEditKey,
        title:    editTitle.trim() || "Untitled Snippet",
        author:   editAuthor.trim() || snippet?.author || "Anonymous",
        files:    validFiles.map(f => ({
          filename: f.filename.trim() || "untitled",
          language: normalizeLanguage(f.language),
          code:     f.code,
        })),
      });
      const merged = {
        ...snippet,
        title:    updated.title    || editTitle,
        language: normalizeLanguage(updated.language || editFiles[0]?.language || "auto"),
        code:     updated.code     || editFiles[0]?.code || "",
        author:   updated.author   || editAuthor,
        files:    updated.files    || editFiles,
      };
      setSnippet(merged);
      cacheSnippetData(snippetId, merged);
      setEditFiles(resolveFiles(merged).map(f => ({ ...f, language: normalizeLanguage(f.language) })));
      setSaveOk(true); setEditMode(false); setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      const msg = e.message || "";
      const isKeyError = msg.includes("401") || msg.toLowerCase().includes("invalid") ||
        msg.toLowerCase().includes("edit key") || msg.toLowerCase().includes("unauthorized");
      if (isKeyError) {
        setSaveError("❌ Invalid edit key. Please check and try again.");
        if (!isOwner) {
          setStoredEditKey("");
          const keys = getStoredEditKeys(); delete keys[snippetId];
          localStorage.setItem("cs_edit_keys", JSON.stringify(keys));
        }
      } else {
        setSaveError(msg || "Failed to save. Please try again.");
      }
    } finally { setSaving(false); }
  };

  // Edit file helpers
  const updateEditFile = (idx, updated) => setEditFiles(f => f.map((file, i) => i === idx ? updated : file));
  const addEditFile    = () => {
    if (editFiles.length >= 20) return;
    setEditFiles(f => [...f, { filename: "", language: "auto", code: "" }]);
    setEditActiveIdx(editFiles.length);
  };
  const removeEditFile = idx => {
    if (editFiles.length <= 1) return;
    setEditFiles(f => f.filter((_, i) => i !== idx));
    setEditActiveIdx(prev => Math.min(prev, editFiles.length - 2));
  };
  const moveEditFile   = (idx, dir) => {
    const next = [...editFiles]; const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setEditFiles(next); setEditActiveIdx(target);
  };

  if (loading && !snippet) return (
    <div className="cs-viewer cs-viewer--loading"><div className="cs-spinner" /><p>Loading snippet…</p></div>
  );
  if (error) return (
    <div className="cs-viewer cs-viewer--error">
      <span className="cs-viewer__error-icon">⚠️</span>
      <p>{error}</p>
      <a href="/codeshare" className="cs-btn cs-btn--secondary">Back to CodeShare</a>
    </div>
  );

  const displayFiles   = resolveFiles(snippet);
  const safeActiveIdx  = Math.min(activeFileIdx, displayFiles.length - 1);
  const activeFile     = displayFiles[safeActiveIdx];
  const isMultiFile    = displayFiles.length > 1;

  return (
    <div className="cs-viewer">
      {showKeyModal && <EditKeyModal onConfirm={handleKeyConfirm} onCancel={() => setShowKeyModal(false)} />}

      {/* Header */}
      <div className="cs-viewer__header">
        <div className="cs-viewer__meta">
          {editMode ? (
            <div className="cs-viewer__edit-meta">
              <input className="cs-editor__title-input cs-viewer__title-edit"
                value={editTitle} onChange={e => setEditTitle(e.target.value)}
                placeholder="Snippet title…" maxLength={120} />
              <input className="cs-editor__author-input"
                value={editAuthor} onChange={e => setEditAuthor(e.target.value)}
                placeholder="Author name" maxLength={60} />
            </div>
          ) : (
            <>
              <h1 className="cs-viewer__title">{snippet.title}</h1>
              <div className="cs-viewer__info">
                {isMultiFile ? (
                  <span className="cs-viewer__file-count">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    {displayFiles.length} files
                  </span>
                ) : (
                  <span className="cs-viewer__lang" style={{ color: LANG_COLORS[activeFile?.language] || "#9ca3af", borderColor: (LANG_COLORS[activeFile?.language] || "#9ca3af") + "44" }}>
                    <span className="cs-langpicker__dot" style={{ background: LANG_COLORS[activeFile?.language] || "#9ca3af" }} />
                    {LANGUAGES.find(l => l.id === normalizeLanguage(activeFile?.language))?.label || activeFile?.language}
                  </span>
                )}
                <span className="cs-viewer__author">by {snippet.author}</span>
                <span className="cs-viewer__time">{timeAgo(snippet.created_at)}</span>
                <span className="cs-viewer__views">👁 {snippet.views} views</span>
              </div>
            </>
          )}
        </div>
        <div className="cs-viewer__actions">
          {editMode ? (
            <>
              <button className={`cs-btn cs-btn--ghost ${preview ? "active" : ""}`} onClick={() => setPreview(p => !p)}>
                {preview ? "✏️ Edit" : "👁 Preview"}
              </button>
              <button className="cs-btn cs-btn--ghost" onClick={handleCancelEdit}>✕ Cancel</button>
              <button className={`cs-btn cs-btn--primary ${saving ? "cs-btn--loading" : ""}`}
                onClick={handleUpdate} disabled={saving}>
                {saving ? <><span className="cs-btn-spinner" /> Saving…</> : <>💾 Save Changes</>}
              </button>
            </>
          ) : (
            <>
              {saveOk && <span className="cs-viewer__save-ok">✓ Saved!</span>}
              <button className="cs-btn cs-btn--ghost" onClick={copyLink}>{copied ? "✓ Copied!" : "🔗 Copy link"}</button>
              <button className="cs-btn cs-btn--ghost" onClick={copyRaw}>{rawCopied ? "✓ Copied!" : "📋 Copy file"}</button>
              <button className="cs-btn cs-btn--ghost" onClick={download}>⬇ Download</button>
              {isOwner ? (
                <>
                  <button className="cs-btn cs-btn--creator-edit" onClick={handleOwnerEdit} title="Edit — no key required">✏️ Edit</button>
                  <button className="cs-btn cs-btn--show-key" onClick={() => setShowKeyBanner(b => !b)} title="Reveal edit key">
                    🔑 {showKeyBanner ? "Hide Key" : "Share Key"}
                  </button>
                </>
              ) : (
                <button className="cs-btn cs-btn--edit-key" onClick={handleCollaboratorEditClick}
                  title={storedEditKey ? "Edit this snippet" : "Enter edit key"}>
                  🔑 {storedEditKey ? "✏️ Edit" : "Edit with Key"}
                </button>
              )}
              <a href="/codeshare" className="cs-btn cs-btn--secondary">+ New</a>
            </>
          )}
        </div>
      </div>

      {/* Creator key banner */}
      {isOwner && showKeyBanner && !editMode && storedEditKey && (
        <div className="cs-creator-key-banner">
          <div className="cs-creator-key-banner__inner">
            <span className="cs-creator-key-banner__icon">🔑</span>
            <div className="cs-creator-key-banner__content">
              <div className="cs-creator-key-banner__label">Your Edit Key</div>
              <div className="cs-creator-key-banner__hint">
                Share with collaborators. Anyone with this key can modify the snippet. <strong>Cannot be changed.</strong>
              </div>
              <div className="cs-creator-key-banner__key-row">
                <code className="cs-editkey-value">{storedEditKey}</code>
                <button className="cs-share-banner__copy cs-editkey-copy-btn" onClick={handleKeyCopy}>
                  {keyCopied ? "✓ Copied!" : "Copy key"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Errors */}
      {saveError && <div className="cs-viewer__save-error">{saveError}</div>}

      {/* ── VIEW MODE ─────────────────────────────────────────────────────── */}
      {!editMode && (
        <>
          {isMultiFile && (
            <FileTabs files={displayFiles} activeIdx={safeActiveIdx} onSelect={setActiveFileIdx} />
          )}
          <CodeBlock
            key={`viewer-${safeActiveIdx}-${activeFile?.language}`}
            code={activeFile?.code || ""}
            language={activeFile?.language || "auto"}
          />
          {isMultiFile && (
            <div className="cs-viewer__file-footer">
              <span className="cs-viewer__file-info">
                <span className="cs-langpicker__dot" style={{ background: LANG_COLORS[normalizeLanguage(activeFile?.language)] || "#9ca3af" }} />
                {activeFile?.filename || "untitled"}
                <span className="cs-viewer__file-lang">{LANGUAGES.find(l => l.id === normalizeLanguage(activeFile?.language))?.label}</span>
              </span>
              <span className="cs-viewer__file-nav">
                <button className="cs-filenav-btn" onClick={() => setActiveFileIdx(i => Math.max(0, i - 1))} disabled={safeActiveIdx === 0}>‹ Prev</button>
                <span className="cs-filenav-count">{safeActiveIdx + 1} / {displayFiles.length}</span>
                <button className="cs-filenav-btn" onClick={() => setActiveFileIdx(i => Math.min(displayFiles.length - 1, i + 1))} disabled={safeActiveIdx === displayFiles.length - 1}>Next ›</button>
              </span>
            </div>
          )}
        </>
      )}

      {/* ── EDIT MODE ─────────────────────────────────────────────────────── */}
      {editMode && (
        <div className="cs-viewer__edit-area">
          {/* Edit file tabs */}
          <div className="cs-edit-filetabs-bar">
            <FileTabs files={editFiles} activeIdx={editActiveIdx} onSelect={setEditActiveIdx} />
            <div className="cs-edit-filetabs-actions">
              <button className="cs-files-add-btn cs-files-add-btn--sm" onClick={addEditFile} disabled={editFiles.length >= 20}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add File
              </button>
            </div>
          </div>

          {/* Active file editor */}
          {editFiles[editActiveIdx] && (
            preview ? (
              <CodeBlock
                key={`edit-preview-${editActiveIdx}`}
                code={editFiles[editActiveIdx].code || "// nothing yet"}
                language={editFiles[editActiveIdx].language}
              />
            ) : (
              <EditFilePanel
                file={editFiles[editActiveIdx]}
                index={editActiveIdx}
                total={editFiles.length}
                onChange={updated => updateEditFile(editActiveIdx, updated)}
                onRemove={() => removeEditFile(editActiveIdx)}
                onMoveUp={() => moveEditFile(editActiveIdx, -1)}
                onMoveDown={() => moveEditFile(editActiveIdx, 1)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── EditFilePanel — used inside the viewer's edit mode ───────────────────────
function EditFilePanel({ file, index, total, onChange, onRemove, onMoveUp, onMoveDown }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxH = window.innerHeight * 0.55;
    ta.style.height = Math.min(Math.max(300, ta.scrollHeight), maxH) + "px";
  }, [file.code]);

  const handleTabKey = e => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target; const start = ta.selectionStart, end = ta.selectionEnd;
      const next = file.code.substring(0, start) + "  " + file.code.substring(end);
      onChange({ ...file, code: next });
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  };

  const handleFilenameChange = e => {
    const name = e.target.value;
    onChange({ ...file, filename: name, language: guessLangFromFilename(name) });
  };

  return (
    <div className="cs-viewer__edit-panel">
      <div className="cs-file-editor__header cs-file-editor__header--viewer">
        <input
          className="cs-file-editor__name-input"
          placeholder="filename.jsx"
          value={file.filename}
          onChange={handleFilenameChange}
          spellCheck={false}
        />
        <LangPicker value={file.language} onChange={lang => onChange({ ...file, language: lang })} />
        <div className="cs-file-editor__reorder">
          <button className="cs-file-editor__reorder-btn" onClick={onMoveUp} disabled={index === 0} title="Move up">↑</button>
          <button className="cs-file-editor__reorder-btn" onClick={onMoveDown} disabled={index === total - 1} title="Move down">↓</button>
        </div>
        {total > 1 && (
          <button className="cs-file-editor__remove" onClick={onRemove} title="Remove this file">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            </svg>
            Remove File
          </button>
        )}
      </div>
      <div className="cs-editor__label">
        <span className="cs-editor__label-dot" style={{ background: LANG_COLORS[file.language] || "#9ca3af" }} />
        {LANGUAGES.find(l => l.id === file.language)?.label || "Auto"}
        <span className="cs-editor__label-badge cs-label-badge--edit">EDITING</span>
        <span className="cs-file-editor__stats">
          {file.code.split("\n").length} lines · {file.code.length.toLocaleString()} chars
        </span>
      </div>
      <textarea
        ref={textareaRef}
        className="cs-editor__textarea cs-viewer__edit-textarea"
        value={file.code}
        onChange={e => onChange({ ...file, code: e.target.value })}
        onKeyDown={handleTabKey}
        spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
      />
    </div>
  );
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, snippet, onConfirm, onCancel, loading }) {
  useEffect(() => {
    const handler = e => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);
  return (
    <div className="cs-modal-overlay" onClick={onCancel}>
      <div className="cs-modal" onClick={e => e.stopPropagation()}>
        <div className="cs-modal__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </div>
        <h3 className="cs-modal__title">{title}</h3>
        <p className="cs-modal__message">{message}</p>
        {snippet && (
          <div className="cs-modal__snippet-preview">
            <span className="cs-modal__snippet-lang" style={{ color: LANG_COLORS[snippet.language] || "#9ca3af" }}>
              <span className="cs-langpicker__dot" style={{ background: LANG_COLORS[snippet.language] || "#9ca3af" }} />
              {LANGUAGES.find(l => l.id === snippet.language)?.label || snippet.language}
            </span>
            <span className="cs-modal__snippet-title">{snippet.title}</span>
          </div>
        )}
        <div className="cs-modal__actions">
          <button className="cs-btn cs-btn--ghost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className={`cs-btn cs-btn--danger ${loading ? "cs-btn--loading" : ""}`} onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="cs-btn-spinner cs-btn-spinner--red" /> Deleting…</> : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              </svg> Delete Snippet</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MySnippets ────────────────────────────────────────────────────────────────
function MySnippets({ refreshKey }) {
  const [snippets,      setSnippets]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [deletingId,    setDeletingId]    = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const ids = getUserSnippetIds();
    if (!ids.length) { setSnippets([]); setLoading(false); return; }
    const data = await apiList(ids);
    const ordered = ids.map(id => data.find(d => d.id === id)).filter(Boolean);
    setSnippets(ordered.map(s => ({ ...s, language: normalizeLanguage(s.language) })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const requestDelete = (snippet, e) => { e.preventDefault(); e.stopPropagation(); setConfirmTarget(snippet); };
  const handleDelete  = async () => {
    if (!confirmTarget) return;
    const id = confirmTarget.id; setDeletingId(id);
    try {
      await apiDelete(id); removeUserSnippetId(id);
      setSnippets(prev => prev.filter(s => s.id !== id)); setConfirmTarget(null);
    } catch (err) { alert(err.message); } finally { setDeletingId(null); }
  };

  if (loading) return (
    <div className="cs-recent cs-recent--loading">
      <div className="cs-spinner cs-spinner--sm" />
      <span className="cs-recent__loading-text">Loading your snippets…</span>
    </div>
  );
  if (!snippets.length) return (
    <div className="cs-recent__empty-state">
      <div className="cs-empty-icon">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="8" y="6" width="32" height="36" rx="4" strokeOpacity="0.3"/>
          <line x1="16" y1="16" x2="32" y2="16" strokeOpacity="0.3"/>
          <line x1="16" y1="22" x2="28" y2="22" strokeOpacity="0.3"/>
          <line x1="16" y1="28" x2="24" y2="28" strokeOpacity="0.3"/>
        </svg>
      </div>
      <p className="cs-recent__empty-title">No snippets yet</p>
      <p className="cs-recent__empty-sub">Snippets you share will appear here.</p>
    </div>
  );

  return (
    <>
      {confirmTarget && (
        <ConfirmModal title="Delete Snippet?" message="This action cannot be undone."
          snippet={confirmTarget} onConfirm={handleDelete} onCancel={() => setConfirmTarget(null)}
          loading={deletingId === confirmTarget.id} />
      )}
      <div className="cs-recent">
        <div className="cs-recent__header">
          <h2 className="cs-recent__heading">
            <svg className="cs-recent__heading-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
            </svg>
            My Snippets
          </h2>
          <span className="cs-recent__count">{snippets.length}</span>
        </div>
        <div className="cs-recent__grid">
          {snippets.map(s => {
            const files      = (s.files && s.files.length) ? s.files : null;
            const langColor  = LANG_COLORS[s.language] || "#9ca3af";
            const langLabel  = LANGUAGES.find(l => l.id === s.language)?.label || s.language;
            const preview    = s.code.split("\n").slice(0, 4).join("\n");
            const isOwner_   = isOwnerOfSnippet(s.id);
            const hasKey     = !!getEditKey(s.id);

            return (
              <div key={s.id} className="cs-card" onClick={() => !confirmTarget && (window.location.href = `/codeshare/${s.id}`)}
                role="link" tabIndex={0}
                onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !confirmTarget) { e.preventDefault(); window.location.href = `/codeshare/${s.id}`; } }}
                style={{ cursor: "pointer" }}>
                <div className="cs-card__header">
                  <span className="cs-card__lang-dot" style={{ background: langColor }} />
                  <span className="cs-card__title">{s.title}</span>
                  {files ? (
                    <span className="cs-card__multifile-badge">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      {files.length}
                    </span>
                  ) : (
                    <span className="cs-card__lang" style={{ color: langColor }}>{langLabel}</span>
                  )}
                  {isOwner_ && <span className="cs-card__owner-badge" title="You created this snippet">👑</span>}
                  {!isOwner_ && hasKey && <span className="cs-card__key-badge" title="You have edit access">🔑</span>}
                </div>

                {/* Multi-file: show file pills */}
                {files ? (
                  <div className="cs-card__file-pills">
                    {files.slice(0, 4).map((f, i) => (
                      <span key={i} className="cs-card__file-pill" style={{ borderColor: (LANG_COLORS[normalizeLanguage(f.language)] || "#9ca3af") + "55", color: LANG_COLORS[normalizeLanguage(f.language)] || "#9ca3af" }}>
                        <span className="cs-langpicker__dot" style={{ background: LANG_COLORS[normalizeLanguage(f.language)] || "#9ca3af", width: 5, height: 5 }} />
                        {f.filename || `file_${i + 1}`}
                      </span>
                    ))}
                    {files.length > 4 && <span className="cs-card__file-pill cs-card__file-pill--more">+{files.length - 4}</span>}
                  </div>
                ) : (
                  <div className="cs-card__preview"><code>{preview}</code></div>
                )}

                <div className="cs-card__footer">
                  <span className="cs-card__time">🕐 {timeAgo(s.created_at)}</span>
                  <span className="cs-card__views">👁 {s.views}</span>
                  <button className="cs-card__delete" onClick={e => requestDelete(s, e)}
                    disabled={deletingId === s.id} title="Delete snippet"
                    onPointerDown={e => e.stopPropagation()}>
                    {deletingId === s.id
                      ? <span className="cs-btn-spinner cs-btn-spinner--sm-icon" />
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                        </svg>
                    }
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CodeShare() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const snippetId = pathParts[0] === "codeshare" && pathParts[1] ? pathParts[1] : null;
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => { getUserId(); }, []);

  return (
    <>
      <style>{CSS}</style>
      <NavBar currentPath="/codeshare" />
      <div className="cs-root">
        <div className="cs-bg" aria-hidden="true">
          <div className="cs-bg__blob cs-bg__blob--1" />
          <div className="cs-bg__blob cs-bg__blob--2" />
          <div className="cs-bg__blob cs-bg__blob--3" />
        </div>
        <div className="cs-page-header">
          <div className="cs-page-header__inner">
            <a href="/codeshare" className="cs-page-header__logo">
              <span className="cs-page-header__icon">📎</span>
              <span>CodeShare</span>
            </a>
            <div className="cs-page-header__divider" />
            <p className="cs-page-header__sub">Paste · Share · Done. Multi-file snippets with instant links.</p>
            <div className="cs-page-header__badge">Private to you</div>
          </div>
        </div>
        <div className="cs-main">
          {snippetId
            ? <SnippetViewer snippetId={snippetId} />
            : <>
                <SnippetEditor onSnippetCreated={() => setRefreshKey(k => k + 1)} />
                <MySnippets refreshKey={refreshKey} />
              </>
          }
        </div>
      </div>
    </>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  html, body { height: auto !important; overflow-y: auto !important; overflow-x: hidden; scroll-behavior: smooth; }

  .cs-root { min-height: 100vh; position: relative; background: #07070f; color: #e2e8f0; font-family: 'Geist Mono', 'Fira Code', 'Cascadia Code', monospace; overflow-x: hidden; }

  .cs-bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
  .cs-bg__blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.08; animation: cs-blob-drift 20s ease-in-out infinite alternate; }
  .cs-bg__blob--1 { width: 600px; height: 600px; background: radial-gradient(circle, #a78bfa, transparent 70%); top: -200px; left: -150px; animation-duration: 22s; }
  .cs-bg__blob--2 { width: 500px; height: 500px; background: radial-gradient(circle, #5b8af0, transparent 70%); top: 40%; right: -150px; animation-duration: 18s; animation-delay: -8s; }
  .cs-bg__blob--3 { width: 400px; height: 400px; background: radial-gradient(circle, #10b981, transparent 70%); bottom: 10%; left: 30%; animation-duration: 25s; animation-delay: -14s; }
  @keyframes cs-blob-drift { from { transform: translate(0,0) scale(1); } to { transform: translate(40px,30px) scale(1.08); } }

  .cs-page-header { position: sticky; top: 0; z-index: 50; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0.6rem 1.5rem; background: rgba(7,7,15,0.85); backdrop-filter: blur(20px); }
  .cs-page-header__inner { max-width: 1000px; margin: 0 auto; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .cs-page-header__logo { display: flex; align-items: center; gap: 8px; font-size: 1.05rem; font-weight: 700; color: #fff; text-decoration: none; letter-spacing: 0.04em; }
  .cs-page-header__logo:hover { color: #a78bfa; }
  .cs-page-header__icon { font-size: 1.2rem; }
  .cs-page-header__divider { width: 1px; height: 16px; background: rgba(255,255,255,0.12); }
  .cs-page-header__sub { color: rgba(255,255,255,0.35); font-size: 0.75rem; margin: 0; flex: 1; }
  .cs-page-header__badge { font-size: 0.68rem; font-weight: 600; padding: 3px 9px; border-radius: 99px; background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.25); color: #a78bfa; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; }

  .cs-main { position: relative; z-index: 1; max-width: 1000px; margin: 0 auto; padding: 2rem 1.5rem 5rem; display: flex; flex-direction: column; gap: 2.5rem; }

  /* ── Editor shell ─────────────────────────────────────────────────────── */
  .cs-editor { border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; overflow: hidden; background: rgba(13,13,22,0.9); box-shadow: 0 0 0 1px rgba(167,139,250,0.04), 0 8px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04); backdrop-filter: blur(12px); transition: border-color 0.2s, box-shadow 0.2s; }
  .cs-editor:focus-within { border-color: rgba(167,139,250,0.2); box-shadow: 0 0 0 1px rgba(167,139,250,0.08), 0 8px 48px rgba(0,0,0,0.7), 0 0 40px rgba(167,139,250,0.06), inset 0 1px 0 rgba(255,255,255,0.05); }
  .cs-editor__toolbar { padding: 12px 14px; background: rgba(18,18,28,0.95); border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 8px; }
  .cs-editor__toolbar-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cs-editor__toolbar-row--meta { align-items: center; }
  .cs-editor__title-input, .cs-editor__author-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 8px; padding: 7px 11px; color: #e2e8f0; font-size: 0.82rem; font-family: inherit; outline: none; transition: border-color 0.15s, background 0.15s; }
  .cs-editor__title-input { flex: 2; min-width: 150px; }
  .cs-editor__author-input { flex: 1; min-width: 120px; max-width: 200px; }
  .cs-editor__title-input:focus, .cs-editor__author-input:focus { border-color: rgba(167,139,250,0.4); background: rgba(167,139,250,0.04); }
  .cs-editor__title-input::placeholder, .cs-editor__author-input::placeholder { color: rgba(255,255,255,0.2); }

  .cs-files-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; padding: 3px 9px; border-radius: 99px; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.2); color: #a78bfa; font-weight: 600; }
  .cs-files-hint { color: rgba(255,255,255,0.2); font-size: 0.7rem; }

  /* ── File list ────────────────────────────────────────────────────────── */
  .cs-files-list { display: flex; flex-direction: column; }

  /* ── FileEditor (inline, stacked) ────────────────────────────────────── */
  .cs-file-editor { border-bottom: 1px solid rgba(255,255,255,0.05); }
  .cs-file-editor:last-child { border-bottom: none; }
  .cs-file-editor__header { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: rgba(14,14,22,0.9); border-bottom: 1px solid rgba(255,255,255,0.04); flex-wrap: wrap; }
  .cs-file-editor__header--viewer { padding: 10px 20px; background: rgba(18,18,28,0.95); border-bottom: 1px solid rgba(255,255,255,0.06); }
  .cs-file-editor__index { width: 20px; height: 20px; border-radius: 50%; background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.2); color: #a78bfa; font-size: 0.65rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .cs-file-editor__name-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 7px; padding: 5px 10px; color: #e2e8f0; font-size: 0.8rem; font-family: 'Geist Mono', monospace; outline: none; flex: 1; min-width: 120px; max-width: 280px; transition: border-color 0.15s; }
  .cs-file-editor__name-input:focus { border-color: rgba(167,139,250,0.4); background: rgba(167,139,250,0.03); }
  .cs-file-editor__name-input::placeholder { color: rgba(255,255,255,0.18); }
  .cs-file-editor__reorder { display: flex; gap: 2px; }
  .cs-file-editor__reorder-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; color: rgba(255,255,255,0.4); font-size: 0.75rem; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.1s; padding: 0; font-family: inherit; }
  .cs-file-editor__reorder-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #fff; }
  .cs-file-editor__reorder-btn:disabled { opacity: 0.25; cursor: not-allowed; }
  .cs-file-editor__remove { display: flex; align-items: center; gap: 5px; background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.15); border-radius: 6px; color: rgba(248,113,113,0.6); font-size: 0.72rem; font-family: inherit; padding: 4px 9px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .cs-file-editor__remove:hover { background: rgba(248,113,113,0.12); color: #f87171; border-color: rgba(248,113,113,0.35); }
  .cs-file-editor__stats { margin-left: auto; color: rgba(255,255,255,0.2); font-size: 0.68rem; }

  .cs-editor__label { display: flex; align-items: center; gap: 7px; padding: 6px 14px; background: rgba(10,10,18,0.6); border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.73rem; color: rgba(255,255,255,0.35); letter-spacing: 0.03em; }
  .cs-editor__label-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .cs-editor__label-badge { margin-left: 4px; font-size: 0.64rem; padding: 1px 6px; border-radius: 4px; background: rgba(167,139,250,0.15); color: #a78bfa; letter-spacing: 0.06em; }
  .cs-label-badge--edit { background: rgba(251,191,36,0.15) !important; color: #fbbf24 !important; }
  .cs-file-editor__textarea { min-height: 180px !important; max-height: 45vh !important; }

  .cs-editor__textarea { width: 100%; min-height: 260px; max-height: 55vh; resize: none; overflow: auto; background: #08080f !important; border: none; outline: none; padding: 1.25rem 1.5rem; color: #c9d1d9; font-family: 'Geist Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 0.85rem; line-height: 1.75; tab-size: 2; box-sizing: border-box; caret-color: #a78bfa; scrollbar-width: thin; scrollbar-color: rgba(167,139,250,0.3) rgba(255,255,255,0.03); -webkit-text-fill-color: #c9d1d9; text-align: left; }
  .cs-editor__textarea::placeholder { color: rgba(255,255,255,0.15); }
  .cs-editor__textarea::-webkit-scrollbar { width: 6px; height: 6px; }
  .cs-editor__textarea::-webkit-scrollbar-thumb { background: rgba(167,139,250,0.3); border-radius: 3px; }

  /* ── Add file button ──────────────────────────────────────────────────── */
  .cs-files-add-row { padding: 10px 14px; background: rgba(14,14,22,0.9); border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; }
  .cs-files-add-btn { display: inline-flex; align-items: center; gap: 6px; background: rgba(167,139,250,0.07); border: 1px dashed rgba(167,139,250,0.25); border-radius: 8px; color: rgba(167,139,250,0.7); font-size: 0.78rem; font-family: inherit; font-weight: 600; padding: 7px 14px; cursor: pointer; transition: all 0.15s; }
  .cs-files-add-btn:hover:not(:disabled) { background: rgba(167,139,250,0.13); border-color: rgba(167,139,250,0.45); color: #a78bfa; }
  .cs-files-add-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .cs-files-add-btn--sm { font-size: 0.72rem; padding: 5px 10px; }
  .cs-files-limit { color: rgba(255,255,255,0.25); font-weight: 400; }

  .cs-editor__footer { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(18,18,28,0.95); border-top: 1px solid rgba(255,255,255,0.06); flex-wrap: wrap; }
  .cs-editor__stats { display: flex; align-items: center; gap: 6px; margin-right: auto; color: rgba(255,255,255,0.25); font-size: 0.74rem; }
  .cs-stat { color: rgba(255,255,255,0.45); }
  .cs-stat-label { color: rgba(255,255,255,0.2); font-size: 0.7rem; }
  .cs-stat-sep { color: rgba(255,255,255,0.15); }
  .cs-editor__error { color: #f87171; font-size: 0.78rem; }

  /* ── Share banner ─────────────────────────────────────────────────────── */
  .cs-share-banner { background: linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(91,138,240,0.06) 100%); border-top: 1px solid rgba(16,185,129,0.2); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .cs-share-banner__inner { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .cs-share-banner__icon-wrap { width: 32px; height: 32px; border-radius: 8px; background: rgba(16,185,129,0.12); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .cs-share-banner__icon-wrap svg { width: 16px; height: 16px; color: #10b981; }
  .cs-share-banner__content { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .cs-share-banner__label { color: #10b981; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  .cs-share-banner__url { color: #a78bfa; font-size: 0.8rem; text-decoration: none; word-break: break-all; }
  .cs-share-banner__url:hover { text-decoration: underline; }
  .cs-share-banner__copy { background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.3); border-radius: 7px; padding: 6px 14px; color: #a78bfa; font-size: 0.78rem; font-family: inherit; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
  .cs-share-banner__copy:hover { background: rgba(167,139,250,0.22); }

  .cs-share-banner__editkey { border-top: 1px solid rgba(251,191,36,0.15); padding-top: 10px; }
  .cs-editkey-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .cs-editkey-info { display: flex; align-items: flex-start; gap: 10px; flex: 1; }
  .cs-editkey-icon { font-size: 1.1rem; line-height: 1.4; flex-shrink: 0; }
  .cs-editkey-label { font-size: 0.74rem; font-weight: 700; color: #fbbf24; letter-spacing: 0.04em; text-transform: uppercase; }
  .cs-editkey-hint { font-size: 0.72rem; color: rgba(255,255,255,0.3); margin-top: 2px; line-height: 1.4; }
  .cs-editkey-hint strong { color: rgba(255,255,255,0.5); }
  .cs-editkey-value-wrap { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cs-editkey-value { background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.2); border-radius: 6px; padding: 5px 10px; color: #fde68a; font-size: 0.78rem; font-family: 'Geist Mono', monospace; letter-spacing: 0.05em; user-select: all; }
  .cs-editkey-copy-btn { background: rgba(251,191,36,0.1) !important; border-color: rgba(251,191,36,0.3) !important; color: #fbbf24 !important; }
  .cs-editkey-copy-btn:hover { background: rgba(251,191,36,0.2) !important; }

  /* ── File Tabs ────────────────────────────────────────────────────────── */
  .cs-filetabs { background: rgba(10,10,18,0.95); border-bottom: 1px solid rgba(255,255,255,0.06); overflow-x: auto; scrollbar-width: none; }
  .cs-filetabs::-webkit-scrollbar { display: none; }
  .cs-filetabs__inner { display: flex; align-items: stretch; min-width: max-content; }
  .cs-filetab { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; background: none; border: none; border-bottom: 2px solid transparent; color: rgba(255,255,255,0.35); font-size: 0.78rem; font-family: inherit; cursor: pointer; transition: all 0.15s; white-space: nowrap; position: relative; }
  .cs-filetab:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.03); }
  .cs-filetab--active { color: var(--tab-color, #a78bfa); border-bottom-color: var(--tab-color, #a78bfa); background: rgba(255,255,255,0.025); }
  .cs-filetab__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .cs-filetab__name { font-weight: 500; }
  .cs-filetab__lang { font-size: 0.66rem; color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.06); border-radius: 4px; padding: 1px 6px; }

  /* ── Edit mode file tabs bar ──────────────────────────────────────────── */
  .cs-edit-filetabs-bar { display: flex; align-items: stretch; background: rgba(10,10,18,0.95); border-bottom: 1px solid rgba(255,255,255,0.06); overflow-x: auto; scrollbar-width: none; }
  .cs-edit-filetabs-bar::-webkit-scrollbar { display: none; }
  .cs-edit-filetabs-bar .cs-filetabs { flex: 1; border-bottom: none; }
  .cs-edit-filetabs-actions { display: flex; align-items: center; padding: 6px 12px; border-left: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }

  /* ── Viewer file footer ───────────────────────────────────────────────── */
  .cs-viewer__file-footer { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: rgba(10,10,18,0.9); border-top: 1px solid rgba(255,255,255,0.04); flex-wrap: wrap; gap: 8px; }
  .cs-viewer__file-info { display: flex; align-items: center; gap: 7px; font-size: 0.75rem; color: rgba(255,255,255,0.4); }
  .cs-viewer__file-lang { font-size: 0.68rem; color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.06); border-radius: 4px; padding: 1px 6px; }
  .cs-viewer__file-nav { display: flex; align-items: center; gap: 6px; }
  .cs-filenav-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: rgba(255,255,255,0.4); font-size: 0.72rem; font-family: inherit; padding: 4px 10px; cursor: pointer; transition: all 0.15s; }
  .cs-filenav-btn:hover:not(:disabled) { background: rgba(255,255,255,0.09); color: #fff; }
  .cs-filenav-btn:disabled { opacity: 0.25; cursor: not-allowed; }
  .cs-filenav-count { color: rgba(255,255,255,0.25); font-size: 0.72rem; min-width: 40px; text-align: center; }

  /* ── Viewer file count badge ──────────────────────────────────────────── */
  .cs-viewer__file-count { display: inline-flex; align-items: center; gap: 5px; font-size: 0.74rem; padding: 3px 9px; border-radius: 99px; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.2); color: #a78bfa; font-weight: 600; }

  /* ── CodeBlock — LEFT-ALIGNED FIX ────────────────────────────────────── */
  .cs-codeblock { display: flex; align-items: flex-start; background: #08080f !important; overflow-x: auto; overflow-y: auto; max-height: 70vh; scrollbar-width: thin; scrollbar-color: rgba(167,139,250,0.3) rgba(255,255,255,0.02); transition: opacity 0.15s ease; opacity: 0.85; contain: paint; }
  .cs-codeblock--ready { opacity: 1; }
  .cs-codeblock::-webkit-scrollbar { width: 6px; height: 6px; }
  .cs-codeblock::-webkit-scrollbar-thumb { background: rgba(167,139,250,0.3); border-radius: 3px; }
  .cs-codeblock__gutter { display: flex; flex-direction: column; padding: 1.25rem 0; min-width: 52px; background: rgba(10,10,18,0.85) !important; border-right: 1px solid rgba(255,255,255,0.04); user-select: none; flex-shrink: 0; position: sticky; left: 0; z-index: 2; }
  .cs-line-num { display: block; padding: 0 12px; font-size: 0.73rem; line-height: 1.75; height: calc(0.85rem * 1.75); color: rgba(255,255,255,0.14); text-align: right; font-family: inherit; }
  .cs-codeblock__pre { margin: 0; padding: 1.25rem 0; flex: 1; overflow: visible; background: #08080f !important; text-align: left; }
  .cs-codeblock__code { display: block; font-family: 'Geist Mono', 'Fira Code', monospace; font-size: 0.85rem; color: #c9d1d9; background: #08080f !important; text-align: left; }
  .cs-code-line { display: block; white-space: pre; line-height: 1.75; min-height: calc(0.85rem * 1.75); padding: 0 1.5rem; font-size: 0.85rem; transition: background 0.08s; min-width: max-content; text-align: left; }
  .cs-code-line:hover { background: rgba(255,255,255,0.025); }
  .cs-codeblock__code .hljs-keyword { color: #c678dd; }
  .cs-codeblock__code .hljs-string { color: #98c379; }
  .cs-codeblock__code .hljs-number { color: #d19a66; }
  .cs-codeblock__code .hljs-comment { color: #5c6370; font-style: italic; }
  .cs-codeblock__code .hljs-function { color: #61afef; }
  .cs-codeblock__code .hljs-title { color: #61afef; }
  .cs-codeblock__code .hljs-built_in { color: #e5c07b; }
  .cs-codeblock__code .hljs-type { color: #e5c07b; }
  .cs-codeblock__code .hljs-variable { color: #e06c75; }
  .cs-codeblock__code .hljs-attr { color: #d19a66; }
  .cs-codeblock__code .hljs-tag { color: #e06c75; }
  .cs-codeblock__code .hljs-attribute { color: #d19a66; }
  .cs-codeblock__code .hljs-operator { color: #56b6c2; }
  .cs-codeblock__code .hljs-literal { color: #56b6c2; }
  .cs-codeblock__code .hljs-meta { color: #e5c07b; }

  /* ── Viewer ───────────────────────────────────────────────────────────── */
  .cs-viewer { border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; overflow: hidden; background: rgba(13,13,22,0.9); box-shadow: 0 8px 48px rgba(0,0,0,0.6); backdrop-filter: blur(12px); }
  .cs-viewer--loading, .cs-viewer--error { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 240px; gap: 12px; color: rgba(255,255,255,0.4); font-size: 0.9rem; }
  .cs-viewer--error { color: #f87171; }
  .cs-viewer__error-icon { font-size: 2rem; }
  .cs-viewer__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px; background: rgba(18,18,28,0.95); border-bottom: 1px solid rgba(255,255,255,0.06); flex-wrap: wrap; }
  .cs-viewer__title { font-size: 1.1rem; font-weight: 700; color: #fff; margin: 0 0 8px; letter-spacing: 0.02em; }
  .cs-viewer__info { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .cs-viewer__lang { display: flex; align-items: center; gap: 5px; font-size: 0.75rem; padding: 3px 9px; border-radius: 99px; border: 1px solid; font-weight: 600; }
  .cs-viewer__author, .cs-viewer__time, .cs-viewer__views { color: rgba(255,255,255,0.3); font-size: 0.75rem; }
  .cs-viewer__actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cs-viewer__save-ok { color: #10b981; font-size: 0.78rem; font-weight: 600; padding: 4px 10px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); border-radius: 6px; }
  .cs-viewer__save-error { background: rgba(248,113,113,0.08); border-top: 1px solid rgba(248,113,113,0.2); padding: 12px 20px; color: #f87171; font-size: 0.8rem; line-height: 1.5; }
  .cs-viewer__edit-meta { display: flex; gap: 8px; flex-wrap: wrap; flex: 1; }
  .cs-viewer__title-edit { min-width: 180px !important; font-size: 0.9rem !important; }
  .cs-viewer__edit-area { background: #08080f; }
  .cs-viewer__edit-panel { background: #08080f; }
  .cs-viewer__edit-textarea { min-height: 300px !important; background: #08080f !important; -webkit-text-fill-color: #c9d1d9 !important; text-align: left !important; }

  /* ── Creator key banner ───────────────────────────────────────────────── */
  .cs-creator-key-banner { background: linear-gradient(135deg, rgba(251,191,36,0.07) 0%, rgba(251,191,36,0.03) 100%); border-top: 1px solid rgba(251,191,36,0.2); border-bottom: 1px solid rgba(251,191,36,0.1); padding: 14px 20px; animation: cs-overlay-in 0.15s ease; }
  .cs-creator-key-banner__inner { display: flex; align-items: flex-start; gap: 12px; }
  .cs-creator-key-banner__icon { font-size: 1.3rem; flex-shrink: 0; }
  .cs-creator-key-banner__content { flex: 1; display: flex; flex-direction: column; gap: 5px; }
  .cs-creator-key-banner__label { font-size: 0.74rem; font-weight: 700; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.06em; }
  .cs-creator-key-banner__hint { font-size: 0.75rem; color: rgba(255,255,255,0.35); line-height: 1.5; }
  .cs-creator-key-banner__hint strong { color: rgba(255,255,255,0.55); }
  .cs-creator-key-banner__key-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 4px; }

  /* ── Buttons ──────────────────────────────────────────────────────────── */
  .cs-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 15px; border-radius: 9px; font-size: 0.8rem; font-family: inherit; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; transition: all 0.15s; white-space: nowrap; }
  .cs-btn--primary { background: linear-gradient(135deg, #a78bfa 0%, #5b8af0 100%); color: #fff; box-shadow: 0 2px 16px rgba(167,139,250,0.25); }
  .cs-btn--primary:hover { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(167,139,250,0.35); }
  .cs-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
  .cs-btn--loading { opacity: 0.65; pointer-events: none; }
  .cs-btn--secondary { background: rgba(167,139,250,0.1); color: #a78bfa; border-color: rgba(167,139,250,0.25); }
  .cs-btn--secondary:hover { background: rgba(167,139,250,0.18); }
  .cs-btn--ghost { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.6); border-color: rgba(255,255,255,0.09); }
  .cs-btn--ghost:hover { background: rgba(255,255,255,0.08); color: #fff; }
  .cs-btn--ghost.active { background: rgba(167,139,250,0.1); border-color: rgba(167,139,250,0.35); color: #a78bfa; }
  .cs-btn-arrow { transition: transform 0.15s; }
  .cs-btn:hover .cs-btn-arrow { transform: translateX(3px); }
  .cs-btn-spinner { width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: cs-spin 0.6s linear infinite; display: inline-block; }
  .cs-btn--creator-edit { background: linear-gradient(135deg, rgba(167,139,250,0.15) 0%, rgba(91,138,240,0.1) 100%) !important; border: 1px solid rgba(167,139,250,0.4) !important; color: #c4b5fd !important; border-radius: 9px; padding: 7px 14px; font-size: 0.8rem; font-family: inherit; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; text-decoration: none; }
  .cs-btn--creator-edit:hover { background: linear-gradient(135deg, rgba(167,139,250,0.25) 0%, rgba(91,138,240,0.18) 100%) !important; border-color: rgba(167,139,250,0.6) !important; color: #ddd6fe !important; }
  .cs-btn--show-key { display: inline-flex; align-items: center; gap: 5px; background: rgba(251,191,36,0.08); color: #fbbf24; border: 1px solid rgba(251,191,36,0.25); border-radius: 9px; padding: 7px 14px; font-size: 0.8rem; font-family: inherit; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .cs-btn--show-key:hover { background: rgba(251,191,36,0.16); border-color: rgba(251,191,36,0.45); }
  .cs-btn--edit-key { background: rgba(251,191,36,0.08); color: #fbbf24; border: 1px solid rgba(251,191,36,0.25); border-radius: 9px; padding: 7px 14px; font-size: 0.8rem; font-family: inherit; font-weight: 600; cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; gap: 5px; }
  .cs-btn--edit-key:hover { background: rgba(251,191,36,0.16); border-color: rgba(251,191,36,0.45); }
  .cs-btn--danger { background: rgba(239,68,68,0.12); color: #f87171; border-color: rgba(239,68,68,0.35); }
  .cs-btn--danger:hover:not(:disabled) { background: rgba(239,68,68,0.22); border-color: rgba(239,68,68,0.6); color: #fca5a5; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(239,68,68,0.2); }
  .cs-btn--danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .cs-btn-spinner--red { border-color: rgba(248,113,113,0.3); border-top-color: #f87171; }
  .cs-btn-spinner--sm-icon { width: 11px; height: 11px; border-width: 2px; border-color: rgba(255,255,255,0.2); border-top-color: rgba(255,255,255,0.6); display: inline-block; border-radius: 50%; animation: cs-spin 0.6s linear infinite; }

  /* ── LangPicker ───────────────────────────────────────────────────────── */
  .cs-langpicker { position: relative; }
  .cs-langpicker__btn { display: flex; align-items: center; gap: 7px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 8px; padding: 7px 11px; color: rgba(255,255,255,0.75); font-size: 0.82rem; font-family: inherit; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .cs-langpicker__btn:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.15); }
  .cs-langpicker__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .cs-langpicker__chevron { width: 13px; height: 13px; color: rgba(255,255,255,0.3); }
  .cs-langpicker__dropdown { position: absolute; top: calc(100% + 6px); left: 0; z-index: 200; background: #13131e; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 4px; min-width: 165px; max-height: 280px; overflow-y: auto; box-shadow: 0 12px 40px rgba(0,0,0,0.7); scrollbar-width: thin; }
  .cs-langpicker__dropdown::-webkit-scrollbar { width: 4px; }
  .cs-langpicker__dropdown::-webkit-scrollbar-thumb { background: rgba(167,139,250,0.25); border-radius: 2px; }
  .cs-langpicker__opt { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; background: none; border: none; border-radius: 8px; color: rgba(255,255,255,0.65); font-size: 0.8rem; font-family: inherit; cursor: pointer; transition: all 0.1s; text-align: left; }
  .cs-langpicker__opt:hover { background: rgba(255,255,255,0.06); color: #fff; }
  .cs-langpicker__opt--active { background: rgba(167,139,250,0.1); color: #a78bfa; }
  .cs-check { width: 13px; height: 13px; margin-left: auto; }

  /* ── Edit Key modal ───────────────────────────────────────────────────── */
  .cs-modal--editkey { border-color: rgba(251,191,36,0.2); }
  .cs-modal__icon--key { background: rgba(251,191,36,0.1) !important; border-color: rgba(251,191,36,0.25) !important; }
  .cs-modal__icon--key svg { color: #fbbf24 !important; }
  .cs-editkey-modal-input { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(251,191,36,0.25); border-radius: 9px; padding: 9px 13px; color: #fde68a; font-family: 'Geist Mono', monospace; font-size: 0.85rem; outline: none; box-sizing: border-box; transition: border-color 0.15s; letter-spacing: 0.04em; }
  .cs-editkey-modal-input:focus { border-color: rgba(251,191,36,0.5); background: rgba(251,191,36,0.04); }
  .cs-editkey-modal-input::placeholder { color: rgba(255,255,255,0.2); }
  .cs-modal__field-err { color: #f87171; font-size: 0.76rem; width: 100%; text-align: left; }

  /* ── My Snippets ──────────────────────────────────────────────────────── */
  .cs-recent--loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 2rem; color: rgba(255,255,255,0.3); font-size: 0.8rem; }
  .cs-recent__loading-text { color: rgba(255,255,255,0.25); font-size: 0.8rem; }
  .cs-recent__empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 2rem; gap: 10px; border: 1px dashed rgba(255,255,255,0.08); border-radius: 16px; background: rgba(255,255,255,0.015); }
  .cs-empty-icon svg { width: 48px; height: 48px; color: rgba(255,255,255,0.15); }
  .cs-recent__empty-title { color: rgba(255,255,255,0.35); font-size: 0.9rem; font-weight: 600; margin: 4px 0 0; }
  .cs-recent__empty-sub { color: rgba(255,255,255,0.2); font-size: 0.78rem; text-align: center; margin: 0; max-width: 280px; }
  .cs-recent__header { display: flex; align-items: center; gap: 10px; margin-bottom: 1rem; }
  .cs-recent__heading { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; font-weight: 600; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.08em; margin: 0; }
  .cs-recent__heading-icon { width: 14px; height: 14px; color: rgba(167,139,250,0.5); flex-shrink: 0; }
  .cs-recent__count { font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: rgba(167,139,250,0.1); color: rgba(167,139,250,0.7); border: 1px solid rgba(167,139,250,0.15); min-width: 22px; text-align: center; }
  .cs-recent__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; }

  /* ── Card ─────────────────────────────────────────────────────────────── */
  .cs-card { display: flex; flex-direction: column; gap: 10px; padding: 15px; background: rgba(13,13,22,0.85); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; text-decoration: none; transition: all 0.18s; overflow: hidden; position: relative; backdrop-filter: blur(8px); outline: none; }
  .cs-card::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(135deg, rgba(167,139,250,0.04) 0%, transparent 60%); opacity: 0; transition: opacity 0.18s; pointer-events: none; }
  .cs-card:hover { border-color: rgba(167,139,250,0.22); transform: translateY(-3px); box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
  .cs-card:hover::before { opacity: 1; }
  .cs-card__header { display: flex; align-items: center; gap: 8px; }
  .cs-card__lang-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .cs-card__title { font-size: 0.84rem; font-weight: 700; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
  .cs-card__lang { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; flex-shrink: 0; }
  .cs-card__multifile-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 99px; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.2); color: #a78bfa; flex-shrink: 0; }
  .cs-card__owner-badge, .cs-card__key-badge { font-size: 0.75rem; flex-shrink: 0; }
  .cs-card__preview { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; padding: 9px 11px; overflow: hidden; max-height: 76px; pointer-events: none; }
  .cs-card__preview code { font-family: inherit; font-size: 0.7rem; line-height: 1.65; color: rgba(255,255,255,0.35); white-space: pre; display: block; overflow: hidden; text-align: left; }
  .cs-card__file-pills { display: flex; flex-wrap: wrap; gap: 5px; min-height: 52px; align-content: flex-start; }
  .cs-card__file-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 0.68rem; padding: 3px 8px; border-radius: 6px; border: 1px solid; background: rgba(255,255,255,0.03); font-family: 'Geist Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
  .cs-card__file-pill--more { color: rgba(255,255,255,0.3); border-color: rgba(255,255,255,0.1); }
  .cs-card__footer { display: flex; align-items: center; gap: 8px; font-size: 0.7rem; }
  .cs-card__time { color: rgba(255,255,255,0.2); }
  .cs-card__views { color: rgba(255,255,255,0.2); margin-left: auto; }
  .cs-card__delete { background: none; border: none; color: rgba(255,255,255,0.15); cursor: pointer; padding: 4px 8px; border-radius: 5px; transition: all 0.15s; line-height: 1; font-family: inherit; position: relative; z-index: 2; }
  .cs-card__delete:hover { color: #f87171; background: rgba(248,113,113,0.1); }
  .cs-card__delete:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Confirm Modal ────────────────────────────────────────────────────── */
  .cs-modal-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.72); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 1rem; animation: cs-overlay-in 0.15s ease; }
  @keyframes cs-overlay-in { from { opacity: 0; } to { opacity: 1; } }
  .cs-modal { background: #0f0f1a; border: 1px solid rgba(239,68,68,0.2); border-radius: 18px; padding: 2rem; width: 100%; max-width: 400px; display: flex; flex-direction: column; align-items: center; gap: 1rem; box-shadow: 0 24px 64px rgba(0,0,0,0.8); animation: cs-modal-in 0.18s cubic-bezier(0.34,1.56,0.64,1); text-align: center; }
  @keyframes cs-modal-in { from { opacity: 0; transform: scale(0.92) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  .cs-modal__icon { width: 52px; height: 52px; border-radius: 14px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); display: flex; align-items: center; justify-content: center; }
  .cs-modal__icon svg { width: 24px; height: 24px; color: #f87171; }
  .cs-modal__title { font-size: 1rem; font-weight: 700; color: #fff; margin: 0; }
  .cs-modal__message { font-size: 0.82rem; color: rgba(255,255,255,0.4); margin: 0; line-height: 1.6; }
  .cs-modal__snippet-preview { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; width: 100%; box-sizing: border-box; }
  .cs-modal__snippet-lang { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0; }
  .cs-modal__snippet-title { font-size: 0.82rem; color: rgba(255,255,255,0.65); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; text-align: left; }
  .cs-modal__actions { display: flex; gap: 10px; width: 100%; margin-top: 0.5rem; }
  .cs-modal__actions .cs-btn { flex: 1; justify-content: center; }

  /* ── Spinner ──────────────────────────────────────────────────────────── */
  .cs-spinner { width: 26px; height: 26px; border: 2px solid rgba(167,139,250,0.15); border-top-color: #a78bfa; border-radius: 50%; animation: cs-spin 0.65s linear infinite; }
  .cs-spinner--sm { width: 16px; height: 16px; }
  @keyframes cs-spin { to { transform: rotate(360deg); } }

  /* ── Responsive ───────────────────────────────────────────────────────── */
  @media (max-width: 640px) {
    .cs-main { padding: 1.25rem 1rem 4rem; }
    .cs-editor__toolbar-row { flex-wrap: wrap; }
    .cs-editor__title-input, .cs-editor__author-input { max-width: 100%; }
    .cs-viewer__header { flex-direction: column; }
    .cs-viewer__actions { width: 100%; }
    .cs-recent__grid { grid-template-columns: 1fr; }
    .cs-page-header__sub { display: none; }
    .cs-editkey-row { flex-direction: column; }
    .cs-file-editor__header { flex-wrap: wrap; }
  }
`;