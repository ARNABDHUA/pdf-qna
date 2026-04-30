// ExpenseTracker.jsx — Multi-model AI · Responsive · Share · MongoDB · Budget/Accounts
// Route: <Route path="/expenses" element={<ExpenseTracker />} />

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── Storage Keys ───────────────────────────────────────────────────────────────
const STORAGE_KEY     = "qnaai_expenses_v3";
const API_KEYS_KEY    = "qnaai_expense_apikeys";
const LOANS_KEY       = "qnaai_expense_loans_v1";
const CUSTOM_CATS_KEY = "qnaai_expense_cats_v1";
const BUDGET_KEY      = "qnaai_budget_v1";

// ── Account type meta ──────────────────────────────────────────────────────────
const ACC_TYPE_META = {
  bank:   { icon:"🏦", color:"#3b82f6", label:"Bank"   },
  wallet: { icon:"👛", color:"#f59e0b", label:"Wallet" },
  cash:   { icon:"💵", color:"#22c55e", label:"Cash"   },
  card:   { icon:"💳", color:"#a855f7", label:"Card"   },
  other:  { icon:"📦", color:"#6b7280", label:"Other"  },
};

// ── Categories ─────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = ["Food","Transport","Shopping","Bills","Health","Entertainment","Education","Travel","Rent","Salary","Other"];
const DEFAULT_CAT_ICONS  = { Food:"🍽️",Transport:"🚌",Shopping:"🛒",Bills:"💡",Health:"💊",Entertainment:"🎬",Education:"📚",Travel:"✈️",Rent:"🏠",Salary:"💰",Other:"📌" };
const DEFAULT_CAT_COLORS = { Food:"#f97316",Transport:"#0ea5e9",Shopping:"#a855f7",Bills:"#ef4444",Health:"#10b981",Entertainment:"#f59e0b",Education:"#3b82f6",Travel:"#06b6d4",Rent:"#8b5cf6",Salary:"#22c55e",Other:"#6b7280" };
const EXTRA_COLORS = ["#ec4899","#14b8a6","#f43f5e","#84cc16","#fb923c","#a78bfa","#38bdf8","#fbbf24","#4ade80","#c084fc"];
const EXTRA_ICONS  = ["🏋️","🐾","🎁","💻","🧴","🍕","☕","🎮","🧾","🚀","💈","🌿","🎵","🏖️","🛠️"];

// ── Backend ────────────────────────────────────────────────────────────────────
const API_BASE = "https://pdf-qna-backend.onrender.com" || "http://localhost:8000";

// ══════════════════════════════════════════════════════════════════════════════
// ── FREE PROVIDER CONFIG ── (hidden from user, rotates automatically)
// ══════════════════════════════════════════════════════════════════════════════
const FREE_GROQ_KEYS = import.meta.env.VITE_GROQ_KEYS.split(",")
const FREE_GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];
const FREE_ROTATION = FREE_GROQ_KEYS.flatMap(key =>
  FREE_GROQ_MODELS.map(model => ({ key, model }))
);

// ── AI Providers ───────────────────────────────────────────────────────────────
const PROVIDERS = {
  free:      { label:"Free",    icon:"✦",  color:"#22c55e" },
  groq:      { label:"Groq",    icon:"⚡", color:"#f97316" },
  gemini:    { label:"Gemini",  icon:"✧",  color:"#3b82f6" },
  anthropic: { label:"Claude",  icon:"◆",  color:"#f59e0b" },
  openai:    { label:"ChatGPT", icon:"✦",  color:"#10b981" },
};
const CLOUD_MODELS = {
  free:      [{ id:"free-model1", label:"Model 1 (Fast & Smart)" }, { id:"free-model2", label:"Model 2 (Lightweight)" }],
  groq:      [{ id:"llama-3.3-70b-versatile",label:"LLaMA 3.3 70B"},{ id:"llama-3.1-8b-instant",label:"LLaMA 3.1 8B"},{ id:"mixtral-8x7b-32768",label:"Mixtral 8x7B"},{ id:"deepseek-r1-distill-llama-70b",label:"DeepSeek R1 70B"}],
  gemini:    [{ id:"gemini-2.5-flash",label:"Gemini 2.5 Flash"},{ id:"gemini-2.0-flash",label:"Gemini 2.0 Flash"},{ id:"gemini-1.5-pro",label:"Gemini 1.5 Pro"},{ id:"gemini-1.5-flash",label:"Gemini 1.5 Flash"}],
  anthropic: [{ id:"claude-sonnet-4-20250514",label:"Claude Sonnet 4"},{ id:"claude-haiku-4-5-20251001",label:"Claude Haiku 4.5"},{ id:"claude-opus-4-5",label:"Claude Opus 4.5"}],
  openai:    [{ id:"gpt-4o",label:"GPT-4o"},{ id:"gpt-4o-mini",label:"GPT-4o Mini"},{ id:"gpt-4-turbo",label:"GPT-4 Turbo"},{ id:"gpt-3.5-turbo",label:"GPT-3.5 Turbo"}],
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const nowIN   = ()  => new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"});
const dateIN  = (d) => new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Asia/Kolkata"});
const timeIN  = (d) => new Date(d).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true,timeZone:"Asia/Kolkata"});
const isoDate = (d) => { const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`; };
const weekKey = (d) => { const dt=new Date(d); const day=dt.getDay(); const diff=dt.getDate()-day+(day===0?-6:1); return isoDate(new Date(new Date(d).setDate(diff))); };
const monthKey= (d) => { const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`; };
const yearKey = (d) => String(new Date(d).getFullYear());
const fmt     = (n) => "₹"+Number(n).toLocaleString("en-IN",{maximumFractionDigits:2});
const uid     = ()  => Date.now().toString(36)+Math.random().toString(36).slice(2);

// ── IST month helpers ──────────────────────────────────────────────────────────
function currentMonthKey() {
  const ist = new Date(Date.now() + 5.5*3600000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth()+1).padStart(2,"0")}`;
}
function prevMonthKey(mk) {
  const [y,m] = mk.split("-").map(Number);
  const d = new Date(y, m-2, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function monthLabel(mk) {
  const [y,m] = mk.split("-").map(Number);
  return new Date(y,m-1).toLocaleDateString("en-IN",{month:"long",year:"numeric"});
}

function getISTContext() {
  const now=new Date(), nowMS=now.getTime(), istOff=5.5*3600000;
  const istNow=new Date(nowMS+istOff);
  const todayNoon=new Date(Date.UTC(istNow.getUTCFullYear(),istNow.getUTCMonth(),istNow.getUTCDate(),6,30,0));
  const yNoon=new Date(todayNoon.getTime()-86400000);
  const yIST=new Date(istNow.getTime()-86400000);
  return {
    nowMs:nowMS, nowIST:nowIN(), todayNoonMs:todayNoon.getTime(), yesterdayNoonMs:yNoon.getTime(),
    todayDateIST:`${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth()+1).padStart(2,"0")}-${String(istNow.getUTCDate()).padStart(2,"0")}`,
    yesterdayDateIST:`${yIST.getUTCFullYear()}-${String(yIST.getUTCMonth()+1).padStart(2,"0")}-${String(yIST.getUTCDate()).padStart(2,"0")}`,
  };
}

// ── Build expense summary for AI context ───────────────────────────────────────
function buildExpenseSummary(expenses, accounts) {
  if (!expenses || expenses.length === 0) return "No expenses recorded yet.";

  const byMonth = {};
  for (const e of expenses) {
    const mk = monthKey(e.timestamp);
    if (!byMonth[mk]) byMonth[mk] = [];
    byMonth[mk].push(e);
  }

  const catTotals = {};
  const catMonthly = {};
  for (const e of expenses) {
    if (!catTotals[e.category]) catTotals[e.category] = { expense: 0, income: 0 };
    if (e.type === "expense") catTotals[e.category].expense += e.amount;
    else catTotals[e.category].income += e.amount;

    const mk = monthKey(e.timestamp);
    if (!catMonthly[mk]) catMonthly[mk] = {};
    if (!catMonthly[mk][e.category]) catMonthly[mk][e.category] = { expense: 0, income: 0 };
    if (e.type === "expense") catMonthly[mk][e.category].expense += e.amount;
    else catMonthly[mk][e.category].income += e.amount;
  }

  const totalExp = expenses.filter(e => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  const totalInc = expenses.filter(e => e.type === "income").reduce((s, e) => s + e.amount, 0);

  let summary = `EXPENSE HISTORY SUMMARY (for answering user questions):\n`;
  summary += `Total Records: ${expenses.length} | Total Spent: ₹${totalExp.toFixed(2)} | Total Income: ₹${totalInc.toFixed(2)} | Net: ₹${(totalInc - totalExp).toFixed(2)}\n\n`;

  if (accounts && accounts.length > 0) {
    summary += `ACCOUNT BALANCES (CURRENT):\n`;
    for (const acc of accounts) {
      const accTxns = expenses
        .filter(e => e.accountId === acc.id)
        .sort((a, b) => b.timestamp - a.timestamp);
      const last5 = accTxns.slice(0, 5);
      summary += `  - "${acc.name}" (type:${acc.type}): current balance = ₹${Number(acc.currentBalance).toLocaleString("en-IN", { maximumFractionDigits: 2 })}, total txns linked: ${accTxns.length}\n`;
      if (last5.length > 0) {
        summary += `    Last ${last5.length} transactions:\n`;
        for (const t of last5) {
          summary += `      [${dateIN(t.timestamp)}] ${t.type === "expense" ? "-" : "+"}₹${t.amount} | ${t.category} | ${t.description || ""}\n`;
        }
      } else {
        summary += `    No linked transactions yet.\n`;
      }
    }
    summary += `\n`;
  }

  summary += `MONTHLY BREAKDOWN:\n`;
  const sortedMonths = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
  for (const mk of sortedMonths.slice(0, 12)) {
    const items = byMonth[mk];
    const mExp = items.filter(e => e.type === "expense").reduce((s, e) => s + e.amount, 0);
    const mInc = items.filter(e => e.type === "income").reduce((s, e) => s + e.amount, 0);
    const [yr, mo] = mk.split("-").map(Number);
    const mName = new Date(yr, mo - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    summary += `${mName}: Spent=₹${mExp.toFixed(2)}, Income=₹${mInc.toFixed(2)}, Txns=${items.length}\n`;
    if (catMonthly[mk]) {
      for (const [cat, vals] of Object.entries(catMonthly[mk])) {
        if (vals.expense > 0) summary += `  - ${cat}: ₹${vals.expense.toFixed(2)}\n`;
      }
    }
  }

  summary += `\nALL-TIME CATEGORY TOTALS (expenses only):\n`;
  for (const [cat, vals] of Object.entries(catTotals)) {
    if (vals.expense > 0) summary += `  ${cat}: ₹${vals.expense.toFixed(2)}\n`;
  }

  summary += `\nRECENT TRANSACTIONS (last 20):\n`;
  const recent = [...expenses].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  for (const e of recent) {
    summary += `  [${dateIN(e.timestamp)}] ${e.type === "expense" ? "-" : "+"}₹${e.amount} | ${e.category} | ${e.description || ""}${e.accountName ? ` | account:${e.accountName}` : ""}\n`;
  }

  return summary;
}

// ── System prompt ──────────────────────────────────────────────────────────────
function buildSystemPrompt(categories, accounts, defaultAccountId, expenses) {
  const ist = getISTContext();
  const defaultAcc = accounts.find(a => a.id === defaultAccountId);
  const accountList = accounts.map(a => `  - name:"${a.name}", id:"${a.id}", type:"${a.type}", currentBalance:${a.currentBalance}`).join("\n") || "  (none)";
  const hasAccounts = accounts.length > 0;
  const expenseSummary = buildExpenseSummary(expenses, accounts);

  return `You are a STRICT expense, income, and loan tracking assistant for an Indian user.

STRICT RULES:
1. ONLY respond to: expenses, income, money, budgeting, spending, financial summaries, savings, loans, splits, account transfers, balance queries.
2. For financial analysis questions (e.g. "how much did I spend on food?", "what's my total expense last month?", "which category I spent most?", "what is my SBI balance?", "show SBI transactions"), use the EXPENSE HISTORY and ACCOUNT BALANCES below to answer accurately with exact numbers.
3. When user asks about a specific account balance or transactions (e.g. "what is my SBI balance", "show my ICICI transactions", "current amount in wallet"), find the account in ACCOUNT BALANCES section and respond with:
   - Current balance of that account
   - Last 5 transactions linked to it (from the data provided)
   - Format it nicely with emojis
4. Anything unrelated → respond ONLY: "I'm your expense tracker assistant. I can only help with expenses, income, loans, and financial topics. 💸"

CURRENT IST CONTEXT:
- nowMs: ${ist.nowMs} | nowIST: ${ist.nowIST}
- Today: ${ist.todayDateIST} | Yesterday: ${ist.yesterdayDateIST}
- todayNoonMs: ${ist.todayNoonMs} | yesterdayNoonMs: ${ist.yesterdayNoonMs}

DATE/TIME RULES:
- If user does NOT mention any time or date → ALWAYS use nowMs (${ist.nowMs}) as the timestamp. This gives the exact current Indian time.
- "today" → use todayNoonMs (${ist.todayNoonMs})
- "yesterday" → use yesterdayNoonMs (${ist.yesterdayNoonMs})
- "N days ago" → todayNoon - (N * 86400000)
- NEVER guess or fabricate timestamps. If no date/time mentioned, use nowMs exactly.

${expenseSummary}

ACCOUNTS STATUS: ${hasAccounts ? "User has accounts set up." : "User has NO accounts set up yet."}

${hasAccounts ? `BUDGET ACCOUNTS:
${accountList}
Default account for online/card payments: ${defaultAcc ? `"${defaultAcc.name}" (id: "${defaultAcc.id}", type: "${defaultAcc.type}")` : "none set"}

ACCOUNT DEDUCTION RULES (only include account_action when accounts exist):
- "paid X for food" / "bought X" / "spent X" (no payment method mentioned) → use default account (id: "${defaultAcc?.id||""}")
- "paid X cash" / "paid X in cash" → use account with type "cash" (find by type)
- "paid X wallet" / "via wallet" / "from wallet" → use account with type "wallet" (find by name or type)
- "paid X from ICICI" / "from SBI" / "from [name]" → use account matching that name
- "add X" / "got X" / "received X" (no account mentioned) → add to default account
- "add X to ICICI" / "add X to [name]" → add to account matching that name
- If required account type (cash/wallet) not in accounts list → set account_not_found: true, account_type_missing: "wallet" (or "cash")` : `TRANSFER/ACCOUNT RULE: If the user asks to transfer money between accounts OR mentions any account name (SBI, ICICI, wallet, cash account, etc.), you MUST respond with exactly this message and nothing else:
"⚠️ You don't have any accounts set up yet! Please add your accounts first in the 💳 **Accounts** tab (tap it above), then come back to transfer or track by account. Adding accounts is quick and optional — but needed for balance tracking! 🏦"`}

TRANSFER RULE (STRICT — APPLIES EVEN WHEN ACCOUNTS EXIST):
If the user asks to transfer money between accounts (e.g. "transfer ₹500 from SBI to ICICI", "move money from wallet to bank", "send 1000 from X to Y"), you MUST respond with ONLY this message and nothing else — do NOT emit any JSON or <expense_data> block:
"🔄 To transfer money between accounts, please go to the **💳 Accounts** tab and tap the **↔ Transfer** button. This ensures your balances are updated correctly!"

LOAN/SPLIT DETECTION:
- "pizza for Ram and Anand and me ₹900" → detect ONLY other people's names (exclude me/I/myself/you — the user is never added to splits)
- Each OTHER person owes: total ÷ (number of other people + 1, counting the user as one participant)
- Example: "cooldrink for Anand and me ₹40" → total=40, participants=2 (Anand + user), Anand owes ₹20. Only add Anand to splits. Do NOT add "me" or "you" to splits.
- Example: "pizza for Ram, Anand and me ₹900" → participants=3, each=₹300. Add only Ram(₹300) and Anand(₹300) to splits. Not the user.
- Repayments: "Anand paid me back ₹300" or "Anand pay ₹20" → loan_repayment block

REPAYMENT RULE ("X paid me" / "X pay amount"):
When someone repays (e.g. "Anand pay 20", "Ram paid me ₹300"), emit a <loan_repayment> block AND also an <expense_data> block treating it as income (so it's recorded in the Records section and credited to the default account):
- type: "income"
- category: "Other"
- description: "<Name> repaid ₹<amount>"
- account_action: credit to default account (delta: +amount)

ANALYSIS RESPONSE RULES (when user asks a question about their spending or account):
- Use the EXPENSE HISTORY and ACCOUNT BALANCES data above to give exact, accurate answers
- Format amounts in Indian style with ₹ symbol
- Show breakdowns when relevant (by category, by month, etc.)
- For account balance queries: show current balance + last 5 transactions in a clean format
- Compare periods if asked ("last month vs this month")
- Do NOT emit any JSON block for analysis questions — just respond with helpful formatted text
- Use bold for key numbers, bullet points for lists

${hasAccounts ? `On normal expense/income respond with:
<expense_data>{"amount":<n>,"category":"<one of: ${categories.join(", ")}>","description":"<max 60 chars>","reason":"<max 80 chars or empty>","type":"expense|income","timestamp":<unix_ms>,"account_action":{"accountId":"<id or empty>","accountName":"<name>","delta":<negative for expense, positive for income>,"account_not_found":<true|false>,"account_type_missing":"<wallet|cash|bank|empty>"}}</expense_data>` : `On normal expense/income respond with:
<expense_data>{"amount":<n>,"category":"<one of: ${categories.join(", ")}>","description":"<max 60 chars>","reason":"<max 80 chars or empty>","type":"expense|income","timestamp":<unix_ms>}</expense_data>`}

${hasAccounts ? `On split expense respond with BOTH blocks:
<expense_data>{"amount":<total>,"category":"<cat>","description":"<desc>","reason":"","type":"expense","timestamp":<ms>,"account_action":{"accountId":"<id>","accountName":"<name>","delta":<negative total>,"account_not_found":false,"account_type_missing":""}}</expense_data>
<loan_data>{"description":"<what was split>","timestamp":<ms>,"splits":[{"name":"<OtherPersonName>","amount":<their share>,"type":"owe"}]}</loan_data>
IMPORTANT: splits array must contain ONLY other people — never include the user/me/myself.` : `On split expense respond with BOTH blocks:
<expense_data>{"amount":<total>,"category":"<cat>","description":"<desc>","reason":"","type":"expense","timestamp":<ms>}</expense_data>
<loan_data>{"description":"<what was split>","timestamp":<ms>,"splits":[{"name":"<OtherPersonName>","amount":<their share>,"type":"owe"}]}</loan_data>
IMPORTANT: splits array must contain ONLY other people — never include the user/me/myself.`}

On repayment ("X paid me" / "X pay amount") respond with BOTH blocks:
<expense_data>{"amount":<amt>,"category":"Other","description":"<Name> repaid ₹<amt>","reason":"Loan repayment received","type":"income","timestamp":<ms>${hasAccounts && defaultAcc ? `,"account_action":{"accountId":"${defaultAcc.id}","accountName":"${defaultAcc.name}","delta":<+amt>,"account_not_found":false,"account_type_missing":""}` : ""}}</expense_data>
<loan_repayment>{"name":"<Name>","amount":<amt>,"timestamp":<ms>}</loan_repayment>

For analysis/questions → respond helpfully with exact data from EXPENSE HISTORY and ACCOUNT BALANCES, NO JSON block.`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── FREE AI CALL — rotates through FREE_ROTATION on rate-limit errors
// ══════════════════════════════════════════════════════════════════════════════
async function callFreeAI(history, userMsg, categories, accounts, defaultAccountId, expenses) {
  const sys = buildSystemPrompt(categories, accounts, defaultAccountId, expenses);
  const messages = [...history.slice(-8), { role: "user", content: userMsg }];

  const isRateLimit = (status, body) =>
    status === 429 ||
    status === 503 ||
    (body?.error?.code === "rate_limit_exceeded") ||
    (body?.error?.type === "requests" ) ||
    (typeof body?.error?.message === "string" &&
      (body.error.message.toLowerCase().includes("rate limit") ||
       body.error.message.toLowerCase().includes("quota") ||
       body.error.message.toLowerCase().includes("exceeded")));

  let lastError = null;
  for (const { key, model } of FREE_ROTATION) {
    if (!key || key.startsWith("gsk_your_")) continue;

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          messages: [{ role: "system", content: sys }, ...messages],
        }),
      });

      const d = await res.json();

      if (isRateLimit(res.status, d)) {
        lastError = new Error(d.error?.message || `Rate limit on key/model slot`);
        continue;
      }

      if (!res.ok) throw new Error(d.error?.message || `Groq ${res.status}`);

      return d.choices?.[0]?.message?.content || "";
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw new Error(
    lastError?.message?.includes("Rate limit") || lastError?.message?.includes("quota")
      ? "⚡ All free slots are rate-limited right now. Please wait a moment and try again, or add your own API key in Settings."
      : lastError?.message || "Free AI unavailable. Please try again later."
  );
}

// ── AI call ────────────────────────────────────────────────────────────────────
async function callAI(provider, model, apiKey, history, userMsg, categories, accounts, defaultAccountId, expenses) {
  const sys = buildSystemPrompt(categories, accounts, defaultAccountId, expenses);
  const messages = [...history.slice(-8), {role:"user",content:userMsg}];
  if (provider==="anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":apiKey,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model,max_tokens:1200,system:sys,messages})});
    const d = await res.json(); if (!res.ok) throw new Error(d.error?.message||`Anthropic ${res.status}`);
    return d.content?.[0]?.text||"";
  }
  if (provider==="openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,max_tokens:1200,messages:[{role:"system",content:sys},...messages]})});
    const d = await res.json(); if (!res.ok) throw new Error(d.error?.message||`OpenAI ${res.status}`);
    return d.choices?.[0]?.message?.content||"";
  }
  if (provider==="groq") {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,max_tokens:1200,messages:[{role:"system",content:sys},...messages]})});
    const d = await res.json(); if (!res.ok) throw new Error(d.error?.message||`Groq ${res.status}`);
    return d.choices?.[0]?.message?.content||"";
  }
  if (provider==="gemini") {
    const gm = messages.map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]}));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:gm,systemInstruction:{parts:[{text:sys}]},generationConfig:{temperature:0.1,maxOutputTokens:1200}})});
    const d = await res.json(); if (!res.ok) throw new Error(d.error?.message||`Gemini ${res.status}`);
    return d.candidates?.[0]?.content?.parts?.[0]?.text||"";
  }
  throw new Error("Unknown provider");
}

// ── Share helpers ──────────────────────────────────────────────────────────────
function encodeShare(expenses) { try { return `${window.location.origin}${window.location.pathname}?share=${btoa(unescape(encodeURIComponent(JSON.stringify(expenses))))}`; } catch { return null; } }
function decodeShare(search)   { try { const p=new URLSearchParams(search).get("share"); return p?JSON.parse(decodeURIComponent(escape(atob(p)))):null; } catch { return null; } }

// ── Cloud API helpers ──────────────────────────────────────────────────────────
// async function apiCheckUser(u) { const r=await fetch(`${API_BASE}/expenses/check-user`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u})}); if(!r.ok) throw new Error("Server error"); return r.json(); }
// async function apiSaveExpenses(u,pw,ex) { const r=await fetch(`${API_BASE}/expenses/save`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,password:pw,expenses:ex})}); const d=await r.json(); if(!r.ok) throw new Error(d.detail||"Save failed"); return d; }
// async function apiSyncExpenses(u,pw) { const r=await fetch(`${API_BASE}/expenses/sync`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,password:pw})}); const d=await r.json(); if(!r.ok) throw new Error(d.detail||"Sync failed"); return d; }

async function apiCheckUser(u) {
  const r = await fetch(`${API_BASE}/expenses/check-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u }),
  });
  if (!r.ok) throw new Error("Server error");
  return r.json();
}
async function apiSaveExpenses(u, pw, ex, budget) {          // ← budget added
  const r = await fetch(`${API_BASE}/expenses/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: pw, expenses: ex, budget }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail || "Save failed");
  return d;
}

async function apiSyncExpenses(u, pw) {
  const r = await fetch(`${API_BASE}/expenses/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: pw }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail || "Sync failed");
  return d;                                                   // now includes .budget
}
// ══════════════════════════════════════════════════════════════════════════════
// ── Toast
// ══════════════════════════════════════════════════════════════════════════════
function Toast({ message, type, onDone }) {
  useEffect(() => { const t=setTimeout(onDone,3200); return ()=>clearTimeout(t); }, [onDone]);
  const color = type==="success"?"#22c55e":type==="error"?"#ef4444":"#f59e0b";
  return (
    <div className="et-toast" style={{borderColor:color+"44",background:color+"12"}}>
      <span style={{color}}>{type==="success"?"✓":"⚠️"}</span>
      <span>{message}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Cloud Modal
// ══════════════════════════════════════════════════════════════════════════════
function CloudModal({ mode, expenses, budget, onClose, onSuccess }) {
  const [step, setStep]           = useState("username");
  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [userExists, setUserExists] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [showPw, setShowPw]       = useState(false);

  // ── 50-sec countdown state ──
  const [countdown, setCountdown]   = useState(null);   // null = not started
  const countdownRef                = useRef(null);

  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, [step]);

  // Start / clear countdown
  const startCountdown = (onDone) => {
    setCountdown(50);
    let remaining = 50;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        // countdown finished — don't close, the fetch is still running
      }
    }, 1000);
  };

  const clearCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  };

  // Cleanup on unmount
  useEffect(() => () => clearCountdown(), []);

  const isSave   = mode === "save";
  const accent   = isSave ? "#f59e0b" : "#22c55e";
  const hk       = (e, fn) => { if (e.key === "Enter") fn(); };

  const handleUsernameNext = async () => {
    const u = username.trim().toLowerCase();
    if (u.length < 2) { setError("Min 2 chars."); return; }
    setError(""); setLoading(true);
startCountdown();  // ← ADD
try {
  const { exists } = await apiCheckUser(u);
  setUserExists(exists);
  setStep("password");
} catch (e) {
  setError(e.message);
} finally {
  clearCountdown();  // ← ADD
  setLoading(false);
}
  };

  const handleSubmit = async () => {
    if (password.length < 4) { setError("Min 4 chars."); return; }
    setError(""); setLoading(true);

    // Start 50-sec countdown immediately
    startCountdown();

    try {
      if (isSave) {
        const r = await apiSaveExpenses(
          username.trim().toLowerCase(),
          password,
          expenses,
          budget,                      // ← pass budget
        );
        clearCountdown();
        onSuccess({ type: "save", message: r.message, count: r.saved });
      } else {
        const r = await apiSyncExpenses(
          username.trim().toLowerCase(),
          password,
        );
        clearCountdown();
        onSuccess({
          type: "sync",
          expenses: r.expenses,
          count: r.count,
          budget: r.budget,            // ← pass budget back
          has_budget: r.has_budget,
        });
      }
    } catch (e) {
      clearCountdown();
      setError(e.message);
      setLoading(false);
    }
  };

  // Progress bar width (50 → 0 maps to 100% → 0%)
  const progressPct = countdown !== null ? (countdown / 50) * 100 : 0;

  return (
    <div className="et-modal-overlay" onClick={onClose}>
      <div className="et-modal et-cloud-modal" onClick={e => e.stopPropagation()}>
        <div
          className="et-cloud-modal-icon"
          style={{ background: accent + "18", border: `1px solid ${accent}44` }}
        >
          {isSave ? "☁️" : "🔄"}
        </div>

        <h3>{isSave ? "Save to Cloud" : "Sync from Cloud"}</h3>
        <p className="et-cloud-modal-sub">
          {isSave
            ? "Save your expenses & account data to MongoDB cloud."
            : "Load your cloud expenses & account data to this device."}
        </p>

        {/* ── Countdown UI (shown while loading) ── */}
        {loading && countdown !== null && (
          <div className="et-countdown-wrap">
            <div className="et-countdown-bar-bg">
              <div
                className="et-countdown-bar-fill"
                style={{
                  width: progressPct + "%",
                  background: `linear-gradient(90deg, ${accent}, ${isSave ? "#ef4444" : "#3b82f6"})`,
                  transition: "width 1s linear",
                }}
              />
            </div>
            <div className="et-countdown-row">
              <span className="et-countdown-icon">
                {countdown > 30 ? "🚀" : countdown > 10 ? "⏳" : "✨"}
              </span>
              <span className="et-countdown-text">
                {countdown > 0
                  ? `Server waking up… ${countdown}s`
                  : "Almost there, please wait…"}
              </span>
              {countdown > 0 && (
                <span className="et-countdown-num" style={{ color: accent }}>
                  {countdown}
                </span>
              )}
            </div>
          </div>
        )}

        {step === "username" && (
          <>
            <div className="et-cloud-field">
              <label>Username</label>
              <input
                ref={inputRef}
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(""); }}
                onKeyDown={e => hk(e, handleUsernameNext)}
                placeholder="Enter your username"
                className="et-cloud-input"
                autoComplete="username"
              />
            </div>
            {error && <div className="et-cloud-error">⚠️ {error}</div>}
            <div className="et-modal-actions">
              <button className="et-modal-cancel" onClick={onClose}>Cancel</button>
              <button
                className="et-modal-confirm"
                style={{ background: `linear-gradient(135deg,${accent},${isSave ? "#ef4444" : "#3b82f6"})` }}
                onClick={handleUsernameNext}
                disabled={loading || !username.trim()}
              >
                {loading ? "Checking…" : "Continue →"}
              </button>
            </div>
          </>
        )}

        {step === "password" && (
          <>
            <div className="et-cloud-user-badge">
              <span className="et-cloud-avatar">{username[0]?.toUpperCase()}</span>
              <span>{username}</span>
              <button
                className="et-cloud-change-user"
                onClick={() => { setStep("username"); setPassword(""); setError(""); setUserExists(null); clearCountdown(); }}
              >✎</button>
            </div>

            {userExists === false && (
              <div className="et-cloud-notice" style={{ borderColor: accent + "44", background: accent + "0d" }}>
                🆕 <strong>New account</strong> — will be created.
              </div>
            )}
            {userExists === true && (
              <div className="et-cloud-notice" style={{ borderColor: "#3b82f644", background: "#3b82f60d" }}>
                👤 <strong>Welcome back!</strong> Enter your password.
              </div>
            )}

            <div className="et-cloud-field">
              <label>{userExists === false ? "Create password" : "Password"}</label>
              <div className="et-api-input-wrap">
                <input
                  ref={inputRef}
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={e => hk(e, handleSubmit)}
                  placeholder={userExists === false ? "Min 4 chars" : "Enter password"}
                  className="et-api-input"
                  autoComplete={userExists === false ? "new-password" : "current-password"}
                  disabled={loading}
                />
                <button className="et-api-toggle" onClick={() => setShowPw(s => !s)}>
                  {showPw
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                </button>
              </div>
            </div>

            {/* Accounts/budget info strip */}
            {isSave && budget && budget.accounts && budget.accounts.length > 0 && (
              <div className="et-cloud-notice" style={{ borderColor: "#3b82f644", background: "#3b82f60d", fontSize: 11 }}>
                💳 <strong>{budget.accounts.length} account{budget.accounts.length !== 1 ? "s" : ""}</strong> will also be saved
                {" "}({budget.accounts.map(a => a.name).join(", ")}).
              </div>
            )}

            {error && <div className="et-cloud-error">⚠️ {error}</div>}

            <div className="et-modal-actions">
              <button
                className="et-modal-cancel"
                onClick={onClose}
                disabled={loading}
              >Cancel</button>
              <button
                className="et-modal-confirm"
                style={{
                  background: loading
                    ? "#333"
                    : `linear-gradient(135deg,${accent},${isSave ? "#ef4444" : "#3b82f6"})`,
                }}
                onClick={handleSubmit}
                disabled={loading || !password}
              >
                {loading
                  ? (isSave ? "Saving…" : "Syncing…")
                  : (isSave ? "💾 Save to Cloud" : "🔄 Sync to Device")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Category Manager Modal
// ══════════════════════════════════════════════════════════════════════════════
function CategoryModal({ customCats, catIcons, catColors, onClose, onSave }) {
  const [cats,setCats]=useState([...customCats]);
  const [icons,setIcons]=useState({...catIcons});
  const [colors,setColors]=useState({...catColors});
  const [newName,setNewName]=useState("");
  const [newIcon,setNewIcon]=useState("📦");
  const [newColor,setNewColor]=useState(EXTRA_COLORS[0]);
  const [err,setErr]=useState("");
  const handleAdd=()=>{ const n=newName.trim(); if(!n){setErr("Enter a name.");return;} if(cats.includes(n)){setErr("Already exists.");return;} setCats(p=>[...p,n]); setIcons(p=>({...p,[n]:newIcon})); setColors(p=>({...p,[n]:newColor})); setNewName("");setErr(""); };
  const handleRemove=(cat)=>{ if(DEFAULT_CATEGORIES.includes(cat)) return; setCats(p=>p.filter(c=>c!==cat)); };
  return (
    <div className="et-modal-overlay" onClick={onClose}>
      <div className="et-modal et-cat-modal" onClick={e=>e.stopPropagation()}>
        <div className="et-modal-icon">🏷️</div>
        <h3>Manage Categories</h3>
        <div className="et-cat-modal-list">
          {cats.map(cat=>(
            <div key={cat} className="et-cat-modal-row">
              <span className="et-cat-modal-icon">{icons[cat]||"📌"}</span>
              <span className="et-cat-modal-name" style={{color:colors[cat]||"#6b7280"}}>{cat}</span>
              {!DEFAULT_CATEGORIES.includes(cat)?<button className="et-cat-modal-del" onClick={()=>handleRemove(cat)}>✕</button>:<span className="et-cat-modal-default">default</span>}
            </div>
          ))}
        </div>
        <div className="et-cat-add-row">
          <div className="et-cat-add-top">
            <select className="et-cat-icon-sel" value={newIcon} onChange={e=>setNewIcon(e.target.value)}>{EXTRA_ICONS.map(ic=><option key={ic} value={ic}>{ic}</option>)}</select>
            <input className="et-cat-name-inp" value={newName} onChange={e=>{setNewName(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="New category name…"/>
          </div>
          <div className="et-cat-color-row">{EXTRA_COLORS.map(c=><button key={c} className={`et-color-dot ${newColor===c?"et-color-dot--active":""}`} style={{background:c}} onClick={()=>setNewColor(c)}/>)}</div>
          {err&&<div className="et-cloud-error" style={{marginTop:6}}>⚠️ {err}</div>}
          <button className="et-cat-add-btn" onClick={handleAdd}>+ Add Category</button>
        </div>
        <div className="et-modal-actions" style={{marginTop:14}}>
          <button className="et-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="et-modal-confirm" style={{background:"linear-gradient(135deg,#6366f1,#a855f7)"}} onClick={()=>{onSave(cats,icons,colors);onClose();}}>💾 Save</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Accounts Tab
// ══════════════════════════════════════════════════════════════════════════════
function AccountsTab({ budget, setBudget, showToast, onRecordAccountTransaction }) {
  const curMonth = currentMonthKey();

  const ensureMonth = useCallback((bgt) => {
    if (bgt.months[curMonth]) return bgt;
    const prev = prevMonthKey(curMonth);
    const prevAccs = bgt.months[prev]?.accounts || [];
    const accounts = bgt.accounts.map(acc => {
      const prevAcc = prevAccs.find(a => a.id === acc.id);
      const leftover = prevAcc ? Math.max(0, prevAcc.currentBalance) : 0;
      return { id: acc.id, currentBalance: acc.currentBalance + leftover, carryover: leftover };
    });
    return { ...bgt, months: { ...bgt.months, [curMonth]: { accounts, transfers: [] } } };
  }, [curMonth]);

  useEffect(() => { setBudget(prev => ensureMonth(prev)); }, [ensureMonth, setBudget]);

  const [addModal,   setAddModal]   = useState(false);
  const [editAcc,    setEditAcc]    = useState(null);
  const [xferModal,  setXferModal]  = useState(false);
  const [delAcc,     setDelAcc]     = useState(null);

  const [newName,      setNewName]      = useState("");
  const [newBalance,   setNewBalance]   = useState("");
  const [newType,      setNewType]      = useState("bank");
  const [newColor,     setNewColor]     = useState(ACC_TYPE_META.bank.color);
  const [newDefault,   setNewDefault]   = useState(false);
  const [formErr,      setFormErr]      = useState("");

  const [xFrom, setXFrom] = useState("");
  const [xTo,   setXTo]   = useState("");
  const [xAmt,  setXAmt]  = useState("");
  const [xNote, setXNote] = useState("");
  const [xErr,  setXErr]  = useState("");

  const [editVal, setEditVal] = useState("");
  const [editErr, setEditErr] = useState("");

  const currentAccounts = useMemo(() => {
    const m = budget.months[curMonth];
    if (!m) return budget.accounts.map(acc => ({ ...acc, currentBalance: acc.currentBalance, carryover: 0 }));
    return budget.accounts.map(acc => {
      const mAcc = m.accounts.find(a => a.id === acc.id);
      return { ...acc, currentBalance: mAcc?.currentBalance ?? acc.currentBalance, carryover: mAcc?.carryover || 0 };
    });
  }, [budget, curMonth]);

  const totalBalance = currentAccounts.reduce((s, a) => s + a.currentBalance, 0);

  const patchAccInMonth = (bgt, accId, fn) => {
    const m = bgt.months[curMonth] || { accounts: [], transfers: [] };
    const accExists = m.accounts.find(a => a.id === accId);
    const newAccounts = accExists
      ? m.accounts.map(a => a.id === accId ? fn(a) : a)
      : [...m.accounts, fn({ id: accId, currentBalance: 0, carryover: 0 })];
    return { ...bgt, months: { ...bgt.months, [curMonth]: { ...m, accounts: newAccounts } } };
  };

  const handleAdd = () => {
    const n = newName.trim();
    if (!n) { setFormErr("Enter account name."); return; }
    const bal = parseFloat(newBalance);
    if (isNaN(bal) || bal < 0) { setFormErr("Enter a valid current balance (0 or more)."); return; }
    if (budget.accounts.find(a => a.name.toLowerCase() === n.toLowerCase())) { setFormErr("Account already exists."); return; }
    const newAcc = { id: uid(), name: n, currentBalance: bal, type: newType, color: newColor };
    setBudget(prev => {
      let upd = { ...prev, accounts: [...prev.accounts, newAcc] };
      if (newDefault || upd.accounts.length === 1) {
        upd = { ...upd, defaultAccountId: newAcc.id };
      }
      const m = upd.months[curMonth] || { accounts: [], transfers: [] };
      return { ...upd, months: { ...upd.months, [curMonth]: { ...m, accounts: [...m.accounts, { id: newAcc.id, currentBalance: bal, carryover: 0 }] } } };
    });

    if (bal > 0) {
      onRecordAccountTransaction({
        amount: bal,
        category: "Salary",
        description: `${n} — initial balance`,
        reason: `Account added: ${n} (${newType})`,
        type: "income",
        accountId: newAcc.id,
        accountName: n,
      });
    }

    setNewName(""); setNewBalance(""); setNewType("bank"); setNewColor(ACC_TYPE_META.bank.color); setNewDefault(false); setFormErr(""); setAddModal(false);
    showToast(`✓ ${n} added with balance ${fmt(bal)}${bal > 0 ? " · logged as income" : ""}`, "success");
  };

  const handleSetDefault = (accId) => {
    setBudget(prev => ({ ...prev, defaultAccountId: accId }));
    const acc = budget.accounts.find(a => a.id === accId);
    showToast(`⭐ ${acc?.name} set as default account`, "success");
  };

  const handleEditBalance = (accId) => {
    const newVal = parseFloat(editVal);
    if (isNaN(newVal) || newVal < 0) { setEditErr("Enter valid balance (0 or more)."); return; }

    const acc = currentAccounts.find(a => a.id === accId);
    const oldVal = acc ? acc.currentBalance : 0;
    const diff = newVal - oldVal;

    setBudget(prev => {
      let upd = { ...prev, accounts: prev.accounts.map(a => a.id === accId ? { ...a, currentBalance: newVal } : a) };
      upd = patchAccInMonth(upd, accId, a => ({ ...a, currentBalance: newVal }));
      return upd;
    });

    if (diff !== 0 && acc) {
      onRecordAccountTransaction({
        amount: Math.abs(diff),
        category: diff > 0 ? "Salary" : "Other",
        description: `${acc.name} — balance ${diff > 0 ? "topped up" : "adjusted"}`,
        reason: `Manual balance update: ${fmt(oldVal)} → ${fmt(newVal)}`,
        type: diff > 0 ? "income" : "expense",
        accountId: accId,
        accountName: acc.name,
      });
      showToast(`Balance updated · ${diff > 0 ? "+" : ""}${fmt(diff)} logged as ${diff > 0 ? "income" : "expense"}`, "success");
    } else {
      showToast("Balance updated!", "success");
    }

    setEditAcc(null); setEditVal(""); setEditErr("");
  };

  const handleTransfer = () => {
    if (!xFrom || !xTo) { setXErr("Select both accounts."); return; }
    if (xFrom === xTo) { setXErr("Cannot transfer to same account."); return; }
    const amt = parseFloat(xAmt);
    if (!amt || amt <= 0) { setXErr("Enter valid amount."); return; }
    const fromAcc = currentAccounts.find(a => a.id === xFrom);
    if (!fromAcc || fromAcc.currentBalance < amt) { setXErr(`Insufficient balance in ${fromAcc?.name || "source"}.`); return; }
    setBudget(prev => {
      let upd = ensureMonth(prev);
      upd = patchAccInMonth(upd, xFrom, a => ({ ...a, currentBalance: a.currentBalance - amt }));
      upd = patchAccInMonth(upd, xTo,   a => ({ ...a, currentBalance: a.currentBalance + amt }));
      upd = { ...upd, accounts: upd.accounts.map(a => {
        if (a.id === xFrom) return { ...a, currentBalance: a.currentBalance - amt };
        if (a.id === xTo)   return { ...a, currentBalance: a.currentBalance + amt };
        return a;
      })};
      const m = upd.months[curMonth];
      const tr = { id: uid(), from: xFrom, to: xTo, amount: amt, note: xNote.trim(), timestamp: Date.now() };
      return { ...upd, months: { ...upd.months, [curMonth]: { ...m, transfers: [...(m.transfers || []), tr] } } };
    });
    showToast(`↔ Transferred ${fmt(amt)}`, "success");
    setXFrom(""); setXTo(""); setXAmt(""); setXNote(""); setXErr(""); setXferModal(false);
  };

  const handleDeleteAccount = (accId) => {
    setBudget(prev => {
      let upd = {
        ...prev,
        accounts: prev.accounts.filter(a => a.id !== accId),
        months: Object.fromEntries(Object.entries(prev.months).map(([mk, mv]) => [mk, { ...mv, accounts: mv.accounts.filter(a => a.id !== accId) }]))
      };
      if (upd.defaultAccountId === accId) {
        upd = { ...upd, defaultAccountId: upd.accounts[0]?.id || null };
      }
      return upd;
    });
    setDelAcc(null);
    showToast("Account removed.", "info");
  };

  const transfers = budget.months[curMonth]?.transfers || [];
  const accName = id => budget.accounts.find(a => a.id === id)?.name || "?";

  return (
    <div className="et-records">
      <div className="et-bgt-month-row">
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>💳 Account Details</h3>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "3px 0 0" }}>Track real bank/wallet balances. Account is optional.</p>
        </div>
        <div className="et-bgt-actions">
          <button className="et-bgt-xfer-btn" onClick={() => setXferModal(true)} disabled={budget.accounts.length < 2}>↔ Transfer</button>
          <button className="et-bgt-add-btn" onClick={() => setAddModal(true)}>+ Account</button>
        </div>
      </div>

      {budget.accounts.length > 0 && (
        <div className="et-default-strip">
          <span className="et-default-strip-label">⭐ Default (online/card):</span>
          <span className="et-default-strip-val">
            {budget.accounts.find(a => a.id === budget.defaultAccountId)?.name || "None set — tap ⭐ on a card"}
          </span>
        </div>
      )}

      {currentAccounts.length > 0 && (
        <div className="et-bgt-summary">
          <div className="et-bgt-sum-item">
            <span className="et-bgt-sum-label">Total Balance</span>
            <span className="et-bgt-sum-val" style={{ color: totalBalance >= 0 ? "#22c55e" : "#ef4444" }}>{fmt(totalBalance)}</span>
          </div>
          <div className="et-bgt-sum-divider" />
          <div className="et-bgt-sum-item">
            <span className="et-bgt-sum-label">Accounts</span>
            <span className="et-bgt-sum-val">{currentAccounts.length}</span>
          </div>
          <div className="et-bgt-sum-divider" />
          <div className="et-bgt-sum-item">
            <span className="et-bgt-sum-label">Default</span>
            <span className="et-bgt-sum-val" style={{ fontSize: 13 }}>{budget.accounts.find(a => a.id === budget.defaultAccountId)?.name || "—"}</span>
          </div>
        </div>
      )}

      {budget.accounts.length > 0 && (
        <div style={{ padding: "8px 12px", background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 9, fontSize: 11, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 7 }}>
          <span>📋</span>
          <span>Balance changes (add or edit) are automatically logged as income/expense in <strong style={{color:"rgba(255,255,255,0.7)"}}>📊 Records</strong>.</span>
        </div>
      )}

      {currentAccounts.length === 0 ? (
        <div className="et-no-data">
          No accounts yet. Accounts are <strong style={{ color: "#f59e0b" }}>optional</strong>.<br />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>Add accounts like SBI, ICICI, Wallet, Cash… to track balances.</span><br />
          <button className="et-bgt-add-btn" style={{ marginTop: 16 }} onClick={() => setAddModal(true)}>+ Add First Account</button>
        </div>
      ) : (
        <div className="et-bgt-cards">
          {currentAccounts.map(acc => {
            const meta = ACC_TYPE_META[acc.type] || ACC_TYPE_META.other;
            const isDefault = budget.defaultAccountId === acc.id;
            return (
              <div key={acc.id} className={`et-bgt-card ${isDefault ? "et-bgt-card--default" : ""}`}>
                <div className="et-bgt-card-top">
                  <div className="et-bgt-card-icon" style={{ background: acc.color + "22", color: acc.color }}>{meta.icon}</div>
                  <div className="et-bgt-card-info">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="et-bgt-card-name">{acc.name}</span>
                      {isDefault && <span className="et-default-badge">⭐ Default</span>}
                    </div>
                    <span className="et-bgt-card-type" style={{ color: acc.color }}>{meta.label}</span>
                  </div>
                  <div className="et-bgt-card-right">
                    <span className="et-bgt-card-bal" style={{ color: acc.currentBalance < 0 ? "#ef4444" : "#fff" }}>{fmt(acc.currentBalance)}</span>
                    <span className="et-bgt-card-bal-label">current balance</span>
                  </div>
                  <div className="et-bgt-card-actions">
                    {!isDefault && (
                      <button className="et-bgt-star-btn" title="Set as default" onClick={() => handleSetDefault(acc.id)}>⭐</button>
                    )}
                    <button className="et-bgt-edit-btn" title="Edit balance" onClick={() => { setEditAcc(acc.id); setEditVal(String(acc.currentBalance)); setEditErr(""); }}>✏️</button>
                    <button className="et-del-btn" title="Remove" onClick={() => setDelAcc(acc.id)}>✕</button>
                  </div>
                </div>

                {editAcc === acc.id && (
                  <div className="et-bgt-inline-edit">
                    <span className="et-bgt-inline-label">Update current balance (₹) — difference logged in Records</span>
                    <div className="et-bgt-inline-row">
                      <input className="et-cloud-input" type="number" value={editVal}
                        onChange={e => { setEditVal(e.target.value); setEditErr(""); }}
                        onKeyDown={e => e.key === "Enter" && handleEditBalance(acc.id)}
                        placeholder="e.g. 45000" style={{ flex: 1 }} />
                      <button className="et-modal-confirm" style={{ padding: "7px 14px", fontSize: 12, flex: "unset", borderRadius: 8, background: "linear-gradient(135deg,#22c55e,#16a34a)" }}
                        onClick={() => handleEditBalance(acc.id)}>Save</button>
                      <button className="et-modal-cancel" style={{ padding: "7px 10px", fontSize: 12, flex: "unset", borderRadius: 8 }}
                        onClick={() => setEditAcc(null)}>✕</button>
                    </div>
                    {editErr && <div className="et-cloud-error" style={{ marginTop: 4 }}>⚠️ {editErr}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {transfers.length > 0 && (
        <div className="et-bgt-xfer-log">
          <p className="et-section-label">Transfer History</p>
          {transfers.slice().reverse().map(t => (
            <div key={t.id} className="et-bgt-xfer-row">
              <span className="et-bgt-xfer-icon">↔</span>
              <span className="et-bgt-xfer-from">{accName(t.from)}</span>
              <span className="et-bgt-xfer-arrow">→</span>
              <span className="et-bgt-xfer-to">{accName(t.to)}</span>
              {t.note && <span className="et-bgt-xfer-note">({t.note})</span>}
              <span className="et-bgt-xfer-amt">{fmt(t.amount)}</span>
              <span className="et-bgt-xfer-date">{dateIN(t.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Account Modal ── */}
      {addModal && (
        <div className="et-modal-overlay" onClick={() => setAddModal(false)}>
          <div className="et-modal et-bgt-modal" onClick={e => e.stopPropagation()}>
            <div className="et-modal-icon">🏦</div>
            <h3>Add Account</h3>
            <div className="et-cloud-field">
              <label>Account Name</label>
              <input className="et-cloud-input" value={newName} onChange={e => { setNewName(e.target.value); setFormErr(""); }}
                onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="e.g. SBI, ICICI, Wallet, Cash…" />
            </div>
            <div className="et-cloud-field">
              <label>Current Balance (₹)</label>
              <input className="et-cloud-input" type="number" value={newBalance} onChange={e => { setNewBalance(e.target.value); setFormErr(""); }}
                onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="e.g. 45000 (enter 0 if unknown)" />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4, display: "block" }}>Enter your actual current account balance. If &gt;0, it will be logged as income in Records.</span>
            </div>
            <div className="et-cloud-field">
              <label>Account Type</label>
              <div className="et-bgt-type-grid">
                {Object.entries(ACC_TYPE_META).map(([k, v]) => (
                  <button key={k} className={`et-bgt-type-btn ${newType === k ? "et-bgt-type-btn--active" : ""}`}
                    style={newType === k ? { borderColor: v.color, color: v.color, background: v.color + "18" } : {}}
                    onClick={() => { setNewType(k); setNewColor(v.color); }}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="et-cloud-field">
              <label>Color</label>
              <div className="et-cat-color-row">
                {["#3b82f6","#f59e0b","#22c55e","#a855f7","#ef4444","#06b6d4","#f97316","#ec4899","#6b7280","#14b8a6"].map(c => (
                  <button key={c} className={`et-color-dot ${newColor === c ? "et-color-dot--active" : ""}`} style={{ background: c }} onClick={() => setNewColor(c)} />
                ))}
              </div>
            </div>
            <div className="et-cloud-field">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={newDefault} onChange={e => setNewDefault(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span>Set as default account for online/card payments ⭐</span>
              </label>
            </div>
            {formErr && <div className="et-cloud-error">⚠️ {formErr}</div>}
            <div className="et-modal-actions">
              <button className="et-modal-cancel" onClick={() => setAddModal(false)}>Cancel</button>
              <button className="et-modal-confirm" style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }} onClick={handleAdd}>+ Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfer Modal ── */}
      {xferModal && (
        <div className="et-modal-overlay" onClick={() => setXferModal(false)}>
          <div className="et-modal et-bgt-modal" onClick={e => e.stopPropagation()}>
            <div className="et-modal-icon">↔️</div>
            <h3>Transfer Between Accounts</h3>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center", marginBottom: 14 }}>Balances update instantly.</p>
            <div className="et-cloud-field">
              <label>From</label>
              <select className="et-bgt-select" value={xFrom} onChange={e => { setXFrom(e.target.value); setXErr(""); }}>
                <option value="">— select —</option>
                {currentAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({fmt(a.currentBalance)})</option>)}
              </select>
            </div>
            <div className="et-cloud-field">
              <label>To</label>
              <select className="et-bgt-select" value={xTo} onChange={e => { setXTo(e.target.value); setXErr(""); }}>
                <option value="">— select —</option>
                {currentAccounts.filter(a => a.id !== xFrom).map(a => <option key={a.id} value={a.id}>{a.name} ({fmt(a.currentBalance)})</option>)}
              </select>
            </div>
            <div className="et-cloud-field">
              <label>Amount (₹)</label>
              <input className="et-cloud-input" type="number" value={xAmt} onChange={e => { setXAmt(e.target.value); setXErr(""); }}
                onKeyDown={e => e.key === "Enter" && handleTransfer()} placeholder="e.g. 500" />
            </div>
            <div className="et-cloud-field">
              <label>Note (optional)</label>
              <input className="et-cloud-input" value={xNote} onChange={e => setXNote(e.target.value)} placeholder="e.g. rent, savings…" />
            </div>
            {xErr && <div className="et-cloud-error">⚠️ {xErr}</div>}
            <div className="et-modal-actions">
              <button className="et-modal-cancel" onClick={() => setXferModal(false)}>Cancel</button>
              <button className="et-modal-confirm" style={{ background: "linear-gradient(135deg,#0ea5e9,#6366f1)" }} onClick={handleTransfer}>↔ Transfer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Account Confirm ── */}
      {delAcc && (
        <div className="et-modal-overlay" onClick={() => setDelAcc(null)}>
          <div className="et-modal" onClick={e => e.stopPropagation()}>
            <div className="et-modal-icon">🗑️</div>
            <h3>Remove Account?</h3>
            <p>This removes <strong>{budget.accounts.find(a => a.id === delAcc)?.name}</strong>. Cannot be undone.</p>
            <div className="et-modal-actions">
              <button className="et-modal-cancel" onClick={() => setDelAcc(null)}>Cancel</button>
              <button className="et-modal-confirm" onClick={() => handleDeleteAccount(delAcc)}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Category Breakdown Tab
// ══════════════════════════════════════════════════════════════════════════════
function CategoryBreakdown({ expenses, catIcons, catColors }) {
  const [period, setPeriod] = useState("month");
  const [selectedCat, setSelectedCat] = useState("all");

  const filtered = useMemo(() => {
    const ist = new Date(Date.now() + 5.5 * 3600000);
    const today = isoDate(ist), thisWeek = weekKey(ist), thisMonth = monthKey(ist), thisYear = yearKey(ist);
    return expenses.filter(e => {
      if (e.type !== "expense") return false;
      if (period === "day")   return isoDate(e.timestamp) === today;
      if (period === "week")  return weekKey(e.timestamp) === thisWeek;
      if (period === "month") return monthKey(e.timestamp) === thisMonth;
      if (period === "year")  return yearKey(e.timestamp) === thisYear;
      return true;
    });
  }, [expenses, period]);

  const byCategory = useMemo(() => {
    const map = {};
    for (const e of filtered) {
      if (!map[e.category]) map[e.category] = { total: 0, count: 0, items: [] };
      map[e.category].total += e.amount;
      map[e.category].count++;
      map[e.category].items.push(e);
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const totalExp = byCategory.reduce((s, [, v]) => s + v.total, 0);
  const maxVal   = byCategory.length ? byCategory[0][1].total : 1;
  const periodLabel = { day: "Today", week: "This Week", month: "This Month", year: "This Year" }[period];

  const catDetail = useMemo(() => {
    if (selectedCat === "all") return null;
    const found = byCategory.find(([cat]) => cat === selectedCat);
    return found ? found[1] : null;
  }, [selectedCat, byCategory]);

  useEffect(() => {
    if (selectedCat !== "all") {
      const exists = byCategory.some(([cat]) => cat === selectedCat);
      if (!exists) setSelectedCat("all");
    }
  }, [byCategory, selectedCat]);

  const availableCategories = byCategory.map(([cat]) => cat);

  return (
    <div className="et-records">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="et-view-toggle" style={{ flex: 1 }}>
          {[["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"]].map(([v, l]) =>
            <button key={v} className={`et-view-btn ${period === v ? "et-view-btn--active" : ""}`} onClick={() => setPeriod(v)}>{l}</button>
          )}
        </div>
        {availableCategories.length > 0 && (
          <select
            className="et-bgt-select et-cat-filter-sel"
            value={selectedCat}
            onChange={e => setSelectedCat(e.target.value)}
            style={{ minWidth: 140, maxWidth: 180 }}
          >
            <option value="all">All Categories</option>
            {availableCategories.map(cat => (
              <option key={cat} value={cat}>{catIcons[cat] || "📌"} {cat}</option>
            ))}
          </select>
        )}
      </div>

      {byCategory.length === 0 ? (
        <div className="et-no-data">No expenses for {periodLabel.toLowerCase()}. Start tracking! 💬</div>
      ) : selectedCat !== "all" && catDetail ? (
        <div className="et-catdetail">
          <div className="et-catdetail-header">
            <div className="et-catbreak-icon" style={{ background: (catColors[selectedCat] || "#6b7280") + "22", color: catColors[selectedCat] || "#6b7280", width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              {catIcons[selectedCat] || "📌"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{selectedCat}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{catDetail.count} transaction{catDetail.count !== 1 ? "s" : ""} · {periodLabel}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: catColors[selectedCat] || "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(catDetail.total)}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{totalExp > 0 ? Math.round(catDetail.total / totalExp * 100) : 0}% of total</div>
            </div>
          </div>
          <div className="et-catdetail-list">
            {catDetail.items.sort((a, b) => b.timestamp - a.timestamp).map(e => (
              <div key={e.id} className="et-catdetail-item">
                <div className="et-catdetail-item-left">
                  <span className="et-catdetail-item-desc">{e.description || "—"}</span>
                  {e.reason && <span className="et-catdetail-item-reason">{e.reason}</span>}
                </div>
                <div className="et-catdetail-item-right">
                  <span className="et-catdetail-item-amt" style={{ color: catColors[selectedCat] || "#6b7280" }}>{fmt(e.amount)}</span>
                  <span className="et-catdetail-item-date">{dateIN(e.timestamp)} {timeIN(e.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="et-catbreak-total">
            <span className="et-catbreak-total-label">{periodLabel} Total Spend</span>
            <span className="et-catbreak-total-val">{fmt(totalExp)}</span>
          </div>
          <div className="et-catbreak-grid">
            {byCategory.map(([cat, data]) => {
              const pct = Math.round(data.total / totalExp * 100), barW = Math.max(4, Math.round(data.total / maxVal * 100));
              const color = catColors[cat] || "#6b7280", icon = catIcons[cat] || "📌";
              return (
                <div key={cat} className="et-catbreak-card" onClick={() => setSelectedCat(cat)} style={{ cursor: "pointer" }}>
                  <div className="et-catbreak-card-top">
                    <div className="et-catbreak-icon" style={{ background: color + "22", color }}>{icon}</div>
                    <div className="et-catbreak-info"><span className="et-catbreak-name">{cat}</span><span className="et-catbreak-count">{data.count} txn{data.count !== 1 ? "s" : ""}</span></div>
                    <div className="et-catbreak-right"><span className="et-catbreak-amt" style={{ color }}>{fmt(data.total)}</span><span className="et-catbreak-pct">{pct}%</span></div>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginLeft: 4 }}>›</span>
                  </div>
                  <div className="et-catbreak-bar-wrap"><div className="et-catbreak-bar" style={{ width: barW + "%", background: `linear-gradient(90deg,${color},${color}88)` }} /></div>
                  <div className="et-catbreak-items">
                    {data.items.slice(0, 3).map(e => <div key={e.id} className="et-catbreak-item"><span className="et-catbreak-item-desc">{e.description || "—"}</span><span className="et-catbreak-item-date">{dateIN(e.timestamp)}</span><span className="et-catbreak-item-amt">{fmt(e.amount)}</span></div>)}
                    {data.items.length > 3 && <div className="et-catbreak-more">+{data.items.length - 3} more · tap card to view all</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="et-catbreak-summary">
            <p className="et-catbreak-summary-title">Category Share</p>
            <div className="et-catbreak-pies">
              {byCategory.map(([cat, data]) => { const pct = Math.round(data.total / totalExp * 100), color = catColors[cat] || "#6b7280"; return (
                <div key={cat} className="et-catbreak-pie-row" onClick={() => setSelectedCat(cat)} style={{ cursor: "pointer" }}>
                  <div className="et-catbreak-pie-dot" style={{ background: color }} />
                  <span className="et-catbreak-pie-name">{catIcons[cat] || "📌"} {cat}</span>
                  <div className="et-catbreak-pie-bar-wrap"><div className="et-catbreak-pie-bar" style={{ width: pct + "%", background: color }} /></div>
                  <span className="et-catbreak-pie-pct" style={{ color }}>{pct}%</span>
                  <span className="et-catbreak-pie-amt">{fmt(data.total)}</span>
                </div>
              ); })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Loans / Splits Tab
// ══════════════════════════════════════════════════════════════════════════════
function LoansTab({ loans, onRepay, onDeleteLoan }) {
  const [deleteCfm,  setDeleteCfm]  = useState(null);
  const [repayModal, setRepayModal] = useState(null);
  const [repayAmt,   setRepayAmt]   = useState("");
  const [repayErr,   setRepayErr]   = useState("");

  const personMap = useMemo(()=>{ const map={}; for(const loan of loans){ for(const split of loan.splits){ if(!map[split.name]) map[split.name]={owed:0,paid:0,history:[]}; if(split.type==="owe") map[split.name].owed+=split.amount; if(split.type==="repaid") map[split.name].paid+=split.amount; map[split.name].history.push({...split,description:loan.description,timestamp:loan.timestamp}); } } return Object.entries(map).sort((a,b)=>(b[1].owed-b[1].paid)-(a[1].owed-a[1].paid)); },[loans]);
  const totalOwed = personMap.reduce((s,[,v])=>s+Math.max(0,v.owed-v.paid),0);
  const handleRepayConfirm=()=>{ const amt=parseFloat(repayAmt); if(!amt||amt<=0){setRepayErr("Enter valid amount.");return;} if(amt>repayModal.maxAmt){setRepayErr(`Max owed is ${fmt(repayModal.maxAmt)}`);return;} onRepay(repayModal.name,amt); setRepayModal(null); setRepayAmt(""); };

  return (
    <div className="et-records">
      {personMap.length===0?(
        <div className="et-no-data">No splits yet.<br/><span style={{fontSize:12,color:"rgba(255,255,255,0.25)"}}>Try: "Pizza for Ram and Anand ₹900"</span></div>
      ):(
        <>
          <div className="et-loans-total-bar"><span className="et-loans-total-label">💸 Total Owed to You</span><span className="et-loans-total-val">{fmt(totalOwed)}</span></div>
          <div className="et-loans-grid">
            {personMap.map(([name,data])=>{ const due=Math.max(0,data.owed-data.paid), isPaid=due<=0; return (
              <div key={name} className={`et-loan-card ${isPaid?"et-loan-card--paid":""}`}>
                <div className="et-loan-card-top">
                  <div className="et-loan-avatar" style={{background:isPaid?"#22c55e22":"#f59e0b22",borderColor:isPaid?"#22c55e44":"#f59e0b44",color:isPaid?"#22c55e":"#f59e0b"}}>{name[0].toUpperCase()}</div>
                  <div className="et-loan-info"><span className="et-loan-name">{name}</span><span className="et-loan-meta">Lent: {fmt(data.owed)} · Paid: {fmt(data.paid)}</span></div>
                  <div className="et-loan-right">
                    <span className="et-loan-due" style={{color:isPaid?"#22c55e":"#f59e0b"}}>{isPaid?"✓ Cleared":fmt(due)+" due"}</span>
                    {!isPaid&&<button className="et-loan-repay-btn" onClick={()=>{setRepayModal({name,maxAmt:due});setRepayAmt("");setRepayErr("");}}>Mark Paid</button>}
                  </div>
                </div>
                <div className="et-loan-history">
                  {data.history.slice().sort((a,b)=>b.timestamp-a.timestamp).map((h,i)=>(
                    <div key={i} className={`et-loan-hist-row et-loan-hist-row--${h.type}`}>
                      <span>{h.type==="owe"?"📤":"📥"}</span>
                      <span className="et-loan-hist-desc">{h.description}</span>
                      <span className="et-loan-hist-date">{dateIN(h.timestamp)}</span>
                      <span className="et-loan-hist-amt" style={{color:h.type==="owe"?"#f59e0b":"#22c55e"}}>{h.type==="owe"?"owes ":"paid "}{fmt(h.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ); })}
          </div>
          <div className="et-loans-log">
            <p className="et-section-label">All Split Transactions</p>
            {loans.slice().sort((a,b)=>b.timestamp-a.timestamp).map(loan=>(
              <div key={loan.id} className="et-loan-log-entry">
                <div className="et-loan-log-header">
                  <span className="et-loan-log-desc">🍕 {loan.description}</span>
                  <span className="et-loan-log-date">{dateIN(loan.timestamp)}</span>
                  <button className="et-del-btn" onClick={()=>setDeleteCfm(loan.id)}>✕</button>
                </div>
                <div className="et-loan-log-splits">
                  {loan.splits.map((s,i)=><span key={i} className={`et-loan-log-split et-loan-log-split--${s.type}`}>{s.name}: {s.type==="owe"?"owes":"paid"} {fmt(s.amount)}</span>)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {repayModal&&(
        <div className="et-modal-overlay" onClick={()=>setRepayModal(null)}>
          <div className="et-modal" onClick={e=>e.stopPropagation()}>
            <div className="et-modal-icon">💰</div>
            <h3>{repayModal.name} paid back</h3>
            <p>Max due: <strong>{fmt(repayModal.maxAmt)}</strong></p>
            <div className="et-cloud-field"><label>Amount Received</label><input className="et-cloud-input" type="number" value={repayAmt} onChange={e=>{setRepayAmt(e.target.value);setRepayErr("");}} onKeyDown={e=>e.key==="Enter"&&handleRepayConfirm()} placeholder={`Max ${fmt(repayModal.maxAmt)}`}/></div>
            {repayErr&&<div className="et-cloud-error">⚠️ {repayErr}</div>}
            <div className="et-modal-actions"><button className="et-modal-cancel" onClick={()=>setRepayModal(null)}>Cancel</button><button className="et-modal-confirm" style={{background:"linear-gradient(135deg,#22c55e,#16a34a)"}} onClick={handleRepayConfirm}>✓ Confirm</button></div>
          </div>
        </div>
      )}
      {deleteCfm&&(
        <div className="et-modal-overlay" onClick={()=>setDeleteCfm(null)}>
          <div className="et-modal" onClick={e=>e.stopPropagation()}>
            <div className="et-modal-icon">🗑️</div><h3>Delete this split?</h3><p>This removes the split record permanently.</p>
            <div className="et-modal-actions"><button className="et-modal-cancel" onClick={()=>setDeleteCfm(null)}>Cancel</button><button className="et-modal-confirm" onClick={()=>{onDeleteLoan(deleteCfm);setDeleteCfm(null);}}>Delete</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main Component
// ══════════════════════════════════════════════════════════════════════════════
export default function ExpenseTracker() {

  const [customCatData, setCustomCatData] = useState(()=>{ try{ const s=JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY)||"null"); if(s) return s; }catch{} return {categories:[...DEFAULT_CATEGORIES],icons:{...DEFAULT_CAT_ICONS},colors:{...DEFAULT_CAT_COLORS}}; });
  const categories=customCatData.categories, catIcons=customCatData.icons, catColors=customCatData.colors;

  const [expenses, setExpenses] = useState(()=>{ const shared=decodeShare(window.location.search); if(shared) return shared; try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");}catch{return [];} });
  const [loans, setLoans] = useState(()=>{ try{return JSON.parse(localStorage.getItem(LOANS_KEY)||"[]");}catch{return [];} });
  const [budget, setBudget] = useState(()=>{
    try {
      const saved = JSON.parse(localStorage.getItem(BUDGET_KEY)||"null");
      if (saved) return saved;
    } catch {}
    return { accounts:[], months:{}, defaultAccountId: null };
  });

  const [selectedProvider, setSelectedProvider] = useState("free");
  const [selectedModel,    setSelectedModel]    = useState(CLOUD_MODELS.free[0].id);
  const [apiKeys, setApiKeys] = useState(()=>{ try{return JSON.parse(localStorage.getItem(API_KEYS_KEY)||"{}");}catch{return {};} });

  const [messages, setMessages] = useState([{ role:"assistant", content:"👋 **Namaste!** I'm your AI expense tracker.\n\nTell me things like:\n- *\"Paid ₹150 for food\"*\n- *\"Paid ₹50 for auto cash\"* (deducts from cash account if added)\n- *\"Pizza for Ram and Anand and me ₹900\"* (split!)\n- *\"How much did I spend on food last month?\"* (I'll analyze your data!)\n- *\"What is my SBI balance?\"* (shows balance + last 5 transactions!)\n- *\"Anand pay 20\"* (marks repayment + adds to Records & account!)\n\nAccounts are **optional** — add them in 💳 Accounts tab to track balances.", id:uid() }]);
  const [input,        setInput]       = useState("");
  const [loading,      setLoading]     = useState(false);
  const [tab,          setTab]         = useState("chat");
  const [tableView,    setTableView]   = useState("day");
  const [cmpView,      setCmpView]     = useState("month");
  const [isListening,  setIsListening] = useState(false);
  const [shareState,   setShareState]  = useState("idle");
  const [deleteCfm,    setDeleteCfm]   = useState(null);
  const [sidebarOpen,  setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen]= useState(false);
  const [catModalOpen, setCatModalOpen]= useState(false);
  const [cloudModal,   setCloudModal]  = useState(null);
  const [toast,        setToast]       = useState(null);

  const historyRef  = useRef([]);
  const messagesEnd = useRef(null);
  const recognRef   = useRef(null);
  const textareaRef = useRef(null);

  useEffect(()=>{ localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses)); }, [expenses]);
  useEffect(()=>{ localStorage.setItem(API_KEYS_KEY, JSON.stringify(apiKeys)); }, [apiKeys]);
  useEffect(()=>{ localStorage.setItem(LOANS_KEY, JSON.stringify(loans)); }, [loans]);
  useEffect(()=>{ localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(customCatData)); }, [customCatData]);
  useEffect(()=>{ localStorage.setItem(BUDGET_KEY, JSON.stringify(budget)); }, [budget]);
  useEffect(()=>{ messagesEnd.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);
  useEffect(()=>{ if(textareaRef.current){textareaRef.current.style.height="auto";textareaRef.current.style.height=textareaRef.current.scrollHeight+"px";} }, [input]);

  const showToast = useCallback((message, type="success") => { setToast({message,type,id:uid()}); }, []);

  const handleRecordAccountTransaction = useCallback(({ amount, category, description, reason, type, accountId, accountName }) => {
    const newEntry = {
      id: uid(),
      amount,
      category: DEFAULT_CATEGORIES.includes(category) ? category : "Other",
      description: description.slice(0, 80),
      reason: (reason || "").slice(0, 100),
      type,
      timestamp: Date.now(),
      accountId,
      accountName,
      provider: "system",
      model: "account-update",
    };
    setExpenses(prev => [newEntry, ...prev].sort((a, b) => b.timestamp - a.timestamp));
  }, []);

  const applyAccountAction = useCallback((accountAction) => {
    if (!accountAction) return { applied: false, message: "" };
    const { accountId, accountName, delta, account_not_found, account_type_missing } = accountAction;

    if (account_not_found && account_type_missing) {
      return {
        applied: false,
        message: `⚠️ Please add a **${account_type_missing}** account in 💳 Accounts tab first.`
      };
    }

    if (!accountId) return { applied: false, message: "" };

    const curMonth = currentMonthKey();
    setBudget(prev => {
      const accExists = prev.accounts.find(a => a.id === accountId);
      if (!accExists) return prev;

      const updAccounts = prev.accounts.map(a =>
        a.id === accountId ? { ...a, currentBalance: a.currentBalance + delta } : a
      );

      const m = prev.months[curMonth] || { accounts: [], transfers: [] };
      const monthAccExists = m.accounts.find(a => a.id === accountId);
      const newMonthAccounts = monthAccExists
        ? m.accounts.map(a => a.id === accountId ? { ...a, currentBalance: a.currentBalance + delta } : a)
        : [...m.accounts, { id: accountId, currentBalance: accExists.currentBalance + delta, carryover: 0 }];

      return {
        ...prev,
        accounts: updAccounts,
        months: { ...prev.months, [curMonth]: { ...m, accounts: newMonthAccounts } }
      };
    });

    const action = delta < 0 ? `Deducted ${fmt(Math.abs(delta))} from` : `Added ${fmt(delta)} to`;
    return { applied: true, message: `${action} **${accountName}**` };
  }, []);

  const refundAccountForExpense = useCallback((expense) => {
    if (!budget.accounts.length || !budget.defaultAccountId) return;
    if (expense.type !== "expense") return;
    const curMonth = currentMonthKey();
    const refundAmt = expense.amount;
    setBudget(prev => {
      if (!prev.accounts.length || !prev.defaultAccountId) return prev;
      const updAccounts = prev.accounts.map(a =>
        a.id === prev.defaultAccountId ? { ...a, currentBalance: a.currentBalance + refundAmt } : a
      );
      const m = prev.months[curMonth] || { accounts: [], transfers: [] };
      const monthAccExists = m.accounts.find(a => a.id === prev.defaultAccountId);
      const newMonthAccounts = monthAccExists
        ? m.accounts.map(a => a.id === prev.defaultAccountId ? { ...a, currentBalance: a.currentBalance + refundAmt } : a)
        : m.accounts;
      return {
        ...prev,
        accounts: updAccounts,
        months: { ...prev.months, [curMonth]: { ...m, accounts: newMonthAccounts } }
      };
    });
  }, [budget]);

  // const handleCloudSuccess = useCallback((result) => {
  //   setCloudModal(null);
  //   if (result.type==="save") { showToast(`☁️ ${result.message}`,"success"); }
  //   else if (result.type==="sync") { setExpenses(prev=>{ const m=Object.fromEntries(prev.map(e=>[e.id,e])); for(const e of result.expenses) m[e.id]=e; return Object.values(m).sort((a,b)=>b.timestamp-a.timestamp); }); showToast(`🔄 Synced ${result.count} expenses from cloud.`,"success"); }
  // }, [showToast]);

const handleCloudSuccess = useCallback((result) => {
  setCloudModal(null);
  if (result.type === "save") {
    showToast(`☁️ ${result.message}`, "success");
  } else if (result.type === "sync") {
    // Merge expenses
    setExpenses(prev => {
      const m = Object.fromEntries(prev.map(e => [e.id, e]));
      for (const e of result.expenses) m[e.id] = e;
      return Object.values(m).sort((a, b) => b.timestamp - a.timestamp);
    });

    // Restore budget/accounts if present
    if (result.has_budget && result.budget) {
      setBudget(result.budget);
      const accCount = result.budget?.accounts?.length || 0;
      showToast(
        `🔄 Synced ${result.count} expenses${accCount ? ` + ${accCount} account${accCount !== 1 ? "s" : ""}` : ""} from cloud.`,
        "success",
      );
    } else {
      showToast(`🔄 Synced ${result.count} expenses from cloud.`, "success");
    }
  }
}, [showToast, setBudget]);
  const handleProviderChange = useCallback((prov) => {
    setSelectedProvider(prov);
    const mods=CLOUD_MODELS[prov]||[];
    if(mods.length) setSelectedModel(mods[0].id);
  }, []);

  const handleApiKeyChange   = useCallback((prov, key) => { setApiKeys(prev=>({...prev,[prov]:key})); }, []);
  const handleSaveCats       = useCallback((cats, icons, colors) => { setCustomCatData({categories:cats,icons,colors}); showToast("Categories updated!","success"); }, [showToast]);

  const startVoice = useCallback(() => {
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Voice input not supported.");return;}
    const r=new SR(); r.lang="en-IN"; r.interimResults=false; r.maxAlternatives=1;
    r.onresult=e=>{setInput(prev=>prev+" "+e.results[0][0].transcript);}; r.onend=()=>setIsListening(false); r.onerror=()=>setIsListening(false);
    r.start(); recognRef.current=r; setIsListening(true);
  }, []);
  const stopVoice = useCallback(() => { recognRef.current?.stop(); setIsListening(false); }, []);

  // ── handleRepay: marks repayment in splits AND adds income record + credits account ──
  const handleRepay = useCallback((name, amount) => {
    // 1. Update loan splits
    setLoans(prev => {
      const updated=[...prev]; let remaining=amount;
      for(let i=updated.length-1;i>=0&&remaining>0;i--){
        const loan={...updated[i],splits:[...updated[i].splits]};
        for(let j=0;j<loan.splits.length&&remaining>0;j++){
          const split=loan.splits[j];
          if(split.name===name&&split.type==="owe"){ const repaid=Math.min(split.amount,remaining); loan.splits.push({name,amount:repaid,type:"repaid"}); remaining-=repaid; }
        }
        updated[i]=loan;
      }
      return updated;
    });

    // 2. Add income record to expenses (Records section)
    const repayEntry = {
      id: uid(),
      amount,
      category: "Other",
      description: `${name} repaid ₹${amount}`,
      reason: "Loan repayment received",
      type: "income",
      timestamp: Date.now(),
      provider: "system",
      model: "repayment",
      accountId: null,
      accountName: null,
    };

    // 3. Also credit to default account if available
    setBudget(prev => {
      if (!prev.accounts.length || !prev.defaultAccountId) {
        // No account — just store entry without account info
        return prev;
      }
      const curMonth = currentMonthKey();
      const accId = prev.defaultAccountId;
      const accName = prev.accounts.find(a => a.id === accId)?.name || "";

      // Patch entry with account info
      repayEntry.accountId = accId;
      repayEntry.accountName = accName;

      const updAccounts = prev.accounts.map(a =>
        a.id === accId ? { ...a, currentBalance: a.currentBalance + amount } : a
      );
      const m = prev.months[curMonth] || { accounts: [], transfers: [] };
      const monthAccExists = m.accounts.find(a => a.id === accId);
      const newMonthAccounts = monthAccExists
        ? m.accounts.map(a => a.id === accId ? { ...a, currentBalance: a.currentBalance + amount } : a)
        : [...m.accounts, { id: accId, currentBalance: (prev.accounts.find(a=>a.id===accId)?.currentBalance||0) + amount, carryover: 0 }];

      return {
        ...prev,
        accounts: updAccounts,
        months: { ...prev.months, [curMonth]: { ...m, accounts: newMonthAccounts } }
      };
    });

    setExpenses(prev => [repayEntry, ...prev].sort((a, b) => b.timestamp - a.timestamp));
    showToast(`✓ Marked ${name} paid ${fmt(amount)} · added to Records`, "success");
  }, [showToast]);

  const handleDeleteLoan = useCallback((loanId) => { setLoans(prev=>prev.filter(l=>l.id!==loanId)); }, []);

  // ── Transfer detection — for showing redirect message in chat ──
  const detectTransferIntent = useCallback((text) => {
    const lower = text.toLowerCase();
    const transferKeywords = ["transfer", "move money", "send money"];
    const hasTransferWord = transferKeywords.some(kw => lower.includes(kw));
    // Also catch "from X to Y" patterns with account names
    const fromToPattern = /from\s+\w+\s+to\s+\w+/i.test(text);
    return hasTransferWord || fromToPattern;
  }, []);

  const detectAccountQuery = useCallback((text) => {
    if (!budget.accounts.length) return null;
    const lower = text.toLowerCase();
    const balanceKeywords = ["balance", "amount", "how much", "current", "transactions", "history", "statement", "show me", "what is", "check"];
    const hasBalanceIntent = balanceKeywords.some(kw => lower.includes(kw));
    if (!hasBalanceIntent) return null;
    for (const acc of budget.accounts) {
      if (lower.includes(acc.name.toLowerCase())) return acc;
    }
    return null;
  }, [budget.accounts]);

  const handleSend = useCallback(async (overrideText) => {
    const text=(overrideText??input).trim();
    if(!text||loading) return;
    setInput("");

    // ── Strict transfer redirect (works regardless of account setup) ──
    if (detectTransferIntent(text)) {
      setMessages(p=>[...p,
        {role:"user",content:text,id:uid()},
        {role:"assistant",content:"🔄 To transfer money between accounts, please go to the **💳 Accounts** tab and tap the **↔ Transfer** button. This ensures your balances are updated correctly!",id:uid()}
      ]);
      return;
    }

    if (budget.accounts.length === 0 && detectTransferIntent(text)) {
      setMessages(p=>[...p,
        {role:"user",content:text,id:uid()},
        {role:"assistant",content:"⚠️ You don't have any accounts set up yet!\n\nTo transfer money or track by account, please:\n1. Tap the **💳 Accounts** tab above\n2. Add your accounts (SBI, ICICI, Wallet, Cash, etc.)\n3. Come back here to transfer!\n\nAdding accounts is **quick and optional** — but it's needed for balance tracking and transfers. 🏦",id:uid()}
      ]);
      return;
    }

    // ── Helper to process AI response (shared between free and paid providers) ──
    const processAIResponse = async (aiText, providerName, modelName) => {
      historyRef.current=[...historyRef.current,{role:"assistant",content:aiText}];

      let newExpense=null;
      let accountMsg = "";
      const bm=aiText.match(/<expense_data>([\s\S]*?)<\/expense_data>/);
      if(bm){ try{
        const p=JSON.parse(bm[1]);
        if(p.amount&&p.amount>0){
          const ts=p.timestamp&&Number.isFinite(p.timestamp)&&p.timestamp>0?p.timestamp:Date.now();
          const accountId  = p.account_action?.accountId  || null;
          const accountName= p.account_action?.accountName|| null;
          newExpense={
            id:uid(), amount:p.amount,
            category:categories.includes(p.category)?p.category:"Other",
            description:(p.description||text).slice(0,80),
            reason:(p.reason||"").slice(0,100),
            type:p.type==="income"?"income":"expense",
            timestamp:ts,
            provider:providerName, model:modelName,
            accountId, accountName,
          };
          setExpenses(prev=>[newExpense,...prev].sort((a,b)=>b.timestamp-a.timestamp));
          if (p.account_action && budget.accounts.length > 0) {
            const result = applyAccountAction(p.account_action);
            if (!result.applied && result.message) accountMsg = "\n\n" + result.message;
            else if (result.applied && result.message) accountMsg = "\n\n💳 " + result.message;
          }
        }
      }catch{} }

      let newLoan=null;
      const lm=aiText.match(/<loan_data>([\s\S]*?)<\/loan_data>/);
      if(lm){ try{
        const p=JSON.parse(lm[1]);
        if(p.splits&&p.splits.length>0){
          // Filter out any "me", "you", "myself", "i" entries the AI might accidentally include
          const filteredSplits = p.splits.filter(s => {
            const n = (s.name||"").toLowerCase().trim();
            return n !== "me" && n !== "you" && n !== "myself" && n !== "i" && n !== "user";
          });
          if(filteredSplits.length>0){
            newLoan={id:uid(),description:p.description||text,timestamp:p.timestamp||Date.now(),splits:filteredSplits};
            setLoans(prev=>[newLoan,...prev]);
          }
        }
      }catch{} }

      const rm=aiText.match(/<loan_repayment>([\s\S]*?)<\/loan_repayment>/);
      if(rm){ try{
        const p=JSON.parse(rm[1]);
        if(p.name&&p.amount>0) {
          // If AI also provided an expense_data for the repayment income, don't double-add
          // The expense_data block already handles it; just update splits
          if (!newExpense) {
            // No expense_data emitted — call handleRepay which adds income record + credits account
            handleRepay(p.name, p.amount);
          } else {
            // expense_data was emitted — just update the loan splits
            setLoans(prev => {
              const updated=[...prev]; let remaining=p.amount;
              for(let i=updated.length-1;i>=0&&remaining>0;i--){
                const loan={...updated[i],splits:[...updated[i].splits]};
                for(let j=0;j<loan.splits.length&&remaining>0;j++){
                  const split=loan.splits[j];
                  if(split.name===p.name&&split.type==="owe"){ const repaid=Math.min(split.amount,remaining); loan.splits.push({name:p.name,amount:repaid,type:"repaid"}); remaining-=repaid; }
                }
                updated[i]=loan;
              }
              return updated;
            });
          }
        }
      }catch{} }

      const displayText=(aiText
        .replace(/<expense_data>[\s\S]*?<\/expense_data>/g,"")
        .replace(/<loan_data>[\s\S]*?<\/loan_data>/g,"")
        .replace(/<loan_repayment>[\s\S]*?<\/loan_repayment>/g,"")
        .replace(/<transfer_request>[\s\S]*?<\/transfer_request>/g,"")
        .trim()) + accountMsg;

      return { displayText, newExpense, newLoan };
    };

    // ── FREE provider ──
    if (selectedProvider === "free") {
      setMessages(p=>[...p,{role:"user",content:text,id:uid()}]);
      setLoading(true);
      historyRef.current=[...historyRef.current,{role:"user",content:text}];
      try {
        const aiText = await callFreeAI(
          historyRef.current, text, categories,
          budget.accounts, budget.defaultAccountId, expenses
        );
        const { displayText, newExpense, newLoan } = await processAIResponse(aiText, "free", "free");
        setMessages(p=>[...p,{role:"assistant",content:displayText,expense:newExpense,loan:newLoan,id:uid(),provider:"free"}]);
      } catch(err){ setMessages(p=>[...p,{role:"assistant",content:`⚠️ ${err.message}`,id:uid()}]); }
      finally { setLoading(false); }
      return;
    }

    // ── Other providers ──
    const apiKey=apiKeys[selectedProvider]||"";
    if(!apiKey){ setMessages(p=>[...p,{role:"user",content:text,id:uid()},{role:"assistant",content:`⚠️ No API key set for **${PROVIDERS[selectedProvider]?.label}**. Tap ⚙️ to add your key.`,id:uid()}]); return; }
    setMessages(p=>[...p,{role:"user",content:text,id:uid()}]);
    setLoading(true);
    historyRef.current=[...historyRef.current,{role:"user",content:text}];
    try {
      const aiText=await callAI(
        selectedProvider, selectedModel, apiKey,
        historyRef.current, text, categories,
        budget.accounts, budget.defaultAccountId,
        expenses
      );
      const { displayText, newExpense, newLoan } = await processAIResponse(aiText, selectedProvider, selectedModel);
      setMessages(p=>[...p,{role:"assistant",content:displayText,expense:newExpense,loan:newLoan,id:uid(),provider:selectedProvider}]);
    } catch(err){ setMessages(p=>[...p,{role:"assistant",content:`⚠️ ${err.message}`,id:uid()}]); }
    finally { setLoading(false); }
  }, [input,loading,selectedProvider,selectedModel,apiKeys,categories,budget,handleRepay,applyAccountAction,expenses,detectTransferIntent,detectAccountQuery]);

  const handleShare = useCallback(() => {
    const url=encodeShare(expenses); if(!url) return;
    if(navigator.share){ navigator.share({title:"My Expense Session",url}).catch(()=>{navigator.clipboard.writeText(url);setShareState("copied");setTimeout(()=>setShareState("idle"),2500);}); }
    else{ navigator.clipboard.writeText(url);setShareState("copied");setTimeout(()=>setShareState("idle"),2500); }
  }, [expenses]);

  const confirmDeleteItem = (id, desc) => setDeleteCfm({type:"item", id, label:desc||"this entry"});
  const confirmDeleteDay   = (key) => setDeleteCfm({type:"day",  key, label:key});
  const confirmDeleteMonth = (key) => setDeleteCfm({type:"month",key, label:key});

  const executeDelete = () => {
    if (!deleteCfm) return;
    if (deleteCfm.type === "item") {
      const exp = expenses.find(e => e.id === deleteCfm.id);
      if (exp && exp.type === "expense" && budget.accounts.length > 0 && budget.defaultAccountId) {
        refundAccountForExpense(exp);
        showToast(`↩ ${fmt(exp.amount)} refunded to ${budget.accounts.find(a=>a.id===budget.defaultAccountId)?.name}`, "success");
      }
      setExpenses(p => p.filter(e => e.id !== deleteCfm.id));
    }
    if (deleteCfm.type === "day")   setExpenses(p => p.filter(e => isoDate(e.timestamp) !== deleteCfm.key));
    if (deleteCfm.type === "month") setExpenses(p => p.filter(e => monthKey(e.timestamp) !== deleteCfm.key));
    setDeleteCfm(null);
  };

  const grouped = useMemo(()=>{ const g={day:{},week:{},month:{},year:{}}; for(const e of expenses){ const dk=isoDate(e.timestamp),wk=weekKey(e.timestamp),mk=monthKey(e.timestamp),yk=yearKey(e.timestamp); [["day",dk],["week",wk],["month",mk],["year",yk]].forEach(([gr,k])=>{ if(!g[gr][k]) g[gr][k]={income:0,expense:0,items:[]}; g[gr][k].items.push(e); g[gr][k][e.type]+=e.amount; }); } return g; },[expenses]);

  const totals = useMemo(()=>{
    const inc=expenses.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
    const exp=expenses.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
    return {income:inc,expense:exp,net:inc-exp};
  },[expenses]);

  const totalLoansOwed = useMemo(()=>{ const map={}; for(const loan of loans){ for(const s of loan.splits){ if(!map[s.name]) map[s.name]=0; if(s.type==="owe") map[s.name]+=s.amount; if(s.type==="repaid") map[s.name]-=s.amount; } } return Object.values(map).reduce((s,v)=>s+Math.max(0,v),0); },[loans]);

  const totalAccountBalance = useMemo(()=>{
    return budget.accounts.reduce((s, a) => s + a.currentBalance, 0);
  }, [budget]);

  const prov = PROVIDERS[selectedProvider]||{};

  const analysisSuggestions = useMemo(() => {
    if (budget.accounts.length > 0) {
      const firstAcc = budget.accounts[0];
      return [
        `What is my ${firstAcc.name} balance?`,
        "How much did I spend this month?",
        "Which category I spend most?",
        "What's my net balance?",
      ];
    }
    if (expenses.length > 0) {
      return [
        "How much did I spend this month?",
        "Which category I spend most?",
        "Compare last month vs this month",
        "What's my net balance?",
      ];
    }
    return [
      "₹20 auto to office",
      "Pizza for Ram and Anand and me ₹900",
      "Electricity ₹800",
      "Paid ₹50 auto cash",
    ];
  }, [budget.accounts, expenses.length]);

  const freeConfigured = FREE_GROQ_KEYS.some(k => k && !k.startsWith("gsk_your_"));

  return (
    <>
      <style>{CSS}</style>
      <div className="et-app">
        {sidebarOpen&&<div className="et-overlay" onClick={()=>setSidebarOpen(false)}/>}

        {/* ── SIDEBAR ── */}
        <aside className={`et-sidebar ${sidebarOpen?"et-sidebar--open":""}`}>
          <div className="et-sidebar-header">
            <div className="et-logo"><span className="et-logo-icon">💸</span><div><h1 className="et-logo-title">Expense AI</h1><p className="et-logo-sub">Multi-model · Indian format</p></div></div>
            <button className="et-close-sidebar" onClick={()=>setSidebarOpen(false)}>✕</button>
          </div>
          <div className="et-summary-cards">
            <div className="et-sum-section-label">All-time Summary</div>
            <div className="et-sum-card et-sum-card--green">
              <span className="et-sum-label">Total Income</span>
              <span className="et-sum-val">{fmt(totals.income)}</span>
            </div>
            <div className="et-sum-card et-sum-card--red">
              <span className="et-sum-label">Total Expense</span>
              <span className="et-sum-val">{fmt(totals.expense)}</span>
            </div>
            <div className={`et-sum-card ${totals.net>=0?"et-sum-card--blue":"et-sum-card--orange"}`}>
              <span className="et-sum-label">Net Balance</span>
              <span className="et-sum-val">{fmt(totals.net)}</span>
            </div>
            {totalLoansOwed>0&&<div className="et-sum-card" style={{background:"rgba(245,158,11,0.09)",border:"1px solid rgba(245,158,11,0.2)"}}><span className="et-sum-label">Others Owe You</span><span className="et-sum-val" style={{color:"#f59e0b"}}>{fmt(totalLoansOwed)}</span></div>}
            {budget.accounts.length>0&&<div className="et-sum-card" style={{background:"rgba(59,130,246,0.09)",border:"1px solid rgba(59,130,246,0.2)"}}><span className="et-sum-label">Account Balance</span><span className="et-sum-val" style={{color:"#3b82f6"}}>{fmt(totalAccountBalance)}</span></div>}
          </div>
          <div className="et-cloud-btns">
            <button className="et-cloud-btn et-cloud-btn--save" onClick={()=>{setSidebarOpen(false);setCloudModal("save");}} disabled={expenses.length===0}><span>☁️</span> Save to Cloud</button>
            <button className="et-cloud-btn et-cloud-btn--sync" onClick={()=>{setSidebarOpen(false);setCloudModal("sync");}}><span>🔄</span> Sync from Cloud</button>
            <button className="et-cloud-btn" style={{background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.28)",color:"#818cf8"}} onClick={()=>{setSidebarOpen(false);setCatModalOpen(true);}}><span>🏷️</span> Manage Categories</button>
          </div>
          <div className="et-cat-section">
            <p className="et-section-label">Category Breakdown</p>
            {categories.filter(c=>expenses.some(e=>e.category===c)).map(cat=>{ const total=expenses.filter(e=>e.category===cat).reduce((s,e)=>s+e.amount,0), pct=totals.expense>0?Math.round(total/totals.expense*100):0; return (
              <div key={cat} className="et-cat-row"><span className="et-cat-icon">{catIcons[cat]||"📌"}</span><span className="et-cat-name">{cat}</span><div className="et-cat-bar-wrap"><div className="et-cat-bar" style={{width:pct+"%",background:catColors[cat]||"#6b7280"}}/></div><span className="et-cat-amt">{fmt(total)}</span></div>
            ); })}
            {expenses.length===0&&<p className="et-empty-hint">No expenses yet</p>}
          </div>
          <button className="et-share-btn" onClick={handleShare} disabled={expenses.length===0}>{shareState==="copied"?<><span>✓</span> Link copied!</>:<><span>⤴</span> Share Session</>}</button>
        </aside>

        {/* ── MAIN ── */}
        <main className="et-main">

          {/* Top bar */}
          <div className="et-topbar">
            <button className="et-menu-btn" onClick={()=>setSidebarOpen(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
            <div className="et-topbar-brand"><span className="et-topbar-icon">💸</span><span className="et-topbar-title">Expense AI</span></div>
            <div className="et-topbar-actions">
              <div className="et-provider-chip" style={{borderColor:prov.color+"55",color:prov.color}}>
                {prov.icon} {selectedProvider === "free"
                  ? (CLOUD_MODELS.free.find(m=>m.id===selectedModel)?.label || "Free")
                  : (CLOUD_MODELS[selectedProvider]?.find(m=>m.id===selectedModel)?.label||selectedModel)}
              </div>
              <button className="et-settings-btn" onClick={()=>setSettingsOpen(o=>!o)} title="AI Settings">⚙️</button>
              <button className="et-topbar-cloud-btn et-topbar-cloud-btn--save" onClick={()=>setCloudModal("save")} disabled={expenses.length===0} title="Save to cloud">☁️</button>
              <button className="et-topbar-cloud-btn et-topbar-cloud-btn--sync" onClick={()=>setCloudModal("sync")} title="Sync from cloud">🔄</button>
              <button className="et-share-btn-sm" onClick={handleShare} disabled={expenses.length===0} title="Share">{shareState==="copied"?"✓":"⤴"}</button>
            </div>
          </div>

          {/* Settings panel */}
          {settingsOpen&&(
            <div className="et-settings-panel">
              <div className="et-settings-header"><span>AI Model Settings</span><button onClick={()=>setSettingsOpen(false)}>✕</button></div>
              <div className="et-settings-body">
                <p className="et-settings-label">Provider</p>
                <div className="et-provider-tabs">
                  {Object.entries(PROVIDERS).map(([key,p])=>(
                    <button key={key}
                      className={`et-provider-tab ${selectedProvider===key?"et-provider-tab--active":""} ${key==="free"?"et-provider-tab--free":""}`}
                      style={selectedProvider===key?{borderColor:p.color,color:p.color,background:p.color+"18"}:{}}
                      onClick={()=>handleProviderChange(key)}>
                      {p.icon} {p.label}
                      {key==="free"&&<span className="et-free-badge">FREE</span>}
                    </button>
                  ))}
                </div>

                <p className="et-settings-label">Model</p>
                <div className="et-model-grid">
                  {(CLOUD_MODELS[selectedProvider]||[]).map(m=>(
                    <button key={m.id}
                      className={`et-model-pill ${selectedModel===m.id?"et-model-pill--active":""}`}
                      style={selectedModel===m.id?{borderColor:prov.color,color:prov.color,background:prov.color+"18"}:{}}
                      onClick={()=>setSelectedModel(m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>

                {selectedProvider === "free" ? (
                  <div className="et-free-info-box">
                    <div className="et-free-info-header">
                      <span className="et-free-info-icon">✦</span>
                      <span className="et-free-info-title">Free AI — No API Key Needed!</span>
                    </div>
                    {!freeConfigured && (
                      <div className="et-free-warn">
                        ⚠️ Free keys not yet configured in <code>FREE_GROQ_KEYS</code>. Edit the file to add your Groq keys.
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="et-settings-label">🔑 {prov.label} API Key</p>
                    <ApiKeyInput value={apiKeys[selectedProvider]||""} onChange={val=>handleApiKeyChange(selectedProvider,val)} placeholder={`Paste your ${prov.label} API key…`} accentColor={prov.color}/>
                    {apiKeys[selectedProvider]&&<p className="et-key-saved">✓ Key saved in browser · never sent to our servers</p>}
                    <p className="et-settings-label" style={{marginTop:16}}>Saved Keys</p>
                    <div className="et-keys-grid">{Object.entries(PROVIDERS).filter(([k])=>k!=="free").map(([key,p])=><div key={key} className={`et-key-badge ${apiKeys[key]?"et-key-badge--set":""}`} style={apiKeys[key]?{borderColor:p.color+"55",color:p.color}:{}}>{p.icon} {p.label} {apiKeys[key]?"✓":"✗"}</div>)}</div>
                  </>
                )}

                <div style={{marginTop:16,borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:14}}>
                  <p className="et-settings-label">Categories</p>
                  <button className="et-cat-manage-btn" onClick={()=>{setSettingsOpen(false);setCatModalOpen(true);}}>🏷️ Manage Categories ({categories.length})</button>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="et-tabs">
            {[["chat","💬","Chat"],["table","📊","Records"],["catbreak","🎯","By Cat"],["accounts","💳","Accounts"],["compare","📈","Compare"],["loans","🤝","Splits"]].map(([t,ic,l])=>(
              <button key={t} className={`et-tab ${tab===t?"et-tab--active":""}`} onClick={()=>{setTab(t);setSettingsOpen(false);}}>
                <span>{ic}</span><span className="et-tab-label">{l}</span>
                {t==="loans"&&totalLoansOwed>0&&<span className="et-tab-badge">{loans.length}</span>}
                {t==="accounts"&&budget.accounts.length>0&&<span className="et-tab-badge" style={{background:"#3b82f6"}}>{budget.accounts.length}</span>}
              </button>
            ))}
          </div>

          <div className="et-tab-content">

            {/* ── CHAT ── */}
            {tab==="chat"&&(
              <div className="et-chat">
                <div className="et-messages">
                  {messages.map(msg=>(
                    <div key={msg.id} className={`et-msg et-msg--${msg.role}`}>
                      <div className="et-msg-avatar" style={msg.role==="assistant"&&msg.provider?{background:PROVIDERS[msg.provider]?.color+"22",borderColor:PROVIDERS[msg.provider]?.color+"44"}:{}}>{msg.role==="assistant"?(msg.provider?PROVIDERS[msg.provider]?.icon||"💸":"💸"):"👤"}</div>
                      <div className="et-msg-body">
                        <MarkdownLite content={msg.content}/>
                        {msg.expense&&(
                          <div className={`et-expense-pill et-expense-pill--${msg.expense.type}`}>
                            <span>{catIcons[msg.expense.category]||"📌"}</span>
                            <span className="et-expense-pill-cat">{msg.expense.category}</span>
                            <span className="et-expense-pill-desc">{msg.expense.description}</span>
                            <span className="et-expense-pill-amt">{msg.expense.type==="income"?"+":"-"}{fmt(msg.expense.amount)}</span>
                            {msg.expense.reason&&<span className="et-expense-pill-reason">📝 {msg.expense.reason}</span>}
                            {msg.expense.accountName&&<span className="et-expense-pill-reason">💳 {msg.expense.accountName}</span>}
                            <span className="et-expense-pill-time">{dateIN(msg.expense.timestamp)} {timeIN(msg.expense.timestamp)}</span>
                          </div>
                        )}
                        {msg.loan&&(
                          <div className="et-split-pill">
                            <span className="et-split-pill-title">🤝 Split Recorded</span>
                            <span className="et-split-pill-desc">{msg.loan.description}</span>
                            <div className="et-split-pill-people">{msg.loan.splits.map((s,i)=><span key={i} className="et-split-person">{s.name}: owes {fmt(s.amount)}</span>)}</div>
                          </div>
                        )}
                        {msg.role==="assistant"&&msg.provider&&msg.provider!=="system"&&(
                          <div className="et-msg-tag" style={{color:PROVIDERS[msg.provider]?.color}}>
                            {PROVIDERS[msg.provider]?.icon} {msg.provider === "free"
                              ? "Free AI"
                              : `${PROVIDERS[msg.provider]?.label} · ${CLOUD_MODELS[msg.provider]?.find(m=>m.id===selectedModel)?.label||selectedModel}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {loading&&<div className="et-msg et-msg--assistant"><div className="et-msg-avatar"><span style={{color:prov.color}}>{prov.icon}</span></div><div className="et-msg-body"><div className="et-typing"><span/><span/><span/></div></div></div>}
                  <div ref={messagesEnd}/>
                </div>

                <div className="et-suggestions">
                  {analysisSuggestions.map(s=><button key={s} className="et-suggestion" onClick={()=>handleSend(s)}>{s}</button>)}
                </div>

                <div className={`et-input-wrap ${isListening?"et-input-wrap--listening":""}`} style={isListening?{borderColor:prov.color}:{}}>
                  <textarea ref={textareaRef} className="et-textarea" placeholder="e.g. 'paid ₹200 for food' or 'what is my SBI balance?'" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSend();}}} rows={1} disabled={loading}/>
                  <div className="et-input-actions">
                    <button className={`et-voice-btn ${isListening?"et-voice-btn--active":""}`} onClick={isListening?stopVoice:startVoice} title={isListening?"Stop":"Voice"}>{isListening?<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>}</button>
                    <button className={`et-send-btn ${input.trim()&&!loading?"et-send-btn--active":""}`} style={input.trim()&&!loading?{background:`linear-gradient(135deg,${prov.color},#a855f7)`}:{}} onClick={()=>handleSend()} disabled={!input.trim()||loading}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
                  </div>
                </div>
                {isListening&&<div className="et-listening-bar" style={{color:prov.color}}><span className="et-pulse" style={{background:"#ef4444"}}/>Listening in English (India)…</div>}
              </div>
            )}

            {/* ── RECORDS ── */}
            {tab==="table"&&(
              <div className="et-records">
                <div className="et-view-toggle">{[["day","Day"],["week","Week"],["month","Month"],["year","Year"]].map(([v,l])=><button key={v} className={`et-view-btn ${tableView===v?"et-view-btn--active":""}`} onClick={()=>setTableView(v)}>{l}</button>)}</div>
                {Object.keys(grouped[tableView]).length===0?<div className="et-no-data">No expenses yet. Chat with me to add some! 💬</div>:Object.entries(grouped[tableView]).sort(([a],[b])=>b.localeCompare(a)).map(([key,group])=><GroupSection key={key} groupKey={key} group={group} view={tableView} catIcons={catIcons} catColors={catColors} onDeleteItem={(id,desc)=>confirmDeleteItem(id,desc)} onDeleteGroup={k=>{if(tableView==="month") confirmDeleteMonth(k); else confirmDeleteDay(k);}}/>)}
              </div>
            )}

            {tab==="catbreak"&&<CategoryBreakdown expenses={expenses} catIcons={catIcons} catColors={catColors}/>}
            {tab==="accounts"&&<AccountsTab budget={budget} setBudget={setBudget} showToast={showToast} onRecordAccountTransaction={handleRecordAccountTransaction}/>}

            {tab==="compare"&&(
              <div className="et-records">
                <div className="et-view-toggle">{[["day","Day"],["week","Week"],["month","Month"],["year","Year"]].map(([v,l])=><button key={v} className={`et-view-btn ${cmpView===v?"et-view-btn--active":""}`} onClick={()=>setCmpView(v)}>{l}</button>)}</div>
                <CompareTable groups={grouped[cmpView]} view={cmpView}/>
              </div>
            )}

            {tab==="loans"&&<LoansTab loans={loans} onRepay={handleRepay} onDeleteLoan={handleDeleteLoan}/>}

          </div>
        </main>
      </div>

      {catModalOpen&&<CategoryModal customCats={categories} catIcons={catIcons} catColors={catColors} onClose={()=>setCatModalOpen(false)} onSave={handleSaveCats}/>}
      {cloudModal&&<CloudModal mode={cloudModal} expenses={expenses} onClose={()=>setCloudModal(null)} onSuccess={handleCloudSuccess}/>}

      {deleteCfm&&(
        <div className="et-modal-overlay" onClick={()=>setDeleteCfm(null)}>
          <div className="et-modal" onClick={e=>e.stopPropagation()}>
            <div className="et-modal-icon">🗑️</div>
            <h3>{deleteCfm.type==="item"?"Delete this entry?":deleteCfm.type==="month"?"Delete month's records?":"Delete day's records?"}</h3>
            <p>{deleteCfm.type==="item"
              ? <>{budget.accounts.length > 0 && budget.defaultAccountId ? <>Delete <strong>"{deleteCfm.label}"</strong>? Amount will be refunded to your default account.</> : <>Delete <strong>"{deleteCfm.label}"</strong>? Cannot be undone.</>}</>
              : <>Delete all entries for <strong>{deleteCfm.label}</strong>? Cannot be undone.</>
            }</p>
            <div className="et-modal-actions"><button className="et-modal-cancel" onClick={()=>setDeleteCfm(null)}>Cancel</button><button className="et-modal-confirm" onClick={executeDelete}>Delete</button></div>
          </div>
        </div>
      )}

      {toast&&<Toast key={toast.id} message={toast.message} type={toast.type} onDone={()=>setToast(null)}/>}
    </>
  );
}

// ── API Key Input ──────────────────────────────────────────────────────────────
function ApiKeyInput({ value, onChange, placeholder, accentColor }) {
  const [show,setShow]=useState(false);
  return (
    <div className="et-api-input-wrap">
      <input className="et-api-input" type={show?"text":"password"} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={value?{borderColor:accentColor+"55"}:{}}/>
      <button className="et-api-toggle" onClick={()=>setShow(s=>!s)}>{show?<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}</button>
    </div>
  );
}

// ── Group Section ──────────────────────────────────────────────────────────────
function GroupSection({ groupKey, group, view, onDeleteItem, onDeleteGroup, catIcons, catColors }) {
  const [open,setOpen]=useState(true);
  const label=(()=>{ if(view==="day") return new Date(groupKey).toLocaleDateString("en-IN",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}); if(view==="week"){const s=new Date(groupKey),e=new Date(s);e.setDate(e.getDate()+6);return `${s.toLocaleDateString("en-IN",{day:"2-digit",month:"short"})} – ${e.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}`;} if(view==="month"){const[y,m]=groupKey.split("-");return new Date(y,m-1).toLocaleDateString("en-IN",{month:"long",year:"numeric"});} return groupKey; })();
  return (
    <div className="et-group">
      <div className="et-group-header" onClick={()=>setOpen(o=>!o)}>
        <div className="et-group-header-left"><span className="et-chevron">{open?"▾":"▸"}</span><span className="et-group-label">{label}</span><span className="et-group-count">{group.items.length}</span></div>
        <div className="et-group-header-right">
          {group.income>0&&<span className="et-group-inc">+{fmt(group.income)}</span>}
          {group.expense>0&&<span className="et-group-exp">-{fmt(group.expense)}</span>}
          <span className={`et-group-net ${group.income-group.expense>=0?"et-group-net--pos":"et-group-net--neg"}`}>Net {fmt(group.income-group.expense)}</span>
          {(view==="day"||view==="month")&&<button className="et-del-group-btn" title="Delete group" onClick={e=>{e.stopPropagation();onDeleteGroup(groupKey);}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>}
        </div>
      </div>
      {open&&(
        <div className="et-table-wrap">
          <table className="et-table">
            <thead><tr><th>Date</th><th>Time</th><th>Category</th><th className="et-th-desc">Description</th><th className="et-th-reason">Reason</th><th>Type</th><th>Amount</th><th>Account</th><th></th></tr></thead>
            <tbody>
              {group.items.sort((a,b)=>b.timestamp-a.timestamp).map(e=>(
                <React.Fragment key={e.id}>
                  <tr>
                    <td>{dateIN(e.timestamp)}</td><td>{timeIN(e.timestamp)}</td>
                    <td><span className="et-cat-tag" style={{background:(catColors[e.category]||"#6b7280")+"22",color:catColors[e.category]||"#6b7280"}}>{catIcons[e.category]||"📌"} {e.category}</span></td>
                    <td className="et-desc-cell">{e.description}</td>
                    <td className="et-reason-cell">{e.reason||<span className="et-reason-empty">—</span>}</td>
                    <td><span className={`et-type-badge et-type-badge--${e.type}`}>{e.type}</span></td>
                    <td className={e.type==="income"?"et-amt--inc":"et-amt--exp"}>{e.type==="income"?"+":"-"}{fmt(e.amount)}</td>
                    <td className="et-acc-cell">{e.accountName?<span className="et-acc-tag">💳 {e.accountName}</span>:<span className="et-reason-empty">—</span>}</td>
                    <td><button className="et-del-btn" onClick={()=>onDeleteItem(e.id,e.description)}>✕</button></td>
                  </tr>
                  <tr className="et-mobile-subrow"><td colSpan="9"><div className="et-mobile-meta">{e.description&&<span className="et-mobile-desc">📋 {e.description}</span>}{e.reason&&<span className="et-mobile-reason">📝 {e.reason}</span>}{e.accountName&&<span className="et-mobile-reason">💳 {e.accountName}</span>}</div></td></tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Compare Table ──────────────────────────────────────────────────────────────
function CompareTable({ groups, view }) {
  const entries=Object.entries(groups).sort(([a],[b])=>b.localeCompare(a)).slice(0,12);
  if(entries.length<2) return <div className="et-no-data">Need at least 2 {view}s of data to compare.</div>;
  const label=k=>{ if(view==="day") return new Date(k).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}); if(view==="week") return new Date(k).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}); if(view==="month"){const[y,m]=k.split("-");return new Date(y,m-1).toLocaleDateString("en-IN",{month:"short",year:"2-digit"});} return k; };
  const maxVal=Math.max(...entries.map(([,g])=>Math.max(g.expense,g.income)),1);
  return (
    <div className="et-compare">
      <p className="et-compare-title">Expense comparison ({view}wise)</p>
      <div className="et-bar-chart">
        {entries.slice().reverse().map(([k,g])=>(
          <div key={k} className="et-bar-row">
            <span className="et-bar-label">{label(k)}</span>
            <div className="et-bar-track">
              {g.expense>0&&<div className="et-bar-segment"><div className="et-bar-fill et-bar-fill--exp" style={{width:Math.max(2,Math.round(g.expense/maxVal*100))+"%"}}/><span className="et-bar-inline-val et-bar-inline-val--exp">{fmt(g.expense)}</span></div>}
              {g.income>0&&<div className="et-bar-segment"><div className="et-bar-fill et-bar-fill--inc" style={{width:Math.max(2,Math.round(g.income/maxVal*100))+"%"}}/><span className="et-bar-inline-val et-bar-inline-val--inc">{fmt(g.income)}</span></div>}
            </div>
          </div>
        ))}
        <div className="et-bar-legend"><span><span className="et-legend-dot et-legend-dot--exp"/>Expense</span><span><span className="et-legend-dot et-legend-dot--inc"/>Income</span></div>
      </div>
      <div className="et-table-wrap">
        <table className="et-table">
          <thead><tr><th>Period</th><th>Income</th><th>Expense</th><th>Net</th><th>Txns</th><th>Avg/txn</th><th>vs prev</th></tr></thead>
          <tbody>{entries.map(([k,g],i)=>{ const net=g.income-g.expense, avg=g.items.length>0?g.expense/g.items.length:0, prev=entries[i+1], diff=prev?g.expense-prev[1].expense:null; return <tr key={k}><td><strong>{label(k)}</strong></td><td className="et-amt--inc">{fmt(g.income)}</td><td className="et-amt--exp">{fmt(g.expense)}</td><td className={net>=0?"et-amt--inc":"et-amt--exp"}>{fmt(net)}</td><td>{g.items.length}</td><td>{avg>0?fmt(Math.round(avg)):"-"}</td><td>{diff===null?"—":<span className={diff>0?"et-diff--up":"et-diff--down"}>{diff>0?"▲":"▼"} {fmt(Math.abs(diff))}</span>}</td></tr>; })}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── Markdown Lite ──────────────────────────────────────────────────────────────
function MarkdownLite({ content }) {
  if(!content) return null;
  return (
    <div className="et-markdown">
      {content.split("\n").map((line,i)=>{ if(!line.trim()) return <br key={i}/>; const parts=line.split(/(\*\*[^*]+\*\*)/g).map((p,j)=>p.startsWith("**")&&p.endsWith("**")?<strong key={j}>{p.slice(2,-2)}</strong>:p); if(line.startsWith("- ")||line.startsWith("• ")) return <div key={i} className="et-bullet">• {parts.slice(1)}</div>; return <p key={i} className="et-p">{parts}</p>; })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── CSS (unchanged from original)
// ══════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#080810;--bg2:#0d0d1a;--bg3:#12121f;--border:rgba(255,255,255,0.07);--text:#e4e4f0;--muted:rgba(255,255,255,0.35);--accent:#f59e0b;--radius:12px;--sidebar-w:280px;}
html,body,#root{height:100%;overflow:hidden;}
.et-app{display:flex;height:100dvh;overflow:hidden;font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);}
.et-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:40;backdrop-filter:blur(2px);}

/* Sidebar */
.et-sidebar{width:var(--sidebar-w);flex-shrink:0;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto;transition:transform 0.25s ease;z-index:50;}
.et-sidebar::-webkit-scrollbar{width:3px;}.et-sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:4px;}
.et-sidebar-header{display:flex;align-items:center;justify-content:space-between;padding:18px 16px 14px;border-bottom:1px solid var(--border);flex-shrink:0;}
.et-logo{display:flex;align-items:center;gap:10px;}.et-logo-icon{font-size:26px;}.et-logo-title{font-size:15px;font-weight:700;color:#fff;}.et-logo-sub{font-size:10px;color:var(--muted);}
.et-close-sidebar{display:none;background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer;padding:4px;line-height:1;}
.et-sum-section-label{font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.2);padding:14px 12px 4px;flex-shrink:0;}
.et-summary-cards{padding:0 12px 0;display:flex;flex-direction:column;gap:7px;flex-shrink:0;}
.et-sum-card{border-radius:10px;padding:9px 13px;display:flex;justify-content:space-between;align-items:center;}
.et-sum-card--green{background:rgba(34,197,94,0.09);border:1px solid rgba(34,197,94,0.2);}
.et-sum-card--red{background:rgba(239,68,68,0.09);border:1px solid rgba(239,68,68,0.2);}
.et-sum-card--blue{background:rgba(59,130,246,0.09);border:1px solid rgba(59,130,246,0.2);}
.et-sum-card--orange{background:rgba(249,115,22,0.09);border:1px solid rgba(249,115,22,0.2);}
.et-sum-label{font-size:10px;color:var(--muted);}.et-sum-val{font-size:13px;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;}
.et-cloud-btns{display:flex;flex-direction:column;gap:7px;padding:12px 12px 0;flex-shrink:0;}
.et-cloud-btn{display:flex;align-items:center;justify-content:center;gap:7px;padding:9px;border-radius:10px;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;}
.et-cloud-btn--save{background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.28);color:#f59e0b;}
.et-cloud-btn--save:hover:not(:disabled){background:rgba(245,158,11,0.22);transform:translateY(-1px);}
.et-cloud-btn--save:disabled{opacity:0.3;cursor:not-allowed;}
.et-cloud-btn--sync{background:rgba(34,197,94,0.10);border:1px solid rgba(34,197,94,0.28);color:#22c55e;}
.et-cloud-btn--sync:hover{background:rgba(34,197,94,0.20);transform:translateY(-1px);}
.et-cat-section{padding:14px 12px 0;flex:1;}.et-section-label{font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.25);margin-bottom:10px;}
.et-cat-row{display:flex;align-items:center;gap:6px;margin-bottom:6px;}.et-cat-icon{font-size:13px;flex-shrink:0;}.et-cat-name{font-size:10px;color:var(--muted);width:66px;flex-shrink:0;}
.et-cat-bar-wrap{flex:1;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;}.et-cat-bar{height:100%;border-radius:2px;transition:width 0.5s ease;}
.et-cat-amt{font-size:10px;color:var(--muted);width:58px;text-align:right;font-family:'JetBrains Mono',monospace;}.et-empty-hint{font-size:11px;color:rgba(255,255,255,0.2);}
.et-share-btn{margin:14px 12px 16px;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border-radius:10px;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;}
.et-share-btn:disabled{opacity:0.35;cursor:not-allowed;}.et-share-btn:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(245,158,11,0.3);}

/* Main */
.et-main{flex:1;display:flex;flex-direction:column;height:100dvh;overflow:hidden;background:var(--bg);min-width:0;position:relative;z-index:0;}
.et-topbar{display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0;min-height:52px;position:relative;z-index:20;}
.et-menu-btn{display:none;background:none;border:none;color:var(--muted);cursor:pointer;padding:6px;border-radius:8px;flex-shrink:0;}
.et-menu-btn:hover{background:rgba(255,255,255,0.06);color:#fff;}
.et-topbar-brand{display:flex;align-items:center;gap:7px;}.et-topbar-icon{font-size:20px;}.et-topbar-title{font-size:15px;font-weight:700;color:#fff;}
.et-topbar-actions{display:flex;align-items:center;gap:6px;margin-left:auto;}
.et-provider-chip{font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid;background:transparent;font-family:'JetBrains Mono',monospace;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;}
.et-settings-btn{background:none;border:1px solid var(--border);border-radius:8px;padding:5px 8px;font-size:15px;cursor:pointer;line-height:1;transition:all 0.15s;}.et-settings-btn:hover{background:rgba(255,255,255,0.06);}
.et-topbar-cloud-btn{background:none;border:1px solid var(--border);border-radius:8px;padding:5px 8px;font-size:15px;cursor:pointer;line-height:1;transition:all 0.15s;}
.et-topbar-cloud-btn:hover:not(:disabled){background:rgba(255,255,255,0.06);}.et-topbar-cloud-btn:disabled{opacity:0.3;cursor:not-allowed;}
.et-topbar-cloud-btn--save{border-color:rgba(245,158,11,0.3);}.et-topbar-cloud-btn--sync{border-color:rgba(34,197,94,0.3);}
.et-share-btn-sm{background:linear-gradient(135deg,#f59e0b,#ef4444);border:none;border-radius:8px;padding:6px 10px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.15s;}.et-share-btn-sm:disabled{opacity:0.35;cursor:not-allowed;}

/* ── Countdown ── */
.et-countdown-wrap{margin:10px 0;display:flex;flex-direction:column;gap:7px;}
.et-countdown-bar-bg{height:6px;background:rgba(255,255,255,0.07);border-radius:4px;overflow:hidden;}
.et-countdown-bar-fill{height:100%;border-radius:4px;}
.et-countdown-row{display:flex;align-items:center;gap:7px;}
.et-countdown-icon{font-size:16px;flex-shrink:0;}
.et-countdown-text{flex:1;font-size:12px;color:rgba(255,255,255,0.55);}
.et-countdown-num{font-size:20px;font-weight:800;font-family:'JetBrains Mono',monospace;min-width:28px;text-align:right;}


/* Settings panel */
.et-settings-panel{background:var(--bg3);border-bottom:1px solid var(--border);flex-shrink:0;animation:et-slide-down 0.2s ease;overflow-y:auto;max-height:min(50dvh,400px);position:relative;z-index:10;}
@keyframes et-slide-down{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.et-settings-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px;font-weight:700;color:#fff;position:sticky;top:0;background:var(--bg3);z-index:1;}
.et-settings-header button{background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer;}
.et-settings-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;}
.et-settings-label{font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:2px;}
.et-provider-tabs{display:flex;flex-wrap:wrap;gap:6px;}.et-provider-tab{padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;display:flex;align-items:center;gap:5px;}.et-provider-tab--active{font-weight:700;}

/* Free provider badge */
.et-provider-tab--free{position:relative;}
.et-free-badge{display:inline-block;font-size:8px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;padding:1px 5px;border-radius:8px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;line-height:1.5;margin-left:2px;}

/* Free info box */
.et-free-info-box{background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;}
.et-free-info-header{display:flex;align-items:center;gap:8px;}.et-free-info-icon{font-size:18px;color:#22c55e;}.et-free-info-title{font-size:13px;font-weight:700;color:#22c55e;}
.et-free-info-desc{font-size:11px;color:rgba(255,255,255,0.5);line-height:1.6;}
.et-free-slots{display:flex;flex-direction:column;gap:4px;}
.et-free-slot{display:flex;align-items:center;gap:7px;font-size:10px;padding:4px 8px;border-radius:6px;}
.et-free-slot--ok{background:rgba(34,197,94,0.08);color:#22c55e;}
.et-free-slot--empty{background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.25);}
.et-free-warn{font-size:10px;color:#f59e0b;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.22);border-radius:7px;padding:7px 10px;line-height:1.5;}
.et-free-warn code{font-family:'JetBrains Mono',monospace;font-size:10px;background:rgba(245,158,11,0.12);padding:1px 4px;border-radius:3px;}

.et-model-grid{display:flex;flex-wrap:wrap;gap:6px;}.et-model-pill{padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;}.et-model-pill--active{font-weight:700;}
.et-api-input-wrap{display:flex;gap:6px;}.et-api-input{flex:1;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:border-color 0.2s;}.et-api-input:focus{border-color:rgba(255,255,255,0.2);}.et-api-input::placeholder{color:var(--muted);}
.et-api-toggle{background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;padding:0 10px;color:var(--muted);cursor:pointer;transition:all 0.15s;}.et-api-toggle:hover{color:#fff;}
.et-key-saved{font-size:11px;color:#22c55e;}.et-keys-grid{display:flex;flex-wrap:wrap;gap:6px;}.et-key-badge{font-size:11px;padding:4px 10px;border-radius:20px;border:1px solid var(--border);color:var(--muted);font-weight:600;}.et-key-badge--set{font-weight:700;}
.et-cat-manage-btn{background:rgba(99,102,241,0.10);border:1px solid rgba(99,102,241,0.28);color:#818cf8;border-radius:9px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;text-align:left;width:100%;}.et-cat-manage-btn:hover{background:rgba(99,102,241,0.20);}

/* Tabs */
.et-tabs{display:flex;border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0;position:relative;z-index:5;overflow-x:auto;}.et-tabs::-webkit-scrollbar{height:0;}
.et-tab{flex:1;min-width:0;padding:10px 5px;border:none;background:none;color:var(--muted);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;border-bottom:2px solid transparent;display:flex;align-items:center;justify-content:center;gap:3px;position:relative;white-space:nowrap;}
.et-tab--active{color:var(--accent);border-bottom-color:var(--accent);background:rgba(245,158,11,0.05);}.et-tab:hover:not(.et-tab--active){color:rgba(255,255,255,0.6);}
.et-tab-label{display:inline;}.et-tab-badge{position:absolute;top:5px;right:3px;background:#ef4444;color:#fff;font-size:8px;font-weight:700;padding:1px 4px;border-radius:8px;line-height:1.3;}
.et-tab-content{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;position:relative;}

/* Chat */
.et-chat{display:flex;flex-direction:column;height:100%;overflow:hidden;min-height:0;}
.et-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;min-height:0;}
.et-messages::-webkit-scrollbar{width:3px;}.et-messages::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:4px;}
.et-msg{display:flex;gap:9px;align-items:flex-start;animation:et-slide 0.2s ease;}.et-msg--user{flex-direction:row-reverse;}
@keyframes et-slide{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.et-msg-avatar{width:30px;height:30px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:15px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.2);}
.et-msg--user .et-msg-avatar{background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.3);}
.et-msg-body{max-width:80%;}
.et-msg--user .et-msg-body{background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:9px 13px;border-radius:16px 4px 16px 16px;color:#fff;}
.et-msg--assistant .et-msg-body{background:rgba(255,255,255,0.04);border:1px solid var(--border);padding:9px 13px;border-radius:4px 16px 16px 16px;}
.et-msg-tag{font-size:10px;margin-top:6px;opacity:0.7;}
.et-expense-pill{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:8px;padding:7px 11px;border-radius:9px;font-size:11px;font-family:'JetBrains Mono',monospace;}
.et-expense-pill--expense{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.22);}
.et-expense-pill--income{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.22);}
.et-expense-pill-cat{color:var(--muted);}.et-expense-pill-desc{color:rgba(255,255,255,0.8);flex:1;}.et-expense-pill-amt{font-weight:700;color:#fff;}
.et-expense-pill-reason{color:rgba(255,255,255,0.5);font-size:10px;width:100%;font-style:italic;}.et-expense-pill-time{color:rgba(255,255,255,0.3);font-size:9px;width:100%;}
.et-split-pill{margin-top:8px;padding:9px 12px;border-radius:9px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);display:flex;flex-direction:column;gap:5px;}
.et-split-pill-title{font-size:11px;font-weight:700;color:#818cf8;}.et-split-pill-desc{font-size:12px;color:rgba(255,255,255,0.75);}
.et-split-pill-people{display:flex;flex-wrap:wrap;gap:5px;}.et-split-person{font-size:10px;padding:2px 8px;border-radius:20px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.25);color:#f59e0b;font-family:'JetBrains Mono',monospace;}
.et-typing{display:flex;gap:5px;padding:4px 0;}.et-typing span{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.25);}
.et-typing span:nth-child(1){animation:et-bounce 1s ease-in-out 0s infinite;}.et-typing span:nth-child(2){animation:et-bounce 1s ease-in-out 0.2s infinite;}.et-typing span:nth-child(3){animation:et-bounce 1s ease-in-out 0.4s infinite;}
@keyframes et-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
.et-suggestions{padding:8px 16px 0;display:flex;flex-wrap:wrap;gap:5px;flex-shrink:0;}
.et-suggestion{padding:4px 10px;border-radius:20px;border:1px solid rgba(245,158,11,0.22);background:rgba(245,158,11,0.06);color:rgba(255,255,255,0.55);font-size:11px;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}.et-suggestion:hover{border-color:rgba(245,158,11,0.5);color:#fff;}
.et-input-wrap{display:flex;align-items:flex-end;gap:7px;margin:8px 16px 14px;padding:9px 11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:12px;transition:border-color 0.2s;flex-shrink:0;}.et-input-wrap:focus-within{border-color:rgba(99,102,241,0.4);}
.et-textarea{flex:1;background:none;border:none;color:var(--text);font-size:14px;font-family:inherit;resize:none;outline:none;max-height:90px;overflow-y:auto;line-height:1.5;}.et-textarea::placeholder{color:rgba(255,255,255,0.18);}
.et-input-actions{display:flex;align-items:center;gap:5px;flex-shrink:0;}
.et-voice-btn{width:30px;height:30px;border-radius:8px;border:none;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;}.et-voice-btn--active{background:rgba(239,68,68,0.18);color:#ef4444;}.et-voice-btn:hover{background:rgba(255,255,255,0.1);color:#fff;}
.et-send-btn{width:30px;height:30px;border-radius:8px;border:none;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.25);cursor:not-allowed;display:flex;align-items:center;justify-content:center;transition:all 0.15s;}.et-send-btn--active{color:#fff;cursor:pointer;box-shadow:0 2px 10px rgba(245,158,11,0.25);}.et-send-btn--active:hover{transform:scale(1.05);}
.et-listening-bar{display:flex;align-items:center;gap:7px;padding:5px 16px 11px;font-size:11px;flex-shrink:0;}.et-pulse{width:7px;height:7px;border-radius:50%;animation:et-bounce 0.8s ease infinite;}

/* Records */
.et-records{flex:1;height:100%;overflow-y:auto;overflow-x:hidden;padding:14px 16px;display:flex;flex-direction:column;gap:14px;min-height:0;}
.et-records::-webkit-scrollbar{width:3px;}.et-records::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:4px;}
.et-view-toggle{display:flex;gap:5px;flex-wrap:wrap;flex-shrink:0;}
.et-view-btn{padding:5px 14px;border-radius:20px;border:1px solid rgba(255,255,255,0.09);background:transparent;color:var(--muted);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;}.et-view-btn--active{background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.35);color:var(--accent);}
.et-no-data{text-align:center;color:var(--muted);font-size:13px;padding:48px 0;line-height:2;}
.et-group{background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;flex-shrink:0;}
.et-group-header{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;cursor:pointer;gap:10px;background:rgba(255,255,255,0.02);flex-wrap:wrap;}.et-group-header:hover{background:rgba(255,255,255,0.04);}
.et-group-header-left{display:flex;align-items:center;gap:7px;}.et-group-header-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.et-chevron{color:var(--muted);font-size:12px;}.et-group-label{font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);}.et-group-count{font-size:10px;color:var(--muted);background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:20px;}
.et-group-inc{font-size:11px;font-weight:700;color:#22c55e;font-family:'JetBrains Mono',monospace;}.et-group-exp{font-size:11px;font-weight:700;color:#ef4444;font-family:'JetBrains Mono',monospace;}
.et-group-net{font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;}.et-group-net--pos{color:#22c55e;}.et-group-net--neg{color:#ef4444;}
.et-del-group-btn{display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;border:1px solid rgba(239,68,68,0.25);background:rgba(239,68,68,0.07);color:rgba(239,68,68,0.6);font-size:10px;cursor:pointer;font-family:inherit;transition:all 0.15s;}.et-del-group-btn:hover{background:rgba(239,68,68,0.18);color:#ef4444;}
.et-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;}
.et-table{width:100%;border-collapse:collapse;font-size:12px;}
.et-table th{padding:8px 11px;text-align:left;font-size:9px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:rgba(255,255,255,0.25);border-bottom:1px solid var(--border);white-space:nowrap;}
.et-th-desc{display:table-cell;}.et-th-reason{display:table-cell;}
.et-table td{padding:8px 11px;border-bottom:1px solid rgba(255,255,255,0.03);color:rgba(255,255,255,0.65);}.et-table tr:last-child td{border-bottom:none;}.et-table tr:hover td{background:rgba(255,255,255,0.02);}
.et-cat-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;white-space:nowrap;}
.et-acc-tag{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;white-space:nowrap;background:rgba(59,130,246,0.12);color:#60a5fa;border:1px solid rgba(59,130,246,0.25);}
.et-acc-cell{white-space:nowrap;}
.et-desc-cell{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.et-reason-cell{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,0.4);font-style:italic;font-size:11px;}.et-reason-empty{color:rgba(255,255,255,0.15);}
.et-type-badge{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;}.et-type-badge--expense{background:rgba(239,68,68,0.14);color:#ef4444;}.et-type-badge--income{background:rgba(34,197,94,0.14);color:#22c55e;}
.et-amt--inc{color:#22c55e;font-weight:700;font-family:'JetBrains Mono',monospace;}.et-amt--exp{color:#ef4444;font-weight:700;font-family:'JetBrains Mono',monospace;}
.et-del-btn{width:22px;height:22px;border-radius:5px;border:1px solid rgba(239,68,68,0.18);background:transparent;color:rgba(239,68,68,0.4);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;font-size:11px;}.et-del-btn:hover{background:rgba(239,68,68,0.14);color:#ef4444;}
.et-mobile-subrow{display:none;}.et-mobile-meta{display:flex;flex-direction:column;gap:3px;padding:0 11px 8px;}.et-mobile-desc{font-size:11px;color:rgba(255,255,255,0.65);white-space:normal;word-break:break-word;}.et-mobile-reason{font-size:10px;color:rgba(255,255,255,0.38);font-style:italic;white-space:normal;word-break:break-word;}

/* Category breakdown */
.et-catbreak-total{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.18);border-radius:10px;}.et-catbreak-total-label{font-size:11px;color:var(--muted);}.et-catbreak-total-val{font-size:18px;font-weight:700;color:#f59e0b;font-family:'JetBrains Mono',monospace;}
.et-catbreak-grid{display:flex;flex-direction:column;gap:10px;}.et-catbreak-card{background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:12px;padding:12px;transition:background 0.15s;}.et-catbreak-card:hover{background:rgba(255,255,255,0.04);}
.et-catbreak-card-top{display:flex;align-items:center;gap:10px;margin-bottom:8px;}.et-catbreak-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
.et-catbreak-info{flex:1;display:flex;flex-direction:column;gap:2px;}.et-catbreak-name{font-size:13px;font-weight:700;color:#fff;}.et-catbreak-count{font-size:10px;color:var(--muted);}
.et-catbreak-right{display:flex;flex-direction:column;align-items:flex-end;gap:2px;}.et-catbreak-amt{font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;}.et-catbreak-pct{font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace;}
.et-catbreak-bar-wrap{height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-bottom:8px;}.et-catbreak-bar{height:100%;border-radius:2px;transition:width 0.5s ease;}
.et-catbreak-items{display:flex;flex-direction:column;gap:4px;}.et-catbreak-item{display:flex;align-items:center;gap:8px;font-size:11px;}.et-catbreak-item-desc{flex:1;color:rgba(255,255,255,0.55);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.et-catbreak-item-date{color:rgba(255,255,255,0.25);font-size:10px;white-space:nowrap;}.et-catbreak-item-amt{color:rgba(255,255,255,0.6);font-family:'JetBrains Mono',monospace;white-space:nowrap;}.et-catbreak-more{font-size:10px;color:rgba(255,255,255,0.25);font-style:italic;}
.et-catbreak-summary{background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:12px;padding:14px;}.et-catbreak-summary-title{font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.25);margin-bottom:12px;}
.et-catbreak-pies{display:flex;flex-direction:column;gap:8px;}.et-catbreak-pie-row{display:flex;align-items:center;gap:8px;border-radius:6px;padding:3px 4px;transition:background 0.12s;}.et-catbreak-pie-row:hover{background:rgba(255,255,255,0.04);}.et-catbreak-pie-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0;}.et-catbreak-pie-name{font-size:11px;color:var(--muted);width:100px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.et-catbreak-pie-bar-wrap{flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;}.et-catbreak-pie-bar{height:100%;border-radius:3px;transition:width 0.5s ease;}.et-catbreak-pie-pct{font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;width:28px;text-align:right;}.et-catbreak-pie-amt{font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace;width:70px;text-align:right;}

/* Category detail view */
.et-cat-filter-sel{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:5px 12px;color:var(--text);font-size:11px;font-weight:600;font-family:inherit;outline:none;cursor:pointer;appearance:none;-webkit-appearance:none;}
.et-cat-filter-sel option{background:#1a1a2e;color:#fff;}
.et-catdetail{display:flex;flex-direction:column;gap:12px;}
.et-catdetail-header{display:flex;align-items:center;gap:12px;padding:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:14px;}
.et-catdetail-list{display:flex;flex-direction:column;gap:6px;}
.et-catdetail-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px;transition:background 0.12s;}.et-catdetail-item:hover{background:rgba(255,255,255,0.04);}
.et-catdetail-item-left{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0;}.et-catdetail-item-desc{font-size:13px;font-weight:600;color:rgba(255,255,255,0.85);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.et-catdetail-item-reason{font-size:11px;color:rgba(255,255,255,0.4);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.et-catdetail-item-right{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;}.et-catdetail-item-amt{font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;}.et-catdetail-item-date{font-size:10px;color:rgba(255,255,255,0.3);white-space:nowrap;}

/* ── ACCOUNTS TAB ── */
.et-bgt-month-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.et-bgt-actions{display:flex;gap:7px;flex-shrink:0;}
.et-bgt-add-btn{padding:6px 14px;border-radius:20px;border:1px solid rgba(99,102,241,0.35);background:rgba(99,102,241,0.12);color:#818cf8;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}.et-bgt-add-btn:hover{background:rgba(99,102,241,0.22);transform:translateY(-1px);}
.et-bgt-xfer-btn{padding:6px 14px;border-radius:20px;border:1px solid rgba(14,165,233,0.35);background:rgba(14,165,233,0.12);color:#38bdf8;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}.et-bgt-xfer-btn:hover:not(:disabled){background:rgba(14,165,233,0.22);transform:translateY(-1px);}.et-bgt-xfer-btn:disabled{opacity:0.35;cursor:not-allowed;}
.et-default-strip{display:flex;align-items:center;gap:8px;padding:9px 13px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.18);border-radius:9px;font-size:11px;}
.et-default-strip-label{color:rgba(255,255,255,0.4);flex-shrink:0;}.et-default-strip-val{color:#f59e0b;font-weight:700;}
.et-default-badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;letter-spacing:0.04em;}
.et-bgt-star-btn{background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:7px;padding:4px 7px;font-size:13px;cursor:pointer;line-height:1;transition:all 0.15s;}.et-bgt-star-btn:hover{background:rgba(245,158,11,0.2);}
.et-bgt-card--default{border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.03);}
.et-bgt-summary{display:flex;align-items:center;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:14px;gap:0;flex-wrap:wrap;}
.et-bgt-sum-item{flex:1;display:flex;flex-direction:column;gap:4px;align-items:center;min-width:80px;}
.et-bgt-sum-label{font-size:10px;color:var(--muted);text-align:center;}.et-bgt-sum-val{font-size:16px;font-weight:700;font-family:'JetBrains Mono',monospace;color:#fff;text-align:center;}
.et-bgt-sum-divider{width:1px;background:var(--border);height:36px;flex-shrink:0;margin:0 8px;}
.et-bgt-cards{display:flex;flex-direction:column;gap:12px;}
.et-bgt-card{background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:14px;padding:14px;transition:background 0.15s;}.et-bgt-card:hover{background:rgba(255,255,255,0.04);}
.et-bgt-card-top{display:flex;align-items:center;gap:10px;margin-bottom:4px;}
.et-bgt-card-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
.et-bgt-card-info{flex:1;display:flex;flex-direction:column;gap:2px;}.et-bgt-card-name{font-size:15px;font-weight:700;color:#fff;}.et-bgt-card-type{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;}
.et-bgt-card-right{display:flex;flex-direction:column;align-items:flex-end;gap:2px;}.et-bgt-card-bal{font-size:18px;font-weight:700;font-family:'JetBrains Mono',monospace;}.et-bgt-card-bal-label{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;}
.et-bgt-card-actions{display:flex;gap:5px;margin-left:6px;}.et-bgt-edit-btn{background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:7px;padding:4px 7px;font-size:13px;cursor:pointer;line-height:1;transition:all 0.15s;}.et-bgt-edit-btn:hover{background:rgba(255,255,255,0.1);}
.et-bgt-inline-edit{margin-top:12px;padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.09);border-radius:9px;display:flex;flex-direction:column;gap:7px;}
.et-bgt-inline-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);}
.et-bgt-inline-row{display:flex;gap:7px;align-items:center;}
.et-bgt-xfer-log{display:flex;flex-direction:column;gap:6px;}
.et-bgt-xfer-row{display:flex;align-items:center;gap:7px;padding:9px 12px;background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.15);border-radius:9px;font-size:11px;flex-wrap:wrap;}
.et-bgt-xfer-icon{color:#38bdf8;font-weight:700;flex-shrink:0;}.et-bgt-xfer-from{color:#fff;font-weight:700;}.et-bgt-xfer-arrow{color:var(--muted);}.et-bgt-xfer-to{color:#fff;font-weight:700;flex:1;}.et-bgt-xfer-note{color:var(--muted);font-style:italic;}.et-bgt-xfer-amt{color:#38bdf8;font-weight:700;font-family:'JetBrains Mono',monospace;}.et-bgt-xfer-date{color:rgba(255,255,255,0.25);font-size:10px;white-space:nowrap;}
.et-bgt-modal{max-width:400px !important;text-align:left;}
.et-bgt-type-grid{display:flex;flex-wrap:wrap;gap:6px;}
.et-bgt-type-btn{padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;}.et-bgt-type-btn--active{font-weight:700;}
.et-bgt-select{width:100%;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:9px;padding:9px 13px;color:var(--text);font-size:13px;font-family:inherit;outline:none;cursor:pointer;appearance:none;-webkit-appearance:none;}
.et-bgt-select option{background:#1a1a2e;color:#fff;}

/* Compare */
.et-compare{display:flex;flex-direction:column;gap:18px;}.et-compare-title{font-size:12px;font-weight:600;color:var(--muted);}
.et-bar-chart{display:flex;flex-direction:column;gap:10px;width:100%;overflow:hidden;}
.et-bar-row{display:flex;align-items:flex-start;gap:8px;width:100%;min-width:0;}.et-bar-label{font-size:10px;color:var(--muted);width:42px;flex-shrink:0;text-align:right;font-family:'JetBrains Mono',monospace;padding-top:2px;}
.et-bar-track{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}.et-bar-segment{display:flex;align-items:center;gap:6px;min-width:0;}
.et-bar-fill{height:8px;border-radius:4px;transition:width 0.5s ease;flex-shrink:0;min-width:3px;}.et-bar-fill--exp{background:linear-gradient(90deg,#ef4444,#f87171);}.et-bar-fill--inc{background:linear-gradient(90deg,#22c55e,#4ade80);}
.et-bar-inline-val{font-size:10px;font-family:'JetBrains Mono',monospace;white-space:nowrap;flex-shrink:0;}.et-bar-inline-val--exp{color:#f87171;}.et-bar-inline-val--inc{color:#4ade80;}
.et-bar-legend{display:flex;gap:14px;font-size:10px;color:var(--muted);padding-top:3px;}.et-legend-dot{display:inline-block;width:7px;height:7px;border-radius:2px;margin-right:4px;}.et-legend-dot--exp{background:#ef4444;}.et-legend-dot--inc{background:#22c55e;}
.et-diff--up{color:#ef4444;font-size:11px;font-weight:600;}.et-diff--down{color:#22c55e;font-size:11px;font-weight:600;}

/* Loans */
.et-loans-total-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:10px;}.et-loans-total-label{font-size:12px;color:var(--muted);}.et-loans-total-val{font-size:18px;font-weight:700;color:#f59e0b;font-family:'JetBrains Mono',monospace;}
.et-loans-grid{display:flex;flex-direction:column;gap:10px;}
.et-loan-card{background:rgba(255,255,255,0.02);border:1px solid rgba(245,158,11,0.15);border-radius:12px;padding:12px;transition:all 0.15s;}.et-loan-card--paid{border-color:rgba(34,197,94,0.15);opacity:0.7;}
.et-loan-card-top{display:flex;align-items:center;gap:10px;margin-bottom:10px;}.et-loan-avatar{width:38px;height:38px;border-radius:50%;border:1px solid;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0;}
.et-loan-info{flex:1;display:flex;flex-direction:column;gap:3px;}.et-loan-name{font-size:14px;font-weight:700;color:#fff;}.et-loan-meta{font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace;}
.et-loan-right{display:flex;flex-direction:column;align-items:flex-end;gap:5px;}.et-loan-due{font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;}
.et-loan-repay-btn{padding:4px 10px;border-radius:8px;border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.1);color:#22c55e;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;}.et-loan-repay-btn:hover{background:rgba(34,197,94,0.22);transform:translateY(-1px);}
.et-loan-history{display:flex;flex-direction:column;gap:4px;border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;}
.et-loan-hist-row{display:flex;align-items:center;gap:6px;font-size:11px;}.et-loan-hist-desc{flex:1;color:rgba(255,255,255,0.55);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.et-loan-hist-date{color:rgba(255,255,255,0.25);font-size:10px;white-space:nowrap;}.et-loan-hist-amt{font-family:'JetBrains Mono',monospace;font-weight:700;white-space:nowrap;}
.et-loans-log{display:flex;flex-direction:column;gap:8px;}.et-loan-log-entry{background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px;padding:10px 12px;}
.et-loan-log-header{display:flex;align-items:center;gap:8px;margin-bottom:6px;}.et-loan-log-desc{flex:1;font-size:12px;font-weight:600;color:rgba(255,255,255,0.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.et-loan-log-date{font-size:10px;color:var(--muted);white-space:nowrap;}
.et-loan-log-splits{display:flex;flex-wrap:wrap;gap:5px;}.et-loan-log-split{font-size:10px;padding:2px 8px;border-radius:20px;font-family:'JetBrains Mono',monospace;}.et-loan-log-split--owe{background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);color:#f59e0b;}.et-loan-log-split--repaid{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);color:#22c55e;}

/* Category Modal */
.et-cat-modal{max-width:420px !important;text-align:left;}.et-cat-modal h3{text-align:center;margin-bottom:12px;}
.et-cat-modal-list{display:flex;flex-direction:column;gap:5px;max-height:200px;overflow-y:auto;margin-bottom:12px;border:1px solid var(--border);border-radius:9px;padding:8px;}
.et-cat-modal-list::-webkit-scrollbar{width:3px;}.et-cat-modal-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:4px;}
.et-cat-modal-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:7px;}.et-cat-modal-row:hover{background:rgba(255,255,255,0.04);}
.et-cat-modal-icon{font-size:16px;flex-shrink:0;}.et-cat-modal-name{flex:1;font-size:12px;font-weight:600;}
.et-cat-modal-del{background:none;border:none;color:rgba(239,68,68,0.5);cursor:pointer;font-size:12px;padding:2px 5px;border-radius:4px;line-height:1;transition:color 0.15s;}.et-cat-modal-del:hover{color:#ef4444;}
.et-cat-modal-default{font-size:9px;color:rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:8px;}
.et-cat-add-row{display:flex;flex-direction:column;gap:7px;padding:10px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:9px;}
.et-cat-add-top{display:flex;gap:7px;}.et-cat-icon-sel{background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;padding:7px 8px;color:var(--text);font-size:16px;cursor:pointer;outline:none;flex-shrink:0;}
.et-cat-name-inp{flex:1;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;font-family:inherit;outline:none;}.et-cat-name-inp:focus{border-color:rgba(99,102,241,0.4);}
.et-cat-color-row{display:flex;flex-wrap:wrap;gap:6px;}.et-color-dot{width:20px;height:20px;border-radius:50%;border:2px solid transparent;cursor:pointer;transition:all 0.15s;}.et-color-dot--active{border-color:#fff;transform:scale(1.2);}
.et-cat-add-btn{background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);color:#818cf8;border-radius:8px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.15s;}.et-cat-add-btn:hover{background:rgba(99,102,241,0.22);}

/* Markdown */
.et-markdown{}.et-markdown .et-p{margin:0 0 3px;font-size:13px;line-height:1.55;}.et-markdown .et-bullet{margin:0 0 2px;font-size:13px;line-height:1.5;padding-left:4px;}.et-markdown br{display:block;margin:3px 0;}.et-msg--user .et-markdown .et-p{color:#fff;margin:0;}

/* Cloud Modal */
.et-cloud-modal{max-width:380px !important;text-align:center;}.et-cloud-modal-icon{width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 14px;}.et-cloud-modal h3{font-size:17px;color:#fff;margin-bottom:5px;}.et-cloud-modal-sub{font-size:12px;color:var(--muted);margin-bottom:16px;}
.et-cloud-field{text-align:left;margin-bottom:10px;}.et-cloud-field label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:5px;}
.et-cloud-input{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:9px;padding:9px 13px;color:var(--text);font-size:14px;font-family:inherit;outline:none;transition:border-color 0.2s;}.et-cloud-input:focus{border-color:rgba(255,255,255,0.28);}.et-cloud-input::placeholder{color:var(--muted);}
.et-cloud-error{font-size:12px;color:#ef4444;margin-bottom:8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.22);border-radius:8px;padding:7px 11px;text-align:left;}
.et-cloud-user-badge{display:flex;align-items:center;gap:9px;padding:8px 11px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:9px;margin-bottom:10px;font-size:13px;font-weight:600;}
.et-cloud-avatar{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#a855f7);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;}
.et-cloud-change-user{margin-left:auto;background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:2px 5px;border-radius:5px;transition:color 0.15s;}.et-cloud-change-user:hover{color:#fff;}
.et-cloud-notice{font-size:12px;color:rgba(255,255,255,0.7);border:1px solid;border-radius:8px;padding:7px 11px;margin-bottom:10px;text-align:left;line-height:1.5;}

/* Toast */
.et-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:9px;padding:11px 18px;border-radius:12px;border:1px solid;font-size:13px;font-weight:600;color:#fff;backdrop-filter:blur(12px);background:rgba(20,20,36,0.9);box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:200;white-space:nowrap;animation:et-toast-in 0.25s cubic-bezier(0.34,1.56,0.64,1);}
@keyframes et-toast-in{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

/* Modals */
.et-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:100;animation:et-fade 0.15s ease;padding:16px;}
@keyframes et-fade{from{opacity:0}to{opacity:1}}
.et-modal{background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;max-width:340px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.6);animation:et-modal-pop 0.2s cubic-bezier(0.34,1.56,0.64,1);}
@keyframes et-modal-pop{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
.et-modal-icon{font-size:28px;margin-bottom:10px;text-align:center;}.et-modal h3{margin-bottom:9px;font-size:16px;color:#fff;text-align:center;}.et-modal p{margin-bottom:18px;font-size:13px;color:var(--muted);text-align:center;line-height:1.5;}
.et-modal-actions{display:flex;gap:9px;}
.et-modal-cancel{flex:1;padding:10px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:var(--muted);cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.15s;}.et-modal-cancel:hover{background:rgba(255,255,255,0.06);color:#fff;}.et-modal-cancel:disabled{opacity:0.4;cursor:not-allowed;}
.et-modal-confirm{flex:1;padding:10px;border-radius:9px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;transition:all 0.15s;}.et-modal-confirm:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 14px rgba(239,68,68,0.4);}.et-modal-confirm:disabled{opacity:0.5;cursor:not-allowed;transform:none;box-shadow:none;}

/* Responsive */
@media (max-width:768px){
  .et-sidebar{position:fixed;top:0;left:0;height:100dvh;transform:translateX(-100%);box-shadow:8px 0 32px rgba(0,0,0,0.5);}
  .et-sidebar--open{transform:translateX(0);}.et-close-sidebar{display:block;}.et-menu-btn{display:flex;}
  .et-topbar-title{font-size:14px;}.et-provider-chip{font-size:10px;max-width:90px;}
  .et-tab-label{display:none;}.et-tab{font-size:15px;padding:11px 6px;}
  .et-messages{padding:12px;}.et-input-wrap{margin:7px 12px 12px;}.et-suggestions{padding:7px 12px 0;}
  .et-records{padding:10px;gap:10px;}.et-listening-bar{padding:4px 12px 10px;}
  .et-group-header{flex-direction:column;align-items:flex-start;}.et-group-header-right{width:100%;}
  .et-th-desc{display:none;}.et-th-reason{display:none;}.et-desc-cell{display:none;}.et-reason-cell{display:none;}.et-mobile-subrow{display:table-row;}
  .et-settings-body{padding:12px;}.et-settings-panel{max-height:50dvh;}
  .et-bar-label{width:34px;font-size:9px;}.et-bar-fill{height:7px;}.et-bar-inline-val{font-size:9px;}
  .et-toast{bottom:16px;font-size:12px;padding:9px 14px;max-width:90vw;white-space:normal;text-align:center;}
  .et-catbreak-pie-name{width:80px;}.et-catbreak-pie-amt{width:60px;}
  .et-bgt-summary{gap:0;}.et-bgt-sum-val{font-size:14px;}.et-bgt-sum-divider{height:28px;}
  .et-bgt-month-row{flex-direction:column;align-items:flex-start;}.et-bgt-actions{width:100%;}
  .et-bgt-xfer-btn,.et-bgt-add-btn{flex:1;text-align:center;justify-content:center;}
  .et-catdetail-item{flex-direction:column;align-items:flex-start;gap:6px;}
  .et-catdetail-item-right{align-items:flex-start;}
  .et-acc-cell{display:none;}
  .et-free-slots{display:grid;grid-template-columns:1fr 1fr;}
}
@media (max-width:420px){
  .et-provider-chip{display:none;}.et-topbar{padding:8px 12px;gap:6px;}.et-settings-panel{max-height:55dvh;}
  .et-bar-label{width:28px;font-size:8px;}.et-bar-inline-val{display:none;}.et-topbar-cloud-btn{padding:5px 6px;font-size:13px;}
  .et-bgt-card-bal{font-size:15px;}.et-bgt-sum-val{font-size:13px;}
}
`;