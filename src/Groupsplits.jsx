// GroupSplits.jsx — Group-based split expenses for ExpenseTracker
// Features: Month/Year navigation, Excel export, PDF export, detailed transaction view
// Usage: import GroupSplits from "./GroupSplits"; then add as a tab in ExpenseTracker

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── Config ─────────────────────────────────────────────────────────────────────
const API_BASE = "https://pdf-qna-backend.onrender.com";

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt        = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const dateIN     = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
const timeIN     = (ts) => new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const monthKey   = (ts) => { const d = new Date(ts + 5.5 * 3600000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const yearKey    = (ts) => String(new Date(ts + 5.5 * 3600000).getUTCFullYear());
const monthLabel = (mk) => { const [y, m] = mk.split("-").map(Number); return new Date(y, m - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); };
const uid        = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

const MONTH_NAMES_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_NAMES_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Dedup helper ───────────────────────────────────────────────────────────────
const dedupExpenses = (arr) =>
  Array.from(new Map((arr || []).map(e => [e.expense_id, e])).values())
    .sort((a, b) => b.timestamp - a.timestamp);

const CAT_ICONS  = { Food:"🍽️", Transport:"🚌", Shopping:"🛒", Bills:"💡", Health:"💊", Entertainment:"🎬", Education:"📚", Travel:"✈️", Rent:"🏠", Salary:"💰", Other:"📌" };
const CAT_COLORS = { Food:"#f97316", Transport:"#0ea5e9", Shopping:"#a855f7", Bills:"#ef4444", Health:"#10b981", Entertainment:"#f59e0b", Education:"#3b82f6", Travel:"#06b6d4", Rent:"#8b5cf6", Salary:"#22c55e", Other:"#6b7280" };
const CATEGORIES = Object.keys(CAT_ICONS);

// ── API helpers ────────────────────────────────────────────────────────────────
async function apiCall(path, body) {
  const res = await fetch(`${API_BASE}/groups${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.detail || d.message || `Error ${res.status}`);
  return d;
}

// ── SheetJS lazy loader ────────────────────────────────────────────────────────
function loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload  = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error("Failed to load SheetJS"));
    document.head.appendChild(s);
  });
}

// ── jsPDF lazy loader ──────────────────────────────────────────────────────────
function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf) { resolve(window.jspdf.jsPDF); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload  = () => resolve(window.jspdf.jsPDF);
    s.onerror = () => reject(new Error("Failed to load jsPDF"));
    document.head.appendChild(s);
  });
}

// ── Excel export builder ───────────────────────────────────────────────────────
function buildGroupExcel(XLSX, expenses, groupName, periodLabel, members, username) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const catMap = {};
  for (const e of expenses) catMap[e.category] = (catMap[e.category] || 0) + e.amount;

  // Per-member: how much they paid vs owe
  const memberPaid = {}, memberShare = {};
  for (const m of members) { memberPaid[m] = 0; memberShare[m] = 0; }
  for (const e of expenses) {
    memberPaid[e.paid_by] = (memberPaid[e.paid_by] || 0) + e.amount;
    for (const s of e.splits || []) {
      memberShare[s.username] = (memberShare[s.username] || 0) + s.share;
    }
  }

  const sumRows = [
    [`Group Expense Report — ${groupName}`, "", "", ""],
    [`Period: ${periodLabel}`, "", "", ""],
    [],
    ["Category", "Amount (₹)", "Transactions", "% Share"],
    ...Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => [
      `${CAT_ICONS[cat]||""} ${cat}`, amt, expenses.filter(e=>e.category===cat).length,
      total > 0 ? ((amt/total)*100).toFixed(1)+"%" : "0%"
    ]),
    [],
    ["TOTAL", total, expenses.length, "100%"],
    [],
    ["Member", "Paid", "Owes (Share)", "Net Balance"],
    ...members.map(m => [
      m + (m === username ? " (you)" : ""),
      memberPaid[m] || 0,
      memberShare[m] || 0,
      (memberPaid[m] || 0) - (memberShare[m] || 0)
    ]),
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(sumRows);
  wsSummary["!cols"] = [{wch:30},{wch:16},{wch:14},{wch:12}];
  wsSummary["!merges"] = [{s:{r:0,c:0},e:{r:0,c:3}},{s:{r:1,c:0},e:{r:1,c:3}}];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 2: All Transactions ─────────────────────────────────────────────
  const txRows = [
    [`All Transactions — ${groupName} (${periodLabel})`, "", "", "", "", "", ""],
    [],
    ["Date", "Time", "Category", "Description", "Reason", "Paid By", "Total (₹)"],
    ...expenses.sort((a,b)=>a.timestamp-b.timestamp).map(e => [
      dateIN(e.timestamp), timeIN(e.timestamp),
      `${CAT_ICONS[e.category]||""} ${e.category}`,
      e.description || "—", e.reason || "",
      e.paid_by + (e.paid_by === username ? " (you)" : ""),
      e.amount,
    ])
  ];
  const wsTx = XLSX.utils.aoa_to_sheet(txRows);
  wsTx["!cols"] = [{wch:13},{wch:10},{wch:16},{wch:30},{wch:24},{wch:14},{wch:12}];
  wsTx["!merges"] = [{s:{r:0,c:0},e:{r:0,c:6}}];
  XLSX.utils.book_append_sheet(wb, wsTx, "Transactions");

  // ── Sheet 3: Detailed Splits ──────────────────────────────────────────────
  const splitRows = [
    [`Detailed Splits — ${groupName} (${periodLabel})`, "", "", "", "", ""],
    [],
    ["Date", "Description", "Paid By", "Member", "Share (₹)", "Status"],
  ];
  for (const e of expenses.sort((a,b)=>a.timestamp-b.timestamp)) {
    for (const s of e.splits || []) {
      splitRows.push([
        dateIN(e.timestamp),
        e.description || "—",
        e.paid_by + (e.paid_by === username ? " (you)" : ""),
        s.username + (s.username === username ? " (you)" : ""),
        s.share,
        s.paid ? "✓ Settled" : "Pending",
      ]);
    }
  }
  const wsSplit = XLSX.utils.aoa_to_sheet(splitRows);
  wsSplit["!cols"] = [{wch:13},{wch:30},{wch:14},{wch:14},{wch:12},{wch:10}];
  wsSplit["!merges"] = [{s:{r:0,c:0},e:{r:0,c:5}}];
  XLSX.utils.book_append_sheet(wb, wsSplit, "Splits Detail");

  // ── Sheets per member ─────────────────────────────────────────────────────
  for (const member of members) {
    const mRows = [
      [`${member}'s Expenses — ${groupName} (${periodLabel})`, "", "", "", ""],
      [],
      [`Paid by ${member}: ${fmt(memberPaid[member]||0)}`, "", `${member}'s share: ${fmt(memberShare[member]||0)}`, "", `Net: ${fmt((memberPaid[member]||0)-(memberShare[member]||0))}`],
      [],
      ["Date", "Description", "Category", "Total Expense", "Share", "Status"],
    ];
    for (const e of expenses.filter(e => e.paid_by === member || e.splits?.some(s=>s.username===member)).sort((a,b)=>a.timestamp-b.timestamp)) {
      const myS = e.splits?.find(s=>s.username===member);
      mRows.push([
        dateIN(e.timestamp), e.description||"—",
        `${CAT_ICONS[e.category]||""} ${e.category}`,
        e.paid_by === member ? e.amount : "—",
        myS ? myS.share : "—",
        myS?.paid || e.paid_by === member ? "✓" : "Pending",
      ]);
    }
    const wsM = XLSX.utils.aoa_to_sheet(mRows);
    wsM["!cols"] = [{wch:13},{wch:28},{wch:16},{wch:14},{wch:10},{wch:10}];
    wsM["!merges"] = [{s:{r:0,c:0},e:{r:0,c:5}},{s:{r:2,c:0},e:{r:2,c:1}},{s:{r:2,c:2},e:{r:2,c:3}}];
    XLSX.utils.book_append_sheet(wb, wsM, member.slice(0,31));
  }

  return wb;
}

// ── PDF export builder ─────────────────────────────────────────────────────────
async function exportGroupPDF(expenses, groupName, periodLabel, members, username) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, margin = 14;
  let y = margin;

  const col = { dark:"#0d0d1a", accent:"#f59e0b", green:"#22c55e", red:"#ef4444", muted:"#6b7280", white:"#ffffff", bg:"#12121f" };

  const addPage = () => { doc.addPage(); y = margin; };
  const checkY = (need=10) => { if (y + need > 287) addPage(); };

  // ── Header ──
  doc.setFillColor("#0d0d1a");
  doc.rect(0, 0, W, 42, "F");
  doc.setTextColor("#f59e0b");
  doc.setFontSize(20); doc.setFont("helvetica","bold");
  doc.text(`💸 ${groupName}`, margin, 18);
  doc.setFontSize(11); doc.setFont("helvetica","normal");
  doc.setTextColor("#e4e4f0");
  doc.text(`Group Expense Report — ${periodLabel}`, margin, 28);
  doc.setFontSize(9); doc.setTextColor("#6b7280");
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")} · ${expenses.length} transactions`, margin, 36);
  y = 52;

  // ── Summary ──
  const total = expenses.reduce((s,e)=>s+e.amount, 0);
  doc.setFillColor("#1a1a2e");
  doc.roundedRect(margin, y, W-margin*2, 22, 3, 3, "F");
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor("#f59e0b");
  doc.text("PERIOD SUMMARY", margin+6, y+8);
  doc.setFont("helvetica","normal"); doc.setTextColor("#e4e4f0");
  doc.text(`Total Spent: ${fmt(total)}`, margin+6, y+16);
  doc.text(`Transactions: ${expenses.length}`, margin+70, y+16);
  doc.text(`Members: ${members.length}`, margin+130, y+16);
  y += 30;

  // ── Category breakdown ──
  checkY(20);
  doc.setFontSize(11); doc.setFont("helvetica","bold"); doc.setTextColor("#f59e0b");
  doc.text("Category Breakdown", margin, y); y += 7;
  const catMap = {};
  for (const e of expenses) catMap[e.category] = (catMap[e.category]||0) + e.amount;
  const catEntries = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  for (const [cat, amt] of catEntries) {
    checkY(8);
    const pct = total > 0 ? ((amt/total)*100).toFixed(1) : "0";
    const barW = total > 0 ? Math.round((amt/total)*(W-margin*2-60)) : 0;
    doc.setFillColor("#1a1a2e"); doc.rect(margin, y-4, W-margin*2, 7, "F");
    doc.setFillColor(CAT_COLORS[cat]||"#6b7280"); doc.rect(margin, y-4, barW, 7, "F");
    doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor("#ffffff");
    doc.text(`${cat}`, margin+2, y+1);
    doc.setFont("helvetica","normal"); doc.setTextColor("#e4e4f0");
    doc.text(`${fmt(amt)} (${pct}%)`, W-margin-30, y+1);
    y += 9;
  }
  y += 4;

  // ── Member balances ──
  checkY(30);
  doc.setFontSize(11); doc.setFont("helvetica","bold"); doc.setTextColor("#f59e0b");
  doc.text("Member Balances", margin, y); y += 7;
  const memberPaid = {}, memberShare = {};
  for (const m of members) { memberPaid[m]=0; memberShare[m]=0; }
  for (const e of expenses) {
    memberPaid[e.paid_by] = (memberPaid[e.paid_by]||0)+e.amount;
    for (const s of e.splits||[]) memberShare[s.username]=(memberShare[s.username]||0)+s.share;
  }
  // Header row
  doc.setFillColor("#1a1a2e"); doc.rect(margin, y-4, W-margin*2, 7, "F");
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor("#94a3b8");
  doc.text("Member", margin+2, y+1); doc.text("Paid", margin+70, y+1);
  doc.text("Share", margin+110, y+1); doc.text("Net", margin+148, y+1);
  y += 9;
  for (const m of members) {
    checkY(8);
    const paid=memberPaid[m]||0, share=memberShare[m]||0, net=paid-share;
    const isMe = m === username;
    doc.setFillColor(isMe?"#1e1e30":"#131320"); doc.rect(margin, y-4, W-margin*2, 7, "F");
    doc.setFontSize(9); doc.setFont("helvetica", isMe?"bold":"normal"); doc.setTextColor("#e4e4f0");
    doc.text(m+(isMe?" (you)":""), margin+2, y+1);
    doc.text(fmt(paid), margin+70, y+1);
    doc.text(fmt(share), margin+110, y+1);
    doc.setTextColor(net>=0?"#22c55e":"#ef4444");
    doc.text(fmt(net), margin+148, y+1);
    y += 9;
  }
  y += 6;

  // ── Detailed Transactions ──
  doc.addPage(); y = margin;
  doc.setFillColor("#0d0d1a"); doc.rect(0,0,W,20,"F");
  doc.setFontSize(14); doc.setFont("helvetica","bold"); doc.setTextColor("#f59e0b");
  doc.text(`Detailed Transactions — ${periodLabel}`, margin, 14); y = 26;

  // Group by date
  const byDate = {};
  for (const e of [...expenses].sort((a,b)=>a.timestamp-b.timestamp)) {
    const dk = dateIN(e.timestamp);
    if (!byDate[dk]) byDate[dk] = [];
    byDate[dk].push(e);
  }

  for (const [date, dayExps] of Object.entries(byDate)) {
    checkY(16);
    // Day header
    const dayTotal = dayExps.reduce((s,e)=>s+e.amount,0);
    doc.setFillColor("#1e1e30"); doc.rect(margin, y-4, W-margin*2, 8, "F");
    doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor("#f59e0b");
    doc.text(date, margin+2, y+1);
    doc.setTextColor("#94a3b8");
    doc.text(`${dayExps.length} expenses · Total: ${fmt(dayTotal)}`, margin+40, y+1);
    y += 10;

    for (const e of dayExps) {
      checkY(8 + (e.splits||[]).length*6);
      // Expense row
      doc.setFillColor("#0f0f1e"); doc.rect(margin, y-3, W-margin*2, 7, "F");
      doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor("#e4e4f0");
      doc.text(e.description||"—", margin+2, y+2);
      doc.setFont("helvetica","normal"); doc.setTextColor(CAT_COLORS[e.category]||"#6b7280");
      doc.text(e.category, margin+80, y+2);
      doc.setTextColor("#94a3b8");
      doc.text(`Paid by: ${e.paid_by}`, margin+110, y+2);
      doc.setTextColor("#ef4444"); doc.setFont("helvetica","bold");
      doc.text(fmt(e.amount), W-margin-2, y+2, {align:"right"});
      if (e.reason) {
        doc.setFont("helvetica","italic"); doc.setFontSize(7); doc.setTextColor("#6b7280");
        doc.text(e.reason.slice(0,60), margin+2, y+5.5);
      }
      y += 9;

      // Splits
      for (const s of e.splits||[]) {
        checkY(6);
        doc.setFillColor(s.paid?"#0e2016":"#1a1020"); doc.rect(margin+4, y-2.5, W-margin*2-8, 5.5, "F");
        doc.setFontSize(7.5); doc.setFont("helvetica","normal");
        doc.setTextColor(s.username===username?"#f59e0b":"#94a3b8");
        doc.text(`  ${s.username===username?"(you)":s.username}`, margin+6, y+1);
        doc.setTextColor(s.paid?"#22c55e":"#f87171");
        doc.text(s.paid?"✓ Settled":"Pending", margin+60, y+1);
        doc.setTextColor("#e4e4f0"); doc.setFont("helvetica","bold");
        doc.text(fmt(s.share), W-margin-6, y+1, {align:"right"});
        y += 6;
      }
      y += 3;
    }
    y += 4;
  }

  // ── Footer on each page ──
  const pageCount = doc.getNumberOfPages();
  for (let i=1; i<=pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor("#0d0d1a"); doc.rect(0,290,W,10,"F");
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor("#6b7280");
    doc.text(`${groupName} · ${periodLabel} · Page ${i} of ${pageCount}`, W/2, 296, {align:"center"});
  }

  return doc;
}

// ── Web Push helpers ───────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function fetchVapidPublicKey() {
  try {
    const res = await fetch(`${API_BASE}/groups/vapid-public-key`);
    if (!res.ok) return null;
    const d = await res.json();
    return d.vapid_public_key || null;
  } catch { return null; }
}

async function subscribeToPush(username, password) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return { ok: false, reason: "Push not supported in this browser." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Notification permission denied." };
  try {
    const vapidKey = await fetchVapidPublicKey();
    if (!vapidKey) return { ok: false, reason: "Push not configured on server." };
    const reg      = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(vapidKey) });
    await apiCall("/push-subscribe", { username, password, subscription: sub.toJSON() });
    return { ok: true, sub };
  } catch (e) { return { ok: false, reason: e.message || "Unknown error." }; }
}

async function unsubscribeFromPush(username, password) {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await apiCall("/push-unsubscribe", { username, password, endpoint: sub.endpoint }); await sub.unsubscribe(); }
  } catch (e) { console.warn("Push unsubscribe error:", e); }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MonthYearNav — the new navigable month/year picker
// ══════════════════════════════════════════════════════════════════════════════
function MonthYearNav({ allMonthKeys, allYearKeys, selectedPeriod, periodView, onSelect, onPeriodViewChange }) {
  const [yearPage, setYearPage] = useState(0); // for year pagination

  const availableMonths = useMemo(() => {
    const set = new Set(allMonthKeys);
    return set;
  }, [allMonthKeys]);

  const availableYears = useMemo(() => {
    const set = new Set(allYearKeys);
    return [...set].sort((a,b)=>Number(a)-Number(b));
  }, [allYearKeys]);

  // Current year context for month grid
  const [viewingYear, setViewingYear] = useState(() => {
    if (selectedPeriod) return Number(selectedPeriod.split("-")[0]);
    return new Date().getFullYear();
  });

  useEffect(() => {
    if (selectedPeriod && periodView === "month") {
      setViewingYear(Number(selectedPeriod.split("-")[0]));
    }
  }, [selectedPeriod, periodView]);

  const canGoPrevYear = availableYears.some(y => Number(y) < viewingYear);
  const canGoNextYear = availableYears.some(y => Number(y) > viewingYear);

  return (
    <div className="gs-myn-root">
      {/* Period mode toggle */}
      <div className="gs-myn-mode-row">
        <button className={`gs-myn-mode-btn ${periodView==="month"?"gs-myn-mode-btn--active":""}`}
          onClick={()=>onPeriodViewChange("month")}>📅 Month</button>
        <button className={`gs-myn-mode-btn ${periodView==="year"?"gs-myn-mode-btn--active":""}`}
          onClick={()=>onPeriodViewChange("year")}>📆 Year</button>
      </div>

      {periodView === "month" && (
        <>
          {/* Year navigator */}
          <div className="gs-myn-year-nav">
            <button className="gs-myn-nav-btn" onClick={()=>setViewingYear(y=>y-1)} disabled={!canGoPrevYear}>‹</button>
            <span className="gs-myn-year-label">{viewingYear}</span>
            <button className="gs-myn-nav-btn" onClick={()=>setViewingYear(y=>y+1)} disabled={!canGoNextYear}>›</button>
          </div>
          {/* Month grid */}
          <div className="gs-myn-month-grid">
            {MONTH_NAMES_SHORT.map((name, i) => {
              const mk = `${viewingYear}-${String(i+1).padStart(2,"0")}`;
              const hasData = availableMonths.has(mk);
              const isActive = selectedPeriod === mk;
              return (
                <button key={mk}
                  className={`gs-myn-month-btn ${hasData?"gs-myn-month-btn--has-data":""} ${isActive?"gs-myn-month-btn--active":""} ${!hasData?"gs-myn-month-btn--empty":""}`}
                  onClick={() => hasData && onSelect(mk)}
                  disabled={!hasData}
                >
                  {name}
                  {hasData && <span className="gs-myn-dot"/>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {periodView === "year" && (
        <div className="gs-myn-year-grid">
          {availableYears.length === 0 ? (
            <span style={{fontSize:11,color:"rgba(255,255,255,0.3)",gridColumn:"1/-1",textAlign:"center"}}>No data yet</span>
          ) : availableYears.map(yr => (
            <button key={yr}
              className={`gs-myn-year-chip ${selectedPeriod===yr?"gs-myn-year-chip--active":""}`}
              onClick={() => onSelect(yr)}
            >{yr}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ExportPanel — Excel + PDF download
// ══════════════════════════════════════════════════════════════════════════════
function ExportPanel({ expenses, groupName, periodLabel, members, username, onClose }) {
  const [exporting, setExporting] = useState(null); // "excel"|"pdf"|null
  const [done,      setDone]      = useState(null);

  const handleExcel = async () => {
    setExporting("excel");
    try {
      const XLSX = await loadSheetJS();
      const wb = buildGroupExcel(XLSX, expenses, groupName, periodLabel, members, username);
      const safeGroup = groupName.replace(/[^a-z0-9]/gi,"_");
      const safePeriod = periodLabel.replace(/[^a-z0-9]/gi,"_");
      XLSX.writeFile(wb, `group_${safeGroup}_${safePeriod}.xlsx`);
      setDone("excel");
    } catch(e) { alert("Excel export failed: "+e.message); }
    finally { setExporting(null); }
  };

  const handlePDF = async () => {
    setExporting("pdf");
    try {
      const doc = await exportGroupPDF(expenses, groupName, periodLabel, members, username);
      const safeGroup = groupName.replace(/[^a-z0-9]/gi,"_");
      const safePeriod = periodLabel.replace(/[^a-z0-9]/gi,"_");
      doc.save(`group_${safeGroup}_${safePeriod}.pdf`);
      setDone("pdf");
    } catch(e) { alert("PDF export failed: "+e.message); }
    finally { setExporting(null); }
  };

  return (
    <div className="gs-export-panel">
      <div className="gs-export-header">
        <span className="gs-export-title">📤 Export Report</span>
        <button className="gs-export-close" onClick={onClose}>✕</button>
      </div>
      <p className="gs-export-desc">
        <strong style={{color:"#f59e0b"}}>{periodLabel}</strong> · {expenses.length} transactions · {fmt(expenses.reduce((s,e)=>s+e.amount,0))} total
      </p>
      <div className="gs-export-sheets-info">
        <div className="gs-export-sheet-row"><span>📋</span><span><strong>Summary</strong> — category breakdown + member balances</span></div>
        <div className="gs-export-sheet-row"><span>📋</span><span><strong>Transactions</strong> — all expenses with dates & payer</span></div>
        <div className="gs-export-sheet-row"><span>📋</span><span><strong>Splits Detail</strong> — each member's share per expense</span></div>
        <div className="gs-export-sheet-row"><span>📋</span><span><strong>Per-member sheets</strong> — individual expense history</span></div>
      </div>
      <div className="gs-export-btns">
        <button className="gs-export-btn gs-export-btn--excel" onClick={handleExcel} disabled={!!exporting || expenses.length===0}>
          {exporting==="excel" ? "⏳ Building…" : done==="excel" ? "✓ Downloaded!" : "⬇️ Excel (.xlsx)"}
        </button>
        <button className="gs-export-btn gs-export-btn--pdf" onClick={handlePDF} disabled={!!exporting || expenses.length===0}>
          {exporting==="pdf" ? "⏳ Building…" : done==="pdf" ? "✓ Downloaded!" : "⬇️ PDF Report"}
        </button>
      </div>
      {expenses.length===0 && (
        <p style={{fontSize:11,color:"rgba(255,255,255,0.3)",textAlign:"center",margin:"4px 0 0"}}>No expenses in this period to export.</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── DetailedTransactionView — rich transaction list with splits
// ══════════════════════════════════════════════════════════════════════════════
function DetailedTransactionView({ expenses, username, groupName, periodLabel, onSettle, onDelete, isAdmin }) {
  const [expandedExp, setExpandedExp] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  // Group by date
  const byDate = useMemo(() => {
    const map = {};
    for (const e of [...expenses].sort((a,b)=>a.timestamp-b.timestamp)) {
      const dk = dateIN(e.timestamp);
      if (!map[dk]) map[dk] = [];
      map[dk].push(e);
    }
    return Object.entries(map).sort((a,b)=>b[0].localeCompare(a[0]));
  }, [expenses]);

  const totalAmt = expenses.reduce((s,e)=>s+e.amount,0);

  return (
    <div className="gs-dtv-root">
      {/* Header strip */}
      <div className="gs-dtv-header">
        <div className="gs-dtv-header-left">
          <span className="gs-dtv-title">📋 Detailed Transactions</span>
          <span className="gs-dtv-sub">{periodLabel}</span>
        </div>
        <div className="gs-dtv-header-right">
          <div className="gs-dtv-stat">
            <span className="gs-dtv-stat-val">{fmt(totalAmt)}</span>
            <span className="gs-dtv-stat-label">Total</span>
          </div>
          <div className="gs-dtv-stat">
            <span className="gs-dtv-stat-val">{expenses.length}</span>
            <span className="gs-dtv-stat-label">Txns</span>
          </div>
        </div>
      </div>

      {expenses.length === 0 ? (
        <div className="gs-dtv-empty">No transactions for this period.</div>
      ) : byDate.map(([date, dayExps]) => {
        const dayTotal = dayExps.reduce((s,e)=>s+e.amount,0);
        return (
          <div key={date} className="gs-dtv-day-group">
            {/* Day header */}
            <div className="gs-dtv-day-header">
              <span className="gs-dtv-day-date">{date}</span>
              <span className="gs-dtv-day-count">{dayExps.length} expense{dayExps.length!==1?"s":""}</span>
              <span className="gs-dtv-day-total">{fmt(dayTotal)}</span>
            </div>

            {/* Expenses */}
            {dayExps.map(e => {
              const isExpanded = expandedExp === e.expense_id;
              const myShare = e.splits?.find(s=>s.username===username);
              const isPayer = e.paid_by === username;
              const allSettled = e.splits?.every(s=>s.paid);
              const color = CAT_COLORS[e.category]||"#6b7280";
              const pendingCount = (e.splits||[]).filter(s=>!s.paid&&s.username!==e.paid_by).length;

              return (
                <div key={e.expense_id} className={`gs-dtv-exp ${allSettled?"gs-dtv-exp--settled":""}`}>
                  {/* Main row */}
                  <div className="gs-dtv-exp-main" onClick={()=>setExpandedExp(isExpanded?null:e.expense_id)}>
                    <div className="gs-dtv-exp-icon" style={{background:color+"22",color}}>
                      {CAT_ICONS[e.category]||"📌"}
                    </div>
                    <div className="gs-dtv-exp-info">
                      <div className="gs-dtv-exp-desc">{e.description||"—"}</div>
                      <div className="gs-dtv-exp-meta">
                        <span style={{color}}>{e.category}</span>
                        <span className="gs-dtv-dot">·</span>
                        <span>Paid by <strong style={{color:isPayer?"#f59e0b":"#818cf8"}}>{isPayer?"you":e.paid_by}</strong></span>
                        {e.reason && <><span className="gs-dtv-dot">·</span><span style={{fontStyle:"italic",color:"rgba(255,255,255,0.3)"}}>{e.reason}</span></>}
                      </div>
                      <div className="gs-dtv-exp-time">{timeIN(e.timestamp)}</div>
                    </div>
                    <div className="gs-dtv-exp-right">
                      <span className="gs-dtv-exp-amt" style={{color}}>{fmt(e.amount)}</span>
                      {myShare && (
                        <span className={`gs-dtv-my-share ${myShare.paid||isPayer?"gs-dtv-my-share--paid":""}`}>
                          {isPayer?"you paid":myShare.paid?"✓ settled":`your share: ${fmt(myShare.share)}`}
                        </span>
                      )}
                      {!allSettled && pendingCount > 0 && (
                        <span className="gs-dtv-pending-badge">{pendingCount} pending</span>
                      )}
                      {allSettled && <span className="gs-dtv-settled-badge">✓ all settled</span>}
                    </div>
                    <span className="gs-dtv-chevron">{isExpanded?"▾":"▸"}</span>
                  </div>

                  {/* Expanded splits */}
                  {isExpanded && (
                    <div className="gs-dtv-splits">
                      <div className="gs-dtv-splits-header">
                        <span className="gs-dtv-splits-label">Split Breakdown</span>
                        <span className="gs-dtv-splits-total">
                          Total: {fmt(e.amount)} ÷ {e.splits?.length||0} members
                        </span>
                      </div>
                      <div className="gs-dtv-splits-grid">
                        {(e.splits||[]).map((s,i) => {
                          const isMe = s.username === username;
                          const canSettle = isPayer && !s.paid && s.username !== username;
                          const pct = e.amount > 0 ? ((s.share/e.amount)*100).toFixed(0) : 0;
                          return (
                            <div key={`${e.expense_id}-${s.username}-${i}`}
                              className={`gs-dtv-split-item ${s.paid?"gs-dtv-split-item--paid":""} ${isMe?"gs-dtv-split-item--me":""}`}>
                              <div className="gs-dtv-split-avatar" style={{
                                background: isMe?"rgba(245,158,11,0.18)":"rgba(99,102,241,0.18)",
                                color: isMe?"#f59e0b":"#818cf8"
                              }}>
                                {s.username[0].toUpperCase()}
                              </div>
                              <div className="gs-dtv-split-info">
                                <span className="gs-dtv-split-name">
                                  {s.username}{isMe?" (you)":""}
                                  {e.paid_by===s.username?" ⭐":""}
                                </span>
                                <div className="gs-dtv-split-bar-wrap">
                                  <div className="gs-dtv-split-bar"
                                    style={{width:pct+"%",background:s.paid?"#22c55e":isMe?"#f59e0b":"#6366f1"}}/>
                                </div>
                                <span className="gs-dtv-split-pct">{pct}% of total</span>
                              </div>
                              <div className="gs-dtv-split-right">
                                <span className="gs-dtv-split-amt" style={{color:s.paid?"#22c55e":isMe?"#f59e0b":"rgba(255,255,255,0.7)"}}>
                                  {fmt(s.share)}
                                </span>
                                <span className={`gs-dtv-split-status ${s.paid?"gs-dtv-split-status--paid":""}`}>
                                  {s.paid?"✓ settled":"pending"}
                                </span>
                                {canSettle && (
                                  <button className="gs-dtv-settle-btn"
                                    onClick={(ev)=>{ev.stopPropagation();onSettle(e.expense_id,s.username,s.share,e.description);}}>
                                    Mark Paid
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Delete */}
                      {(isPayer || isAdmin) && (
                        confirmDel===e.expense_id ? (
                          <div className="gs-dtv-confirm-del">
                            <span>Delete this expense?</span>
                            <button className="gs-btn gs-btn--danger" style={{fontSize:11,padding:"4px 12px"}}
                              onClick={()=>{setConfirmDel(null);onDelete(e.expense_id);}}>Delete</button>
                            <button className="gs-btn gs-btn--ghost" style={{fontSize:11,padding:"4px 10px"}}
                              onClick={()=>setConfirmDel(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button className="gs-dtv-del-btn" onClick={()=>setConfirmDel(e.expense_id)}>
                            🗑 Delete Expense
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main GroupSplits Component
// ══════════════════════════════════════════════════════════════════════════════
export default function GroupSplits({ credentials, onRecordTransaction, budget, showToast, onSignIn }) {
  const { username = "", password = "" } = credentials || {};

  const [groups,          setGroups]          = useState([]);
  const [activeGroup,     setActiveGroup]     = useState(null);
  const [groupExpenses,   setGroupExpenses]   = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [view,            setView]            = useState("list");
  const [periodView,      setPeriodView]      = useState("month");
  const [selectedPeriod,  setSelectedPeriod]  = useState("");
  const [catFilter,       setCatFilter]       = useState("all");
  const [compareMode,     setCompareMode]     = useState(false);
  const [detailView,      setDetailView]      = useState(false); // NEW
  const [showExport,      setShowExport]      = useState(false); // NEW
  const [pushEnabled,     setPushEnabled]     = useState(false);
  const [pushLoading,     setPushLoading]     = useState(false);
  const [toast,           setToast]           = useState(null);

  // Modals
  const [createModal,     setCreateModal]     = useState(false);
  const [joinModal,       setJoinModal]       = useState(false);
  const [addExpModal,     setAddExpModal]     = useState(false);
  const [inviteModal,     setInviteModal]     = useState(false);
  const [addMemberModal,  setAddMemberModal]  = useState(false);
  const [removeModal,     setRemoveModal]     = useState(null);
  const [settleAllModal,  setSettleAllModal]  = useState(null);
  const [leaveModal,      setLeaveModal]      = useState(false);
  const [payAndSaveModal, setPayAndSaveModal] = useState(null);
  const [settleShareModal,  setSettleShareModal]  = useState(null); // {expenseId, forUsername, amount, expenseName}

  const wsRef              = useRef({});
  const wsRetry            = useRef({});
  const handleWsMessageRef = useRef(null);
  const loadGroupDetailRef = useRef(null);
  const pollRef            = useRef(null);
  const lastExpCountRef    = useRef(0);

  const isAuthed = username && password;

  useEffect(() => {
    if (!isAuthed) return;
    const checkPush = async () => {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (Notification.permission !== "granted") return;
      try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); setPushEnabled(!!sub); } catch {}
    };
    checkPush();
  }, [isAuthed]);

  const localToast = useCallback((msg, type = "success") => {
    if (showToast) showToast(msg, type);
    else setToast({ msg, type, id: uid() });
  }, [showToast]);

  const loadGroups = useCallback(async () => {
    if (!isAuthed) return;
    setLoading(true);
    try { const d = await apiCall("/my-groups", { username, password }); setGroups(d.groups || []); }
    catch (e) { localToast("⚠️ " + e.message, "error"); }
    finally { setLoading(false); }
  }, [username, password, isAuthed, localToast]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const handleWsMessage = useCallback((msg, gid) => {
    if (msg.type === "new_expense") {
      setGroupExpenses(prev => prev.some(e=>e.expense_id===msg.expense.expense_id) ? prev : dedupExpenses([msg.expense,...prev]));
      if (msg.expense.paid_by !== username) localToast(`🆕 ${msg.expense.paid_by} added ${fmt(msg.expense.amount)} — ${msg.expense.description}`, "info");
    }
    if (msg.type === "share_settled") {
      setGroupExpenses(prev=>prev.map(e=>{
        if(e.expense_id!==msg.expense_id) return e;
        return {...e,splits:e.splits.map(s=>s.username===msg.settled_for?{...s,paid:true}:s)};
      }));
      if (msg.settled_by !== username) localToast(`✅ ${msg.settled_by} settled ${fmt(msg.amount)} for ${msg.settled_for}`, "success");
    }
    if (msg.type === "expense_deleted") {
      setGroupExpenses(prev=>prev.filter(e=>e.expense_id!==msg.expense_id));
      if (msg.by !== username) localToast(`🗑 An expense was deleted by ${msg.by}`, "info");
    }
    if (msg.type === "member_joined" || msg.type === "member_added") {
      localToast(`👋 ${msg.username} joined the group!`, "success");
      loadGroupDetailRef.current?.(gid);
    }
    if (msg.type === "member_removed" || msg.type === "member_left") {
      localToast(`👋 ${msg.username} left the group.`, "info");
      loadGroupDetailRef.current?.(gid);
    }
  }, [username, localToast]);

  useEffect(() => { handleWsMessageRef.current = handleWsMessage; }, [handleWsMessage]);

  const loadGroupDetail = useCallback(async (groupId) => {
    if (!isAuthed) return;
    setLoading(true);
    try {
      const d = await apiCall(`/${groupId}/detail`, { username, password });
      setActiveGroup(d.group);
      setGroupExpenses(dedupExpenses(d.expenses || []));
      setView("detail");
      const ist = new Date(Date.now() + 5.5*3600000);
      const mk  = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth()+1).padStart(2,"0")}`;
      setSelectedPeriod(mk);
      setDetailView(false);
      setShowExport(false);
    } catch(e) { localToast("⚠️ " + e.message, "error"); }
    finally { setLoading(false); }
  }, [username, password, isAuthed, localToast]);

  useEffect(() => { loadGroupDetailRef.current = loadGroupDetail; }, [loadGroupDetail]);

  useEffect(() => {
    if (!activeGroup || !isAuthed) return;
    const gid = activeGroup.group_id;
    let destroyed=false, pingInterval=null, retryTimeout=null, wsConnected=false;

    const startPolling=()=>{
      if(pollRef.current) return;
      pollRef.current=setInterval(async()=>{
        if(wsConnected||destroyed){clearInterval(pollRef.current);pollRef.current=null;return;}
        try{const d=await apiCall(`/${gid}/detail`,{username,password});const incoming=dedupExpenses(d.expenses||[]);if(incoming.length!==lastExpCountRef.current){lastExpCountRef.current=incoming.length;setGroupExpenses(incoming);}}catch{}
      },8000);
    };
    const stopPolling=()=>{if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}};

    const setupWs=(ws)=>{
      const ot=setTimeout(()=>{if(!wsConnected)startPolling();},8000);
      ws.onopen=()=>{clearTimeout(ot);if(destroyed){ws.close();return;}wsConnected=true;wsRef.current[gid]=ws;wsRetry.current[gid]=0;clearTimeout(retryTimeout);stopPolling();pingInterval=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"ping"}));},25000);};
      ws.onmessage=(e)=>{try{const msg=JSON.parse(e.data);if(msg.type==="pong")return;handleWsMessageRef.current?.(msg,gid);}catch{}};
      ws.onerror=()=>clearTimeout(ot);
      ws.onclose=()=>{clearTimeout(ot);clearInterval(pingInterval);pingInterval=null;wsConnected=false;delete wsRef.current[gid];if(!destroyed){startPolling();scheduleRetry();}};
    };

    const connect=()=>{
      if(destroyed)return;
      const wsUrl=`${API_BASE.replace(/^https/,"wss").replace(/^http/,"ws")}/groups/ws/${gid}/${encodeURIComponent(username)}`;
      fetch(`${API_BASE}/health`,{method:"GET"}).then(()=>{if(destroyed)return;let ws;try{ws=new WebSocket(wsUrl);}catch{startPolling();scheduleRetry();return;}setupWs(ws);}).catch(()=>{startPolling();scheduleRetry();});
    };

    const scheduleRetry=()=>{
      if(destroyed)return;
      const attempt=(wsRetry.current[gid]||0)+1;wsRetry.current[gid]=attempt;
      const delay=Math.min(2000*Math.pow(2,attempt-1),30000);retryTimeout=setTimeout(connect,delay);
    };

    lastExpCountRef.current=groupExpenses.length;connect();

    return ()=>{
      destroyed=true;clearInterval(pingInterval);clearTimeout(retryTimeout);stopPolling();
      const ws=wsRef.current[gid];if(ws){ws.close();delete wsRef.current[gid];}delete wsRetry.current[gid];
    };
  }, [activeGroup?.group_id, isAuthed, username]);

  // ── All period keys ────────────────────────────────────────────────────────
  const allMonthKeys = useMemo(() => {
    const keys = new Set(groupExpenses.map(e => monthKey(e.timestamp)));
    return [...keys].sort((a,b)=>b.localeCompare(a));
  }, [groupExpenses]);

  const allYearKeys = useMemo(() => {
    const keys = new Set(groupExpenses.map(e => yearKey(e.timestamp)));
    return [...keys].sort((a,b)=>b.localeCompare(a));
  }, [groupExpenses]);

  useEffect(() => {
    const allPeriods = periodView==="month" ? allMonthKeys : allYearKeys;
    if (allPeriods.length && !allPeriods.includes(selectedPeriod)) {
      setSelectedPeriod(allPeriods[0]);
    }
  }, [allMonthKeys, allYearKeys, periodView, selectedPeriod]);

  const filteredExpenses = useMemo(() => {
    return groupExpenses.filter(e => {
      const pk  = periodView==="month" ? monthKey(e.timestamp) : yearKey(e.timestamp);
      const pm  = !selectedPeriod || pk===selectedPeriod;
      const cm  = catFilter==="all" || e.category===catFilter;
      return pm && cm;
    });
  }, [groupExpenses, periodView, selectedPeriod, catFilter]);

  const currentPeriodLabel = useMemo(() => {
    if (!selectedPeriod) return "";
    return periodView==="month" ? monthLabel(selectedPeriod) : selectedPeriod;
  }, [selectedPeriod, periodView]);

  const balanceSummary = useMemo(() => {
    if (!activeGroup) return { youOwe:0, othersOwe:0, settledTotal:0 };
    let youOwe=0, othersOwe=0, settledTotal=0;
    for (const e of groupExpenses) {
      for (const s of e.splits||[]) {
        if(s.username===username&&e.paid_by!==username&&!s.paid) youOwe+=s.share;
        if(e.paid_by===username&&s.username!==username&&!s.paid) othersOwe+=s.share;
        if(s.paid&&(s.username===username||e.paid_by===username)) settledTotal+=s.share;
      }
    }
    return { youOwe:Math.round(youOwe*100)/100, othersOwe:Math.round(othersOwe*100)/100, settledTotal };
  }, [groupExpenses, activeGroup, username]);

  const netBalances = useMemo(() => {
    if (!activeGroup) return {};
    const map={};
    for (const e of groupExpenses) {
      for (const s of e.splits||[]) {
        const paidBy=e.paid_by;
        if(paidBy===username&&s.username!==username&&!s.paid){if(!map[s.username])map[s.username]={youGet:0,youOwe:0};map[s.username].youGet+=s.share;}
        if(paidBy!==username&&s.username===username&&!s.paid){if(!map[paidBy])map[paidBy]={youGet:0,youOwe:0};map[paidBy].youOwe+=s.share;}
      }
    }
    const result={};
    for(const[person,{youGet,youOwe}]of Object.entries(map)){
      const net=Math.round((youGet-youOwe)*100)/100;
      result[person]={net,youGet:Math.round(youGet*100)/100,youOwe:Math.round(youOwe*100)/100};
    }
    return result;
  }, [groupExpenses, activeGroup, username]);

  const comparePeriods = useMemo(() => {
    const allPeriods = periodView==="month" ? allMonthKeys : allYearKeys;
    if (!compareMode || allPeriods.length < 2) return null;
    const [cur, prev] = allPeriods;
    const forPeriod=(pk)=>{
      const exps=groupExpenses.filter(e=>{const k=periodView==="month"?monthKey(e.timestamp):yearKey(e.timestamp);return k===pk;});
      const total=exps.reduce((s,e)=>s+e.amount,0);
      const catMap={};for(const e of exps)catMap[e.category]=(catMap[e.category]||0)+e.amount;
      return{total,count:exps.length,catMap};
    };
    return{cur:{key:cur,...forPeriod(cur)},prev:{key:prev,...forPeriod(prev)}};
  }, [compareMode, allMonthKeys, allYearKeys, groupExpenses, periodView]);

  const handleTogglePush = async () => {
    if (!isAuthed) return;
    setPushLoading(true);
    try {
      if (pushEnabled) { await unsubscribeFromPush(username,password); setPushEnabled(false); localToast("🔕 Push notifications disabled.","info"); }
      else { const result=await subscribeToPush(username,password); if(result.ok){setPushEnabled(true);localToast("🔔 Push notifications enabled!","success");}else{localToast("⚠️ "+result.reason,"error");} }
    } finally { setPushLoading(false); }
  };

  // The actual API call — called after confirmation
const doSettleShare = useCallback(async (expenseId, forUsername, amount, expenseName) => {
    try {
      const settledAt = Date.now();
      await apiCall("/settle", { username, password, group_id:activeGroup.group_id, expense_id:expenseId, settled_for_username:forUsername, amount });
      setGroupExpenses(prev=>prev.map(e=>{
        if(e.expense_id!==expenseId) return e;
        return{...e, splits:e.splits.map(s=>s.username===forUsername ? {...s, paid:true, settled_at:settledAt} : s)};
      }));
      // Credit to default account if payer is settling (they're receiving money)
      if (onRecordTransaction) {
        onRecordTransaction({
          amount,
          category: "Other",
          description: `${forUsername} paid their share — ${expenseName||"group expense"}`,
          reason: `Group: ${activeGroup.name} · Settled on ${new Date(settledAt).toLocaleDateString("en-IN", {day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Asia/Kolkata"})}`,
          type: "income",
          accountId: budget?.defaultAccountId || null,
          accountName: budget?.accounts?.find(a=>a.id===budget?.defaultAccountId)?.name || null,
          timestamp: settledAt,
        });
      }
      localToast(`✅ Settled ${fmt(amount)} for ${forUsername}${budget?.defaultAccountId ? " · credited to account" : ""}`, "success");
    } catch(err) { localToast("⚠️ "+err.message,"error"); }
  }, [activeGroup, username, password, localToast, onRecordTransaction, budget]);

  // Opens confirmation modal instead of settling directly
  const handleSettleShare = useCallback((expenseId, forUsername, amount, expenseName) => {
    setSettleShareModal({ expenseId, forUsername, amount, expenseName: expenseName || "expense" });
  }, []);

  const handleDeleteExpense = useCallback(async (expenseId) => {
    try {
      await apiCall("/delete-expense", { username, password, group_id:activeGroup.group_id, expense_id:expenseId });
      setGroupExpenses(prev=>prev.filter(e=>e.expense_id!==expenseId));
      localToast("🗑 Expense deleted.", "success");
    } catch(err) { localToast("⚠️ "+err.message,"error"); }
  }, [activeGroup, username, password, localToast]);

  // const handleSettleAll = useCallback(async (memberName, totalAmount) => {
  //   const unsettled=groupExpenses.filter(e=>e.splits?.some(s=>s.username===memberName&&!s.paid&&e.paid_by===username));
  //   for(const e of unsettled)for(const s of e.splits){if(s.username===memberName&&!s.paid){try{await handleSettleShare(e.expense_id,memberName,s.share);}catch{}}}
  //   if(onRecordTransaction)onRecordTransaction({amount:totalAmount,category:"Other",description:`${memberName} settled all dues`,reason:`Group: ${activeGroup.name} — full settlement`,type:"income",accountId:budget?.defaultAccountId||null,accountName:budget?.accounts?.find(a=>a.id===budget?.defaultAccountId)?.name||null});
  //   localToast(`✅ Settled ${fmt(totalAmount)} from ${memberName} · added to Records`,"success");
  //   setSettleAllModal(null);
  // }, [groupExpenses, username, handleSettleShare, onRecordTransaction, activeGroup, budget, localToast]);

  // NEW — settles ALL pending splits between you and memberName in BOTH directions
const handleSettleAll = useCallback(async (memberName, totalAmount) => {
  // Direction 1: expenses YOU paid, where memberName still owes you
  const youPaid = groupExpenses.filter(e =>
    e.paid_by === username &&
    e.splits?.some(s => s.username === memberName && !s.paid)
  );
  for (const e of youPaid)
    for (const s of e.splits)
      if (s.username === memberName && !s.paid)
        try { await handleSettleShare(e.expense_id, memberName, s.share); } catch {}

  // Direction 2: expenses MEMBER paid, where YOUR split is still pending
  const theyPaid = groupExpenses.filter(e =>
    e.paid_by === memberName &&
    e.splits?.some(s => s.username === username && !s.paid)
  );
  for (const e of theyPaid)
    for (const s of e.splits)
      if (s.username === username && !s.paid)
        try { await handleSettleShare(e.expense_id, username, s.share); } catch {}

  if (onRecordTransaction)
    onRecordTransaction({
      amount: totalAmount,
      category: "Other",
      description: `${memberName} settled all dues`,
      reason: `Group: ${activeGroup.name} — full settlement`,
      type: "income",
      accountId: budget?.defaultAccountId || null,
      accountName: budget?.accounts?.find(a => a.id === budget?.defaultAccountId)?.name || null,
    });

  localToast(`✅ Settled all dues with ${memberName} · added to Records`, "success");
  setSettleAllModal(null);
}, [groupExpenses, username, handleSettleShare, onRecordTransaction, activeGroup, budget, localToast]);

  const handlePayAndSave = useCallback((personName, amount) => {
    if(onRecordTransaction)onRecordTransaction({amount,category:"Other",description:`Paid ${personName} — group settlement`,reason:`Group: ${activeGroup?.name||"group"} — you paid your share`,type:"expense",accountId:budget?.defaultAccountId||null,accountName:budget?.accounts?.find(a=>a.id===budget?.defaultAccountId)?.name||null});
    const accName=budget?.accounts?.find(a=>a.id===budget?.defaultAccountId)?.name;
    localToast(`💾 ${fmt(amount)} paid to ${personName} · saved to Records${accName?` & deducted from ${accName}`:""}`, "success");
    setPayAndSaveModal(null);
  }, [onRecordTransaction, activeGroup, budget, localToast]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{GS_CSS}</style>
      <div className="gs-root">
        {!isAuthed ? (
          <GroupSignIn onSignIn={onSignIn} showToast={showToast||localToast} />
        ) : (
          <>
            {/* ── LIST VIEW ── */}
            {view === "list" && (
              <div className="gs-list-view">
                <div className="gs-list-header">
                  <div>
                    <h2 className="gs-section-title">🤝 Group Splits</h2>
                    <p className="gs-section-sub">Signed in as <strong style={{color:"#f59e0b"}}>@{username}</strong></p>
                  </div>
                  <div className="gs-header-actions">
                    <button className={`gs-push-btn ${pushEnabled?"gs-push-btn--on":""}`} onClick={handleTogglePush} disabled={pushLoading}>
                      {pushLoading?"⏳":pushEnabled?"🔔 Push ON":"🔕 Push OFF"}
                    </button>
                    <button className="gs-btn gs-btn--secondary" onClick={()=>setJoinModal(true)}>🔗 Join</button>
                    <button className="gs-btn gs-btn--primary" onClick={()=>setCreateModal(true)}>+ New Group</button>
                  </div>
                </div>

                {!pushEnabled && (
                  <div className="gs-push-banner">
                    <span>🔔</span>
                    <span>Enable <strong>Push Notifications</strong> to get notified about group expenses even when the app is closed.</span>
                    <button className="gs-push-banner-btn" onClick={handleTogglePush} disabled={pushLoading}>{pushLoading?"...":"Enable"}</button>
                  </div>
                )}

                {loading && <div className="gs-loading"><div className="gs-spinner"/><span>Loading groups…</span></div>}

                {!loading && groups.length===0 && (
                  <div className="gs-empty-state">
                    <div className="gs-empty-icon">👥</div>
                    <h3>No groups yet</h3>
                    <p>Create a group or join one via an invite link to split expenses with friends.</p>
                    <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:16}}>
                      <button className="gs-btn gs-btn--primary" onClick={()=>setCreateModal(true)}>+ Create Group</button>
                      <button className="gs-btn gs-btn--secondary" onClick={()=>setJoinModal(true)}>🔗 Join via Link</button>
                    </div>
                  </div>
                )}

                <div className="gs-group-grid">
                  {groups.map(g=><GroupCard key={g.group_id} group={g} username={username} onOpen={()=>loadGroupDetail(g.group_id)}/>)}
                </div>
              </div>
            )}

            {/* ── DETAIL VIEW ── */}
            {view==="detail" && activeGroup && (
              <div className="gs-detail-view">
                {/* Header */}
                <div className="gs-detail-header">
                  <button className="gs-back-btn" onClick={()=>{setView("list");setActiveGroup(null);setGroupExpenses([]);loadGroups();}}>← Back</button>
                  <div className="gs-detail-title-wrap">
                    <h2 className="gs-detail-title">{activeGroup.name}</h2>
                    {activeGroup.description&&<p className="gs-detail-desc">{activeGroup.description}</p>}
                  </div>
                  <div className="gs-detail-actions">
                    <button className={`gs-push-btn gs-push-btn--sm ${pushEnabled?"gs-push-btn--on":""}`} onClick={handleTogglePush} disabled={pushLoading}>
                      {pushLoading?"⏳":pushEnabled?"🔔":"🔕"}
                    </button>
                    <button className="gs-btn gs-btn--ghost" onClick={()=>setInviteModal(true)}>🔗 Invite</button>
                    {activeGroup.admin===username&&<button className="gs-btn gs-btn--ghost" onClick={()=>setAddMemberModal(true)}>+ Member</button>}
                    <button className="gs-btn gs-btn--leave" onClick={()=>setLeaveModal(true)}>🚪 Leave</button>
                    <button className="gs-btn gs-btn--primary" onClick={()=>setAddExpModal(true)}>+ Expense</button>
                  </div>
                </div>

                {/* Balance cards */}
                <div className="gs-balance-strip">
                  <div className="gs-bal-card gs-bal-card--owe"><span className="gs-bal-label">You Owe</span><span className="gs-bal-val">{fmt(balanceSummary.youOwe)}</span></div>
                  <div className="gs-bal-card gs-bal-card--owed"><span className="gs-bal-label">Others Owe You</span><span className="gs-bal-val">{fmt(balanceSummary.othersOwe)}</span></div>
                  <div className="gs-bal-card gs-bal-card--settled"><span className="gs-bal-label">Total Settled</span><span className="gs-bal-val">{fmt(balanceSummary.settledTotal)}</span></div>
                  <div className="gs-bal-card gs-bal-card--members"><span className="gs-bal-label">Members</span><span className="gs-bal-val">{activeGroup.members?.length||0}</span></div>
                </div>

                {/* Members */}
                <div className="gs-members-row">
                  {(activeGroup.members||[]).map(m=>(
                    <div key={m} className="gs-member-chip">
                      <span className="gs-member-avatar" style={{background:m===username?"#f59e0b33":"#6366f133",color:m===username?"#f59e0b":"#818cf8"}}>{m[0].toUpperCase()}</span>
                      <span className="gs-member-name">{m}{m===username?" (you)":""}{m===activeGroup.admin?" ⭐":""}</span>
                      {activeGroup.admin===username&&m!==username&&<button className="gs-member-remove" onClick={()=>setRemoveModal(m)}>✕</button>}
                    </div>
                  ))}
                </div>

                {/* Per-person balances */}
                <PersonBalances
                  netBalances={netBalances} username={username} members={activeGroup.members||[]}
                  onSettleAll={(name,amount)=>setSettleAllModal({name,amount})}
                  onPayAndSave={(name,amount)=>setPayAndSaveModal({name,amount})}
                />

                {/* ── NEW: Month/Year Nav ── */}
                <MonthYearNav
                  allMonthKeys={allMonthKeys}
                  allYearKeys={allYearKeys}
                  selectedPeriod={selectedPeriod}
                  periodView={periodView}
                  onSelect={setSelectedPeriod}
                  onPeriodViewChange={(v)=>{setPeriodView(v);setSelectedPeriod(v==="month"?allMonthKeys[0]||"":allYearKeys[0]||"");}}
                />

                {/* Category filter + view toggles */}
                <div className="gs-filters-row">
                  <select className="gs-period-sel" value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
                    <option value="all">All Categories</option>
                    {[...new Set(groupExpenses.map(e=>e.category))].map(c=><option key={c} value={c}>{CAT_ICONS[c]||"📌"} {c}</option>)}
                  </select>
                  {/* <button className={`gs-btn gs-btn--ghost ${compareMode?"gs-btn--active":""}`} onClick={()=>{setCompareMode(p=>!p);setDetailView(false);}}>📊 Compare</button> */}
                  <button className={`gs-btn gs-btn--ghost ${detailView?"gs-btn--active":""}`} onClick={()=>{setDetailView(p=>!p);setCompareMode(false);}}>📋 Detail</button>
                  <button className={`gs-btn gs-btn--ghost ${showExport?"gs-btn--active":""}`} onClick={()=>setShowExport(p=>!p)}>📤 Export</button>
                </div>

                {/* Export panel */}
                {showExport && (
                  <ExportPanel
                    expenses={filteredExpenses}
                    groupName={activeGroup.name}
                    periodLabel={currentPeriodLabel}
                    members={activeGroup.members||[]}
                    username={username}
                    onClose={()=>setShowExport(false)}
                  />
                )}

                {/* Compare view */}
                {compareMode && comparePeriods && (
                  <CompareView cur={comparePeriods.cur} prev={comparePeriods.prev} periodView={periodView}/>
                )}

                {/* Period summary */}
                {!compareMode && !detailView && selectedPeriod && (
                  <PeriodSummary expenses={filteredExpenses} periodLabel={currentPeriodLabel}/>
                )}

                {/* ── Detailed Transaction View ── */}
                {detailView ? (
                  <DetailedTransactionView
                    expenses={filteredExpenses}
                    username={username}
                    groupName={activeGroup.name}
                    periodLabel={currentPeriodLabel}
                    isAdmin={activeGroup.admin===username}
                    onSettle={handleSettleShare}
                    onDelete={handleDeleteExpense}
                  />
                ) : !compareMode && (
                  <div className="gs-expenses-list">
                    {filteredExpenses.length===0 ? (
                      <div className="gs-empty-state" style={{padding:"32px 0"}}>
                        <div className="gs-empty-icon">💸</div>
                        <p>No expenses for {currentPeriodLabel||"this period"}.</p>
                        <button className="gs-btn gs-btn--primary" style={{marginTop:12}} onClick={()=>setAddExpModal(true)}>+ Add First Expense</button>
                      </div>
                    ) : filteredExpenses.map(e=>(
                      <GroupExpenseCard
                        key={e.expense_id} expense={e} username={username}
                        isAdmin={activeGroup.admin===username}
                        onSettle={(forUser,amount,expName)=>handleSettleShare(e.expense_id,forUser,amount,expName||e.description)}
                        onDelete={()=>handleDeleteExpense(e.expense_id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Modals ── */}
            {createModal&&<CreateGroupModal username={username} password={password} onClose={()=>setCreateModal(false)} onCreated={(g)=>{setCreateModal(false);loadGroups();localToast(`✅ Group "${g.name||"group"}" created!`,"success");}}/>}
            {joinModal&&<JoinGroupModal username={username} password={password} onClose={()=>setJoinModal(false)} onJoined={()=>{setJoinModal(false);loadGroups();localToast("✅ Joined group!","success");}}/>}
            {addExpModal&&activeGroup&&(
              <AddExpenseModal username={username} password={password} group={activeGroup}
                onClose={()=>setAddExpModal(false)}
                onAdded={(exp)=>{
                  setAddExpModal(false);
                  setGroupExpenses(prev=>dedupExpenses([exp,...prev]));
                  if(onRecordTransaction){const myShare=exp.splits?.find(s=>s.username===username);if(myShare)onRecordTransaction({amount:exp.amount,category:exp.category,description:`[${activeGroup.name}] ${exp.description}`,reason:`Group split — your share: ${fmt(myShare.share)}`,type:"expense",accountId:budget?.defaultAccountId||null,accountName:budget?.accounts?.find(a=>a.id===budget?.defaultAccountId)?.name||null});}
                  localToast(`✅ Expense added to ${activeGroup.name}`,"success");
                }}
              />
            )}
            {inviteModal&&activeGroup&&<InviteModal username={username} password={password} group={activeGroup} onClose={()=>setInviteModal(false)}/>}
            {addMemberModal&&activeGroup&&<AddMemberModal username={username} password={password} groupId={activeGroup.group_id} members={activeGroup.members||[]} onClose={()=>setAddMemberModal(false)} onAdded={(mem)=>{setAddMemberModal(false);setActiveGroup(prev=>({...prev,members:[...(prev.members||[]),mem]}));localToast(`✅ ${mem} added to group`,"success");}}/>}

            {removeModal&&activeGroup&&(
              <div className="et-modal-overlay" onClick={()=>setRemoveModal(null)}>
                <div className="et-modal" onClick={e=>e.stopPropagation()}>
                  <div className="et-modal-icon">🗑️</div><h3>Remove Member?</h3><p>Remove <strong>{removeModal}</strong> from <strong>{activeGroup.name}</strong>?</p>
                  <div className="et-modal-actions">
                    <button className="et-modal-cancel" onClick={()=>setRemoveModal(null)}>Cancel</button>
                    <button className="et-modal-confirm" onClick={async()=>{try{await apiCall("/remove-member",{username,password,group_id:activeGroup.group_id,member_username:removeModal});setActiveGroup(prev=>({...prev,members:prev.members.filter(m=>m!==removeModal)}));localToast(`✅ ${removeModal} removed.`,"success");}catch(e){localToast("⚠️ "+e.message,"error");}setRemoveModal(null);}}>Remove</button>
                  </div>
                </div>
              </div>
            )}

            {/* {settleAllModal&&(
              <div className="et-modal-overlay" onClick={()=>setSettleAllModal(null)}>
                <div className="et-modal" onClick={e=>e.stopPropagation()}>
                  <div className="et-modal-icon">💰</div><h3>Settle All for {settleAllModal.name}?</h3>
                  <p>Mark <strong style={{color:"#22c55e"}}>{fmt(settleAllModal.amount)}</strong> as fully paid by <strong style={{color:"#f59e0b"}}>{settleAllModal.name}</strong>.<br/><br/>This will be recorded as <strong>income</strong> and credited to your default account.</p>
                  <div className="et-modal-actions">
                    <button className="et-modal-cancel" onClick={()=>setSettleAllModal(null)}>Cancel</button>
                    <button className="et-modal-confirm" style={{background:"linear-gradient(135deg,#22c55e,#16a34a)"}} onClick={()=>handleSettleAll(settleAllModal.name,settleAllModal.amount)}>✓ Settle All {fmt(settleAllModal.amount)}</button>
                  </div>
                </div>
              </div>
            )} */}

            {settleAllModal && (
              <div className="et-modal-overlay" onClick={() => setSettleAllModal(null)}>
                <div className="et-modal" onClick={e => e.stopPropagation()}>
                  <div className="et-modal-icon">💰</div>
                  <h3>Settle All with {settleAllModal.name}?</h3>
                  <p>
                    This will mark <strong style={{color:"#22c55e"}}>all pending splits</strong> between 
                    you and <strong style={{color:"#f59e0b"}}>{settleAllModal.name}</strong> as settled 
                    in both directions — clearing the net balance completely.
                    <br/><br/>
                    Net amount <strong style={{color:"#22c55e"}}>{fmt(settleAllModal.amount)}</strong> will 
                    be recorded as income.
                  </p>
                  <div className="et-modal-actions">
                    <button className="et-modal-cancel" onClick={() => setSettleAllModal(null)}>Cancel</button>
                    <button
                      className="et-modal-confirm"
                      style={{background: "linear-gradient(135deg,#22c55e,#16a34a)"}}
                      onClick={() => handleSettleAll(settleAllModal.name, settleAllModal.amount)}
                    >
                      ✓ Settle All {fmt(settleAllModal.amount)}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {settleShareModal && (
              <div className="et-modal-overlay" onClick={()=>setSettleShareModal(null)}>
                <div className="et-modal" onClick={e=>e.stopPropagation()}>
                  <div className="et-modal-icon">💸</div>
                  <h3>Mark as Paid?</h3>
                  <p>
                    Confirm that <strong style={{color:"#f59e0b"}}>{settleShareModal.forUsername}</strong> has paid their share of{" "}
                    <strong style={{color:"#22c55e"}}>{fmt(settleShareModal.amount)}</strong> for{" "}
                    <strong style={{color:"#e4e4f0"}}>"{settleShareModal.expenseName}"</strong>.
                    {budget?.defaultAccountId && (
                      <><br/><br/>
                      <span style={{color:"rgba(255,255,255,0.45)"}}>
                        {fmt(settleShareModal.amount)} will be credited to{" "}
                        <strong style={{color:"#3b82f6"}}>{budget.accounts?.find(a=>a.id===budget.defaultAccountId)?.name || "your default account"}</strong> and logged in Records with today's date.
                      </span></>
                    )}
                    {!budget?.defaultAccountId && (
                      <><br/><br/><span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>💡 Add a default account in 💳 Accounts to auto-credit settlements.</span></>
                    )}
                  </p>
                  <div className="et-modal-actions">
                    <button className="et-modal-cancel" onClick={()=>setSettleShareModal(null)}>Cancel</button>
                    <button
                      className="et-modal-confirm"
                      style={{background:"linear-gradient(135deg,#22c55e,#16a34a)"}}
                      onClick={()=>{
                        doSettleShare(settleShareModal.expenseId, settleShareModal.forUsername, settleShareModal.amount, settleShareModal.expenseName);
                        setSettleShareModal(null);
                      }}
                    >
                      ✓ Confirm Settled {fmt(settleShareModal.amount)}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {payAndSaveModal&&(
              <div className="et-modal-overlay" onClick={()=>setPayAndSaveModal(null)}>
                <div className="et-modal" onClick={e=>e.stopPropagation()}>
                  <div className="et-modal-icon">💾</div><h3>Pay &amp; Save</h3>
                  <p>Record that you paid <strong style={{color:"#ef4444"}}>{fmt(payAndSaveModal.amount)}</strong> to <strong style={{color:"#f59e0b"}}>{payAndSaveModal.name}</strong>.<br/><br/>This will be logged as an <strong>expense</strong> in your Records{budget?.defaultAccountId?<> and <strong style={{color:"#ef4444"}}>{fmt(payAndSaveModal.amount)}</strong> will be deducted from your <strong style={{color:"#3b82f6"}}>{budget.accounts?.find(a=>a.id===budget.defaultAccountId)?.name||"default"}</strong> account.</>:". Add an account in the 💳 Accounts tab to also auto-deduct."}</p>
                  <div className="et-modal-actions">
                    <button className="et-modal-cancel" onClick={()=>setPayAndSaveModal(null)}>Cancel</button>
                    <button className="et-modal-confirm" style={{background:"linear-gradient(135deg,#ef4444,#dc2626)"}} onClick={()=>handlePayAndSave(payAndSaveModal.name,payAndSaveModal.amount)}>💾 Confirm &amp; Save</button>
                  </div>
                </div>
              </div>
            )}

            {leaveModal&&activeGroup&&(
              <div className="et-modal-overlay" onClick={()=>setLeaveModal(false)}>
                <div className="et-modal" onClick={e=>e.stopPropagation()}>
                  <div className="et-modal-icon">🚪</div><h3>Leave Group?</h3>
                  <p>You will be removed from <strong style={{color:"#f59e0b"}}>{activeGroup.name}</strong>.<br/><br/>
                  {activeGroup.admin===username?(activeGroup.members?.length>1?<>You are the <strong style={{color:"#f59e0b"}}>admin</strong>. Admin will be transferred to <strong style={{color:"#818cf8"}}>{activeGroup.members.find(m=>m!==username)}</strong> automatically.</>:<>You are the only member. Leaving will <strong style={{color:"#ef4444"}}>permanently delete</strong> this group and all its expenses.</>):<>Your past expenses will remain. You can rejoin using an invite link.</>}</p>
                  <div className="et-modal-actions">
                    <button className="et-modal-cancel" onClick={()=>setLeaveModal(false)}>Cancel</button>
                    <button className="et-modal-confirm" style={{background:"linear-gradient(135deg,#ef4444,#dc2626)"}} onClick={async()=>{try{await apiCall(`/${activeGroup.group_id}/leave`,{username,password});setLeaveModal(false);setView("list");setActiveGroup(null);setGroupExpenses([]);loadGroups();localToast(`✅ Left "${activeGroup.name}"`,"success");}catch(e){localToast("⚠️ "+e.message,"error");setLeaveModal(false);}}}>🚪 Leave Group</button>
                  </div>
                </div>
              </div>
            )}

            {!showToast&&toast&&(
              <div className="et-toast" style={{borderColor:toast.type==="success"?"#22c55e44":"#f59e0b44",background:toast.type==="success"?"#22c55e12":"#f59e0b12"}}>
                <span style={{color:toast.type==="success"?"#22c55e":"#f59e0b"}}>{toast.type==="success"?"✓":"⚠️"}</span>
                <span>{toast.msg}</span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Sub-components (unchanged from original)
// ══════════════════════════════════════════════════════════════════════════════

function GroupCard({ group, username, onOpen }) {
  return (
    <div className="gs-group-card" onClick={onOpen}>
      <div className="gs-gc-top">
        <div className="gs-gc-avatar">{group.name[0].toUpperCase()}</div>
        <div className="gs-gc-info">
          <span className="gs-gc-name">{group.name}</span>
          <span className="gs-gc-meta">{group.members?.length||"?"} members · {group.expense_count||0} expenses</span>
          {group.admin===username&&<span className="gs-gc-admin">⭐ Admin</span>}
        </div>
        <span className="gs-gc-arrow">›</span>
      </div>
      {group.description&&<p className="gs-gc-desc">{group.description}</p>}
      <div className="gs-gc-balances">
        {group.you_owe>0&&<span className="gs-gc-badge gs-gc-badge--owe">You owe {fmt(group.you_owe)}</span>}
        {group.others_owe>0&&<span className="gs-gc-badge gs-gc-badge--owed">Owed {fmt(group.others_owe)}</span>}
        {group.you_owe===0&&group.others_owe===0&&<span className="gs-gc-badge gs-gc-badge--clear">✓ All settled</span>}
      </div>
    </div>
  );
}

function PersonBalances({ netBalances, username, members, onSettleAll, onPayAndSave }) {
  const entries    = Object.entries(netBalances).filter(([,d])=>d.net!==0||d.youGet>0||d.youOwe>0);
  if (entries.length===0) return null;
  const theyOweYou = entries.filter(([,d])=>d.net>0);
  const youOweThem = entries.filter(([,d])=>d.net<0);
  const settled    = entries.filter(([,d])=>d.net===0&&(d.youGet>0||d.youOwe>0));
  return (
    <div className="gs-person-balances">
      {theyOweYou.length>0&&(<>
        <p className="gs-subsection-label">💰 Who Owes You (Net)</p>
        <div className="gs-person-grid">
          {theyOweYou.map(([person,data])=>(
            <div key={person} className="gs-person-card">
              <span className="gs-person-avatar">{person[0].toUpperCase()}</span>
              <div className="gs-person-info"><span className="gs-person-name">{person}</span><span className="gs-person-detail">They owe ₹{data.youGet} · You owe ₹{data.youOwe} · Net: +₹{data.net}</span></div>
              <div className="gs-person-right"><span className="gs-person-net gs-person-net--due">{fmt(data.net)} due</span><button className="gs-settle-all-btn" onClick={()=>onSettleAll&&onSettleAll(person,data.net)}>✓ Settle All</button></div>
            </div>
          ))}
        </div>
      </>)}
      {youOweThem.length>0&&(<>
        <p className="gs-subsection-label" style={{marginTop:theyOweYou.length>0?10:0}}>🔴 You Owe (Net)</p>
        <div className="gs-person-grid">
          {youOweThem.map(([person,data])=>(
            <div key={person} className="gs-person-card gs-person-card--you-owe">
              <span className="gs-person-avatar" style={{background:"#ef444422",color:"#ef4444"}}>{person[0].toUpperCase()}</span>
              <div className="gs-person-info"><span className="gs-person-name">{person}</span><span className="gs-person-detail">They owe ₹{data.youGet} · You owe ₹{data.youOwe} · Net: -₹{Math.abs(data.net)}</span></div>
              <div className="gs-person-right"><span className="gs-person-net gs-person-net--you-owe">{fmt(Math.abs(data.net))}</span><button className="gs-pay-save-btn" onClick={()=>onPayAndSave&&onPayAndSave(person,Math.abs(data.net))}>💾 Pay &amp; Save</button></div>
            </div>
          ))}
        </div>
      </>)}
      {settled.length>0&&(<>
        <p className="gs-subsection-label" style={{marginTop:10}}>✅ All Settled</p>
        <div className="gs-person-grid">
          {settled.map(([person])=>(
            <div key={person} className="gs-person-card gs-person-card--clear">
              <span className="gs-person-avatar" style={{background:"#22c55e22",color:"#22c55e"}}>{person[0].toUpperCase()}</span>
              <div className="gs-person-info"><span className="gs-person-name">{person}</span></div>
              <span className="gs-person-net gs-person-net--clear">✓ Cleared</span>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

function PeriodSummary({ expenses, periodLabel }) {
  const total=expenses.reduce((s,e)=>s+e.amount,0);
  const bycat={};for(const e of expenses) bycat[e.category]=(bycat[e.category]||0)+e.amount;
  const topCat=Object.entries(bycat).sort((a,b)=>b[1]-a[1])[0];
  if(expenses.length===0) return null;
  return (
    <div className="gs-period-summary">
      <div className="gs-ps-item"><span className="gs-ps-label">{periodLabel}</span><span className="gs-ps-val">{fmt(total)}</span></div>
      <div className="gs-ps-div"/>
      <div className="gs-ps-item"><span className="gs-ps-label">Transactions</span><span className="gs-ps-val">{expenses.length}</span></div>
      {topCat&&(<><div className="gs-ps-div"/><div className="gs-ps-item"><span className="gs-ps-label">Top Category</span><span className="gs-ps-val" style={{fontSize:13}}>{CAT_ICONS[topCat[0]]||"📌"} {topCat[0]}</span></div></>)}
    </div>
  );
}

function CompareView({ cur, prev, periodView }) {
  const diff=cur.total-prev.total, pct=prev.total>0?Math.round(Math.abs(diff)/prev.total*100):0;
  const allCats=[...new Set([...Object.keys(cur.catMap),...Object.keys(prev.catMap)])];
  return (
    <div className="gs-compare-wrap">
      <p className="gs-subsection-label">📊 Period Comparison</p>
      <div className="gs-cmp-top">
        <div className="gs-cmp-col"><span className="gs-cmp-period">{periodView==="month"?monthLabel(cur.key):cur.key}</span><span className="gs-cmp-total" style={{color:"#ef4444"}}>{fmt(cur.total)}</span><span className="gs-cmp-txns">{cur.count} transactions</span></div>
        <div className="gs-cmp-arrow"><span style={{color:diff>0?"#ef4444":"#22c55e"}}>{diff>0?"▲":"▼"} {pct}%</span></div>
        <div className="gs-cmp-col"><span className="gs-cmp-period">{periodView==="month"?monthLabel(prev.key):prev.key}</span><span className="gs-cmp-total" style={{color:"#6b7280"}}>{fmt(prev.total)}</span><span className="gs-cmp-txns">{prev.count} transactions</span></div>
      </div>
      {allCats.map(cat=>{const cv=cur.catMap[cat]||0,pv=prev.catMap[cat]||0,max=Math.max(cv,pv,1);return(
        <div key={cat} className="gs-cmp-cat-row">
          <span className="gs-cmp-cat-icon">{CAT_ICONS[cat]||"📌"}</span>
          <span className="gs-cmp-cat-name">{cat}</span>
          <div className="gs-cmp-bars">
            <div className="gs-cmp-bar-row"><div className="gs-cmp-bar gs-cmp-bar--cur" style={{width:Math.round(cv/max*100)+"%",background:CAT_COLORS[cat]||"#6b7280"}}/><span className="gs-cmp-bar-val" style={{color:CAT_COLORS[cat]}}>{fmt(cv)}</span></div>
            <div className="gs-cmp-bar-row"><div className="gs-cmp-bar gs-cmp-bar--prev" style={{width:Math.round(pv/max*100)+"%"}}/><span className="gs-cmp-bar-val" style={{color:"rgba(255,255,255,0.3)"}}>{fmt(pv)}</span></div>
          </div>
        </div>
      );})}
    </div>
  );
}

function GroupExpenseCard({ expense, username, isAdmin, onSettle, onDelete }) {
  const [expanded,setExpanded]=useState(false);
  const [confirmDel,setConfirmDel]=useState(false);
  const myShare=expense.splits?.find(s=>s.username===username);
  const settled=expense.splits?.every(s=>s.paid);
  const isPayer=expense.paid_by===username;
  const color=CAT_COLORS[expense.category]||"#6b7280";
  return (
    <div className={`gs-exp-card ${settled?"gs-exp-card--settled":""}`}>
      <div className="gs-exp-card-top" onClick={()=>setExpanded(p=>!p)}>
        <div className="gs-exp-icon" style={{background:color+"22",color}}>{CAT_ICONS[expense.category]||"📌"}</div>
        <div className="gs-exp-info">
          <span className="gs-exp-desc">{expense.description}</span>
          <span className="gs-exp-meta">{expense.category} · paid by <strong style={{color:isPayer?"#f59e0b":"#818cf8"}}>{isPayer?"you":expense.paid_by}</strong>{expense.reason&&<span> · {expense.reason}</span>}</span>
          <span className="gs-exp-date">{dateIN(expense.timestamp)} {timeIN(expense.timestamp)}</span>
        </div>
        <div className="gs-exp-right">
          <span className="gs-exp-total" style={{color}}>{fmt(expense.amount)}</span>
          {myShare&&<span className={`gs-exp-myshare ${myShare.paid||isPayer?"gs-exp-myshare--paid":""}`}>your share: {myShare.paid||isPayer?"✓ ":""}{fmt(myShare.share)}</span>}
          {settled&&<span className="gs-settled-badge">✓ Settled</span>}
        </div>
        <span className="gs-exp-chevron">{expanded?"▾":"▸"}</span>
      </div>
      {expanded&&(
        <div className="gs-exp-splits">
          <p className="gs-splits-label">Splits</p>
          {(expense.splits||[]).map((s,i)=>{
            const isMe=s.username===username,canSettle=isPayer&&!s.paid&&s.username!==username;
            return(
              <div key={`${expense.expense_id}-${s.username}-${i}`} className={`gs-split-row ${s.paid?"gs-split-row--paid":""}`}>
                <span className="gs-split-avatar" style={{background:isMe?"#f59e0b22":"#6366f122",color:isMe?"#f59e0b":"#818cf8"}}>{s.username[0].toUpperCase()}</span>
                <span className="gs-split-name">{s.username}{isMe?" (you)":""}</span>
                <span className="gs-split-share" style={{color:s.paid?"#22c55e":"rgba(255,255,255,0.6)"}}>{fmt(s.share)} {s.paid?"✓":""}</span>
                {canSettle&&<button className="gs-settle-btn" onClick={()=>onSettle(s.username,s.share,expense.description)}>Mark Paid</button>}
              </div>
            );
          })}
          {(isPayer||isAdmin)&&!confirmDel&&<button className="gs-del-exp-btn" onClick={()=>setConfirmDel(true)}>🗑 Delete Expense</button>}
          {confirmDel&&<div className="gs-confirm-del"><span>Delete this expense?</span><button className="gs-btn gs-btn--danger" onClick={()=>{setConfirmDel(false);onDelete();}}>Delete</button><button className="gs-btn gs-btn--ghost" onClick={()=>setConfirmDel(false)}>Cancel</button></div>}
        </div>
      )}
    </div>
  );
}

// ── Modals (CreateGroupModal, JoinGroupModal, InviteModal, AddMemberModal, AddExpenseModal — unchanged) ──

function CreateGroupModal({ username, password, onClose, onCreated }) {
  const [name,setName]=useState(""),desc=useState(""),curr=useState("INR"),loading=useState(false),err=useState("");
  const [d,setDesc]=desc,[c,setCurr]=curr,[l,setLoading]=loading,[e,setErr]=err;
  const handleCreate=async()=>{if(!name.trim()){setErr("Enter a group name.");return;}setLoading(true);setErr("");try{const res=await apiCall("/create",{username,password,group_name:name.trim(),description:d.trim(),currency:c});onCreated({...res,name:name.trim()});}catch(ex){setErr(ex.message);}finally{setLoading(false);}};
  return(
    <div className="et-modal-overlay" onClick={onClose}><div className="et-modal gs-modal" onClick={ev=>ev.stopPropagation()}>
      <div className="et-modal-icon">👥</div><h3>Create Group</h3>
      <div className="et-cloud-field"><label>Group Name *</label><input className="et-cloud-input" value={name} onChange={ev=>{setName(ev.target.value);setErr("");}} onKeyDown={ev=>ev.key==="Enter"&&handleCreate()} placeholder="e.g. Mess, Office Lunch, Trip to Goa…" autoFocus/></div>
      <div className="et-cloud-field"><label>Description</label><input className="et-cloud-input" value={d} onChange={ev=>setDesc(ev.target.value)} placeholder="Optional…"/></div>
      <div className="et-cloud-field"><label>Currency</label><select className="et-cloud-input" value={c} onChange={ev=>setCurr(ev.target.value)} style={{cursor:"pointer"}}><option value="INR">₹ INR (Indian Rupee)</option><option value="USD">$ USD</option><option value="EUR">€ EUR</option></select></div>
      {e&&<div className="et-cloud-error">⚠️ {e}</div>}
      <div className="et-modal-actions"><button className="et-modal-cancel" onClick={onClose}>Cancel</button><button className="et-modal-confirm" style={{background:"linear-gradient(135deg,#6366f1,#a855f7)"}} onClick={handleCreate} disabled={l}>{l?"Creating…":"✓ Create Group"}</button></div>
    </div></div>
  );
}

function JoinGroupModal({ username, password, onClose, onJoined }) {
  const [token,setToken]=useState(""),loading=useState(false),err=useState("");
  const [l,setLoading]=loading,[e,setErr]=err;
  const handleJoin=async()=>{const t=token.trim().split("/").pop();if(!t){setErr("Enter invite link or token.");return;}setLoading(true);setErr("");try{await apiCall("/join",{username,password,invite_token:t});onJoined();}catch(ex){setErr(ex.message);}finally{setLoading(false);}};
  return(
    <div className="et-modal-overlay" onClick={onClose}><div className="et-modal gs-modal" onClick={ev=>ev.stopPropagation()}>
      <div className="et-modal-icon">🔗</div><h3>Join Group</h3>
      <p style={{fontSize:12,color:"rgba(255,255,255,0.4)",textAlign:"center"}}>Paste the invite link or token shared by the group admin.</p>
      <div className="et-cloud-field"><label>Invite Link or Token</label><input className="et-cloud-input" value={token} onChange={ev=>{setToken(ev.target.value);setErr("");}} onKeyDown={ev=>ev.key==="Enter"&&handleJoin()} placeholder="Paste invite link here…" autoFocus/></div>
      {e&&<div className="et-cloud-error">⚠️ {e}</div>}
      <div className="et-modal-actions"><button className="et-modal-cancel" onClick={onClose}>Cancel</button><button className="et-modal-confirm" style={{background:"linear-gradient(135deg,#22c55e,#16a34a)"}} onClick={handleJoin} disabled={l}>{l?"Joining…":"🔗 Join Group"}</button></div>
    </div></div>
  );
}

function InviteModal({ username, password, group, onClose }) {
  const [token,setToken]=useState(""),loading=useState(false),copied=useState(false);
  const [l,setLoading]=loading,[cp,setCopied]=copied;
  useEffect(()=>{const load=async()=>{setLoading(true);try{const d=await apiCall(`/${group.group_id}/invite`,{username,password});setToken(d.invite_token);}catch{}finally{setLoading(false);}};load();},[group.group_id,username,password]);
  const inviteLink=token?`${window.location.origin}${window.location.pathname}?join=${token}`:"";
  const handleCopy=()=>{if(inviteLink){navigator.clipboard.writeText(inviteLink);setCopied(true);setTimeout(()=>setCopied(false),2000);}};
  return(
    <div className="et-modal-overlay" onClick={onClose}><div className="et-modal gs-modal" onClick={ev=>ev.stopPropagation()}>
      <div className="et-modal-icon">🔗</div><h3>Invite to {group.name}</h3>
      <p style={{fontSize:12,color:"rgba(255,255,255,0.4)",textAlign:"center"}}>Share this link for others to join.</p>
      {l?<div className="gs-loading"><div className="gs-spinner"/><span>Loading…</span></div>:(
        <><div className="gs-invite-box"><span className="gs-invite-token">{inviteLink||"Loading…"}</span><button className="gs-copy-btn" onClick={handleCopy}>{cp?"✓ Copied!":"📋 Copy"}</button></div>
        <p style={{fontSize:10,color:"rgba(255,255,255,0.25)",textAlign:"center",marginTop:8}}>Or share token only: <strong style={{color:"#f59e0b",fontFamily:"monospace"}}>{token}</strong></p></>
      )}
      <div className="et-modal-actions"><button className="et-modal-cancel" onClick={onClose}>Done</button></div>
    </div></div>
  );
}

function AddMemberModal({ username, password, groupId, members=[], onClose, onAdded }) {
  const [mem,setMem]=useState(""),loading=useState(false),err=useState("");
  const [l,setLoading]=loading,[e,setErr]=err;
  const handleAdd=async()=>{const m=mem.trim().toLowerCase();if(!m){setErr("Enter a username.");return;}if(m===username.toLowerCase()){setErr("That's you — you're already in the group.");return;}if(members.map(x=>x.toLowerCase()).includes(m)){setErr(`@${m} is already a member of this group.`);return;}setLoading(true);setErr("");try{await apiCall("/add-member",{username,password,group_id:groupId,member_username:m});onAdded(m);}catch(ex){const msg=ex.message?.toLowerCase()||"";if(msg.includes("already")||msg.includes("exist")||msg.includes("member")){setErr(`@${m} is already a member of this group.`);}else{setErr(ex.message);}}finally{setLoading(false);}};
  return(
    <div className="et-modal-overlay" onClick={onClose}><div className="et-modal gs-modal" onClick={ev=>ev.stopPropagation()}>
      <div className="et-modal-icon">➕</div><h3>Add Member</h3>
      <div className="et-cloud-field"><label>Username</label><input className="et-cloud-input" value={mem} onChange={ev=>{setMem(ev.target.value);setErr("");}} onKeyDown={ev=>ev.key==="Enter"&&handleAdd()} placeholder="e.g. ravi_123" autoFocus/><span style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:4,display:"block"}}>User must have saved expenses to cloud at least once.</span></div>
      {members.length>0&&(<div style={{marginBottom:4}}><p style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(255,255,255,0.25)",marginBottom:6}}>Current Members ({members.length})</p><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{members.map(m=><span key={m} style={{fontSize:10,padding:"2px 9px",borderRadius:20,background:m===username?"rgba(245,158,11,0.12)":"rgba(99,102,241,0.1)",border:`1px solid ${m===username?"rgba(245,158,11,0.28)":"rgba(99,102,241,0.22)"}`,color:m===username?"#f59e0b":"#818cf8",fontWeight:600}}>{m}{m===username?" (you)":""}</span>)}</div></div>)}
      {e&&<div className="et-cloud-error">⚠️ {e}</div>}
      <div className="et-modal-actions"><button className="et-modal-cancel" onClick={onClose}>Cancel</button><button className="et-modal-confirm" style={{background:l?"#333":"linear-gradient(135deg,#6366f1,#a855f7)"}} onClick={handleAdd} disabled={l||!mem.trim()}>{l?"Adding…":"+ Add Member"}</button></div>
    </div></div>
  );
}

function AddExpenseModal({ username, password, group, onClose, onAdded }) {
  const members=group.members||[];
  const [amount,setAmount]=useState(""),cat=useState("Food"),desc=useState(""),reason=useState(""),splitMode=useState("equal"),shares=useState(()=>Object.fromEntries(members.map(m=>[m,""]))),loading=useState(false),err=useState("");
  const [c,setCat]=cat,[d,setDesc]=desc,[r,setReason]=reason,[sm,setSplitMode]=splitMode,[sh,setShares]=shares,[l,setLoading]=loading,[e,setErr]=err;
  const equalShare=amount&&members.length?(parseFloat(amount)/members.length).toFixed(2):"";
  const handleAdd=async()=>{const amt=parseFloat(amount);if(!amt||amt<=0){setErr("Enter a valid amount.");return;}if(!d.trim()){setErr("Enter a description.");return;}let splits=null;if(sm==="custom"){const total=Object.values(sh).reduce((s,v)=>s+(parseFloat(v)||0),0);if(Math.abs(total-amt)>0.05){setErr(`Shares total (${fmt(total)}) must equal ${fmt(amt)}.`);return;}splits=members.map(m=>({username:m,share:parseFloat(sh[m])||0,paid:m===username}));}setLoading(true);setErr("");try{const res=await apiCall("/add-expense",{username,password,group_id:group.group_id,amount:amt,category:c,description:d.trim(),reason:r.trim(),timestamp:Date.now(),splits});onAdded(res.expense);}catch(ex){setErr(ex.message);}finally{setLoading(false);}};
  const sharesTotal=Object.values(sh).reduce((s,v)=>s+(parseFloat(v)||0),0);
  return(
    <div className="et-modal-overlay" onClick={onClose}><div className="et-modal gs-modal gs-exp-modal" onClick={ev=>ev.stopPropagation()} style={{maxWidth:440}}>
      <div className="et-modal-icon">💸</div><h3>Add Group Expense</h3>
      <p style={{fontSize:11,color:"rgba(255,255,255,0.3)",textAlign:"center",marginBottom:14}}>in <strong style={{color:"#f59e0b"}}>{group.name}</strong> · {members.length} members</p>
      <div className="gs-exp-form">
        <div className="gs-form-row">
          <div className="et-cloud-field" style={{flex:1}}><label>Amount (₹) *</label><input className="et-cloud-input" type="number" value={amount} onChange={ev=>{setAmount(ev.target.value);setErr("");}} placeholder="e.g. 900" autoFocus/></div>
          <div className="et-cloud-field" style={{flex:1}}><label>Category</label><select className="et-cloud-input" value={c} onChange={ev=>setCat(ev.target.value)} style={{cursor:"pointer"}}>{CATEGORIES.map(cat=><option key={cat} value={cat}>{CAT_ICONS[cat]} {cat}</option>)}</select></div>
        </div>
        <div className="et-cloud-field"><label>Description *</label><input className="et-cloud-input" value={d} onChange={ev=>{setDesc(ev.target.value);setErr("");}} placeholder="e.g. Fish, Pizza, Auto to office…"/></div>
        <div className="et-cloud-field"><label>Reason (optional)</label><input className="et-cloud-input" value={r} onChange={ev=>setReason(ev.target.value)} placeholder="Optional note…"/></div>
        <div className="et-cloud-field"><label>Split Method</label><div className="gs-split-mode-toggle"><button className={`gs-split-mode-btn ${sm==="equal"?"gs-split-mode-btn--active":""}`} onClick={()=>setSplitMode("equal")}>⚖️ Equal Split</button><button className={`gs-split-mode-btn ${sm==="custom"?"gs-split-mode-btn--active":""}`} onClick={()=>setSplitMode("custom")}>✏️ Custom Split</button></div></div>
        {sm==="equal"&&amount&&members.length>0&&(<div className="gs-equal-preview"><div className="gs-splits-label-row"><p className="gs-splits-label">Each person pays {fmt(equalShare)}</p><span className="gs-splits-count">{members.length} members</span></div><div className="gs-equal-members gs-equal-members--scroll">{members.map(m=><div key={m} className="gs-equal-member"><span className="gs-split-avatar" style={{background:m===username?"#f59e0b22":"#6366f122",color:m===username?"#f59e0b":"#818cf8"}}>{m[0].toUpperCase()}</span><span>{m}{m===username?" (you)":""}</span><span style={{marginLeft:"auto",color:"#6b7280",fontFamily:"monospace"}}>{fmt(equalShare)}</span></div>)}</div></div>)}
        {sm==="custom"&&(<div className="gs-custom-splits"><div className="gs-splits-label-row"><p className="gs-splits-label">Custom splits</p><span className="gs-splits-count">{fmt(sharesTotal)} / {fmt(amount||0)}</span></div><div className="gs-custom-members--scroll">{members.map(m=><div key={m} className="gs-custom-split-row"><span className="gs-split-avatar" style={{background:m===username?"#f59e0b22":"#6366f122",color:m===username?"#f59e0b":"#818cf8"}}>{m[0].toUpperCase()}</span><span style={{flex:1,fontSize:12}}>{m}{m===username?" (you)":""}</span><input className="gs-share-input" type="number" value={sh[m]} onChange={ev=>{setShares(p=>({...p,[m]:ev.target.value}));setErr("");}} placeholder="₹0"/></div>)}</div>{amount&&Math.abs(sharesTotal-parseFloat(amount))>0.05&&<p style={{fontSize:10,color:"#f59e0b",marginTop:4}}>Remaining: {fmt(Math.max(0,parseFloat(amount)-sharesTotal))}</p>}</div>)}
      </div>
      {e&&<div className="et-cloud-error">⚠️ {e}</div>}
      <div className="et-modal-actions" style={{marginTop:14}}><button className="et-modal-cancel" onClick={onClose} disabled={l}>Cancel</button><button className="et-modal-confirm" style={{background:l?"#333":"linear-gradient(135deg,#f59e0b,#ef4444)"}} onClick={handleAdd} disabled={l||!amount||!d.trim()}>{l?"Adding…":"💸 Add Expense"}</button></div>
    </div></div>
  );
}

function GroupSignIn({ onSignIn, showToast }) {
  const [step,setStep]=useState("username"),username=useState(""),password=useState(""),userExists=useState(null),loading=useState(false),showPw=useState(false),err=useState("");
  const [u,setU]=username,[p,setP]=password,[ue,setUE]=userExists,[l,setL]=loading,[sp,setSP]=showPw,[e,setE]=err;
  const API_BASE_LOCAL="https://pdf-qna-backend.onrender.com";
  const handleUsernameNext=async()=>{const un=u.trim().toLowerCase();if(un.length<2){setE("Min 2 characters.");return;}setE("");setL(true);try{const res=await fetch(`${API_BASE_LOCAL}/expenses/check-user`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:un})});const d=await res.json();setUE(d.exists);setStep("password");}catch{setE("Could not reach server. Try again.");}finally{setL(false);}};
  const handleSignIn=async()=>{if(p.length<4){setE("Min 4 characters.");return;}setE("");setL(true);try{const res=await fetch(`${API_BASE_LOCAL}/expenses/sync`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u.trim().toLowerCase(),password:p})});const d=await res.json();if(!res.ok)throw new Error(d.detail||"Invalid credentials.");if(onSignIn)onSignIn({username:u.trim().toLowerCase(),password:p,syncResult:{expenses:d.expenses||[],count:d.count||0,budget:d.budget||null,has_budget:d.has_budget||false}});}catch(ex){setE(ex.message);}finally{setL(false);}};
  const hk=(ev,fn)=>{if(ev.key==="Enter")fn();};
  return(
    <div className="gs-signin-wrap"><div className="gs-signin-card">
      <div className="gs-signin-icon">🤝</div><h3 className="gs-signin-title">Group Splits</h3>
      <p className="gs-signin-sub">Sign in with your cloud account to create and manage shared expense groups.</p>
      {step==="username"&&(<><div className="et-cloud-field"><label>Username</label><input className="et-cloud-input" type="text" value={u} onChange={ev=>{setU(ev.target.value);setE("");}} onKeyDown={ev=>hk(ev,handleUsernameNext)} placeholder="Your cloud username" autoFocus autoComplete="username"/></div>{e&&<div className="et-cloud-error">⚠️ {e}</div>}<button className="gs-signin-btn" onClick={handleUsernameNext} disabled={l||!u.trim()}>{l?"Checking…":"Continue →"}</button></>)}
      {step==="password"&&(<><div className="gs-signin-user-badge"><span className="et-cloud-avatar">{u[0]?.toUpperCase()}</span><span>@{u}</span><button className="et-cloud-change-user" onClick={()=>{setStep("username");setP("");setE("");setUE(null);}}>✎</button></div>{ue===false&&<div className="et-cloud-notice" style={{borderColor:"#f59e0b44",background:"#f59e0b0d",marginBottom:10}}>🆕 <strong>New account</strong> — will be created on first save.</div>}{ue===true&&<div className="et-cloud-notice" style={{borderColor:"#3b82f644",background:"#3b82f60d",marginBottom:10}}>👤 <strong>Welcome back!</strong> Enter your password.</div>}<div className="et-cloud-field"><label>{ue===false?"Create password":"Password"}</label><div className="et-api-input-wrap"><input className="et-api-input" type={sp?"text":"password"} value={p} onChange={ev=>{setP(ev.target.value);setE("");}} onKeyDown={ev=>hk(ev,handleSignIn)} placeholder={ue===false?"Min 4 chars":"Enter password"} autoFocus autoComplete={ue===false?"new-password":"current-password"}/><button className="et-api-toggle" onClick={()=>setSP(s=>!s)}>{sp?<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}</button></div></div>{e&&<div className="et-cloud-error">⚠️ {e}</div>}<button className="gs-signin-btn" onClick={handleSignIn} disabled={l||!p} style={{background:l?"#333":"linear-gradient(135deg,#6366f1,#a855f7)"}}>{l?"Signing in…":ue===false?"🚀 Create & Sign In":"🔓 Sign In"}</button></>)}
      <p className="gs-signin-hint">💡 You can also sign in by using the <strong>☁️ Save</strong> or <strong>🔄 Sync</strong> buttons in the top bar.</p>
    </div></div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── CSS
// ══════════════════════════════════════════════════════════════════════════════
const GS_CSS = `
.gs-root{display:flex;flex-direction:column;height:100%;min-height:0;overflow-y:auto;padding:14px 16px;gap:14px;}
.gs-root::-webkit-scrollbar{width:3px;}.gs-root::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:4px;}
.gs-list-view{display:flex;flex-direction:column;gap:14px;}
.gs-list-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.gs-section-title{font-size:17px;font-weight:800;color:#fff;margin:0;}
.gs-section-sub{font-size:11px;color:rgba(255,255,255,0.35);margin:3px 0 0;}
.gs-header-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}

/* Push buttons */
.gs-push-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:20px;border:1px solid rgba(99,102,241,0.3);background:rgba(99,102,241,0.08);color:rgba(255,255,255,0.5);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}
.gs-push-btn:hover:not(:disabled){background:rgba(99,102,241,0.18);color:#fff;}.gs-push-btn--on{border-color:rgba(34,197,94,0.4);background:rgba(34,197,94,0.1);color:#22c55e;}.gs-push-btn--on:hover:not(:disabled){background:rgba(34,197,94,0.2);}.gs-push-btn--sm{padding:5px 9px;font-size:14px;}.gs-push-btn:disabled{opacity:0.4;cursor:not-allowed;}
.gs-push-banner{display:flex;align-items:center;gap:10px;padding:11px 14px;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.2);border-radius:10px;font-size:12px;color:rgba(255,255,255,0.6);flex-wrap:wrap;}
.gs-push-banner span:first-child{font-size:18px;flex-shrink:0;}.gs-push-banner span:nth-child(2){flex:1;line-height:1.5;}
.gs-push-banner-btn{padding:5px 13px;border-radius:8px;border:1px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.15);color:#818cf8;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;flex-shrink:0;white-space:nowrap;}.gs-push-banner-btn:hover:not(:disabled){background:rgba(99,102,241,0.28);}.gs-push-banner-btn:disabled{opacity:0.4;cursor:not-allowed;}

/* ── Month/Year Navigator ── */
.gs-myn-root{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;}
.gs-myn-mode-row{display:flex;gap:6px;}
.gs-myn-mode-btn{flex:1;padding:6px;border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:rgba(255,255,255,0.4);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;text-align:center;}
.gs-myn-mode-btn--active{background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.4);color:#f59e0b;}
.gs-myn-year-nav{display:flex;align-items:center;justify-content:center;gap:16px;}
.gs-myn-nav-btn{width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);font-size:16px;font-weight:700;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;justify-content:center;}
.gs-myn-nav-btn:hover:not(:disabled){background:rgba(245,158,11,0.18);border-color:rgba(245,158,11,0.4);color:#f59e0b;}
.gs-myn-nav-btn:disabled{opacity:0.25;cursor:not-allowed;}
.gs-myn-year-label{font-size:15px;font-weight:800;color:#fff;min-width:50px;text-align:center;}
.gs-myn-month-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;}
.gs-myn-month-btn{position:relative;padding:7px 4px;border-radius:9px;border:1px solid rgba(255,255,255,0.07);background:transparent;color:rgba(255,255,255,0.25);font-size:11px;font-weight:700;cursor:not-allowed;font-family:inherit;transition:all 0.15s;text-align:center;}
.gs-myn-month-btn--has-data{color:rgba(255,255,255,0.65);border-color:rgba(255,255,255,0.12);cursor:pointer;background:rgba(255,255,255,0.03);}
.gs-myn-month-btn--has-data:hover{background:rgba(245,158,11,0.1);border-color:rgba(245,158,11,0.35);color:#f59e0b;}
.gs-myn-month-btn--active{background:rgba(245,158,11,0.18)!important;border-color:rgba(245,158,11,0.6)!important;color:#f59e0b!important;box-shadow:0 2px 10px rgba(245,158,11,0.2);}
.gs-myn-month-btn--empty{opacity:0.3;}
.gs-myn-dot{position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:#f59e0b;}
.gs-myn-year-grid{display:flex;flex-wrap:wrap;gap:7px;}
.gs-myn-year-chip{padding:7px 18px;border-radius:20px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.6);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;}
.gs-myn-year-chip:hover{background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.4);color:#f59e0b;}
.gs-myn-year-chip--active{background:rgba(245,158,11,0.18);border-color:rgba(245,158,11,0.5);color:#f59e0b;box-shadow:0 2px 10px rgba(245,158,11,0.2);}

/* ── Export Panel ── */
.gs-export-panel{background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;animation:et-slide-down 0.2s ease;}
.gs-export-header{display:flex;align-items:center;justify-content:space-between;}
.gs-export-title{font-size:13px;font-weight:800;color:#22c55e;}
.gs-export-close{background:none;border:none;color:rgba(255,255,255,0.3);font-size:16px;cursor:pointer;line-height:1;padding:2px 5px;border-radius:4px;transition:color 0.15s;}.gs-export-close:hover{color:#fff;}
.gs-export-desc{font-size:12px;color:rgba(255,255,255,0.5);line-height:1.5;}
.gs-export-sheets-info{display:flex;flex-direction:column;gap:5px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:10px 12px;}
.gs-export-sheet-row{display:flex;align-items:flex-start;gap:7px;font-size:11px;color:rgba(255,255,255,0.5);line-height:1.5;}
.gs-export-sheet-row span:first-child{flex-shrink:0;}
.gs-export-btns{display:flex;gap:9px;}
.gs-export-btn{flex:1;padding:11px;border-radius:10px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;}
.gs-export-btn:disabled{opacity:0.4;cursor:not-allowed;}
.gs-export-btn--excel{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;}.gs-export-btn--excel:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 14px rgba(34,197,94,0.35);}
.gs-export-btn--pdf{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;}.gs-export-btn--pdf:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 14px rgba(239,68,68,0.35);}

/* ── Detailed Transaction View ── */
.gs-dtv-root{display:flex;flex-direction:column;gap:10px;}
.gs-dtv-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;}
.gs-dtv-header-left{display:flex;flex-direction:column;gap:2px;}.gs-dtv-title{font-size:13px;font-weight:800;color:#fff;}.gs-dtv-sub{font-size:11px;color:rgba(255,255,255,0.35);}
.gs-dtv-header-right{display:flex;gap:16px;}
.gs-dtv-stat{display:flex;flex-direction:column;align-items:flex-end;gap:2px;}.gs-dtv-stat-val{font-size:16px;font-weight:800;color:#fff;font-family:'JetBrains Mono',monospace;}.gs-dtv-stat-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:rgba(255,255,255,0.3);}
.gs-dtv-empty{text-align:center;color:rgba(255,255,255,0.3);font-size:13px;padding:32px 0;}

.gs-dtv-day-group{display:flex;flex-direction:column;gap:6px;}
.gs-dtv-day-header{display:flex;align-items:center;gap:10px;padding:7px 12px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:9px;}
.gs-dtv-day-date{font-size:12px;font-weight:800;color:#f59e0b;font-family:'JetBrains Mono',monospace;}
.gs-dtv-day-count{flex:1;font-size:11px;color:rgba(255,255,255,0.4);}
.gs-dtv-day-total{font-size:12px;font-weight:700;color:#f59e0b;font-family:'JetBrains Mono',monospace;}

.gs-dtv-exp{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden;transition:border-color 0.15s;}
.gs-dtv-exp:hover{border-color:rgba(255,255,255,0.12);}
.gs-dtv-exp--settled{opacity:0.6;}
.gs-dtv-exp-main{display:flex;align-items:flex-start;gap:10px;padding:11px 12px;cursor:pointer;}
.gs-dtv-exp-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}
.gs-dtv-exp-info{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0;}
.gs-dtv-exp-desc{font-size:13px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.gs-dtv-exp-meta{font-size:10px;color:rgba(255,255,255,0.4);display:flex;align-items:center;gap:4px;flex-wrap:wrap;}
.gs-dtv-dot{color:rgba(255,255,255,0.2);}
.gs-dtv-exp-time{font-size:9px;color:rgba(255,255,255,0.2);}
.gs-dtv-exp-right{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;}
.gs-dtv-exp-amt{font-size:15px;font-weight:800;font-family:'JetBrains Mono',monospace;}
.gs-dtv-my-share{font-size:10px;color:rgba(255,255,255,0.35);font-family:'JetBrains Mono',monospace;}
.gs-dtv-my-share--paid{color:#22c55e;}
.gs-dtv-pending-badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);color:#f87171;}
.gs-dtv-settled-badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.22);color:#22c55e;}
.gs-dtv-chevron{font-size:13px;flex-shrink:0;margin-top:2px;color:rgba(255,255,255,0.2);}

.gs-dtv-splits{border-top:1px solid rgba(255,255,255,0.06);padding:12px 12px 10px;}
.gs-dtv-splits-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.gs-dtv-splits-label{font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.25);}
.gs-dtv-splits-total{font-size:10px;color:rgba(255,255,255,0.35);font-family:'JetBrains Mono',monospace;}
.gs-dtv-splits-grid{display:flex;flex-direction:column;gap:7px;margin-bottom:10px;}
.gs-dtv-split-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);transition:background 0.12s;}
.gs-dtv-split-item:hover{background:rgba(255,255,255,0.04);}
.gs-dtv-split-item--paid{opacity:0.6;}
.gs-dtv-split-item--me{background:rgba(245,158,11,0.04);border-color:rgba(245,158,11,0.12);}
.gs-dtv-split-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;}
.gs-dtv-split-info{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0;}
.gs-dtv-split-name{font-size:12px;font-weight:600;color:rgba(255,255,255,0.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.gs-dtv-split-bar-wrap{height:4px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden;}
.gs-dtv-split-bar{height:100%;border-radius:2px;transition:width 0.4s ease;}
.gs-dtv-split-pct{font-size:9px;color:rgba(255,255,255,0.25);font-family:'JetBrains Mono',monospace;}
.gs-dtv-split-right{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;}
.gs-dtv-split-amt{font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;}
.gs-dtv-split-status{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.25);}
.gs-dtv-split-status--paid{color:#22c55e;}
.gs-dtv-settle-btn{padding:4px 10px;border-radius:8px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.1);color:#22c55e;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}
.gs-dtv-settle-btn:hover{background:rgba(34,197,94,0.22);}
.gs-dtv-del-btn{align-self:flex-start;padding:5px 11px;border-radius:8px;border:1px solid rgba(239,68,68,0.22);background:transparent;color:rgba(239,68,68,0.5);font-size:11px;cursor:pointer;font-family:inherit;transition:all 0.15s;}
.gs-dtv-del-btn:hover{background:rgba(239,68,68,0.1);color:#ef4444;}
.gs-dtv-confirm-del{display:flex;align-items:center;gap:8px;padding:8px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:8px;font-size:12px;color:rgba(255,255,255,0.6);}

/* Buttons */
.gs-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:20px;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}
.gs-btn--primary{background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;}.gs-btn--primary:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(99,102,241,0.35);}
.gs-btn--secondary{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);}.gs-btn--secondary:hover{background:rgba(255,255,255,0.1);color:#fff;}
.gs-btn--ghost{background:transparent;border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.5);}.gs-btn--ghost:hover{background:rgba(255,255,255,0.06);color:#fff;}
.gs-btn--ghost.gs-btn--active{background:rgba(245,158,11,0.1);border-color:rgba(245,158,11,0.35);color:#f59e0b;}
.gs-btn--danger{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;}.gs-btn--danger:hover{transform:translateY(-1px);}
.gs-btn--leave{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.28);color:#f87171;}.gs-btn--leave:hover{background:rgba(239,68,68,0.18);color:#ef4444;transform:translateY(-1px);}

/* Loading */
.gs-loading{display:flex;align-items:center;justify-content:center;gap:10px;padding:32px;color:rgba(255,255,255,0.4);font-size:13px;}
.gs-spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,0.1);border-top-color:rgba(245,158,11,0.8);border-radius:50%;animation:gs-spin 0.7s linear infinite;}
@keyframes gs-spin{to{transform:rotate(360deg)}}

/* Empty state */
.gs-empty-state{display:flex;flex-direction:column;align-items:center;gap:8px;padding:48px 24px;text-align:center;color:rgba(255,255,255,0.4);}
.gs-empty-state h3{font-size:16px;color:rgba(255,255,255,0.7);margin:0;}.gs-empty-state p{font-size:13px;line-height:1.6;margin:0;}
.gs-empty-icon{font-size:40px;line-height:1;}

/* Group cards */
.gs-group-grid{display:flex;flex-direction:column;gap:10px;}
.gs-group-card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px;cursor:pointer;transition:all 0.15s;}
.gs-group-card:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.14);transform:translateY(-1px);}
.gs-gc-top{display:flex;align-items:center;gap:10px;}
.gs-gc-avatar{width:42px;height:42px;border-radius:13px;background:linear-gradient(135deg,#6366f1,#a855f7);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;flex-shrink:0;}
.gs-gc-info{flex:1;display:flex;flex-direction:column;gap:3px;}.gs-gc-name{font-size:15px;font-weight:700;color:#fff;}.gs-gc-meta{font-size:11px;color:rgba(255,255,255,0.35);}
.gs-gc-admin{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);padding:2px 6px;border-radius:20px;width:fit-content;}
.gs-gc-arrow{font-size:18px;color:rgba(255,255,255,0.2);}
.gs-gc-desc{font-size:11px;color:rgba(255,255,255,0.3);margin:7px 0 0;font-style:italic;}
.gs-gc-balances{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;}
.gs-gc-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;}
.gs-gc-badge--owe{background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);color:#ef4444;}
.gs-gc-badge--owed{background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);color:#22c55e;}
.gs-gc-badge--clear{background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);color:rgba(34,197,94,0.7);}

/* Detail view */
.gs-detail-view{display:flex;flex-direction:column;gap:14px;}
.gs-detail-header{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;}
.gs-back-btn{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:6px 13px;color:rgba(255,255,255,0.6);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;flex-shrink:0;white-space:nowrap;}.gs-back-btn:hover{color:#fff;background:rgba(255,255,255,0.09);}
.gs-detail-title-wrap{flex:1;}.gs-detail-title{font-size:17px;font-weight:800;color:#fff;margin:0;}.gs-detail-desc{font-size:11px;color:rgba(255,255,255,0.3);margin:3px 0 0;}
.gs-detail-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}

/* Balance strip */
.gs-balance-strip{display:flex;gap:8px;flex-wrap:wrap;}
.gs-bal-card{flex:1;min-width:80px;border-radius:12px;padding:10px 13px;display:flex;flex-direction:column;gap:4px;}
.gs-bal-card--owe{background:rgba(239,68,68,0.09);border:1px solid rgba(239,68,68,0.2);}
.gs-bal-card--owed{background:rgba(34,197,94,0.09);border:1px solid rgba(34,197,94,0.2);}
.gs-bal-card--settled{background:rgba(59,130,246,0.09);border:1px solid rgba(59,130,246,0.2);}
.gs-bal-card--members{background:rgba(245,158,11,0.09);border:1px solid rgba(245,158,11,0.2);}
.gs-bal-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);}
.gs-bal-val{font-size:15px;font-weight:800;color:#fff;font-family:'JetBrains Mono',monospace;}

/* Members */
.gs-members-row{display:flex;flex-wrap:wrap;gap:6px;}
.gs-member-chip{display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-radius:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);}
.gs-member-avatar{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;}
.gs-member-name{font-size:11px;color:rgba(255,255,255,0.6);}
.gs-member-remove{background:none;border:none;color:rgba(239,68,68,0.4);cursor:pointer;font-size:11px;padding:1px 3px;border-radius:4px;line-height:1;transition:color 0.15s;}.gs-member-remove:hover{color:#ef4444;}

/* Person balances */
.gs-person-balances{display:flex;flex-direction:column;gap:8px;}
.gs-subsection-label{font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.25);}
.gs-person-grid{display:flex;flex-direction:column;gap:6px;}
.gs-person-card{display:flex;align-items:center;gap:9px;padding:9px 12px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:10px;}
.gs-person-card--clear{background:rgba(34,197,94,0.06);border-color:rgba(34,197,94,0.15);}
.gs-person-card--you-owe{background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);}
.gs-person-avatar{width:32px;height:32px;border-radius:50%;background:rgba(245,158,11,0.15);color:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;}
.gs-person-info{flex:1;display:flex;flex-direction:column;gap:2px;}.gs-person-name{font-size:13px;font-weight:700;color:#fff;}.gs-person-detail{font-size:10px;color:rgba(255,255,255,0.35);font-family:'JetBrains Mono',monospace;}
.gs-person-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
.gs-person-net{font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;}.gs-person-net--due{color:#f59e0b;}.gs-person-net--clear{color:#22c55e;}.gs-person-net--you-owe{color:#ef4444;font-size:14px;font-weight:800;font-family:'JetBrains Mono',monospace;}
.gs-settle-all-btn{padding:4px 11px;border-radius:8px;border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.1);color:#22c55e;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}
.gs-settle-all-btn:hover:not(:disabled){background:rgba(34,197,94,0.22);transform:translateY(-1px);}
.gs-pay-save-btn{padding:4px 11px;border-radius:8px;border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.1);color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}
.gs-pay-save-btn:hover{background:rgba(239,68,68,0.22);color:#ef4444;transform:translateY(-1px);}

/* Filters + period */
.gs-filters-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.gs-period-sel{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:5px 12px;color:var(--text,#e4e4f0);font-size:11px;font-weight:600;font-family:inherit;outline:none;cursor:pointer;appearance:none;-webkit-appearance:none;}
.gs-period-sel option{background:#1a1a2e;color:#fff;}
.gs-period-summary{display:flex;align-items:center;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px 14px;gap:0;flex-wrap:wrap;}
.gs-ps-item{flex:1;display:flex;flex-direction:column;gap:3px;align-items:center;min-width:80px;}
.gs-ps-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.3);}
.gs-ps-val{font-size:16px;font-weight:800;color:#fff;font-family:'JetBrains Mono',monospace;text-align:center;}
.gs-ps-div{width:1px;background:rgba(255,255,255,0.07);height:34px;flex-shrink:0;margin:0 6px;}

/* Compare */
.gs-compare-wrap{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px;}
.gs-cmp-top{display:flex;align-items:center;gap:14px;justify-content:space-between;}
.gs-cmp-col{display:flex;flex-direction:column;gap:3px;}.gs-cmp-period{font-size:10px;color:rgba(255,255,255,0.4);}.gs-cmp-total{font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace;}.gs-cmp-txns{font-size:10px;color:rgba(255,255,255,0.3);}
.gs-cmp-arrow{font-size:13px;font-weight:700;text-align:center;}
.gs-cmp-cat-row{display:flex;align-items:center;gap:8px;}.gs-cmp-cat-icon{font-size:15px;flex-shrink:0;}.gs-cmp-cat-name{font-size:11px;color:rgba(255,255,255,0.5);width:76px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.gs-cmp-bars{flex:1;display:flex;flex-direction:column;gap:3px;}
.gs-cmp-bar-row{display:flex;align-items:center;gap:6px;}
.gs-cmp-bar{height:6px;border-radius:3px;min-width:3px;transition:width 0.5s ease;}.gs-cmp-bar--prev{background:rgba(255,255,255,0.15);}
.gs-cmp-bar-val{font-size:10px;font-family:'JetBrains Mono',monospace;white-space:nowrap;}

/* Expense cards */
.gs-expenses-list{display:flex;flex-direction:column;gap:8px;}
.gs-exp-card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden;transition:background 0.15s;}
.gs-exp-card--settled{opacity:0.6;}
.gs-exp-card-top{display:flex;align-items:flex-start;gap:10px;padding:12px;cursor:pointer;}.gs-exp-card-top:hover{background:rgba(255,255,255,0.02);}
.gs-exp-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}
.gs-exp-info{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0;}.gs-exp-desc{font-size:13px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.gs-exp-meta{font-size:10px;color:rgba(255,255,255,0.4);}.gs-exp-date{font-size:9px;color:rgba(255,255,255,0.25);}
.gs-exp-right{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;}
.gs-exp-total{font-size:15px;font-weight:800;font-family:'JetBrains Mono',monospace;}
.gs-exp-myshare{font-size:10px;color:rgba(255,255,255,0.35);font-family:'JetBrains Mono',monospace;}.gs-exp-myshare--paid{color:#22c55e;}
.gs-settled-badge{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#22c55e;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.22);padding:2px 7px;border-radius:20px;}
.gs-exp-chevron{font-size:13px;flex-shrink:0;margin-top:2px;color:rgba(255,255,255,0.2);}
.gs-exp-splits{border-top:1px solid rgba(255,255,255,0.06);padding:12px;display:flex;flex-direction:column;gap:7px;}
.gs-splits-label{font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.25);}
.gs-split-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;transition:background 0.12s;}.gs-split-row:hover{background:rgba(255,255,255,0.03);}
.gs-split-row--paid{opacity:0.55;}
.gs-split-avatar{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;}
.gs-split-name{flex:1;font-size:12px;color:rgba(255,255,255,0.7);}
.gs-split-share{font-size:12px;font-family:'JetBrains Mono',monospace;font-weight:700;}
.gs-settle-btn{padding:4px 10px;border-radius:8px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.1);color:#22c55e;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;}.gs-settle-btn:hover{background:rgba(34,197,94,0.22);}
.gs-del-exp-btn{align-self:flex-start;padding:5px 11px;border-radius:8px;border:1px solid rgba(239,68,68,0.22);background:transparent;color:rgba(239,68,68,0.5);font-size:11px;cursor:pointer;font-family:inherit;transition:all 0.15s;margin-top:4px;}.gs-del-exp-btn:hover{background:rgba(239,68,68,0.1);color:#ef4444;}
.gs-confirm-del{display:flex;align-items:center;gap:8px;padding:8px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:8px;font-size:12px;color:rgba(255,255,255,0.6);}

/* Modal helpers */
.gs-modal{max-width:400px!important;text-align:left;}
.gs-exp-modal{max-width:440px!important;max-height:90dvh;overflow-y:auto;}
.gs-exp-modal::-webkit-scrollbar{width:3px;}.gs-exp-modal::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
.gs-exp-form{display:flex;flex-direction:column;gap:10px;}
.gs-form-row{display:flex;gap:10px;}.gs-form-row .et-cloud-field{flex:1;}
.gs-split-mode-toggle{display:flex;gap:6px;}
.gs-split-mode-btn{flex:1;padding:7px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:rgba(255,255,255,0.4);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;text-align:center;}
.gs-split-mode-btn--active{background:rgba(245,158,11,0.1);border-color:rgba(245,158,11,0.35);color:#f59e0b;}
.gs-equal-preview,.gs-custom-splits{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:10px;display:flex;flex-direction:column;gap:7px;}
.gs-splits-label-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.gs-splits-count{font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:20px;white-space:nowrap;flex-shrink:0;}
.gs-equal-members{display:flex;flex-direction:column;gap:5px;}
.gs-equal-members--scroll,.gs-custom-members--scroll{max-height:160px;overflow-y:auto;padding-right:4px;}
.gs-equal-members--scroll::-webkit-scrollbar,.gs-custom-members--scroll::-webkit-scrollbar{width:3px;}
.gs-equal-members--scroll::-webkit-scrollbar-thumb,.gs-custom-members--scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px;}
.gs-equal-member{display:flex;align-items:center;gap:7px;font-size:12px;color:rgba(255,255,255,0.6);padding:3px 2px;border-radius:6px;}.gs-equal-member:hover{background:rgba(255,255,255,0.03);}
.gs-custom-members--scroll{display:flex;flex-direction:column;gap:6px;}
.gs-custom-split-row{display:flex;align-items:center;gap:8px;}
.gs-share-input{width:80px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:6px 9px;color:#fff;font-size:12px;font-family:monospace;outline:none;text-align:right;}.gs-share-input:focus{border-color:rgba(245,158,11,0.4);}

/* Invite */
.gs-invite-box{display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:9px;}
.gs-invite-token{flex:1;font-size:10px;color:rgba(255,255,255,0.5);font-family:'JetBrains Mono',monospace;word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.gs-copy-btn{padding:5px 11px;border-radius:8px;border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.1);color:#f59e0b;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}.gs-copy-btn:hover{background:rgba(245,158,11,0.22);}

/* Sign in */
.gs-signin-wrap{display:flex;align-items:center;justify-content:center;min-height:100%;padding:24px;}
.gs-signin-card{width:100%;max-width:360px;display:flex;flex-direction:column;gap:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:28px 24px;}
.gs-signin-icon{font-size:36px;text-align:center;line-height:1;}
.gs-signin-title{font-size:20px;font-weight:800;color:#fff;text-align:center;margin:0;}
.gs-signin-sub{font-size:12px;color:rgba(255,255,255,0.4);text-align:center;line-height:1.6;margin:0;}
.gs-signin-btn{width:100%;padding:11px;border-radius:10px;border:none;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;margin-top:4px;}
.gs-signin-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 16px rgba(245,158,11,0.3);}.gs-signin-btn:disabled{opacity:0.4;cursor:not-allowed;transform:none;}
.gs-signin-user-badge{display:flex;align-items:center;gap:9px;padding:8px 11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:9px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);}
.gs-signin-hint{font-size:10px;color:rgba(255,255,255,0.2);text-align:center;line-height:1.6;margin-top:4px;}

@media(max-width:600px){
  .gs-balance-strip{gap:6px;}.gs-bal-card{min-width:70px;padding:8px 10px;}.gs-bal-val{font-size:13px;}
  .gs-detail-header{flex-direction:column;}.gs-detail-actions{width:100%;justify-content:flex-end;}
  .gs-header-actions{width:100%;}.gs-form-row{flex-direction:column;}
  .gs-cmp-top{flex-direction:column;text-align:center;}.gs-cmp-arrow{transform:rotate(90deg);}
  .gs-filters-row{gap:5px;}.gs-push-banner{gap:7px;}
  .gs-person-card{flex-wrap:wrap;}.gs-person-right{width:100%;flex-direction:row;justify-content:space-between;align-items:center;}
  .gs-myn-month-grid{grid-template-columns:repeat(4,1fr);}
  .gs-export-btns{flex-direction:column;}
  .gs-dtv-exp-main{flex-wrap:wrap;}.gs-dtv-exp-right{width:100%;flex-direction:row;align-items:center;justify-content:space-between;}
}
`;