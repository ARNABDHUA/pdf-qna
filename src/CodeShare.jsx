/**
 * CodeShare.jsx  —  v4
 *
 * Fixes:
 *   1. Scroll — page scrolls normally; no overflow clipping.
 *   2. User-specific snippets — IDs persisted in localStorage under a
 *      stable random userId. On load we fetch only those IDs via
 *      GET /codeshare?ids=a,b,c so other users' snippets are never shown.
 *   3. Syntax highlight fix — language is normalized to lowercase before
 *      passing to highlight.js, and CodeBlock re-mounts when language
 *      changes to avoid stale highlighted HTML.
 *   4. LINE-BY-LINE rendering — each line is its own block element so the
 *      code displays like a proper editor (VSCode-style), not a single line.
 *
 * Routes:
 *   /codeshare        → editor + my snippets list
 *   /codeshare/:id    → read-only viewer
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import NavBar from "./NavBar";

// ── highlight.js — lazy-loaded, graceful fallback ─────────────────────────────
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
  try {
    return JSON.parse(localStorage.getItem("cs_snippet_ids") || "[]");
  } catch {
    return [];
  }
}

function addUserSnippetId(id) {
  const ids = getUserSnippetIds();
  if (!ids.includes(id)) {
    ids.unshift(id);
    localStorage.setItem("cs_snippet_ids", JSON.stringify(ids.slice(0, 200)));
  }
}

function removeUserSnippetId(id) {
  const ids = getUserSnippetIds().filter(i => i !== id);
  localStorage.setItem("cs_snippet_ids", JSON.stringify(ids));
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
  "py":         "python",
  "js":         "javascript",
  "ts":         "typescript",
  "sh":         "bash",
  "shell":      "bash",
  "zsh":        "bash",
  "cs":         "csharp",
  "c#":         "csharp",
  "c++":        "cpp",
  "htm":        "html",
  "yml":        "yaml",
  "rb":         "ruby",
  "rs":         "rust",
  "kt":         "kotlin",
  "plaintext":  "text",
  "plain":      "text",
  "txt":        "text",
};

function normalizeLanguage(lang) {
  if (!lang) return "auto";
  const lower = lang.toLowerCase().trim();
  return LANG_ALIAS_MAP[lower] ?? lower;
}

// ── highlight: returns full highlighted HTML string ───────────────────────────
async function highlight(code, lang) {
  const h = await loadHljs();
  if (!h || !code) return escapeHtml(code);
  const normalized = normalizeLanguage(lang);
  try {
    if (normalized && normalized !== "auto" && normalized !== "text" && h.getLanguage(normalized)) {
      return h.highlight(code, { language: normalized }).value;
    }
    if (normalized === "text") return escapeHtml(code);
    return h.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

/**
 * splitHighlightedHtml
 * ---------------------
 * highlight.js returns a single HTML string where tokens may SPAN multiple
 * lines (e.g. a multi-line string or comment is one <span>...</span> with
 * embedded \n characters).  A naive .split("\n") breaks those open tags.
 *
 * This function walks the HTML character-by-character, tracking open tags,
 * and emits one HTML string per logical line — closing any open spans at the
 * end of each line and re-opening them at the start of the next, so every
 * line is valid, self-contained HTML.
 */
function splitHighlightedHtml(html) {
  const lines   = [];
  let   current = "";         // HTML being built for the current line
  const stack   = [];         // stack of currently open <span ...> tags
  let   i       = 0;

  while (i < html.length) {
    // ── Opening tag ──────────────────────────────────────────────────────────
    if (html[i] === "<" && html[i + 1] !== "/") {
      const end = html.indexOf(">", i);
      if (end === -1) { current += html.slice(i); break; }
      const tag = html.slice(i, end + 1);
      // Self-closing or non-span tags — just emit
      if (tag.startsWith("<span")) {
        stack.push(tag);
        current += tag;
        i = end + 1;
      } else {
        current += tag;
        i = end + 1;
      }
      continue;
    }

    // ── Closing tag ───────────────────────────────────────────────────────────
    if (html[i] === "<" && html[i + 1] === "/") {
      const end = html.indexOf(">", i);
      if (end === -1) { current += html.slice(i); break; }
      const tag = html.slice(i, end + 1);
      if (tag === "</span>" && stack.length) stack.pop();
      current += tag;
      i = end + 1;
      continue;
    }

    // ── Newline ───────────────────────────────────────────────────────────────
    if (html[i] === "\n") {
      // Close all open spans for this line
      const closers = stack.map(() => "</span>").join("");
      lines.push(current + closers);
      // Re-open those spans on the next line
      current = stack.join("");
      i++;
      continue;
    }

    // ── Regular character ─────────────────────────────────────────────────────
    current += html[i];
    i++;
  }

  // Flush last line
  if (current || lines.length === 0) {
    const closers = stack.map(() => "</span>").join("");
    lines.push(current + closers);
  }

  return lines;
}

function timeAgo(isoStr) {
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiPost(body) {
  const r = await fetch(`${API_BASE}/codeshare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const url = ids.length
    ? `${API_BASE}/codeshare?ids=${ids.join(",")}`
    : `${API_BASE}/codeshare`;
  const r = await fetch(url);
  if (!r.ok) return [];
  return r.json();
}

async function apiDelete(id) {
  const r = await fetch(`${API_BASE}/codeshare/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Could not delete snippet");
  return r.json();
}

// ── CodeBlock ─────────────────────────────────────────────────────────────────
// Renders code line-by-line (VSCode-style) with proper syntax highlighting.
// Each line is a <div class="cs-code-line"> so gutter numbers align perfectly.
function CodeBlock({ code, language, lineNumbers = true }) {
  const normalizedLang = normalizeLanguage(language);
  const rawLines = code.split("\n");

  // State: array of per-line HTML strings (one per line)
  const [lineHtmls, setLineHtmls] = useState(() =>
    rawLines.map(l => escapeHtml(l))
  );
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHighlighted(false);
    // Reset to escaped plain text immediately so content is visible
    setLineHtmls(rawLines.map(l => escapeHtml(l)));

    highlight(code, normalizedLang).then(fullHtml => {
      if (!cancelled) {
        const lines = splitHighlightedHtml(fullHtml);
        setLineHtmls(lines);
        setHighlighted(true);
      }
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, normalizedLang]);

  return (
    <div className={`cs-codeblock${highlighted ? " cs-codeblock--ready" : ""}`}>
      {/* Gutter */}
      {lineNumbers && (
        <div className="cs-codeblock__gutter" aria-hidden="true">
          {rawLines.map((_, i) => (
            <div key={i} className="cs-line-num">{i + 1}</div>
          ))}
        </div>
      )}

      {/* Code */}
      <pre className="cs-codeblock__pre">
        <code className={`cs-codeblock__code language-${normalizedLang}`}>
          {lineHtmls.map((lineHtml, i) => (
            <div
              key={i}
              className="cs-code-line"
              dangerouslySetInnerHTML={{ __html: lineHtml || "\u200B" }}
            />
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
            <button
              key={l.id}
              className={`cs-langpicker__opt ${l.id === value ? "cs-langpicker__opt--active" : ""}`}
              onClick={() => { onChange(l.id); setOpen(false); }}
            >
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

// ── SnippetEditor ─────────────────────────────────────────────────────────────
function SnippetEditor({ onSnippetCreated }) {
  const [title,    setTitle]    = useState("");
  const [code,     setCode]     = useState("");
  const [lang,     setLang]     = useState("auto");
  const [author,   setAuthor]   = useState(() => localStorage.getItem("cs_author") || "");
  const [saving,   setSaving]   = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied,   setCopied]   = useState(false);
  const [error,    setError]    = useState("");
  const [preview,  setPreview]  = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxH = window.innerHeight * 0.55;
    ta.style.height = Math.min(Math.max(260, ta.scrollHeight), maxH) + "px";
  }, [code]);

  const handleSave = async () => {
    if (!code.trim()) { setError("Code cannot be empty."); return; }
    setSaving(true); setError("");
    try {
      localStorage.setItem("cs_author", author);
      const { id } = await apiPost({
        title:    title.trim() || "Untitled Snippet",
        language: normalizeLanguage(lang),
        code,
        author:   author.trim() || "Anonymous",
      });
      addUserSnippetId(id);
      const url = `${window.location.origin}/codeshare/${id}`;
      setShareUrl(url);
      if (onSnippetCreated) onSnippetCreated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTabKey = e => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta    = e.target;
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      const next  = code.substring(0, start) + "  " + code.substring(end);
      setCode(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  };

  return (
    <div className="cs-editor">
      {/* Toolbar */}
      <div className="cs-editor__toolbar">
        <div className="cs-editor__toolbar-row">
          <input
            className="cs-editor__title-input"
            placeholder="Snippet title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={120}
          />
          <input
            className="cs-editor__author-input"
            placeholder="Your name (optional)"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            maxLength={60}
          />
        </div>
        <div className="cs-editor__toolbar-row cs-editor__toolbar-row--controls">
          <LangPicker value={lang} onChange={setLang} />
          <button
            className={`cs-editor__preview-btn ${preview ? "active" : ""}`}
            onClick={() => setPreview(p => !p)}
          >
            {preview ? "✏️ Edit" : "👁 Preview"}
          </button>
        </div>
      </div>

      {/* Editor label */}
      <div className="cs-editor__label">
        <span className="cs-editor__label-dot" style={{ background: LANG_COLORS[lang] || "#9ca3af" }} />
        {LANGUAGES.find(l => l.id === lang)?.label || "Auto"}
        {preview && <span className="cs-editor__label-badge">PREVIEW</span>}
      </div>

      {/* Code area */}
      {preview ? (
        <CodeBlock key={`preview-${lang}`} code={code || "// nothing to preview yet"} language={lang} />
      ) : (
        <textarea
          ref={textareaRef}
          className="cs-editor__textarea"
          placeholder="Paste or type your code here…"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={handleTabKey}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      )}

      {/* Footer */}
      <div className="cs-editor__footer">
        <div className="cs-editor__stats">
          <span className="cs-stat">{code.split("\n").length} <span className="cs-stat-label">lines</span></span>
          <span className="cs-stat-sep">·</span>
          <span className="cs-stat">{code.length.toLocaleString()} <span className="cs-stat-label">chars</span></span>
        </div>
        {error && <span className="cs-editor__error">⚠ {error}</span>}
        <button
          className={`cs-btn cs-btn--primary ${saving ? "cs-btn--loading" : ""}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <><span className="cs-btn-spinner" /> Saving…</>
          ) : (
            <>Share Snippet <span className="cs-btn-arrow">→</span></>
          )}
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
              <a className="cs-share-banner__url" href={shareUrl} target="_blank" rel="noreferrer">
                {shareUrl}
              </a>
            </div>
            <button className="cs-share-banner__copy" onClick={handleCopy}>
              {copied ? "✓ Copied!" : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SnippetViewer ─────────────────────────────────────────────────────────────
function SnippetViewer({ snippetId }) {
  const [snippet,   setSnippet]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [copied,    setCopied]    = useState(false);
  const [rawCopied, setRawCopied] = useState(false);

  useEffect(() => {
    apiGet(snippetId)
      .then(data => {
        setSnippet({ ...data, language: normalizeLanguage(data.language) });
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [snippetId]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const copyRaw = () => {
    navigator.clipboard.writeText(snippet?.code || "");
    setRawCopied(true); setTimeout(() => setRawCopied(false), 2000);
  };
  const download = () => {
    const lang = LANGUAGES.find(l => l.id === snippet?.language);
    const ext  = lang?.ext || ".txt";
    const blob = new Blob([snippet?.code || ""], { type: "text/plain" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = (snippet?.title || "snippet").replace(/\s+/g, "_") + ext;
    a.click();
  };

  if (loading) return (
    <div className="cs-viewer cs-viewer--loading">
      <div className="cs-spinner" />
      <p>Loading snippet…</p>
    </div>
  );
  if (error) return (
    <div className="cs-viewer cs-viewer--error">
      <span className="cs-viewer__error-icon">⚠️</span>
      <p>{error}</p>
      <a href="/codeshare" className="cs-btn cs-btn--secondary">Back to CodeShare</a>
    </div>
  );

  const langColor = LANG_COLORS[snippet.language] || "#9ca3af";
  const langLabel = LANGUAGES.find(l => l.id === snippet.language)?.label || snippet.language;

  return (
    <div className="cs-viewer">
      <div className="cs-viewer__header">
        <div className="cs-viewer__meta">
          <h1 className="cs-viewer__title">{snippet.title}</h1>
          <div className="cs-viewer__info">
            <span className="cs-viewer__lang" style={{ color: langColor, borderColor: langColor + "44" }}>
              <span className="cs-langpicker__dot" style={{ background: langColor }} />
              {langLabel}
            </span>
            <span className="cs-viewer__author">by {snippet.author}</span>
            <span className="cs-viewer__time">{timeAgo(snippet.created_at)}</span>
            <span className="cs-viewer__views">👁 {snippet.views} views</span>
          </div>
        </div>
        <div className="cs-viewer__actions">
          <button className="cs-btn cs-btn--ghost" onClick={copyLink}>
            {copied ? "✓ Copied!" : "🔗 Copy link"}
          </button>
          <button className="cs-btn cs-btn--ghost" onClick={copyRaw}>
            {rawCopied ? "✓ Copied!" : "📋 Copy code"}
          </button>
          <button className="cs-btn cs-btn--ghost" onClick={download}>⬇ Download</button>
          <a href="/codeshare" className="cs-btn cs-btn--secondary">+ New Snippet</a>
        </div>
      </div>
      <CodeBlock
        key={`viewer-${snippet.language}`}
        code={snippet.code}
        language={snippet.language}
      />
    </div>
  );
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, snippet, onConfirm, onCancel, loading }) {
  // Close on Escape key
  useEffect(() => {
    const handler = e => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div className="cs-modal-overlay" onClick={onCancel}>
      <div className="cs-modal" onClick={e => e.stopPropagation()}>
        {/* Icon */}
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

        {/* Snippet preview */}
        {snippet && (
          <div className="cs-modal__snippet-preview">
            <span
              className="cs-modal__snippet-lang"
              style={{ color: LANG_COLORS[snippet.language] || "#9ca3af" }}
            >
              <span
                className="cs-langpicker__dot"
                style={{ background: LANG_COLORS[snippet.language] || "#9ca3af" }}
              />
              {LANGUAGES.find(l => l.id === snippet.language)?.label || snippet.language}
            </span>
            <span className="cs-modal__snippet-title">{snippet.title}</span>
          </div>
        )}

        <div className="cs-modal__actions">
          <button className="cs-btn cs-btn--ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className={`cs-btn cs-btn--danger ${loading ? "cs-btn--loading" : ""}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <><span className="cs-btn-spinner cs-btn-spinner--red" /> Deleting…</>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                </svg>
                Delete Snippet
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MySnippets ────────────────────────────────────────────────────────────────
function MySnippets({ refreshKey }) {
  const [snippets,    setSnippets]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [deletingId,  setDeletingId]  = useState(null);
  // confirmTarget: the snippet object pending confirmation, or null
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

  // Step 1: clicking 🗑 opens the confirm modal
  const requestDelete = (snippet, e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmTarget(snippet);
  };

  // Step 2: user confirmed — actually delete
  const handleDelete = async () => {
    if (!confirmTarget) return;
    const id = confirmTarget.id;
    setDeletingId(id);
    try {
      await apiDelete(id);
      removeUserSnippetId(id);
      setSnippets(prev => prev.filter(s => s.id !== id));
      setConfirmTarget(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const cancelDelete = () => setConfirmTarget(null);

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
      <p className="cs-recent__empty-sub">Snippets you share will appear here, only visible to you.</p>
    </div>
  );

  return (
    <>
      {/* Confirm delete modal */}
      {confirmTarget && (
        <ConfirmModal
          title="Delete Snippet?"
          message="This action cannot be undone. The snippet will be permanently removed."
          snippet={confirmTarget}
          onConfirm={handleDelete}
          onCancel={cancelDelete}
          loading={deletingId === confirmTarget.id}
        />
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
            const langColor = LANG_COLORS[s.language] || "#9ca3af";
            const langLabel = LANGUAGES.find(l => l.id === s.language)?.label || s.language;
            const preview   = s.code.split("\n").slice(0, 4).join("\n");
            return (
              <a key={s.id} href={`/codeshare/${s.id}`} className="cs-card">
                <div className="cs-card__header">
                  <span className="cs-card__lang-dot" style={{ background: langColor }} />
                  <span className="cs-card__title">{s.title}</span>
                  <span className="cs-card__lang" style={{ color: langColor }}>{langLabel}</span>
                </div>
                <div className="cs-card__preview">
                  <code>{preview}</code>
                </div>
                <div className="cs-card__footer">
                  <span className="cs-card__time">🕐 {timeAgo(s.created_at)}</span>
                  <span className="cs-card__views">👁 {s.views}</span>
                  <button
                    className="cs-card__delete"
                    onClick={e => requestDelete(s, e)}
                    disabled={deletingId === s.id}
                    title="Delete snippet"
                  >
                    {deletingId === s.id
                      ? <span className="cs-btn-spinner cs-btn-spinner--sm-icon" />
                      : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                        </svg>
                      )
                    }
                  </button>
                </div>
              </a>
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
            <p className="cs-page-header__sub">
              Paste · Share · Done. Ephemeral code snippets with instant links.
            </p>
            <div className="cs-page-header__badge">Private to you</div>
          </div>
        </div>

        <div className="cs-main">
          {snippetId
            ? <SnippetViewer snippetId={snippetId} />
            : (
              <>
                <SnippetEditor onSnippetCreated={() => setRefreshKey(k => k + 1)} />
                <MySnippets refreshKey={refreshKey} />
              </>
            )
          }
        </div>
      </div>
    </>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  /* ── Reset & scroll fix ─────────────────────────────────────────────── */
  html, body {
    height: auto !important;
    overflow-y: auto !important;
    overflow-x: hidden;
    scroll-behavior: smooth;
  }

  .cs-root {
    min-height: 100vh;
    position: relative;
    background: #07070f;
    color: #e2e8f0;
    font-family: 'Geist Mono', 'Fira Code', 'Cascadia Code', monospace;
    overflow-x: hidden;
  }

  /* ── Ambient background ──────────────────────────────────────────────── */
  .cs-bg {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }
  .cs-bg__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.08;
    animation: cs-blob-drift 20s ease-in-out infinite alternate;
  }
  .cs-bg__blob--1 {
    width: 600px; height: 600px;
    background: radial-gradient(circle, #a78bfa, transparent 70%);
    top: -200px; left: -150px;
    animation-duration: 22s;
  }
  .cs-bg__blob--2 {
    width: 500px; height: 500px;
    background: radial-gradient(circle, #5b8af0, transparent 70%);
    top: 40%; right: -150px;
    animation-duration: 18s;
    animation-delay: -8s;
  }
  .cs-bg__blob--3 {
    width: 400px; height: 400px;
    background: radial-gradient(circle, #10b981, transparent 70%);
    bottom: 10%; left: 30%;
    animation-duration: 25s;
    animation-delay: -14s;
  }
  @keyframes cs-blob-drift {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(40px, 30px) scale(1.08); }
  }

  /* ── Page header ─────────────────────────────────────────────────────── */
  .cs-page-header {
    position: sticky;
    top: 0;
    z-index: 50;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    padding: 0.6rem 1.5rem;
    background: rgba(7,7,15,0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }
  .cs-page-header__inner {
    max-width: 1000px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .cs-page-header__logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.05rem;
    font-weight: 700;
    color: #fff;
    text-decoration: none;
    letter-spacing: 0.04em;
  }
  .cs-page-header__logo:hover { color: #a78bfa; }
  .cs-page-header__icon { font-size: 1.2rem; }
  .cs-page-header__divider {
    width: 1px; height: 16px;
    background: rgba(255,255,255,0.12);
  }
  .cs-page-header__sub {
    color: rgba(255,255,255,0.35);
    font-size: 0.75rem;
    margin: 0;
    flex: 1;
  }
  .cs-page-header__badge {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 99px;
    background: rgba(167,139,250,0.12);
    border: 1px solid rgba(167,139,250,0.25);
    color: #a78bfa;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* ── Main container ──────────────────────────────────────────────────── */
  .cs-main {
    position: relative;
    z-index: 1;
    max-width: 1000px;
    margin: 0 auto;
    padding: 2rem 1.5rem 5rem;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  /* ── Editor ──────────────────────────────────────────────────────────── */
  .cs-editor {
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 16px;
    overflow: hidden;
    background: rgba(13,13,22,0.9);
    box-shadow:
      0 0 0 1px rgba(167,139,250,0.04),
      0 8px 48px rgba(0,0,0,0.6),
      inset 0 1px 0 rgba(255,255,255,0.04);
    backdrop-filter: blur(12px);
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .cs-editor:focus-within {
    border-color: rgba(167,139,250,0.2);
    box-shadow:
      0 0 0 1px rgba(167,139,250,0.08),
      0 8px 48px rgba(0,0,0,0.7),
      0 0 40px rgba(167,139,250,0.06),
      inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .cs-editor__toolbar {
    padding: 12px 14px;
    background: rgba(18,18,28,0.95);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cs-editor__toolbar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .cs-editor__toolbar-row--controls { gap: 8px; }

  .cs-editor__title-input,
  .cs-editor__author-input {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 8px;
    padding: 7px 11px;
    color: #e2e8f0;
    font-size: 0.82rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s, background 0.15s;
  }
  .cs-editor__title-input { flex: 2; min-width: 150px; }
  .cs-editor__author-input { flex: 1; min-width: 120px; max-width: 200px; }
  .cs-editor__title-input:focus,
  .cs-editor__author-input:focus {
    border-color: rgba(167,139,250,0.4);
    background: rgba(167,139,250,0.04);
  }
  .cs-editor__title-input::placeholder,
  .cs-editor__author-input::placeholder { color: rgba(255,255,255,0.2); }

  .cs-editor__preview-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 8px;
    padding: 7px 13px;
    color: rgba(255,255,255,0.5);
    font-size: 0.78rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .cs-editor__preview-btn:hover,
  .cs-editor__preview-btn.active {
    background: rgba(167,139,250,0.1);
    border-color: rgba(167,139,250,0.35);
    color: #a78bfa;
  }

  .cs-editor__label {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 14px 6px;
    background: rgba(10,10,18,0.6);
    border-bottom: 1px solid rgba(255,255,255,0.04);
    font-size: 0.73rem;
    color: rgba(255,255,255,0.35);
    letter-spacing: 0.03em;
  }
  .cs-editor__label-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cs-editor__label-badge {
    margin-left: 4px;
    font-size: 0.64rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(167,139,250,0.15);
    color: #a78bfa;
    letter-spacing: 0.06em;
  }

  .cs-editor__textarea {
    width: 100%;
    min-height: 260px;
    max-height: 55vh;
    resize: none;
    overflow: auto;
    background: #08080f;
    border: none;
    outline: none;
    padding: 1.25rem 1.5rem;
    color: #c9d1d9;
    font-family: 'Geist Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 0.85rem;
    line-height: 1.75;
    tab-size: 2;
    box-sizing: border-box;
    caret-color: #a78bfa;
    scrollbar-width: thin;
    scrollbar-color: rgba(167,139,250,0.3) rgba(255,255,255,0.03);
  }
  .cs-editor__textarea::placeholder { color: rgba(255,255,255,0.15); }
  .cs-editor__textarea::-webkit-scrollbar { width: 6px; height: 6px; }
  .cs-editor__textarea::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
  .cs-editor__textarea::-webkit-scrollbar-thumb {
    background: rgba(167,139,250,0.3); border-radius: 3px;
  }

  .cs-editor__footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: rgba(18,18,28,0.95);
    border-top: 1px solid rgba(255,255,255,0.06);
    flex-wrap: wrap;
  }
  .cs-editor__stats {
    display: flex; align-items: center; gap: 6px;
    margin-right: auto;
    color: rgba(255,255,255,0.25); font-size: 0.74rem;
  }
  .cs-stat { color: rgba(255,255,255,0.45); }
  .cs-stat-label { color: rgba(255,255,255,0.2); font-size: 0.7rem; }
  .cs-stat-sep { color: rgba(255,255,255,0.15); }
  .cs-editor__error { color: #f87171; font-size: 0.78rem; }

  .cs-share-banner {
    background: linear-gradient(135deg,
      rgba(16,185,129,0.08) 0%,
      rgba(91,138,240,0.06) 100%);
    border-top: 1px solid rgba(16,185,129,0.2);
    padding: 12px 14px;
  }
  .cs-share-banner__inner {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .cs-share-banner__icon-wrap {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: rgba(16,185,129,0.12);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .cs-share-banner__icon-wrap svg { width: 16px; height: 16px; color: #10b981; }
  .cs-share-banner__content { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .cs-share-banner__label {
    color: #10b981; font-size: 0.72rem; font-weight: 700;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  .cs-share-banner__url {
    color: #a78bfa; font-size: 0.8rem;
    text-decoration: none; word-break: break-all;
  }
  .cs-share-banner__url:hover { text-decoration: underline; }
  .cs-share-banner__copy {
    background: rgba(167,139,250,0.12);
    border: 1px solid rgba(167,139,250,0.3);
    border-radius: 7px; padding: 6px 14px;
    color: #a78bfa; font-size: 0.78rem; font-family: inherit;
    cursor: pointer; white-space: nowrap; transition: all 0.15s;
  }
  .cs-share-banner__copy:hover { background: rgba(167,139,250,0.22); }

  /* ── CodeBlock ───────────────────────────────────────────────────────── */
  .cs-codeblock {
    display: flex;
    background: #08080f;
    overflow: auto;
    max-height: 70vh;
    scrollbar-width: thin;
    scrollbar-color: rgba(167,139,250,0.3) rgba(255,255,255,0.02);
    transition: opacity 0.15s ease;
    opacity: 0.85;
    text-align: left;          /* ← force left-align on the container */
  }
  .cs-codeblock--ready { opacity: 1; }
  .cs-codeblock::-webkit-scrollbar { width: 6px; height: 6px; }
  .cs-codeblock::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
  .cs-codeblock::-webkit-scrollbar-thumb {
    background: rgba(167,139,250,0.3); border-radius: 3px;
  }

  /* Gutter — line numbers */
  .cs-codeblock__gutter {
    display: flex;
    flex-direction: column;
    padding: 1.25rem 0;
    min-width: 52px;
    background: rgba(10,10,18,0.5);
    border-right: 1px solid rgba(255,255,255,0.04);
    user-select: none;
    flex-shrink: 0;
    text-align: right;         /* numbers right-aligned within gutter only */
  }
  .cs-line-num {
    display: block;
    padding: 0 12px;
    font-size: 0.73rem;
    line-height: 1.75;
    height: calc(0.85rem * 1.75);
    color: rgba(255,255,255,0.14);
    text-align: right;
    font-family: inherit;
    box-sizing: content-box;
  }

  /* Code area */
  .cs-codeblock__pre {
    margin: 0;
    padding: 1.25rem 0;
    flex: 1;
    overflow: visible;
    white-space: normal;
    text-align: left;          /* ← pre must also be left-aligned */
    min-width: 0;              /* prevents flex overflow issues */
  }
  .cs-codeblock__code {
    display: block;
    font-family: 'Geist Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 0.85rem;
    color: #c9d1d9;
    white-space: normal;
    text-align: left;          /* ← explicit left-align on code */
  }

  /* ── Each line is its own left-aligned block ─────────────────────────── */
  .cs-code-line {
    display: block;
    white-space: pre;          /* preserve indentation/spaces within a line */
    line-height: 1.75;
    min-height: calc(0.85rem * 1.75);
    padding: 0 1.5rem;
    font-size: 0.85rem;
    text-align: left;          /* ← every line explicitly left-aligned */
    transition: background 0.08s;
  }
  .cs-code-line:hover {
    background: rgba(255,255,255,0.025);
  }

  /* highlight.js tokens */
  .cs-codeblock__code .hljs-keyword    { color: #c678dd; }
  .cs-codeblock__code .hljs-string     { color: #98c379; }
  .cs-codeblock__code .hljs-number     { color: #d19a66; }
  .cs-codeblock__code .hljs-comment    { color: #5c6370; font-style: italic; }
  .cs-codeblock__code .hljs-function   { color: #61afef; }
  .cs-codeblock__code .hljs-title      { color: #61afef; }
  .cs-codeblock__code .hljs-built_in   { color: #e5c07b; }
  .cs-codeblock__code .hljs-class      { color: #e5c07b; }
  .cs-codeblock__code .hljs-type       { color: #e5c07b; }
  .cs-codeblock__code .hljs-variable   { color: #e06c75; }
  .cs-codeblock__code .hljs-attr       { color: #d19a66; }
  .cs-codeblock__code .hljs-tag        { color: #e06c75; }
  .cs-codeblock__code .hljs-name       { color: #e06c75; }
  .cs-codeblock__code .hljs-attribute  { color: #d19a66; }
  .cs-codeblock__code .hljs-operator   { color: #56b6c2; }
  .cs-codeblock__code .hljs-punctuation{ color: #abb2bf; }
  .cs-codeblock__code .hljs-literal    { color: #56b6c2; }
  .cs-codeblock__code .hljs-meta       { color: #e5c07b; }
  .cs-codeblock__code .hljs-addition   { background: #1e3a1e; color: #98c379; }
  .cs-codeblock__code .hljs-deletion   { background: #3a1e1e; color: #e06c75; }

  /* ── Viewer ──────────────────────────────────────────────────────────── */
  .cs-viewer {
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 16px;
    overflow: hidden;
    background: rgba(13,13,22,0.9);
    box-shadow: 0 8px 48px rgba(0,0,0,0.6);
    backdrop-filter: blur(12px);
  }
  .cs-viewer--loading,
  .cs-viewer--error {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    min-height: 240px; gap: 12px;
    color: rgba(255,255,255,0.4); font-size: 0.9rem;
  }
  .cs-viewer--error { color: #f87171; }
  .cs-viewer__error-icon { font-size: 2rem; }
  .cs-viewer__header {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: 12px;
    padding: 18px 20px;
    background: rgba(18,18,28,0.95);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-wrap: wrap;
  }
  .cs-viewer__title {
    font-size: 1.1rem; font-weight: 700;
    color: #fff; margin: 0 0 8px;
    letter-spacing: 0.02em;
  }
  .cs-viewer__info {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .cs-viewer__lang {
    display: flex; align-items: center; gap: 5px;
    font-size: 0.75rem; padding: 3px 9px;
    border-radius: 99px; border: 1px solid; font-weight: 600;
  }
  .cs-viewer__author,
  .cs-viewer__time,
  .cs-viewer__views { color: rgba(255,255,255,0.3); font-size: 0.75rem; }
  .cs-viewer__actions {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }

  /* ── Buttons ─────────────────────────────────────────────────────────── */
  .cs-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 15px; border-radius: 9px;
    font-size: 0.8rem; font-family: inherit;
    font-weight: 600; cursor: pointer;
    text-decoration: none; border: 1px solid transparent;
    transition: all 0.15s; white-space: nowrap;
  }
  .cs-btn--primary {
    background: linear-gradient(135deg, #a78bfa 0%, #5b8af0 100%);
    color: #fff;
    box-shadow: 0 2px 16px rgba(167,139,250,0.25);
  }
  .cs-btn--primary:hover { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(167,139,250,0.35); }
  .cs-btn--primary:active { transform: translateY(0); }
  .cs-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
  .cs-btn--loading { opacity: 0.65; pointer-events: none; }
  .cs-btn--secondary {
    background: rgba(167,139,250,0.1);
    color: #a78bfa;
    border-color: rgba(167,139,250,0.25);
  }
  .cs-btn--secondary:hover { background: rgba(167,139,250,0.18); }
  .cs-btn--ghost {
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.6);
    border-color: rgba(255,255,255,0.09);
  }
  .cs-btn--ghost:hover { background: rgba(255,255,255,0.08); color: #fff; }
  .cs-btn-arrow { transition: transform 0.15s; }
  .cs-btn:hover .cs-btn-arrow { transform: translateX(3px); }
  .cs-btn-spinner {
    width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: cs-spin 0.6s linear infinite;
    display: inline-block;
  }

  /* ── LangPicker ──────────────────────────────────────────────────────── */
  .cs-langpicker { position: relative; }
  .cs-langpicker__btn {
    display: flex; align-items: center; gap: 7px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 8px; padding: 7px 11px;
    color: rgba(255,255,255,0.75);
    font-size: 0.82rem; font-family: inherit;
    cursor: pointer; transition: all 0.15s; white-space: nowrap;
  }
  .cs-langpicker__btn:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.15); }
  .cs-langpicker__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .cs-langpicker__chevron { width: 13px; height: 13px; color: rgba(255,255,255,0.3); }
  .cs-langpicker__dropdown {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 200;
    background: #13131e;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px; padding: 4px;
    min-width: 165px; max-height: 280px; overflow-y: auto;
    box-shadow: 0 12px 40px rgba(0,0,0,0.7);
    scrollbar-width: thin;
    scrollbar-color: rgba(167,139,250,0.25) transparent;
  }
  .cs-langpicker__dropdown::-webkit-scrollbar { width: 4px; }
  .cs-langpicker__dropdown::-webkit-scrollbar-thumb { background: rgba(167,139,250,0.25); border-radius: 2px; }
  .cs-langpicker__opt {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 6px 10px;
    background: none; border: none; border-radius: 8px;
    color: rgba(255,255,255,0.65);
    font-size: 0.8rem; font-family: inherit;
    cursor: pointer; transition: all 0.1s; text-align: left;
  }
  .cs-langpicker__opt:hover { background: rgba(255,255,255,0.06); color: #fff; }
  .cs-langpicker__opt--active { background: rgba(167,139,250,0.1); color: #a78bfa; }
  .cs-check { width: 13px; height: 13px; margin-left: auto; }

  /* ── My Snippets ─────────────────────────────────────────────────────── */
  .cs-recent--loading {
    display: flex; align-items: center; justify-content: center;
    gap: 10px; padding: 2rem;
    color: rgba(255,255,255,0.3); font-size: 0.8rem;
  }
  .cs-recent__loading-text { color: rgba(255,255,255,0.25); font-size: 0.8rem; }
  .cs-recent__empty-state {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 3rem 2rem; gap: 10px;
    border: 1px dashed rgba(255,255,255,0.08);
    border-radius: 16px;
    background: rgba(255,255,255,0.015);
  }
  .cs-empty-icon svg { width: 48px; height: 48px; color: rgba(255,255,255,0.15); }
  .cs-recent__empty-title {
    color: rgba(255,255,255,0.35); font-size: 0.9rem;
    font-weight: 600; margin: 4px 0 0;
  }
  .cs-recent__empty-sub {
    color: rgba(255,255,255,0.2); font-size: 0.78rem;
    text-align: center; margin: 0; max-width: 280px;
  }
  .cs-recent__header {
    display: flex; align-items: center; gap: 10px; margin-bottom: 1rem;
  }
  .cs-recent__heading {
    display: flex; align-items: center; gap: 8px;
    font-size: 0.8rem; font-weight: 600;
    color: rgba(255,255,255,0.35);
    text-transform: uppercase; letter-spacing: 0.08em; margin: 0;
  }
  .cs-recent__heading-icon { width: 14px; height: 14px; color: rgba(167,139,250,0.5); flex-shrink: 0; }
  .cs-recent__count {
    font-size: 0.7rem; font-weight: 700;
    padding: 2px 8px; border-radius: 99px;
    background: rgba(167,139,250,0.1);
    color: rgba(167,139,250,0.7);
    border: 1px solid rgba(167,139,250,0.15);
    min-width: 22px; text-align: center;
  }
  .cs-recent__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 12px;
  }

  /* ── Card ────────────────────────────────────────────────────────────── */
  .cs-card {
    display: flex; flex-direction: column; gap: 10px;
    padding: 15px;
    background: rgba(13,13,22,0.85);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px;
    text-decoration: none;
    transition: all 0.18s;
    cursor: pointer; overflow: hidden;
    position: relative;
    backdrop-filter: blur(8px);
  }
  .cs-card::before {
    content: '';
    position: absolute; inset: 0; border-radius: inherit;
    background: linear-gradient(135deg, rgba(167,139,250,0.04) 0%, transparent 60%);
    opacity: 0; transition: opacity 0.18s;
  }
  .cs-card:hover {
    border-color: rgba(167,139,250,0.22);
    transform: translateY(-3px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(167,139,250,0.06);
  }
  .cs-card:hover::before { opacity: 1; }
  .cs-card__header { display: flex; align-items: center; gap: 8px; }
  .cs-card__lang-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .cs-card__title {
    font-size: 0.84rem; font-weight: 700; color: #e2e8f0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
  }
  .cs-card__lang {
    font-size: 0.68rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em; flex-shrink: 0;
  }
  .cs-card__preview {
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.04);
    border-radius: 8px; padding: 9px 11px;
    overflow: hidden; max-height: 76px;
  }
  .cs-card__preview code {
    font-family: inherit; font-size: 0.7rem;
    line-height: 1.65; color: rgba(255,255,255,0.35);
    white-space: pre; display: block;
  }
  .cs-card__footer { display: flex; align-items: center; gap: 8px; font-size: 0.7rem; }
  .cs-card__time  { color: rgba(255,255,255,0.2); }
  .cs-card__views { color: rgba(255,255,255,0.2); margin-left: auto; }
  .cs-card__delete {
    background: none; border: none;
    color: rgba(255,255,255,0.15); font-size: 0.8rem;
    cursor: pointer; padding: 2px 6px; border-radius: 5px;
    transition: all 0.15s; line-height: 1; font-family: inherit;
  }
  .cs-card__delete:hover { color: #f87171; background: rgba(248,113,113,0.1); }
  .cs-card__delete:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Danger button ───────────────────────────────────────────────────── */
  .cs-btn--danger {
    background: rgba(239,68,68,0.12);
    color: #f87171;
    border-color: rgba(239,68,68,0.35);
  }
  .cs-btn--danger:hover:not(:disabled) {
    background: rgba(239,68,68,0.22);
    border-color: rgba(239,68,68,0.6);
    color: #fca5a5;
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(239,68,68,0.2);
  }
  .cs-btn--danger:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  /* Red spinner variant */
  .cs-btn-spinner--red {
    border-color: rgba(248,113,113,0.3);
    border-top-color: #f87171;
  }
  .cs-btn-spinner--sm-icon {
    width: 11px; height: 11px;
    border-width: 2px;
    border-color: rgba(255,255,255,0.2);
    border-top-color: rgba(255,255,255,0.6);
    display: inline-block;
    border-radius: 50%;
    animation: cs-spin 0.6s linear infinite;
  }

  /* ── Confirm Modal ────────────────────────────────────────────────────── */
  .cs-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0,0,0,0.72);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    animation: cs-overlay-in 0.15s ease;
  }
  @keyframes cs-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .cs-modal {
    background: #0f0f1a;
    border: 1px solid rgba(239,68,68,0.2);
    border-radius: 18px;
    padding: 2rem;
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    box-shadow:
      0 0 0 1px rgba(239,68,68,0.06),
      0 24px 64px rgba(0,0,0,0.8),
      0 0 60px rgba(239,68,68,0.04);
    animation: cs-modal-in 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    text-align: center;
  }
  @keyframes cs-modal-in {
    from { opacity: 0; transform: scale(0.92) translateY(8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  .cs-modal__icon {
    width: 52px; height: 52px;
    border-radius: 14px;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.2);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .cs-modal__icon svg {
    width: 24px; height: 24px;
    color: #f87171;
  }

  .cs-modal__title {
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
    margin: 0;
    letter-spacing: 0.01em;
  }

  .cs-modal__message {
    font-size: 0.82rem;
    color: rgba(255,255,255,0.4);
    margin: 0;
    line-height: 1.6;
  }

  .cs-modal__snippet-preview {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 10px;
    width: 100%;
    box-sizing: border-box;
  }
  .cs-modal__snippet-lang {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    flex-shrink: 0;
  }
  .cs-modal__snippet-title {
    font-size: 0.82rem;
    color: rgba(255,255,255,0.65);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    text-align: left;
  }

  .cs-modal__actions {
    display: flex;
    gap: 10px;
    width: 100%;
    margin-top: 0.5rem;
  }
  .cs-modal__actions .cs-btn {
    flex: 1;
    justify-content: center;
  }

  /* ── Spinner ─────────────────────────────────────────────────────────── */
  .cs-spinner {
    width: 26px; height: 26px;
    border: 2px solid rgba(167,139,250,0.15);
    border-top-color: #a78bfa;
    border-radius: 50%;
    animation: cs-spin 0.65s linear infinite;
  }
  .cs-spinner--sm { width: 16px; height: 16px; }
  @keyframes cs-spin { to { transform: rotate(360deg); } }

  /* ── Responsive ──────────────────────────────────────────────────────── */
  @media (max-width: 640px) {
    .cs-main { padding: 1.25rem 1rem 4rem; }
    .cs-editor__toolbar-row { flex-wrap: wrap; }
    .cs-editor__title-input,
    .cs-editor__author-input { max-width: 100%; }
    .cs-viewer__header { flex-direction: column; }
    .cs-viewer__actions { width: 100%; }
    .cs-recent__grid { grid-template-columns: 1fr; }
    .cs-page-header__sub { display: none; }
  }
`;