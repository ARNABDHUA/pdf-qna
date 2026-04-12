import React, { useState } from "react";

// ── Inline renderer: bold, italic, inline-code, links ────────────────────────
function InlineMarkdown({ text }) {
  if (!text) return null;

  // Split on **bold**, *italic*, `code`, [link](url)
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[(.+?)\]\((.+?)\))/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={last}>{text.slice(last, match.index)}</span>);

    if (match[0].startsWith("**")) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[0].startsWith("*")) {
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[0].startsWith("`")) {
      parts.push(<code key={match.index} className="md-inline-code">{match[4]}</code>);
    } else if (match[0].startsWith("[")) {
      parts.push(<a key={match.index} href={match[6]} target="_blank" rel="noopener noreferrer" className="md-link">{match[5]}</a>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(<span key={last}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

// ── Code block with copy button ───────────────────────────────────────────────
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="md-code-block">
      <div className="md-code-block__header">
        <span className="md-code-block__lang">{lang || "code"}</span>
        <button className="md-code-block__copy" onClick={copy}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="md-code-block__pre"><code>{code}</code></pre>
    </div>
  );
}

// ── Table renderer ────────────────────────────────────────────────────────────
function MarkdownTable({ rows }) {
  if (rows.length < 2) return null;
  const headers = rows[0];
  // row[1] is the separator (---|---), skip it
  const body = rows.slice(2);
  return (
    <div className="md-table-wrap">
      <table className="md-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}><InlineMarkdown text={h.trim()} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}><InlineMarkdown text={cell.trim()} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main parser ───────────────────────────────────────────────────────────────
export default function MarkdownRenderer({ content }) {
  if (!content || content === "...") return null;

  const lines = content.split("\n");
  const elements = [];
  let i = 0;
  let listBuffer = [];   // { ordered, items }
  let tableBuffer = [];  // rows of cells

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const { ordered, items } = listBuffer[0];
    const Tag = ordered ? "ol" : "ul";
    elements.push(
      <Tag key={`list-${elements.length}`} className={ordered ? "md-ol" : "md-ul"}>
        {items.map((item, idx) => (
          <li key={idx}><InlineMarkdown text={item} /></li>
        ))}
      </Tag>
    );
    listBuffer = [];
  };

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    elements.push(<MarkdownTable key={`table-${elements.length}`} rows={tableBuffer} />);
    tableBuffer = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Fenced code block ````lang
    if (trimmed.startsWith("```")) {
      flushList();
      flushTable();
      const lang = trimmed.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(<CodeBlock key={`code-${i}`} lang={lang} code={codeLines.join("\n")} />);
      i++; // skip closing ```
      continue;
    }

    // ── Table row  |col|col|col|
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      const cells = trimmed.slice(1, -1).split("|");
      tableBuffer.push(cells);
      i++;
      continue;
    } else if (tableBuffer.length > 0) {
      flushTable();
    }

    // ── Heading ### ## #
    if (/^#{1,6}\s/.test(trimmed)) {
      flushList();
      const level = trimmed.match(/^(#+)/)[1].length;
      const text  = trimmed.replace(/^#+\s+/, "");
      const Tag   = `h${Math.min(level, 6)}`;
      elements.push(
        <Tag key={`h-${i}`} className={`md-h md-h${level}`}>
          <InlineMarkdown text={text} />
        </Tag>
      );
      i++; continue;
    }

    // ── Horizontal rule ---
    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={`hr-${i}`} className="md-hr" />);
      i++; continue;
    }

    // ── Unordered list  - item  or * item  or • item
    if (/^[-*•]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*•]\s+/, "");
      if (listBuffer.length === 0 || listBuffer[0].ordered) {
        flushList();
        listBuffer.push({ ordered: false, items: [text] });
      } else {
        listBuffer[0].items.push(text);
      }
      i++; continue;
    }

    // ── Ordered list  1. item
    if (/^\d+\.\s+/.test(trimmed)) {
      const text = trimmed.replace(/^\d+\.\s+/, "");
      if (listBuffer.length === 0 || !listBuffer[0].ordered) {
        flushList();
        listBuffer.push({ ordered: true, items: [text] });
      } else {
        listBuffer[0].items.push(text);
      }
      i++; continue;
    }

    // ── Blockquote  > text
    if (trimmed.startsWith("> ")) {
      flushList();
      elements.push(
        <blockquote key={`bq-${i}`} className="md-blockquote">
          <InlineMarkdown text={trimmed.slice(2)} />
        </blockquote>
      );
      i++; continue;
    }

    // ── Empty line
    if (trimmed === "") {
      flushList();
      flushTable();
      elements.push(<div key={`sp-${i}`} className="md-spacer" />);
      i++; continue;
    }

    // ── Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="md-p">
        <InlineMarkdown text={trimmed} />
      </p>
    );
    i++;
  }

  flushList();
  flushTable();

  return <div className="md-root">{elements}</div>;
}
