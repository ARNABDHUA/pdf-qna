/* NavBar.jsx  –  Global navigation for QNA-AI */

import React, { useState } from "react";

const ROUTES = [
  { path: "/",          label: "Chat",        icon: "💬", desc: "AI-powered Q&A"     },
  { path: "/review",    label: "Code Review", icon: "🔍", desc: "AI code analysis"   },
  { path: "/converter", label: "Converter",   icon: "🔄", desc: "PDF / Word / OCR"   },
  { path: "/youtube",   label: "YouTube",     icon: "▶️", desc: "Transcript → PDF"   },
  { path: "/expenses",  label: "Expenses",    icon: "💸", desc: "AI expense tracker" },
  { path: "/codeshare", label: "CodeShare",   icon: "📎", desc: "Share code snippets"},
  { path: "/meet",      label: "Meet",        icon: "📹", desc: "Video call & screen share" },
];

export default function NavBar({ currentPath = "/" }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path) =>
    path === "/"
      ? currentPath === "/"
      : currentPath.startsWith(path);

  return (
    <>
      <style>{`
        .qna-navbar {
          position: sticky;
          top: 0;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.25rem;
          height: 52px;
          background: rgba(15, 15, 20, 0.92);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          font-family: 'Geist Mono', 'Fira Code', monospace;
        }
        .qna-navbar__logo {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: #fff;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .qna-navbar__logo-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a78bfa, #5b8af0);
          box-shadow: 0 0 8px #a78bfa88;
        }
        .qna-navbar__links {
          display: flex;
          align-items: center;
          gap: 2px;
          list-style: none;
          margin: 0; padding: 0;
        }
        .qna-navbar__links a {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 11px;
          border-radius: 7px;
          font-size: 0.78rem;
          font-weight: 500;
          text-decoration: none;
          color: rgba(255,255,255,0.55);
          transition: color 0.15s, background 0.15s;
          white-space: nowrap;
        }
        .qna-navbar__links a:hover {
          color: rgba(255,255,255,0.9);
          background: rgba(255,255,255,0.07);
        }
        .qna-navbar__links a.active {
          color: #a78bfa;
          background: rgba(167,139,250,0.12);
        }
        .qna-navbar__links a .nav-icon {
          font-size: 0.9em;
          line-height: 1;
        }
        /* hamburger */
        .qna-navbar__burger {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          color: rgba(255,255,255,0.7);
        }
        .qna-navbar__burger svg { display: block; }
        /* mobile drawer */
        .qna-navbar__drawer {
          position: fixed;
          inset: 52px 0 0 0;
          z-index: 199;
          background: rgba(12,12,18,0.98);
          backdrop-filter: blur(20px);
          display: flex;
          flex-direction: column;
          padding: 1.25rem;
          gap: 4px;
          transform: translateX(100%);
          transition: transform 0.22s cubic-bezier(0.4,0,0.2,1);
          border-top: 1px solid rgba(255,255,255,0.07);
        }
        .qna-navbar__drawer.open { transform: translateX(0); }
        .qna-navbar__drawer a {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 14px;
          border-radius: 10px;
          text-decoration: none;
          color: rgba(255,255,255,0.65);
          font-size: 0.9rem;
          font-weight: 500;
          transition: color 0.15s, background 0.15s;
        }
        .qna-navbar__drawer a:hover {
          color: #fff;
          background: rgba(255,255,255,0.07);
        }
        .qna-navbar__drawer a.active {
          color: #a78bfa;
          background: rgba(167,139,250,0.12);
        }
        .drawer-link-icon { font-size: 1.2rem; }
        .drawer-link-text { display: flex; flex-direction: column; }
        .drawer-link-label { font-weight: 600; line-height: 1.2; }
        .drawer-link-desc  { font-size: 0.72rem; opacity: 0.55; margin-top: 1px; }
        @media (max-width: 768px) {
          .qna-navbar__links { display: none; }
          .qna-navbar__burger { display: flex; }
        }
      `}</style>

      <nav className="qna-navbar">
        {/* Logo */}
        <a href="/" className="qna-navbar__logo">
          <span className="qna-navbar__logo-dot" />
          QNA-AI
        </a>

        {/* Desktop links */}
        <ul className="qna-navbar__links">
          {ROUTES.map(r => (
            <li key={r.path}>
              <a
                href={r.path}
                className={isActive(r.path) ? "active" : ""}
                title={r.desc}
              >
                <span className="nav-icon">{r.icon}</span>
                {r.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Hamburger */}
        <button
          className="qna-navbar__burger"
          onClick={() => setMobileOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          )}
        </button>
      </nav>

      {/* Mobile drawer */}
      <div className={`qna-navbar__drawer${mobileOpen ? " open" : ""}`}>
        {ROUTES.map(r => (
          <a
            key={r.path}
            href={r.path}
            className={isActive(r.path) ? "active" : ""}
            onClick={() => setMobileOpen(false)}
          >
            <span className="drawer-link-icon">{r.icon}</span>
            <span className="drawer-link-text">
              <span className="drawer-link-label">{r.label}</span>
              <span className="drawer-link-desc">{r.desc}</span>
            </span>
          </a>
        ))}
      </div>
    </>
  );
}