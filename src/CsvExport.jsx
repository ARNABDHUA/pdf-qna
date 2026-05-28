// CsvExport.jsx — Drop-in CSV export panel for ExpenseTracker
// Supports: Monthly · Yearly · All Records
// Output formats: App Native CSV · Cashew-compatible CSV
//
// USAGE — add this import at the top of ExpenseTracker.jsx:
//   import CsvExport from "./CsvExport";
//
// Then add a tab entry in the tabs array:
//   ["csvexport","📤","Export"]
//
// And add the tab panel inside et-tab-content:
//   {tab === "csvexport" && (
//     <CsvExport expenses={expenses} budget={budget} catIcons={catIcons} catColors={catColors} />
//   )}

import React, { useState, useMemo } from "react";

// ── Helpers ────────────────────────────────────────────────────────────────────
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function isoDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function monthLabel(mk) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m-1).toLocaleDateString("en-IN", { month:"long", year:"numeric" });
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("en-IN", { day:"2-digit", month:"2-digit", year:"numeric" });
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true });
}
function fmtDateTime(ts) {
  // Cashew-style: "2026-05-21 08:04:08.000"
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000`;
}
function escapeCsv(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function buildRow(cells) {
  return cells.map(escapeCsv).join(",");
}
function downloadCsv(content, filename) {
  const BOM = "\uFEFF"; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([BOM + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── App Native CSV builder ─────────────────────────────────────────────────────
// Columns: Date, Time, Category, Description, Note/Reason, Type, Amount (₹), Account
function buildNativeCsv(rows) {
  const header = buildRow(["Date","Time","Category","Description","Note","Type","Amount (INR)","Account"]);
  const lines = rows.map(e => buildRow([
    fmtDate(e.timestamp),
    fmtTime(e.timestamp),
    e.category || "",
    e.description || "",
    e.reason || "",
    e.type === "income" ? "Income" : "Expense",
    e.type === "income" ? e.amount : -e.amount,
    e.accountName || "",
  ]));
  return [header, ...lines].join("\r\n");
}

// ── Cashew-compatible CSV builder ─────────────────────────────────────────────
// Mirrors: account,amount,amount unpaid,currency,title,note,date,income,type,
//          category name,subcategory name,color,icon,emoji,budget,objective,extra
function buildCashewCsv(rows) {
  const header = buildRow([
    "account","amount","amount unpaid","currency","title","note","date","income",
    "type","category name","subcategory name","color","icon","emoji","budget","objective","extra"
  ]);
  const lines = rows.map(e => {
    const isIncome = e.type === "income";
    const amount = isIncome ? e.amount : -Math.abs(e.amount);
    return buildRow([
      e.accountName || "Cash",
      amount,
      "",                        // amount unpaid
      "INR",
      e.description || "",
      e.reason || "",
      fmtDateTime(e.timestamp),
      isIncome ? "true" : "false",
      "default",                 // type
      e.category || "Other",
      "",                        // subcategory
      "",                        // color (not stored in app)
      "",                        // icon
      "",                        // emoji
      "",                        // budget
      "",                        // objective
      "",                        // extra
    ]);
  });
  return [header, ...lines].join("\r\n");
}

// ── Summary stats ──────────────────────────────────────────────────────────────
function getStats(rows) {
  const expense = rows.filter(e => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  const income  = rows.filter(e => e.type === "income").reduce((s, e) => s + e.amount, 0);
  return { expense, income, net: income - expense, count: rows.length };
}

const fmt = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

// ══════════════════════════════════════════════════════════════════════════════
// ── CsvExport Component
// ══════════════════════════════════════════════════════════════════════════════
export default function CsvExport({ expenses = [], budget = {}, catIcons = {}, catColors = {} }) {
  // Export mode: "monthly" | "yearly" | "all"
  const [mode,        setMode]        = useState("monthly");
  // Format: "native" | "cashew"
  const [format,      setFormat]      = useState("native");

  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [yearOnly, setYearOnly] = useState(now.getFullYear());

  const [done,    setDone]    = useState(false);
  const [preview, setPreview] = useState(false);

  // Available years from data
  const availableYears = useMemo(() => {
    const ys = new Set(expenses.map(e => new Date(e.timestamp).getFullYear()));
    const arr = [...ys].sort((a, b) => b - a);
    return arr.length ? arr : [now.getFullYear()];
  }, [expenses]);

  // Filtered rows based on mode
  const filteredRows = useMemo(() => {
    const sorted = [...expenses].sort((a, b) => b.timestamp - a.timestamp);
    if (mode === "all") return sorted;
    if (mode === "monthly") {
      return sorted.filter(e => {
        const d = new Date(e.timestamp);
        return d.getFullYear() === selYear && (d.getMonth()+1) === selMonth;
      });
    }
    if (mode === "yearly") {
      return sorted.filter(e => new Date(e.timestamp).getFullYear() === yearOnly);
    }
    return sorted;
  }, [expenses, mode, selMonth, selYear, yearOnly]);

  const stats = useMemo(() => getStats(filteredRows), [filteredRows]);

  // Preview: first 5 rows
  const previewRows = useMemo(() => filteredRows.slice(0, 5), [filteredRows]);

  function getFilename() {
    const fmt_label = format === "cashew" ? "_cashew" : "";
    if (mode === "all")     return `expenses_all${fmt_label}.csv`;
    if (mode === "monthly") return `expenses_${MONTH_NAMES[selMonth-1]}_${selYear}${fmt_label}.csv`;
    if (mode === "yearly")  return `expenses_${yearOnly}${fmt_label}.csv`;
  }

  function handleExport() {
    if (!filteredRows.length) return;
    const content = format === "cashew"
      ? buildCashewCsv(filteredRows)
      : buildNativeCsv(filteredRows);
    downloadCsv(content, getFilename());
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  }

  const periodLabel = mode === "all"
    ? "All Records"
    : mode === "monthly"
    ? `${MONTH_NAMES[selMonth-1]} ${selYear}`
    : String(yearOnly);

  // Category breakdown for the preview card
  const catBreakdown = useMemo(() => {
    const map = {};
    for (const e of filteredRows) {
      if (e.type !== "expense") continue;
      map[e.category] = (map[e.category] || 0) + e.amount;
    }
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0,5);
  }, [filteredRows]);

  return (
    <div className="et-records" style={{ gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ flex:1 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:"#fff", margin:0 }}>📤 Export Records as CSV</h3>
          <p style={{ fontSize:11, color:"rgba(255,255,255,0.35)", margin:"3px 0 0" }}>
            Download your expenses for spreadsheets, Cashew, or any finance tool.
          </p>
        </div>
      </div>

      {/* ── Mode selector ── */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <p style={LABEL_STYLE}>Export Range</p>
        <div className="et-view-toggle">
          {[["monthly","📅 Monthly"],["yearly","📆 Yearly"],["all","🗂️ All Records"]].map(([v,l]) => (
            <button
              key={v}
              className={`et-view-btn ${mode === v ? "et-view-btn--active" : ""}`}
              onClick={() => setMode(v)}
            >{l}</button>
          ))}
        </div>

        {/* Month/Year pickers */}
        {mode === "monthly" && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", padding:"10px 14px", background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:10 }}>
            <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)", flexShrink:0 }}>Month:</span>
            <select
              className="et-bgt-select"
              value={selMonth}
              onChange={e => setSelMonth(Number(e.target.value))}
              style={{ minWidth:110, padding:"5px 10px", fontSize:12 }}
            >
              {MONTH_NAMES.map((n,i) => <option key={i} value={i+1}>{n}</option>)}
            </select>
            <select
              className="et-bgt-select"
              value={selYear}
              onChange={e => setSelYear(Number(e.target.value))}
              style={{ minWidth:80, padding:"5px 10px", fontSize:12 }}
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{ fontSize:12, color:"#f59e0b", fontWeight:700, background:"rgba(245,158,11,0.12)", padding:"3px 10px", borderRadius:20, border:"1px solid rgba(245,158,11,0.25)" }}>
              {MONTH_NAMES[selMonth-1]} {selYear}
            </span>
          </div>
        )}

        {mode === "yearly" && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", padding:"10px 14px", background:"rgba(99,102,241,0.06)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:10 }}>
            <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)", flexShrink:0 }}>Year:</span>
            <select
              className="et-bgt-select"
              value={yearOnly}
              onChange={e => setYearOnly(Number(e.target.value))}
              style={{ minWidth:90, padding:"5px 10px", fontSize:12 }}
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{ fontSize:12, color:"#818cf8", fontWeight:700, background:"rgba(99,102,241,0.12)", padding:"3px 10px", borderRadius:20, border:"1px solid rgba(99,102,241,0.25)" }}>
              {yearOnly}
            </span>
          </div>
        )}
      </div>

      {/* ── Format selector ── */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <p style={LABEL_STYLE}>CSV Format</p>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          {[
            { v:"native",  label:"App Format",      desc:"Date, Time, Category, Description, Note, Type, Amount, Account", color:"#22c55e" },
            { v:"cashew",  label:"Cashew Compatible", desc:"Matches Cashew app export — import directly into Cashew", color:"#38bdf8" },
          ].map(({ v, label, desc, color }) => (
            <div
              key={v}
              onClick={() => setFormat(v)}
              style={{
                flex:1, minWidth:140, padding:"11px 14px", borderRadius:12, cursor:"pointer",
                border: format === v ? `1px solid ${color}55` : "1px solid rgba(255,255,255,0.07)",
                background: format === v ? `${color}10` : "rgba(255,255,255,0.02)",
                transition:"all 0.15s",
              }}
            >
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
                <div style={{ width:14, height:14, borderRadius:"50%", border: format === v ? `3px solid ${color}` : "3px solid rgba(255,255,255,0.15)", flexShrink:0 }} />
                <span style={{ fontSize:12, fontWeight:700, color: format === v ? "#fff" : "rgba(255,255,255,0.55)" }}>{label}</span>
              </div>
              <p style={{ fontSize:10, color:"rgba(255,255,255,0.3)", margin:0, lineHeight:1.5, paddingLeft:21 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Stats card ── */}
      {filteredRows.length > 0 ? (
        <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:14, display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#fff" }}>📋 {periodLabel}</span>
            <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>{filteredRows.length} record{filteredRows.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Summary row */}
          <div style={{ display:"flex", gap:0, background:"rgba(255,255,255,0.03)", borderRadius:10, overflow:"hidden" }}>
            {[
              { label:"Expenses",  val: fmt(stats.expense), color:"#ef4444" },
              { label:"Income",    val: fmt(stats.income),  color:"#22c55e" },
              { label:"Net",       val: fmt(stats.net),     color: stats.net >= 0 ? "#22c55e" : "#ef4444" },
            ].map((item, i) => (
              <React.Fragment key={item.label}>
                {i > 0 && <div style={{ width:1, background:"rgba(255,255,255,0.06)" }} />}
                <div style={{ flex:1, padding:"10px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", marginBottom:3 }}>{item.label}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:item.color, fontFamily:"'JetBrains Mono',monospace" }}>{item.val}</div>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* Top categories */}
          {catBreakdown.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              <p style={{ ...LABEL_STYLE, marginBottom:2 }}>Top Categories</p>
              {catBreakdown.map(([cat, total]) => (
                <div key={cat} style={{ display:"flex", alignItems:"center", gap:8, fontSize:11 }}>
                  <span style={{ width:20, textAlign:"center", flexShrink:0 }}>{catIcons[cat] || "📌"}</span>
                  <span style={{ flex:1, color:"rgba(255,255,255,0.6)" }}>{cat}</span>
                  <span style={{ color: catColors[cat] || "#6b7280", fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{fmt(total)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Preview toggle */}
          <button
            onClick={() => setPreview(p => !p)}
            style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"5px 10px", color:"rgba(255,255,255,0.4)", fontSize:11, cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}
          >
            {preview ? "▾ Hide preview" : "▸ Preview first 5 rows"}
          </button>

          {preview && (
            <div style={{ overflowX:"auto", borderRadius:9, border:"1px solid rgba(255,255,255,0.07)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10, fontFamily:"'JetBrains Mono',monospace" }}>
                <thead>
                  <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                    {(format === "cashew"
                      ? ["Account","Amount","Date","Income","Category","Title","Note"]
                      : ["Date","Time","Category","Description","Note","Type","Amount","Account"]
                    ).map(h => (
                      <th key={h} style={{ padding:"7px 10px", textAlign:"left", color:"rgba(255,255,255,0.3)", fontSize:9, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", borderBottom:"1px solid rgba(255,255,255,0.06)", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((e, i) => (
                    <tr key={e.id || i} style={{ borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                      {format === "cashew" ? <>
                        <td style={TD}>{e.accountName || "Cash"}</td>
                        <td style={{ ...TD, color: e.type === "income" ? "#22c55e" : "#ef4444" }}>{e.type === "income" ? "+" : "-"}{e.amount}</td>
                        <td style={TD}>{fmtDate(e.timestamp)}</td>
                        <td style={TD}>{e.type === "income" ? "true" : "false"}</td>
                        <td style={TD}>{e.category}</td>
                        <td style={TD}>{e.description || "—"}</td>
                        <td style={{ ...TD, color:"rgba(255,255,255,0.3)", fontStyle:"italic" }}>{e.reason || "—"}</td>
                      </> : <>
                        <td style={TD}>{fmtDate(e.timestamp)}</td>
                        <td style={TD}>{fmtTime(e.timestamp)}</td>
                        <td style={TD}>{e.category}</td>
                        <td style={TD}>{e.description || "—"}</td>
                        <td style={{ ...TD, color:"rgba(255,255,255,0.3)", fontStyle:"italic" }}>{e.reason || "—"}</td>
                        <td style={{ ...TD, color: e.type === "income" ? "#22c55e" : "#ef4444" }}>{e.type}</td>
                        <td style={{ ...TD, color: e.type === "income" ? "#22c55e" : "#ef4444" }}>{e.type === "income" ? "+" : "-"}{e.amount}</td>
                        <td style={TD}>{e.accountName || "—"}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRows.length > 5 && (
                <p style={{ fontSize:10, color:"rgba(255,255,255,0.2)", padding:"6px 10px", fontStyle:"italic" }}>
                  + {filteredRows.length - 5} more rows in the downloaded file
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign:"center", padding:"32px 0", color:"rgba(255,255,255,0.3)", fontSize:13 }}>
          No records found for <strong style={{ color:"rgba(255,255,255,0.5)" }}>{periodLabel}</strong>.<br/>
          <span style={{ fontSize:11 }}>Try a different period or add some expenses first.</span>
        </div>
      )}

      {/* ── Download button ── */}
      <button
        onClick={handleExport}
        disabled={!filteredRows.length}
        style={{
          padding:"12px 20px", borderRadius:11, border:"none", cursor: filteredRows.length ? "pointer" : "not-allowed",
          background: done
            ? "linear-gradient(135deg,#22c55e,#16a34a)"
            : filteredRows.length
            ? "linear-gradient(135deg,#f59e0b,#ef4444)"
            : "rgba(255,255,255,0.05)",
          color: filteredRows.length ? "#fff" : "rgba(255,255,255,0.2)",
          fontWeight:700, fontSize:14, fontFamily:"inherit",
          transition:"all 0.2s", boxShadow: filteredRows.length && !done ? "0 4px 18px rgba(245,158,11,0.25)" : "none",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        }}
      >
        {done ? "✓ Downloaded!" : `⬇️ Download ${filteredRows.length > 0 ? `${filteredRows.length} records` : ""} as CSV`}
      </button>

      {/* ── File info ── */}
      {filteredRows.length > 0 && (
        <p style={{ fontSize:11, color:"rgba(255,255,255,0.25)", textAlign:"center", marginTop:-8 }}>
          File: <span style={{ fontFamily:"'JetBrains Mono',monospace", color:"rgba(255,255,255,0.4)" }}>{getFilename()}</span>
        </p>
      )}

      {/* ── Format hints ── */}
      <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, padding:"12px 14px", fontSize:11, color:"rgba(255,255,255,0.4)", lineHeight:2 }}>
        <div style={{ fontWeight:700, color:"rgba(255,255,255,0.55)", marginBottom:4 }}>💡 Tips</div>
        <div>📊 <strong style={{ color:"rgba(255,255,255,0.6)" }}>App Format</strong> — open in Excel / Google Sheets for analysis</div>
        <div>📱 <strong style={{ color:"rgba(255,255,255,0.6)" }}>Cashew Format</strong> — import in Cashew app via Settings → Import CSV</div>
        <div>🗂️ <strong style={{ color:"rgba(255,255,255,0.6)" }}>All Records</strong> — full data backup; use for migration or analysis</div>
      </div>

    </div>
  );
}

// ── Style constants ────────────────────────────────────────────────────────────
const LABEL_STYLE = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "rgba(255,255,255,0.3)", margin: 0,
};
const TD = {
  padding: "6px 10px", color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap",
  maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
};
