// services/api.js
const BASE_URL = "https://pdf-qna-backend.onrender.com";

// Wake up the Render server on app load (free tier spins down after inactivity)
// Call this once when your app starts — e.g. in App.jsx useEffect
export async function wakeUpServer() {
  try {
    await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(60000) });
  } catch {
    // silent — server might still be waking up
  }
}

// Fetch with automatic retry (handles Render cold start delays)
async function fetchWithRetry(url, options = {}, retries = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(60000), // 60s timeout per attempt
      });
      return res;
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw new Error(`Server unreachable after ${retries} attempts. The server may still be waking up — please try again in 30 seconds.`);
      console.warn(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export const api = {
  async getProviders() {
    const res = await fetchWithRetry(`${BASE_URL}/providers`);
    if (!res.ok) throw new Error("Failed to fetch providers");
    return res.json();
  },

  async uploadPDF(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetchWithRetry(`${BASE_URL}/upload-pdf`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Upload failed");
    return data;
  },

  async getDocuments() {
    const res = await fetchWithRetry(`${BASE_URL}/documents`);
    if (!res.ok) throw new Error("Failed to fetch documents");
    return res.json();
  },

  async deleteDocument(name) {
    const res = await fetchWithRetry(`${BASE_URL}/documents/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    return res.json();
  },

  async checkHealth() {
    const res = await fetchWithRetry(`${BASE_URL}/health`);
    if (!res.ok) throw new Error("Health check failed");
    return res.json();
  },

  /**
   * Stream a query response from the backend.
   * Yields: { chunk: string } | { searching: true } | { done: true }
   */
  async *queryStream(question, provider, model, apiKey = "", mode = "chat", webSearchEnabled = false) {
    let res;
    try {
      res = await fetch(`${BASE_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          provider,
          model,
          api_key:            apiKey,
          mode,
          web_search_enabled: webSearchEnabled,
        }),
        signal: AbortSignal.timeout(120000), // 2 min for long LLM responses
      });
    } catch (err) {
      throw new Error("Cannot reach server. It may be waking up — please wait 30 seconds and try again.");
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
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6));
            yield event; // { chunk } | { searching: true } | { done: true }
          } catch {
            // malformed line — skip
          }
        }
      }
    }
  },
};
