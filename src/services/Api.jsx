// services/Api.js
//
// Everything is identical to the original EXCEPT:
// When provider === "ollama":
//   1. Context is retrieved from your Render backend  (upload, embed, FAISS — unchanged)
//   2. The answer is streamed from local Ollama       (no backend involved for generation)
//
// Cloud providers (openai, anthropic, gemini, groq) → 100% unchanged, go through Render backend.

const BASE_URL   = "https://pdf-qna-backend.onrender.com";
const OLLAMA_URL = "http://localhost:11434";
// After
// const OLLAMA_URL = "https://localhost:11435";
// ─────────────────────────────────────────────────────────────────────────────
// Unchanged helpers from original Api.js
// ─────────────────────────────────────────────────────────────────────────────

export async function wakeUpServer() {
  try {
    await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(60000) });
  } catch {
    // silent
  }
}

async function fetchWithRetry(url, options = {}, retries = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(60000),
      });
      return res;
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast)
        throw new Error(
          `Server unreachable after ${retries} attempts. The server may still be waking up — please try again in 30 seconds.`
        );
      console.warn(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama-only: fetch context from backend, then stream generation locally
// ─────────────────────────────────────────────────────────────────────────────

async function fetchContextFromBackend(question, mode) {
  // Call a lightweight backend endpoint that just returns the retrieved chunks
  // as plain text context — no LLM call happens on the backend side.
  const res = await fetch(`${BASE_URL}/context`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, mode }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Context fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.context || ""; // plain string of retrieved chunks
}

function buildPrompt(question, context, mode) {
  if (mode === "legal") {
    const system = `You are a senior legal counsel and expert legal document analyst with 20+ years of experience.
Your task is to produce a comprehensive legal analysis in professional legal draft format.

STRICT OUTPUT FORMAT — you MUST produce ALL of the following sections in order:

═══════════════════════════════════════════════════
LEGAL ANALYSIS MEMORANDUM
═══════════════════════════════════════════════════

RE: [State the subject matter of analysis]
DATE: [Today's date]
PREPARED BY: AI Legal Analysis System

───────────────────────────────────────────────────
I. EXECUTIVE SUMMARY
───────────────────────────────────────────────────
[2-3 paragraph high-level summary of the document and key legal findings]

───────────────────────────────────────────────────
II. DOCUMENT IDENTIFICATION & NATURE
───────────────────────────────────────────────────
• Document Type: [Contract / Agreement / Deed / Notice / etc.]
• Parties Involved: [List all parties with their roles]
• Effective Date: [If mentioned]
• Governing Law / Jurisdiction: [If mentioned]

───────────────────────────────────────────────────
III. KEY PROVISIONS & CLAUSES
───────────────────────────────────────────────────
[List and explain each significant clause or provision found in the document]
For each clause: State the clause → Explain its legal effect → Note any implications

───────────────────────────────────────────────────
IV. RIGHTS & OBLIGATIONS
───────────────────────────────────────────────────
A. Rights Granted:
[List all rights explicitly granted to each party]

B. Obligations & Duties:
[List all obligations imposed on each party]

C. Restrictions & Prohibitions:
[List any restrictions, non-compete, non-disclosure, or prohibited acts]

───────────────────────────────────────────────────
V. RISK ASSESSMENT & RED FLAGS
───────────────────────────────────────────────────
⚠ HIGH RISK:
[Clauses or provisions that pose significant legal risk]

⚠ MEDIUM RISK:
[Clauses that require attention or negotiation]

✓ LOW RISK / FAVORABLE:
[Protective or standard clauses]

───────────────────────────────────────────────────
VI. LEGAL ISSUES & CONCERNS
───────────────────────────────────────────────────
[Identify ambiguous language, missing clauses, enforceability issues, compliance concerns]

───────────────────────────────────────────────────
VII. RECOMMENDATIONS
───────────────────────────────────────────────────
1.
2.
3.

───────────────────────────────────────────────────
VIII. CONCLUSION
───────────────────────────────────────────────────
[Final legal opinion and overall assessment]

───────────────────────────────────────────────────
DISCLAIMER: This analysis is generated by an AI system for informational purposes only
and does not constitute legal advice. Consult a qualified attorney for legal counsel.
═══════════════════════════════════════════════════

Base your analysis STRICTLY on the provided document context. Do not fabricate clauses or provisions not present in the document. If certain information is not available in the document, explicitly state "Not specified in the document."`;

    const user = `DOCUMENT CONTEXT:\n${context}\n\nTASK: ${question.trim() || "Perform a complete legal analysis of the above document in the specified legal draft format."}\n\nProduce a thorough legal analysis memorandum following the exact format specified in your instructions.`;
    return `${system}\n\n${user}`;
  }

  // Chat mode
  const system = "You are a helpful AI assistant. Answer the user's question based on the provided context. Be concise, accurate, and cite sources when relevant. If the answer cannot be found in the context, say so clearly.";
  const user   = `DOCUMENT CONTEXT:\n${context}\n\nQUESTION: ${question}\n\nANSWER:`;
  return `${system}\n\n${user}`;
}

async function* ollamaStream(question, model, mode) {
  // Step 1: get context from backend (embed + FAISS retrieve — your existing logic)
  const context = await fetchContextFromBackend(question, mode);

  if (!context.trim()) {
    yield { chunk: "No relevant context found in the uploaded documents." };
    return;
  }

  // Step 2: build prompt and stream from local Ollama
  const prompt = buildPrompt(question, context, mode);

  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream:  true,
        options: { temperature: 0.1, top_p: 0.9, num_predict: 4096 },
      }),
      signal: AbortSignal.timeout(180000),
    });
  } catch {
    throw new Error("Cannot connect to Ollama. Make sure it is running on port 11434.");
  }

  if (!res.ok) throw new Error(`Ollama returned status ${res.status}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value, { stream: true }).split("\n")) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.response) yield { chunk: data.response };
        if (data.done)     return;
      } catch { /* partial JSON, skip */ }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API  — identical interface to original Api.js, no App.jsx changes needed
// ─────────────────────────────────────────────────────────────────────────────

export const api = {

  // Unchanged
  // async getProviders() {
  //   const res = await fetchWithRetry(`${BASE_URL}/providers`);
  //   if (!res.ok) throw new Error("Failed to fetch providers");
  //   return res.json();
  // },

  async getProviders() {
    // Fetch cloud models from backend
    let backendData = {};
    try {
        const res = await fetchWithRetry(`${BASE_URL}/providers`);
        if (res.ok) {
            const data = await res.json();
            // Take everything EXCEPT ollama from backend
            const { ollama, ...cloudProviders } = data;
            backendData = cloudProviders;
        }
    } catch { /* backend offline */ }

    // Fetch Ollama models directly from your local machine
    let ollamaModels = [];
    try {
        const res = await fetch(`http://localhost:11434/api/tags`, {
            signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
            const data = await res.json();
            ollamaModels = (data.models || []).map(m => m.name);
        }
    } catch { /* Ollama not running */ }

    return {
        ...backendData,
        ollama: { models: ollamaModels, needs_key: false },
    };
},

  // Unchanged
  async uploadPDF(file) {
    const form = new FormData();
    form.append("file", file);
    const res  = await fetchWithRetry(`${BASE_URL}/upload-pdf`, {
      method: "POST",
      body:   form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Upload failed");
    return data;
  },

  // Unchanged
  async getDocuments() {
    const res = await fetchWithRetry(`${BASE_URL}/documents`);
    if (!res.ok) throw new Error("Failed to fetch documents");
    return res.json();
  },

  // Unchanged
  async deleteDocument(name) {
    const res = await fetchWithRetry(
      `${BASE_URL}/documents/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    return res.json();
  },

  // Unchanged
  // async checkHealth() {
  //   const res = await fetchWithRetry(`${BASE_URL}/health`);
  //   if (!res.ok) throw new Error("Health check failed");
  //   return res.json();
  // },

  async checkHealth() {
    let ollama = false;
    try {
        const res = await fetch("http://localhost:11434/api/tags", {
            signal: AbortSignal.timeout(3000),
        });
        ollama = res.ok;
    } catch {
        ollama = false;
    }
    return { ollama };
},

  // Only queryStream changes — Ollama streams locally, cloud goes to backend
  async *queryStream(question, provider, model, apiKey = "", mode = "chat", webSearchEnabled = false) {

    // ── Ollama: retrieve context from backend, generate locally ──────────────
    if (provider === "ollama") {
      yield* ollamaStream(question, model, mode);
      return;
    }

    // ── Cloud providers: 100% unchanged from original ────────────────────────
    let res;
    try {
      res = await fetch(`${BASE_URL}/query`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          provider,
          model,
          api_key:            apiKey,
          mode,
          web_search_enabled: webSearchEnabled,
        }),
        signal: AbortSignal.timeout(120000),
      });
    } catch (err) {
      throw new Error(
        "Cannot reach server. It may be waking up — please wait 30 seconds and try again."
      );
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Server error ${res.status}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6));
            yield event;
          } catch {
            // malformed line — skip
          }
        }
      }
    }
  },
};
