import React, { useState, useRef, useCallback } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
const LS_KEY = "importedExpenses";

const DEFAULT_CATEGORIES = [
  "Food","Transport","Shopping","Bills","Health","Entertainment",
  "Education","Travel","Rent","Salary","Other"
];

// ── Category mapper ────────────────────────────────────────────────────────
// const CAT_MAP = {
//   breakfast:"Food", lunch:"Food", dinner:"Food", snack:"Food",
//   beverage:"Food", "fast food":"Food", groceries:"Food", food:"Food",
//   restaurant:"Food", cafe:"Food", coffee:"Food",
//   transit:"Transport", transport:"Transport", rides:"Transport",
//   cab:"Transport", auto:"Transport", fuel:"Transport", petrol:"Transport",
//   shopping:"Shopping", clothing:"Shopping", fashion:"Shopping", accessories:"Shopping",
//   bills:"Bills", utilities:"Bills", electricity:"Bills", water:"Bills",
//   internet:"Bills", phone:"Bills", recharge:"Bills", subscription:"Bills",
//   health:"Health", medical:"Health", pharmacy:"Health", fitness:"Health",
//   gym:"Health", doctor:"Health",
//   entertainment:"Entertainment", movies:"Entertainment", games:"Entertainment",
//   sports:"Entertainment", music:"Entertainment",
//   education:"Education", books:"Education", courses:"Education", stationery:"Education",
//   travel:"Travel", hotel:"Travel", flight:"Travel", trip:"Travel",
//   rent:"Rent", housing:"Rent", maintenance:"Rent",
//   salary:"Salary", income:"Salary", "balance correction":"Other",
// };

function mapCategory(raw) {
  if (!raw) return "Other";
  const lower = raw.toLowerCase().trim();
  if (CAT_MAP[lower]) return CAT_MAP[lower];
  for (const [k, v] of Object.entries(CAT_MAP)) {
    if (lower.includes(k) || k.includes(lower)) return v;
  }
  const direct = DEFAULT_CATEGORIES.find(c => c.toLowerCase() === lower);
  if (direct) return direct;
  return "Other";
}

// ── ID + helpers ───────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const shortAmount = (num) => {
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return (num/1_000_000).toFixed(2).replace(/\.00$/,"") + "M";
  if (abs >= 1_000)     return (num/1_000).toFixed(2).replace(/\.00$/,"") + "k";
  return String(num);
};

// ── Normalise account name for comparison ─────────────────────────────────
const normAcc = (name) => (name || "").toLowerCase().trim();

// ── localStorage helpers ──────────────────────────────────────────────────
function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function lsSave(items) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
    return true;
  } catch (e) {
    // Storage quota exceeded or unavailable
    console.error("localStorage save failed:", e);
    return false;
  }
}

// ── Parse Cashew CSV row ───────────────────────────────────────────────────
function parseCashewRow(row, accounts = []) {
  const rawAmount = parseFloat(row["amount"] || row["Amount"] || 0);
  if (!rawAmount || isNaN(rawAmount)) return null;

  const isIncome = row["income"] === "true" || row["income"] === true || rawAmount > 0;
  const amount = Math.abs(rawAmount);

  const dateStr = row["date"] || row["Date"] || "";
  const ts = dateStr ? new Date(dateStr).getTime() : Date.now();
  if (isNaN(ts)) return null;

  const catRaw = row["category name"] || row["category"] || row["Category"] || "";
  const category = catRaw.trim() || "Other";
  const description = (row["title"] || row["Title"] || row["description"] || catRaw || "Import").slice(0, 80);
  const reason = (row["note"] || row["Note"] || row["reason"] || "").slice(0, 100);
  const accountName = (row["account"] || row["Account"] || "").trim();

  const matchedAcc = accounts.find(a => normAcc(a.name) === normAcc(accountName));

  return {
    id: uid(), amount, category, description, reason,
    type: isIncome ? "income" : "expense",
    timestamp: ts,
    provider: "import", model: "csv-import",
    accountId: matchedAcc?.id || null,
    accountName: matchedAcc?.name || accountName || null,
  };
}

// ── Parse generic CSV / Excel row ──────────────────────────────────────────
function parseGenericRow(row, accounts = []) {
  const amountKeys = ["amount","Amount","AMOUNT","sum","Sum","value","Value","debit","credit","Debit","Credit"];
  let rawAmount = 0;
  for (const k of amountKeys) {
    if (row[k] !== undefined && row[k] !== "") {
      rawAmount = parseFloat(String(row[k]).replace(/[₹,\s]/g, ""));
      if (!isNaN(rawAmount)) break;
    }
  }
  if (!rawAmount || isNaN(rawAmount)) return null;

  const typeKeys = ["type","Type","income","Income","transaction type","Transaction Type"];
  let isIncome = rawAmount > 0;
  for (const k of typeKeys) {
    const v = String(row[k] || "").toLowerCase();
    if (v === "income" || v === "credit" || v === "true") { isIncome = true; break; }
    if (v === "expense" || v === "debit" || v === "false") { isIncome = false; break; }
  }

  const amount = Math.abs(rawAmount);

  const dateKeys = ["date","Date","DATE","timestamp","Timestamp","datetime","DateTime"];
  let ts = Date.now();
  for (const k of dateKeys) {
    if (row[k]) {
      const d = new Date(row[k]);
      if (!isNaN(d.getTime())) { ts = d.getTime(); break; }
    }
  }

  const catKeys = ["category","Category","CATEGORY","category name","Category Name","cat"];
  let catRaw = "";
  for (const k of catKeys) { if (row[k]) { catRaw = row[k]; break; } }
  const category = catRaw.trim() || "Other";

  const descKeys = ["description","Description","title","Title","name","Name","item","Item","memo","Memo","narration","Narration","particulars","Particulars"];
  let description = catRaw;
  for (const k of descKeys) { if (row[k]) { description = row[k]; break; } }
  description = (description || "Import").slice(0, 80);

  const noteKeys = ["note","Note","reason","Reason","remarks","Remarks","comment","Comment"];
  let reason = "";
  for (const k of noteKeys) { if (row[k]) { reason = row[k]; break; } }

  const accKeys = ["account","Account","bank","Bank","wallet","Wallet","source","Source"];
  let accountName = "";
  for (const k of accKeys) { if (row[k]) { accountName = String(row[k]).trim(); break; } }

  const matchedAcc = accounts.find(a => normAcc(a.name) === normAcc(accountName));

  return {
    id: uid(), amount, category,
    description: description.slice(0, 80),
    reason: reason.slice(0, 100),
    type: isIncome ? "income" : "expense",
    timestamp: ts,
    provider: "import", model: "generic-import",
    accountId: matchedAcc?.id || null,
    accountName: matchedAcc?.name || accountName || null,
  };
}

// ── Detect Cashew vs generic ───────────────────────────────────────────────
function detectFormat(headers) {
  const h = headers.map(x => String(x).toLowerCase());
  if (h.includes("category name") && h.includes("income") && h.includes("account")) return "cashew";
  return "generic";
}

// ── CSV parser ─────────────────────────────────────────────────────────────
function parseCSVText(text) {
  const lines = [];
  let inQuote = false, cur = "", row = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      row.push(cur); cur = "";
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = "";
      lines.push(row); row = [];
    } else {
      cur += ch;
    }
  }
  if (cur || row.length) { row.push(cur); lines.push(row); }
  if (!lines.length) return [];
  const headers = lines[0].map(h => h.trim());
  return lines.slice(1)
    .filter(r => r.some(c => c.trim()))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()])));
}

// ── PDF.js lazy loader ────────────────────────────────────────────────────
function loadPDFJS() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(script);
  });
}

// ── Extract text from PDF file ────────────────────────────────────────────
async function extractPDFText(file) {
  const pdfjsLib = await loadPDFJS();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }
  return fullText;
}

// ── PDF text → expense rows ───────────────────────────────────────────────
function parsePDFTextToRows(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const rows = [];
  const amountRe = /[₹]?\s*(\d[\d,]*\.?\d*)/;
  const dateRe = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i;

  for (const line of lines) {
    const dateMatch = line.match(dateRe);
    const amountMatch = line.match(amountRe);
    if (!dateMatch || !amountMatch) continue;

    const rawAmount = parseFloat(amountMatch[1].replace(/,/g, ""));
    if (!rawAmount || isNaN(rawAmount)) continue;

    const ts = new Date(dateMatch[1]).getTime();
    if (isNaN(ts)) continue;

    const desc = line
      .replace(dateMatch[0], "")
      .replace(amountMatch[0], "")
      .replace(/[₹]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "PDF Import";

    const lower = line.toLowerCase();
    const isIncome = lower.includes("credit") || lower.includes("received") || lower.includes("salary") || lower.includes("refund");

    rows.push({
      id: uid(), amount: rawAmount,
      category: desc.trim() || "Other", description: desc,
      reason: "Imported from PDF",
      type: isIncome ? "income" : "expense",
      timestamp: ts,
      provider: "import", model: "pdf-import",
      accountId: null, accountName: null,
    });
  }
  return rows;
}

// ── Extract distinct accounts from items ───────────────────────────────────
function extractAccountsFromItems(items) {
  const map = {};
  for (const item of items) {
    const raw = (item.accountName || "").trim();
    if (!raw) continue;
    const key = normAcc(raw);
    if (!map[key]) map[key] = { displayName: raw, income: 0, expense: 0 };
    if (item.type === "income") map[key].income += item.amount;
    else                        map[key].expense += item.amount;
  }
  return Object.entries(map).map(([key, v]) => ({
    normName: key,
    displayName: v.displayName,
    netBalance: Math.max(0, v.income - v.expense),
    income: v.income,
    expense: v.expense,
  }));
}

// ── Account type heuristic ─────────────────────────────────────────────────
function guessAccType(name) {
  const lower = name.toLowerCase();
  if (lower.includes("wallet") || lower.includes("paytm") || lower.includes("gpay") || lower.includes("phonepe")) return "wallet";
  if (lower.includes("cash"))   return "cash";
  if (lower.includes("card") || lower.includes("credit") || lower.includes("debit")) return "card";
  return "bank";
}

const ACC_TYPE_META = {
  bank:   { icon:"🏦", color:"#3b82f6" },
  wallet: { icon:"👛", color:"#f59e0b" },
  cash:   { icon:"💵", color:"#22c55e" },
  card:   { icon:"💳", color:"#a855f7" },
  other:  { icon:"📦", color:"#6b7280" },
};

function currentMonthKey() {
  const ist = new Date(Date.now() + 5.5 * 3600000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── SheetJS lazy loader ───────────────────────────────────────────────────
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

// ── Deduplicate against existing localStorage records ─────────────────────
function deduplicateItems(incoming, existing) {
  const existingIds = new Set(existing.map(e => e.id));
  // Also fingerprint by timestamp+amount+description to catch re-imports
  const fingerprints = new Set(
    existing.map(e => `${e.timestamp}|${e.amount}|${e.description}`)
  );
  const fresh = [];
  let dupes = 0;
  for (const item of incoming) {
    const fp = `${item.timestamp}|${item.amount}|${item.description}`;
    if (existingIds.has(item.id) || fingerprints.has(fp)) { dupes++; continue; }
    fresh.push(item);
    fingerprints.add(fp); // prevent dupes within the same import batch
  }
  return { fresh, dupes };
}

// ── Preview Table ──────────────────────────────────────────────────────────
function PreviewTable({ items }) {
  const [page, setPage] = useState(0);
  const PER_PAGE = 20;
  const total = items.length;
  const slice = items.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const dateStr = ts => new Date(ts).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <div style={{ overflowX:"auto", borderRadius:10, border:"1px solid rgba(255,255,255,0.07)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
          <thead>
            <tr style={{ background:"rgba(255,255,255,0.04)" }}>
              {["Date","Description","Category","Type","Amount","Account"].map(h => (
                <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:"rgba(255,255,255,0.35)", fontWeight:700, fontSize:9, textTransform:"uppercase", letterSpacing:"0.07em", borderBottom:"1px solid rgba(255,255,255,0.07)", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map(item => (
              <tr key={item.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                <td style={{ padding:"7px 10px", color:"rgba(255,255,255,0.4)", whiteSpace:"nowrap" }}>{dateStr(item.timestamp)}</td>
                <td style={{ padding:"7px 10px", color:"rgba(255,255,255,0.75)", maxWidth:150, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.description}</td>
                <td style={{ padding:"7px 10px" }}>
                  <span style={{ padding:"2px 7px", borderRadius:20, fontSize:10, fontWeight:600, background:"rgba(99,102,241,0.12)", color:"#818cf8" }}>{item.category}</span>
                </td>
                <td style={{ padding:"7px 10px" }}>
                  <span style={{ padding:"2px 7px", borderRadius:20, fontSize:10, fontWeight:700, background:item.type==="income"?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.12)", color:item.type==="income"?"#22c55e":"#ef4444" }}>{item.type}</span>
                </td>
                <td style={{ padding:"7px 10px", fontFamily:"monospace", fontWeight:700, color:item.type==="income"?"#22c55e":"#ef4444", whiteSpace:"nowrap" }}>{item.type==="income"?"+":"-"}{fmt(item.amount)}</td>
                <td style={{ padding:"7px 10px", color:"rgba(255,255,255,0.35)", whiteSpace:"nowrap", fontSize:10 }}>{item.accountName || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > PER_PAGE && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:11, color:"rgba(255,255,255,0.4)" }}>
          <span>Showing {page*PER_PAGE+1}–{Math.min((page+1)*PER_PAGE,total)} of {total}</span>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} style={navBtnStyle(page===0)}>← Prev</button>
            <button onClick={() => setPage(p => p+1)} disabled={(page+1)*PER_PAGE>=total} style={navBtnStyle((page+1)*PER_PAGE>=total)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function navBtnStyle(disabled) {
  return {
    padding:"4px 12px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)",
    background:"transparent", color:disabled?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.5)",
    cursor:disabled?"not-allowed":"pointer", fontSize:11, fontFamily:"inherit"
  };
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{ flex:1, minWidth:75, background:`${color}0d`, border:`1px solid ${color}25`, borderRadius:10, padding:"10px 10px" }}>
      <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:"rgba(255,255,255,0.35)", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:"clamp(12px,4vw,16px)", fontWeight:700, color, fontFamily:"monospace", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", lineHeight:1.2 }}>{value}</div>
    </div>
  );
}

// ── Account Preview Cards ──────────────────────────────────────────────────
function AccountPreview({ extractedAccounts, existingAccounts }) {
  if (!extractedAccounts.length) return null;
  return (
    <div style={{ background:"rgba(59,130,246,0.05)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:12, padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#60a5fa", marginBottom:2 }}>
        💳 Accounts detected in file ({extractedAccounts.length})
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {extractedAccounts.map(acc => {
          const existing = existingAccounts.find(a => normAcc(a.name) === acc.normName);
          const type = guessAccType(acc.displayName);
          const meta = ACC_TYPE_META[type];
          const isNew = !existing;
          return (
            <div key={acc.normName} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:"rgba(255,255,255,0.03)", border:`1px solid ${isNew?"rgba(99,102,241,0.25)":"rgba(34,197,94,0.25)"}`, borderRadius:9 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{meta.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#fff", display:"flex", alignItems:"center", gap:6 }}>
                  {acc.displayName}
                  <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:20, background:isNew?"rgba(99,102,241,0.15)":"rgba(34,197,94,0.15)", color:isNew?"#818cf8":"#22c55e", border:`1px solid ${isNew?"rgba(99,102,241,0.3)":"rgba(34,197,94,0.3)"}` }}>
                    {isNew ? "✦ NEW" : "✓ EXISTS"}
                  </span>
                </div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", marginTop:2 }}>
                  {isNew
                    ? `Will be created · balance ${fmt(acc.netBalance)}`
                    : `Existing balance ${fmt(existing.currentBalance)} → +${fmt(acc.netBalance)} added`}
                </div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:meta.color, fontFamily:"monospace" }}>{fmt(acc.netBalance)}</div>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)" }}>net from file</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", lineHeight:1.6, borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:8 }}>
        ℹ️ Balances calculated as <strong style={{color:"rgba(255,255,255,0.55)"}}>income − expense</strong> per account.
        Existing accounts will have this net amount <strong style={{color:"rgba(255,255,255,0.55)"}}>added</strong> to their current balance.
        Names matched <strong style={{color:"rgba(255,255,255,0.55)"}}>case-insensitively</strong>.
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function ImportHistory({ onImported, showToast, budget, setBudget, categories = [], onNewCategories }) {
  const [stage, setStage]               = useState("upload");
  const [dragOver, setDragOver]         = useState(false);
  const [parsedItems, setParsedItems]   = useState([]);
  const [fileName, setFileName]         = useState("");
  const [fileType, setFileType]         = useState("");
  const [parseError, setParseError]     = useState("");
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [filterType, setFilterType]     = useState("all");
  const [pdfProgress, setPdfProgress]   = useState("");
  const fileInputRef                    = useRef(null);

  const accounts = budget?.accounts || [];

  // ── Process file ──────────────────────────────────────────────────────
  const processFile = useCallback(async (file) => {
    setParseError("");
    setPdfProgress("");
    setFileName(file.name);
    const ext = file.name.split(".").pop().toLowerCase();
    setFileType(ext);

    try {
      if (ext === "csv") {
        const text = await file.text();
        const rows = parseCSVText(text);
        if (!rows.length) throw new Error("No data rows found in CSV.");
        const headers = Object.keys(rows[0]);
        const format = detectFormat(headers);
        const items = rows
          .map(r => format === "cashew" ? parseCashewRow(r, accounts) : parseGenericRow(r, accounts))
          .filter(Boolean);
        if (!items.length) throw new Error("No valid expense rows could be parsed.");
        setParsedItems(items);
        if (onNewCategories) {
          const unknown = [...new Set(items.map(i => i.category).filter(c => c && c !== "Other" && !categories.includes(c)))];
          if (unknown.length) onNewCategories(unknown);
        }
        setStage("preview");

      } else if (ext === "xlsx" || ext === "xls") {
        await loadSheetJS();
        const buffer = await file.arrayBuffer();
        const wb = window.XLSX.read(buffer, { type:"array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(ws, { defval:"" });
        if (!rows.length) throw new Error("No data found in spreadsheet.");
        const headers = Object.keys(rows[0]);
        const format = detectFormat(headers);
        const items = rows
          .map(r => format === "cashew" ? parseCashewRow(r, accounts) : parseGenericRow(r, accounts))
          .filter(Boolean);
        if (!items.length) throw new Error("No valid expense rows could be parsed.");
        setParsedItems(items);
        if (onNewCategories) {
        const unknown = [...new Set(items.map(i => i.category).filter(c => c && c !== "Other" && !categories.includes(c)))];
        if (unknown.length) onNewCategories(unknown);
      }
        setStage("preview");

      } else if (ext === "pdf") {
        setPdfProgress("📄 Loading PDF.js…");
        showToast?.("📄 Extracting text from PDF…", "info");
        try { await loadPDFJS(); }
        catch { throw new Error("Could not load PDF.js. Check your internet connection."); }
        setPdfProgress("📖 Reading pages…");
        const pdfText = await extractPDFText(file);
        if (!pdfText.trim()) throw new Error("Could not extract text from this PDF. It may be scanned/image-based.");
        setPdfProgress("🔍 Parsing transactions…");
        const items = parsePDFTextToRows(pdfText);
        setPdfProgress("");
        if (!items.length) {
          throw new Error(
            "No transactions could be auto-detected in this PDF. " +
            "Try exporting as CSV from your banking app for best results."
          );
        }
        setParsedItems(items);
        if (onNewCategories) {
          const unknown = [...new Set(items.map(i => i.category).filter(c => c && c !== "Other" && !categories.includes(c)))];
          if (unknown.length) onNewCategories(unknown);
        }
        setStage("preview");

      } else {
        throw new Error("Unsupported file type. Please upload CSV, Excel (.xlsx/.xls), or PDF.");
      }
    } catch (err) {
      setPdfProgress("");
      setParseError(err.message);
      setStage("upload");
    }
  }, [accounts, showToast]);

  // ── Drag & drop ────────────────────────────────────────────────────────
  const onDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = useCallback(e => {
    const file = e.target.files[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  // ── Upsert accounts into budget state ────────────────────────────────
  const upsertAccountsFromImport = useCallback((extractedAccounts) => {
    if (!extractedAccounts.length || !setBudget) return { created:0, updated:0 };
    const curMonth = currentMonthKey();
    let created = 0, updated = 0;

    setBudget(prev => {
      let updAccounts = [...prev.accounts];
      let updMonths   = { ...prev.months };
      let defaultId   = prev.defaultAccountId;

      for (const ext of extractedAccounts) {
        const existIdx = updAccounts.findIndex(a => normAcc(a.name) === ext.normName);

        if (existIdx >= 0) {
          const acc = { ...updAccounts[existIdx] };
          acc.currentBalance = (acc.currentBalance || 0) + ext.netBalance;
          updAccounts[existIdx] = acc;
          const m = updMonths[curMonth] || { accounts:[], transfers:[] };
          const mAccIdx = m.accounts.findIndex(a => a.id === acc.id);
          const newMAccs = mAccIdx >= 0
            ? m.accounts.map((a,i) => i===mAccIdx ? { ...a, currentBalance: a.currentBalance + ext.netBalance } : a)
            : [...m.accounts, { id: acc.id, currentBalance: acc.currentBalance, carryover:0 }];
          updMonths = { ...updMonths, [curMonth]: { ...m, accounts: newMAccs } };
          updated++;
        } else {
          const type  = guessAccType(ext.displayName);
          const meta  = ACC_TYPE_META[type];
          const newId = uid();
          const newAcc = {
            id: newId, name: ext.displayName, type,
            currentBalance: ext.netBalance, color: meta.color,
          };
          updAccounts = [...updAccounts, newAcc];
          if (!defaultId) defaultId = newId;
          const m = updMonths[curMonth] || { accounts:[], transfers:[] };
          updMonths = {
            ...updMonths,
            [curMonth]: { ...m, accounts: [...m.accounts, { id: newId, currentBalance: ext.netBalance, carryover:0 }] }
          };
          created++;
        }
      }

      return { ...prev, accounts: updAccounts, months: updMonths, defaultAccountId: defaultId };
    });

    return { created, updated };
  }, [setBudget]);

  // ── Confirm import → save to localStorage ─────────────────────────────
  const handleImport = () => {
    const toImport = filterType === "all" ? parsedItems : parsedItems.filter(e => e.type === filterType);
    if (!toImport.length) { showToast?.("No items to import after filter.", "error"); return; }

    setImporting(true);

    // ── Deduplicate against existing localStorage records ────────────
    const existing = lsLoad();
    const { fresh, dupes } = deduplicateItems(toImport, existing);

    // ── Merge and persist ────────────────────────────────────────────
    const merged = [...existing, ...fresh];
    const saved  = lsSave(merged);

    if (!saved) {
      showToast?.("⚠️ Storage quota exceeded — some records may not have been saved.", "error");
    }

    // ── Upsert accounts ──────────────────────────────────────────────
    const extracted = extractAccountsFromItems(toImport);
    const { created: accCreated, updated: accUpdated } = upsertAccountsFromImport(extracted);

    // ── Notify parent ────────────────────────────────────────────────
    onImported?.(fresh);

    setImportResult({
      count: fresh.length,
      dupes,
      totalInStorage: merged.length,
      accCreated,
      accUpdated,
      extractedAccounts: extracted,
      storageFailed: !saved,
    });
    setStage("done");
    setImporting(false);
  };

  // ── Derived stats ──────────────────────────────────────────────────────
  const totalExp = parsedItems.filter(e => e.type==="expense").reduce((s,e) => s+e.amount, 0);
  const totalInc = parsedItems.filter(e => e.type==="income").reduce((s,e) => s+e.amount, 0);
  const filteredItems = filterType==="all" ? parsedItems : parsedItems.filter(e => e.type===filterType);
  const extractedAccounts = React.useMemo(() => extractAccountsFromItems(filteredItems), [filteredItems]);

  const catBreakdown = React.useMemo(() => {
    const map = {};
    for (const e of filteredItems.filter(x => x.type==="expense")) {
      map[e.category] = (map[e.category]||0) + e.amount;
    }
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0,6);
  }, [filteredItems]);

  // ══════════════════════════════════════════════════════════════════════
  return (
    <div style={styles.root}>

      {/* ── UPLOAD ─────────────────────────────────────────────────── */}
      {stage === "upload" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={styles.header}>
            <div style={styles.headerIcon}>📥</div>
            <div>
              <h3 style={styles.title}>Import Expense History</h3>
              <p style={styles.subtitle}>Upload from Cashew, any banking app export, or generic CSV/Excel/PDF</p>
            </div>
          </div>

          {/* Drop zone */}
          <div
            style={{ ...styles.dropZone, ...(dragOver ? styles.dropZoneActive : {}) }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.pdf" style={{ display:"none" }} onChange={onFileChange} />
            {pdfProgress ? (
              <>
                <div style={{ fontSize:32, marginBottom:8 }}>⏳</div>
                <div style={{ fontSize:13, fontWeight:700, color:"#f59e0b" }}>{pdfProgress}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:4 }}>Processing PDF locally — no server needed</div>
              </>
            ) : (
              <>
                <div style={{ fontSize:40, marginBottom:10 }}>{dragOver ? "📂" : "📤"}</div>
                <div style={{ fontSize:14, fontWeight:700, color:"#fff", marginBottom:5 }}>
                  {dragOver ? "Drop it!" : "Drop file here or tap to browse"}
                </div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)" }}>
                  <strong style={{color:"#22c55e"}}>CSV</strong> · <strong style={{color:"#3b82f6"}}>Excel (.xlsx/.xls)</strong> · <strong style={{color:"#f59e0b"}}>PDF</strong>
                </div>
              </>
            )}
          </div>

          {parseError && <div style={styles.errorBox}>⚠️ {parseError}</div>}

          {/* Format cards */}
          <div style={styles.formatsGrid}>
            {[
              { icon:"📊", label:"Cashew Export",  desc:"Auto-detected: account, amount, category name, date, income columns", color:"#22c55e" },
              { icon:"🏦", label:"Bank Statement", desc:"Any CSV with date, amount, description/narration columns",             color:"#3b82f6" },
              { icon:"📋", label:"Generic Excel",  desc:".xlsx/.xls with amount, date, category, description headers",         color:"#a855f7" },
              { icon:"📄", label:"PDF Statement",  desc:"Text extracted locally in your browser — no server upload needed",    color:"#f59e0b" },
            ].map(f => (
              <div key={f.label} style={{ ...styles.formatCard, borderColor: f.color+"25" }}>
                <span style={{ fontSize:20 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:f.color }}>{f.label}</div>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", lineHeight:1.5, marginTop:2 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Account extraction info */}
          <div style={{ ...styles.infoBox, borderColor:"rgba(59,130,246,0.25)", background:"rgba(59,130,246,0.06)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#60a5fa", marginBottom:5 }}>💳 Auto Account Detection</div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>
              Account names are extracted from each row, balances calculated (income − expense), and accounts are
              automatically <strong style={{color:"rgba(255,255,255,0.65)"}}>created or updated</strong> in your 💳 Accounts tab.
              Names matched <strong style={{color:"rgba(255,255,255,0.65)"}}>case-insensitively</strong> — SBI = sbi = Sbi.
            </div>
          </div>

          {/* Category mapping info */}
          {/* <div style={styles.infoBox}>
            <div style={{ fontSize:11, fontWeight:700, color:"#818cf8", marginBottom:5 }}>🗂 Auto Category Mapping</div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>
              Breakfast/Lunch/Dinner → <strong style={{color:"#f97316"}}>Food</strong> ·
              Transit/Cab → <strong style={{color:"#0ea5e9"}}>Transport</strong> ·
              Fitness/Gym → <strong style={{color:"#10b981"}}>Health</strong> ·
              Recharge → <strong style={{color:"#ef4444"}}>Bills</strong> ·
              Salary → <strong style={{color:"#22c55e"}}>Salary</strong>
            </div>
          </div> */}
        </div>
      )}

      {/* ── PREVIEW ─────────────────────────────────────────────────── */}
      {stage === "preview" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {/* File info bar */}
          <div style={styles.fileInfo}>
            <span style={{ fontSize:20 }}>{fileType==="csv"?"📊":fileType==="pdf"?"📄":"📋"}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{fileName}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{parsedItems.length} records parsed</div>
            </div>
            <button onClick={() => { setStage("upload"); setParsedItems([]); setFileName(""); }} style={styles.changeBtn}>✕ Change</button>
          </div>

          {/* Stats */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <StatCard label="Records"       value={parsedItems.length}               color="#818cf8" />
            <StatCard label="Total Expense" value={`₹${shortAmount(totalExp)}`}       color="#ef4444" />
            <StatCard label="Total Income"  value={`₹${shortAmount(totalInc)}`}       color="#22c55e" />
            <StatCard label="Net"           value={`₹${shortAmount(totalInc-totalExp)}`} color={totalInc-totalExp>=0?"#22c55e":"#ef4444"} />
          </div>

          {/* Account preview */}
          <AccountPreview extractedAccounts={extractedAccounts} existingAccounts={accounts} />

          {/* Category breakdown */}
          {catBreakdown.length > 0 && (
            <div style={styles.catPreview}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"rgba(255,255,255,0.3)", marginBottom:8 }}>Category Breakdown (Expenses)</div>
              {catBreakdown.map(([cat, total]) => (
                <div key={cat} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                  <span style={{ fontSize:11, color:"rgba(255,255,255,0.55)", width:90, flexShrink:0 }}>{cat}</span>
                  <div style={{ flex:1, height:5, background:"rgba(255,255,255,0.06)", borderRadius:3, overflow:"hidden" }}>
                    <div style={{ width:`${Math.round(total/totalExp*100)}%`, height:"100%", background:"linear-gradient(90deg,#6366f1,#a855f7)", borderRadius:3 }} />
                  </div>
                  <span style={{ fontSize:10, color:"#818cf8", fontFamily:"monospace", flexShrink:0 }}>{fmt(total)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Filter */}
          <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>Import:</span>
            {[["all","All"],["expense","Expenses only"],["income","Income only"]].map(([v,l]) => (
              <button key={v} onClick={() => setFilterType(v)} style={{
                padding:"4px 12px", borderRadius:20, border:"1px solid",
                borderColor: filterType===v?"#6366f1":"rgba(255,255,255,0.1)",
                background:  filterType===v?"rgba(99,102,241,0.15)":"transparent",
                color:       filterType===v?"#818cf8":"rgba(255,255,255,0.4)",
                fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit"
              }}>{l}</button>
            ))}
            <span style={{ marginLeft:"auto", fontSize:11, color:"#818cf8", fontWeight:700 }}>
              {filteredItems.length} items · {extractedAccounts.length} account{extractedAccounts.length!==1?"s":""} detected
            </span>
          </div>

          {/* Preview table */}
          <PreviewTable items={filteredItems} />

          {/* Actions */}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => { setStage("upload"); setParsedItems([]); }} style={styles.cancelBtn} disabled={importing}>Cancel</button>
            <button
              onClick={handleImport}
              disabled={importing || !filteredItems.length}
              style={{
                flex:1, padding:"11px 16px", borderRadius:10, border:"none",
                background: importing ? "#333" : "linear-gradient(135deg,#22c55e,#16a34a)",
                color:"#fff", fontWeight:700, fontSize:13,
                cursor: importing ? "not-allowed" : "pointer", fontFamily:"inherit"
              }}
            >
              {importing
                ? "⏳ Importing…"
                : `⬇️ Import ${filteredItems.length} Record${filteredItems.length!==1?"s":""}${extractedAccounts.length ? ` + ${extractedAccounts.length} Account${extractedAccounts.length!==1?"s":""}` : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* ── DONE ────────────────────────────────────────────────────── */}
      {stage === "done" && importResult && (
        <div style={{ display:"flex", flexDirection:"column", gap:16, alignItems:"center", padding:"32px 0" }}>
          <div style={{ fontSize:56 }}>{importResult.storageFailed ? "⚠️" : "🎉"}</div>
          <div style={{ fontSize:20, fontWeight:700, color: importResult.storageFailed ? "#f59e0b" : "#22c55e" }}>
            {importResult.storageFailed ? "Partial Save" : "Import Successful!"}
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
            <StatCard label="Records Imported"    value={importResult.count}                                         color="#22c55e" />
            {importResult.dupes > 0   && <StatCard label="Dupes Skipped"    value={importResult.dupes}              color="#f59e0b" />}
            {importResult.accCreated > 0 && <StatCard label="Accounts Created" value={importResult.accCreated}      color="#818cf8" />}
            {importResult.accUpdated > 0 && <StatCard label="Accounts Updated" value={importResult.accUpdated}      color="#3b82f6" />}
            <StatCard label="Total in Storage"    value={importResult.totalInStorage}                                color="#6b7280" />
          </div>

          {importResult.storageFailed && (
            <div style={{ ...styles.errorBox, textAlign:"center" }}>
              ⚠️ Storage quota may be full. Try clearing old data or freeing up browser storage.
            </div>
          )}

          {/* Account changes */}
          {importResult.extractedAccounts?.length > 0 && (
            <div style={{ width:"100%", background:"rgba(59,130,246,0.05)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#60a5fa", marginBottom:8 }}>💳 Account Changes</div>
              {importResult.extractedAccounts.map(acc => {
                const existed = accounts.find(a => normAcc(a.name) === acc.normName);
                return (
                  <div key={acc.normName} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, fontSize:12 }}>
                    <span>{ACC_TYPE_META[guessAccType(acc.displayName)]?.icon}</span>
                    <span style={{ color:"#fff", fontWeight:600 }}>{acc.displayName}</span>
                    <span style={{ color:"rgba(255,255,255,0.4)", fontSize:10 }}>
                      {existed ? `updated (+${fmt(acc.netBalance)})` : `created · ${fmt(acc.netBalance)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ fontSize:13, color:"rgba(255,255,255,0.5)", textAlign:"center", lineHeight:1.6 }}>
            Records are now in <strong style={{color:"#fff"}}>📊 Records</strong> tab.
            Accounts are in <strong style={{color:"#fff"}}>💳 Accounts</strong> tab.
          </p>
          <button
            onClick={() => { setStage("upload"); setParsedItems([]); setImportResult(null); setFileName(""); setFilterType("all"); }}
            style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#a855f7)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
          >
            📥 Import Another File
          </button>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = {
  root: {
    flex:1, height:"100%", overflowY:"auto", overflowX:"hidden",
    padding:"14px 16px", display:"flex", flexDirection:"column", gap:14,
  },
  header:     { display:"flex", alignItems:"flex-start", gap:12 },
  headerIcon: { fontSize:28, flexShrink:0, marginTop:2 },
  title:      { fontSize:16, fontWeight:700, color:"#fff", margin:0, marginBottom:4 },
  subtitle:   { fontSize:12, color:"rgba(255,255,255,0.4)", lineHeight:1.5, margin:0 },
  dropZone: {
    border:"2px dashed rgba(255,255,255,0.12)", borderRadius:14,
    padding:"36px 24px", display:"flex", flexDirection:"column",
    alignItems:"center", justifyContent:"center", cursor:"pointer",
    background:"rgba(255,255,255,0.02)", transition:"all 0.2s", gap:0, minHeight:140,
  },
  dropZoneActive: { borderColor:"#22c55e", background:"rgba(34,197,94,0.06)" },
  errorBox: {
    background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)",
    borderRadius:9, padding:"10px 14px", fontSize:12, color:"#ef4444",
  },
  formatsGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 },
  formatCard: {
    display:"flex", gap:10, padding:"10px 12px",
    background:"rgba(255,255,255,0.02)", border:"1px solid",
    borderRadius:10, alignItems:"flex-start",
  },
  infoBox: {
    background:"rgba(99,102,241,0.06)", border:"1px solid rgba(99,102,241,0.2)",
    borderRadius:10, padding:"10px 13px",
  },
  fileInfo: {
    display:"flex", alignItems:"center", gap:10,
    background:"rgba(34,197,94,0.06)", border:"1px solid rgba(34,197,94,0.2)",
    borderRadius:10, padding:"10px 13px",
  },
  changeBtn: {
    background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)",
    color:"#ef4444", borderRadius:8, padding:"4px 10px",
    fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
  },
  catPreview: {
    background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)",
    borderRadius:10, padding:"12px 14px",
  },
  cancelBtn: {
    padding:"11px 20px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)",
    background:"transparent", color:"rgba(255,255,255,0.45)",
    fontSize:13, cursor:"pointer", fontFamily:"inherit",
  },
};
