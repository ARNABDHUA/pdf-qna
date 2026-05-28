// CommunityLeaderboard.jsx
// Route: add "community" tab to ExpenseTracker.jsx tabs array
// Props:  credentials, expenses, budget, catIcons, catColors, showToast

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = "https://pdf-qna-backend.onrender.com";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt         = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const monthLabel  = (mk) => {
  if (!mk) return "";
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};
const currentMonthKey = () => {
  const ist = new Date(Date.now() + 5.5 * 3600000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
};

// If the expense reason contains a group-split share amount, use that instead
// of the full e.amount (e.g. "Group split — your share: ₹1,833.33")
function getEffectiveAmount(e) {
  const match = e.reason?.match(/your share[:\s]+[₹]?\s*([0-9,]+(?:\.[0-9]+)?)/i);
  if (!match) return e.amount;
  return parseFloat(match[1].replace(/,/g, ""));
}

// Build category totals from expense array for a given month
function buildCategoryTotals(expenses, monthKey) {
  const map = {};
  for (const e of expenses) {
    if (e.type !== "expense") continue;
    const d  = new Date(e.timestamp);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (mk !== monthKey) continue;
    if (!map[e.category]) map[e.category] = 0;
    map[e.category] += getEffectiveAmount(e);
  }
  return Object.entries(map).map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }));
}

function buildTotalExpense(expenses, monthKey) {
  return expenses
    .filter((e) => {
      if (e.type !== "expense") return false;
      const d  = new Date(e.timestamp);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return mk === monthKey;
    })
    .reduce((s, e) => s + getEffectiveAmount(e), 0);
}

// Avatar color cycling
const AV_COLORS = [
  { bg: "#EEEDFE", color: "#3C3489" },
  { bg: "#E1F5EE", color: "#085041" },
  { bg: "#FAEEDA", color: "#633806" },
  { bg: "#FAECE7", color: "#712B13" },
  { bg: "#B5D4F4", color: "#0C447C" },
  { bg: "#FBEAF0", color: "#72243E" },
  { bg: "#EAF3DE", color: "#27500A" },
  { bg: "#FCEBEB", color: "#791F1F" },
];
const avColor = (str) => AV_COLORS[Math.abs([...str].reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0)) % AV_COLORS.length];
const initials = (name) => name.slice(0, 2).toUpperCase();

const RANK_COLORS = { 1: "#BA7517", 2: "#888780", 3: "#993C1D" };
const RANK_ICONS  = { 1: "🥇", 2: "🥈", 3: "🥉" };

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, size = 32 }) {
  const c = avColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: c.bg, color: c.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 600, flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank <= 3) return <span style={{ fontSize: 18 }}>{RANK_ICONS[rank]}</span>;
  return <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.45)", minWidth: 24, textAlign: "center" }}>#{rank}</span>;
}

function StatCard({ label, value, sub, color = "#fff" }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12, padding: "12px 14px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function PillToggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 20, cursor: "pointer",
        background: value ? "#22c55e" : "rgba(255,255,255,0.1)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", width: 16, height: 16, borderRadius: "50%",
        background: "#fff", top: 3,
        left: value ? 21 : 3, transition: "left 0.2s",
      }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CommunityLeaderboard({ credentials, expenses, catIcons, catColors, showToast }) {
  const isLoggedIn = !!(credentials?.username && credentials?.password);

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeTab,       setActiveTab]       = useState("leaderboard");
  const [selectedMonth,   setSelectedMonth]   = useState(currentMonthKey);
  const [selectedCat,     setSelectedCat]     = useState("overall");
  const [leaderboard,     setLeaderboard]     = useState(null);
  const [myRank,          setMyRank]          = useState(null);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [loadingLb,       setLoadingLb]       = useState(false);
  const [loadingRank,     setLoadingRank]     = useState(false);
  const [sharing,         setSharing]         = useState(false);

  // FIX 1: Cache all categories from the "overall" fetch so pills never disappear
  // when switching to a filtered category view.
  const [cachedAllCategories, setCachedAllCategories] = useState([]);

  // privacy prefs (persisted in localStorage)
  const [showRealName,    setShowRealName]    = useState(() => {
    try { return JSON.parse(localStorage.getItem("cl_show_real_name") ?? "true"); } catch { return true; }
  });
  const [shareEnabled,    setShareEnabled]    = useState(() => {
    try { return JSON.parse(localStorage.getItem("cl_share_enabled") ?? "false"); } catch { return false; }
  });
  const [excludeIncome,   setExcludeIncome]   = useState(true);

  // FIX 2: Custom display name — free-text, falls back to anon_XXXX if blank
  const [customName,      setCustomName]      = useState(() => {
    try { return localStorage.getItem("cl_custom_name") ?? ""; } catch { return ""; }
  });
  const [nameEditValue,   setNameEditValue]   = useState(customName);
  const [nameEditDirty,   setNameEditDirty]   = useState(false);

  useEffect(() => { localStorage.setItem("cl_show_real_name", JSON.stringify(showRealName)); }, [showRealName]);
  useEffect(() => { localStorage.setItem("cl_share_enabled",  JSON.stringify(shareEnabled));  }, [shareEnabled]);
  useEffect(() => { localStorage.setItem("cl_custom_name",    customName);                    }, [customName]);

  // Effective display-name logic:
  // 1. If user typed a custom name → use it
  // 2. Else if showRealName → use credentials.username
  // 3. Else → anon_XXXX
  const effectiveDisplayName = useMemo(() => {
    if (customName.trim()) return customName.trim();
    if (showRealName && credentials?.username) return credentials.username;
    if (credentials?.username) {
      // deterministic anon hash
      const h = Math.abs([...credentials.username].reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0));
      return `anon_${(h % 9000 + 1000).toString().slice(0, 4)}`;
    }
    return "anon";
  }, [customName, showRealName, credentials]);

  // ── Computed data for selected month ─────────────────────────────────────
  const categoryTotals = useMemo(() => buildCategoryTotals(expenses, selectedMonth), [expenses, selectedMonth]);
  const totalExpense   = useMemo(() => buildTotalExpense(expenses, selectedMonth),   [expenses, selectedMonth]);

  // Available months from local expenses (for picker)
  const localMonths = useMemo(() => {
    const s = new Set(expenses.map((e) => {
      const d = new Date(e.timestamp);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }));
    return [...s].sort((a, b) => b.localeCompare(a)).slice(0, 12);
  }, [expenses]);

  // FIX 1 continued: also derive categories from local expenses so pills
  // are populated even before the first successful leaderboard fetch.
  const localCategories = useMemo(() => {
    const s = new Set(expenses.filter(e => e.type === "expense" && e.category).map(e => e.category));
    return [...s].sort();
  }, [expenses]);

  // Merge cached server categories with local ones
  const allCategories = useMemo(() => {
    const merged = new Set([...cachedAllCategories, ...localCategories]);
    return [...merged].sort();
  }, [cachedAllCategories, localCategories]);

  // ── API calls ─────────────────────────────────────────────────────────────

  const fetchLeaderboard = useCallback(async () => {
    setLoadingLb(true);
    try {
      const res = await fetch(`${API_BASE}/community/leaderboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month_key: selectedMonth,
          category:  selectedCat === "overall" ? null : selectedCat,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to load leaderboard");
      setLeaderboard(d);
      if (d.available_months?.length) setAvailableMonths(d.available_months);

      // FIX 1: Only update the category cache when fetching overall,
      // so category pills remain visible when a specific cat is selected.
      if (selectedCat === "overall" && d.category_winners?.length) {
        setCachedAllCategories(d.category_winners.map((cw) => cw.category).sort());
      }
    } catch (e) {
      showToast(`⚠️ ${e.message}`, "error");
    } finally {
      setLoadingLb(false);
    }
  }, [selectedMonth, selectedCat, showToast]);

  const fetchMyRank = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoadingRank(true);
    try {
      const res = await fetch(`${API_BASE}/community/my-rank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username:  credentials.username,
          password:  credentials.password,
          month_key: selectedMonth,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to load rank");
      setMyRank(d);
    } catch (e) {
      showToast(`⚠️ ${e.message}`, "error");
    } finally {
      setLoadingRank(false);
    }
  }, [selectedMonth, credentials, isLoggedIn, showToast]);

  // Core share call — accepts the display name explicitly so it can be called
  // with a freshly-typed name before React state has flushed.
  const doShare = useCallback(async (displayName, { silent = false } = {}) => {
    if (!isLoggedIn) { showToast("⚠️ Sign in via ☁️ Save/Sync first", "error"); return; }
    if (totalExpense <= 0) { if (!silent) showToast("⚠️ No expense data for this month to share", "error"); return; }
    if (!silent) setSharing(true);
    try {
      const res = await fetch(`${API_BASE}/community/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username:        credentials.username,
          password:        credentials.password,
          month_key:       selectedMonth,
          category_totals: categoryTotals,
          total_expense:   Math.round(totalExpense * 100) / 100,
          display_name:    displayName,
          show_real_name:  showRealName,
          exclude_income:  excludeIncome,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Share failed");
      if (!silent) showToast(`✓ Shared ${monthLabel(selectedMonth)} to leaderboard!`, "success");
      else         showToast(`✓ Display name updated on leaderboard`, "success");
      setShareEnabled(true);
      fetchLeaderboard();
      fetchMyRank();
    } catch (e) {
      showToast(`⚠️ ${e.message}`, "error");
    } finally {
      if (!silent) setSharing(false);
    }
  }, [isLoggedIn, totalExpense, credentials, selectedMonth, categoryTotals, showRealName, excludeIncome, showToast, fetchLeaderboard, fetchMyRank]);

  const handleShare = useCallback(() => doShare(effectiveDisplayName),
    [doShare, effectiveDisplayName]);

  // Save custom name — if already sharing this month, push update to server immediately
  const handleSaveName = useCallback((newName) => {
    const trimmed = newName.trim();
    setCustomName(trimmed);
    setNameEditDirty(false);

    // Use myRank.shared if available; fall back to checking the leaderboard entries
    // directly (myRank may be null if user has not visited the My Rank tab yet).
    const isCurrentlySharing = myRank?.shared ?? (isLoggedIn && !!leaderboard?.entries?.find(e => e.username === credentials?.username));
    if (!isLoggedIn || !isCurrentlySharing) return; // not sharing → nothing to push

    // Compute the effective name with the *new* value before state settles
    let resolvedName;
    if (trimmed) resolvedName = trimmed;
    else if (showRealName && credentials?.username) resolvedName = credentials.username;
    else if (credentials?.username) {
      const h = Math.abs([...credentials.username].reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0));
      resolvedName = `anon_${(h % 9000 + 1000).toString().slice(0, 4)}`;
    } else resolvedName = "anon";

    doShare(resolvedName, { silent: true });
  }, [isLoggedIn, myRank, leaderboard, showRealName, credentials, doShare]);

  const handleUnshare = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch(`${API_BASE}/community/unshare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username:  credentials.username,
          password:  credentials.password,
          month_key: selectedMonth,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Unshare failed");
      showToast("✓ Removed from leaderboard", "success");
      setShareEnabled(false);
      setMyRank(null);
      fetchLeaderboard();
    } catch (e) {
      showToast(`⚠️ ${e.message}`, "error");
    }
  }, [isLoggedIn, credentials, selectedMonth, showToast, fetchLeaderboard]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);
  // Fetch myRank eagerly on mount + month change so handleSaveName always has
  // current sharing status regardless of which tab the user is on.
  useEffect(() => { if (isLoggedIn) fetchMyRank(); }, [fetchMyRank, isLoggedIn]);
  useEffect(() => {
    if (activeTab === "myrank") fetchMyRank();
  }, [activeTab, fetchMyRank]);

  // ── My entry in leaderboard ───────────────────────────────────────────────
  const myEntry = useMemo(() => {
    if (!leaderboard?.entries || !credentials?.username) return null;
    return leaderboard.entries.find((e) => e.username === credentials.username);
  }, [leaderboard, credentials]);

  // ── Percentile bar width ──────────────────────────────────────────────────
  const maxAmount = useMemo(() => {
    if (!leaderboard?.entries?.length) return 1;
    return leaderboard.entries[0]?.total_expense ?? leaderboard.entries[0]?.amount ?? 1;
  }, [leaderboard]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  const renderNotLoggedIn = () => (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "rgba(255,255,255,0.4)" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🏆</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>Sign in to join the leaderboard</div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>Use the <strong style={{ color: "#f59e0b" }}>☁️ Save</strong> or <strong style={{ color: "#22c55e" }}>🔄 Sync</strong> buttons at the top to sign in, then come back here to share your monthly expenses and see how you rank!</div>
    </div>
  );

  const renderLeaderboardEntries = () => {
    const entries = leaderboard?.entries ?? [];
    if (loadingLb) return <div className="cl-loading"><span /><span /><span /></div>;
    if (!entries.length) return <div className="cl-empty">No data shared for {monthLabel(selectedMonth)} yet. Be the first!</div>;

    const isOverall = selectedCat === "overall";
    const myUsername = credentials?.username;

    return (
      <div className="cl-lb-list">
        <div className="cl-lb-header">
          <span>rank</span>
          <span>user</span>
          <span style={{ textAlign: "right" }}>spent</span>
          <span style={{ textAlign: "right" }}>vs avg</span>
        </div>
        {entries.map((entry, idx) => {
          const isMe   = entry.username === myUsername;
          const amount = isOverall ? entry.total_expense : entry.amount;
          const avg    = leaderboard?.avg_spend ?? 0;
          const diff   = avg > 0 ? ((amount - avg) / avg * 100) : 0;
          const barW   = Math.max(3, Math.round((amount / maxAmount) * 100));

          return (
            <div key={entry.username} className={`cl-lb-row${isMe ? " cl-lb-row--me" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <RankBadge rank={entry.rank} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Avatar name={entry.display_name} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.display_name}
                    {isMe && <span className="cl-you-badge">you</span>}
                  </div>
                  <div className="cl-bar-mini">
                    <div style={{ width: barW + "%", height: "100%", borderRadius: 2, background: isMe ? "#22c55e" : RANK_COLORS[entry.rank] || "rgba(255,255,255,0.2)" }} />
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>
                {fmt(amount)}
              </div>
              <div style={{ textAlign: "right", fontSize: 11, fontWeight: 600, color: diff > 0 ? "#ef4444" : "#22c55e" }}>
                {diff > 0 ? "+" : ""}{Math.round(diff)}%
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCategoryWinners = () => {
    if (!leaderboard?.category_winners?.length) return null;
    return (
      <div>
        <p className="cl-section-label">Category winners</p>
        <div className="cl-cat-grid">
          {leaderboard.category_winners.map((cw) => {
            const icon  = catIcons?.[cw.category]  ?? "📌";
            const color = catColors?.[cw.category] ?? "#6b7280";
            const myRankInCat = myRank?.category_ranks?.find((r) => r.category === cw.category);
            return (
              <div key={cw.category} className="cl-cat-card" onClick={() => { setSelectedCat(cw.category); setActiveTab("leaderboard"); }}>
                <div className="cl-cat-card-top">
                  <div className="cl-cat-icon" style={{ background: color + "22", color }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cw.category}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{cw.participant_count} participants</div>
                  </div>
                </div>
                <div className="cl-cat-winner-row">
                  <span style={{ fontSize: 14 }}>🥇</span>
                  <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cw.winner_name}</span>
                  <span style={{ fontSize: 12, color: "#fff", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{fmt(cw.top_amount)}</span>
                </div>
                {myRankInCat && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
                    you: {fmt(myRankInCat.amount)} · rank #{myRankInCat.rank} · top {100 - Math.round(myRankInCat.percentile)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMyRank = () => {
    if (!isLoggedIn) return renderNotLoggedIn();
    if (loadingRank) return <div className="cl-loading"><span /><span /><span /></div>;
    if (!myRank) return <div className="cl-empty">Loading your rank…</div>;
    if (!myRank.shared) return (
      <div style={{ textAlign: "center", padding: "40px 24px" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>Not sharing {monthLabel(selectedMonth)} yet</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>{myRank.message}</div>
        <button className="cl-share-btn" onClick={handleShare} disabled={sharing}>
          {sharing ? "Sharing…" : `📤 Share ${monthLabel(selectedMonth)}`}
        </button>
      </div>
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="cl-rank-hero">
          <div className="cl-rank-hero-num">#{myRank.overall_rank}</div>
          <div className="cl-rank-hero-sub">out of {myRank.total_participants} participants</div>
          <div className="cl-rank-hero-exp">{fmt(myRank.total_expense)} spent · top {100 - Math.round(myRank.percentile)}%</div>
          <div className="cl-percentile-bar">
            <div style={{ width: myRank.percentile + "%", height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#22c55e,#f59e0b)" }} />
            <div className="cl-percentile-marker" style={{ left: myRank.percentile + "%" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
            <span>lowest</span><span>highest spender</span>
          </div>
        </div>

        {myRank.category_ranks?.length > 0 && (
          <div>
            <p className="cl-section-label">your category ranks</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {myRank.category_ranks.map((cr) => {
                const icon  = catIcons?.[cr.category]  ?? "📌";
                const color = catColors?.[cr.category] ?? "#6b7280";
                const pct   = Math.max(3, Math.round(cr.percentile));
                return (
                  <div key={cr.category} className="cl-cat-rank-row">
                    <div className="cl-cat-icon-sm" style={{ background: color + "22", color }}>{icon}</div>
                    <span style={{ flex: 1, fontSize: 13, color: "#fff", fontWeight: 500 }}>{cr.category}</span>
                    <div style={{ flex: 2, marginRight: 10 }}>
                      <div className="cl-bar-wrap">
                        <div style={{ width: pct + "%", height: "100%", borderRadius: 2, background: `linear-gradient(90deg,${color},${color}88)` }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "'JetBrains Mono',monospace", minWidth: 64, textAlign: "right" }}>{fmt(cr.amount)}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", minWidth: 50, textAlign: "right" }}>#{cr.rank}/{cr.total_in_category}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={handleUnshare}
          style={{ marginTop: 4, padding: "8px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.07)", color: "rgba(239,68,68,0.6)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        >
          ✕ remove my data from leaderboard
        </button>
      </div>
    );
  };

  const renderSettings = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className="cl-section-label">privacy & sharing</p>

      {/* FIX 2: Custom display name input */}
      <div className="cl-setting-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
        <div style={{ width: "100%" }}>
          <div style={{ fontSize: 13, color: "#fff", fontWeight: 500, marginBottom: 2 }}>Display name</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
            Shown publicly on the leaderboard. Leave blank to use your username or anonymous ID.
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              className="cl-name-input"
              type="text"
              placeholder={effectiveDisplayName}
              value={nameEditValue}
              maxLength={24}
              onChange={(e) => { setNameEditValue(e.target.value); setNameEditDirty(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName(nameEditValue);
              }}
            />
            {nameEditDirty && (
              <button
                className="cl-name-save-btn"
                onClick={() => handleSaveName(nameEditValue)}
              >
                Save
              </button>
            )}
            {customName && !nameEditDirty && (
              <button
                className="cl-name-clear-btn"
                onClick={() => { handleSaveName(""); setNameEditValue(""); }}
              >
                ✕ clear
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>
            Will appear as: <span style={{ color: "#f59e0b", fontWeight: 600 }}>{effectiveDisplayName}</span>
          </div>
        </div>
      </div>

      {[
        { label: "Show real username (if no custom name)", sub: "If off and no custom name set, shown as anon_XXXX", val: showRealName, set: setShowRealName },
        { label: "Exclude income data", sub: "Only category expense totals shared", val: excludeIncome, set: setExcludeIncome },
      ].map(({ label, sub, val, set }) => (
        <div key={label} className="cl-setting-row">
          <div>
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{sub}</div>
          </div>
          <PillToggle value={val} onChange={set} />
        </div>
      ))}

      <div className="cl-privacy-note">
        <strong>What is shared:</strong> category totals only (e.g. Food ₹4,800). Individual transactions, descriptions, account names, and balances are never shared.
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14, marginTop: 4 }}>
        <p className="cl-section-label">share this month</p>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Preview — {monthLabel(selectedMonth)}</div>
          {categoryTotals.length === 0
            ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No expenses found for this month.</div>
            : categoryTotals.map((ct) => (
                <div key={ct.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "rgba(255,255,255,0.65)" }}>
                  <span>{catIcons?.[ct.category] ?? "📌"} {ct.category}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#fff" }}>{fmt(ct.total)}</span>
                </div>
              ))
          }
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 8, paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Total</span>
            <span style={{ color: "#f59e0b", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(totalExpense)}</span>
          </div>
        </div>

        {!isLoggedIn
          ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Sign in via ☁️ Save/Sync first</div>
          : (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="cl-share-btn" onClick={handleShare} disabled={sharing || totalExpense <= 0} style={{ flex: 1 }}>
                {sharing ? "⏳ Sharing…" : `📤 Share ${monthLabel(selectedMonth)}`}
              </button>
              {myRank?.shared && (
                <button onClick={handleUnshare} style={{ padding: "10px 14px", borderRadius: 9, border: "1px solid rgba(239,68,68,0.25)", background: "transparent", color: "rgba(239,68,68,0.6)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  ✕ unshare
                </button>
              )}
            </div>
          )
        }
      </div>
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CL_CSS}</style>
      <div className="cl-root">

        {/* ── Top bar: month picker + share button ── */}
        <div className="cl-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>🏆 Community</span>
            <select
              className="cl-month-sel"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {/* Merge local months + server months, deduplicated */}
              {[...new Set([...localMonths, ...availableMonths, selectedMonth])]
                .sort((a, b) => b.localeCompare(a))
                .map((mk) => (
                  <option key={mk} value={mk}>{monthLabel(mk)}</option>
                ))}
            </select>
          </div>
          {isLoggedIn && (
            <button className="cl-share-btn cl-share-btn--sm" onClick={handleShare} disabled={sharing || totalExpense <= 0}>
              {sharing ? "⏳" : "📤 share"}
            </button>
          )}
          <button className="cl-refresh-btn" onClick={fetchLeaderboard} disabled={loadingLb} title="Refresh">
            🔄
          </button>
        </div>

        {/* ── Stats row ── */}
        {leaderboard && (
          <div className="cl-stats-row">
            <StatCard label="participants" value={leaderboard.participant_count ?? 0} />
            <StatCard
              label="your rank"
              value={myRank?.shared ? `#${myRank.overall_rank}` : "—"}
              sub={myRank?.shared ? `top ${100 - Math.round(myRank.percentile)}%` : "not sharing"}
              color="#f59e0b"
            />
            <StatCard
              label="avg spend"
              value={leaderboard.avg_spend ? fmt(leaderboard.avg_spend) : "—"}
              sub={leaderboard.avg_spend && totalExpense > 0
                ? (totalExpense > leaderboard.avg_spend ? "you're above avg" : "you're below avg")
                : undefined}
              color={totalExpense > (leaderboard.avg_spend ?? 0) ? "#ef4444" : "#22c55e"}
            />
          </div>
        )}

        {/* ── Inner tabs ── */}
        <div className="cl-tabs">
          {[
            ["leaderboard", "🏅 Leaderboard"],
            ["categories",  "🎯 Categories"],
            ["myrank",      "📊 My Rank"],
            ["settings",    "⚙️ Settings"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`cl-tab${activeTab === key ? " cl-tab--active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Category filter (leaderboard tab only) ── */}
        {/* FIX 1: Uses allCategories which is now persistent (merged from cache + local) */}
        {activeTab === "leaderboard" && allCategories.length > 0 && (
          <div className="cl-cat-filter">
            {["overall", ...allCategories].map((cat) => (
              <button
                key={cat}
                className={`cl-cat-pill${selectedCat === cat ? " cl-cat-pill--active" : ""}`}
                onClick={() => setSelectedCat(cat)}
              >
                {cat === "overall" ? "📊 Overall" : `${catIcons?.[cat] ?? "📌"} ${cat}`}
              </button>
            ))}
          </div>
        )}

        {/* ── Tab content ── */}
        <div className="cl-content">
          {activeTab === "leaderboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {!isLoggedIn && (
                <div className="cl-info-banner">
                  👋 Sign in via <strong>☁️ Save/Sync</strong> to share your data and join the rankings.
                </div>
              )}
              {renderLeaderboardEntries()}
            </div>
          )}

          {activeTab === "categories" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {loadingLb
                ? <div className="cl-loading"><span /><span /><span /></div>
                : renderCategoryWinners()
              }
            </div>
          )}

          {activeTab === "myrank"    && renderMyRank()}
          {activeTab === "settings"  && renderSettings()}
        </div>
      </div>
    </>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CL_CSS = `
.cl-root{display:flex;flex-direction:column;gap:14px;height:100%;overflow-y:auto;padding:14px 16px;box-sizing:border-box;}
.cl-root::-webkit-scrollbar{width:3px;}.cl-root::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:4px;}

.cl-topbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.cl-month-sel{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:5px 12px;color:#e4e4f0;font-size:12px;font-weight:600;font-family:inherit;outline:none;cursor:pointer;appearance:none;-webkit-appearance:none;}
.cl-month-sel option{background:#1a1a2e;color:#fff;}
.cl-refresh-btn{background:none;border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:4px 8px;font-size:14px;cursor:pointer;line-height:1;transition:all 0.15s;}.cl-refresh-btn:hover{background:rgba(255,255,255,0.06);}

.cl-stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}

.cl-tabs{display:flex;gap:5px;flex-wrap:wrap;}
.cl-tab{padding:5px 13px;border-radius:20px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:rgba(255,255,255,0.45);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}
.cl-tab--active{background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.35);color:#f59e0b;}

.cl-cat-filter{display:flex;gap:5px;flex-wrap:wrap;}
.cl-cat-pill{padding:4px 11px;border-radius:20px;border:1px solid rgba(255,255,255,0.07);background:transparent;color:rgba(255,255,255,0.4);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}
.cl-cat-pill--active{background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:#818cf8;}

.cl-content{flex:1;display:flex;flex-direction:column;gap:10px;}

.cl-info-banner{padding:9px 13px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:9px;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.5;}

/* Leaderboard list */
.cl-lb-list{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden;}
.cl-lb-header{display:grid;grid-template-columns:36px 1fr 90px 60px;gap:8px;padding:8px 12px;font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.25);border-bottom:1px solid rgba(255,255,255,0.05);}
.cl-lb-row{display:grid;grid-template-columns:36px 1fr 90px 60px;gap:8px;padding:9px 12px;align-items:center;transition:background 0.12s;border-bottom:1px solid rgba(255,255,255,0.03);}
.cl-lb-row:last-child{border-bottom:none;}
.cl-lb-row:hover{background:rgba(255,255,255,0.03);}
.cl-lb-row--me{background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:8px;margin:4px 8px;padding:9px;}
.cl-you-badge{display:inline-block;font-size:9px;font-weight:700;padding:1px 6px;border-radius:20px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#22c55e;margin-left:5px;}
.cl-bar-mini{height:3px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:4px;overflow:hidden;width:100%;}

/* Category winners grid */
.cl-cat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}
.cl-cat-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;cursor:pointer;transition:background 0.15s;}
.cl-cat-card:hover{background:rgba(255,255,255,0.06);}
.cl-cat-card-top{display:flex;align-items:center;gap:8px;}
.cl-cat-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
.cl-cat-winner-row{display:flex;align-items:center;gap:6px;}

/* My rank */
.cl-rank-hero{background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.2);border-radius:14px;padding:18px;text-align:center;}
.cl-rank-hero-num{font-size:48px;font-weight:700;color:#818cf8;font-family:'JetBrains Mono',monospace;line-height:1;}
.cl-rank-hero-sub{font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;}
.cl-rank-hero-exp{font-size:13px;color:rgba(255,255,255,0.65);font-weight:600;margin-top:6px;}
.cl-percentile-bar{height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:visible;margin-top:14px;position:relative;}
.cl-percentile-marker{position:absolute;top:-3px;width:2px;height:14px;background:#fff;border-radius:1px;transform:translateX(-50%);}
.cl-cat-rank-row{display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:9px;}
.cl-cat-icon-sm{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
.cl-bar-wrap{height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;}

/* Settings */
.cl-setting-row{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:9px;gap:10px;}
.cl-privacy-note{font-size:11px;color:rgba(255,255,255,0.4);padding:9px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:8px;line-height:1.6;border-left:2px solid rgba(255,255,255,0.15);}

/* Custom name input */
.cl-name-input{flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:7px 11px;color:#fff;font-size:13px;font-family:inherit;outline:none;transition:border-color 0.15s;}
.cl-name-input:focus{border-color:rgba(245,158,11,0.4);}
.cl-name-input::placeholder{color:rgba(255,255,255,0.25);}
.cl-name-save-btn{padding:7px 14px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;}
.cl-name-clear-btn{padding:7px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;}

/* Share button */
.cl-share-btn{padding:10px 18px;border-radius:9px;border:none;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;transition:all 0.15s;}
.cl-share-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 14px rgba(245,158,11,0.3);}
.cl-share-btn:disabled{opacity:0.4;cursor:not-allowed;transform:none;box-shadow:none;}
.cl-share-btn--sm{padding:6px 12px;font-size:12px;}

/* Loading / empty */
.cl-loading{display:flex;gap:6px;justify-content:center;padding:40px 0;}.cl-loading span{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.2);animation:cl-bounce 1s ease-in-out infinite;}.cl-loading span:nth-child(2){animation-delay:0.15s;}.cl-loading span:nth-child(3){animation-delay:0.3s;}
@keyframes cl-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-7px)}}
.cl-empty{text-align:center;color:rgba(255,255,255,0.35);font-size:13px;padding:40px 0;line-height:2;}
.cl-section-label{font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.25);margin-bottom:8px;}

@media(max-width:480px){
  .cl-stats-row{grid-template-columns:1fr 1fr;}.cl-stats-row>div:last-child{grid-column:1/-1;}
  .cl-cat-grid{grid-template-columns:1fr;}
  .cl-lb-header,.cl-lb-row{grid-template-columns:30px 1fr 80px 50px;}
}
`;
