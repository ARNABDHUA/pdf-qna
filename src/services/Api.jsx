// services/api.js
// Updated to support: Groq provider + web_search_enabled flag

const BASE_URL = "https://pdf-qna-backend.onrender.com"|| "http://localhost:8000";
// arnab
export const api = {
  async getProviders() {
    const res = await fetch(`${BASE_URL}/providers`);
    if (!res.ok) throw new Error("Failed to fetch providers");
    return res.json();
  },

  async uploadPDF(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE_URL}/upload-pdf`, { method: "POST", body: form });
    return res.json();
  },

  async getDocuments() {
    const res = await fetch(`${BASE_URL}/documents`);
    if (!res.ok) throw new Error("Failed to fetch documents");
    return res.json();
  },

  async deleteDocument(name) {
    const res = await fetch(`${BASE_URL}/documents/${encodeURIComponent(name)}`, { method: "DELETE" });
    return res.json();
  },

  async checkHealth() {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error("Health check failed");
    return res.json();
  },

  /**
   * Stream a query response from the backend.
   * Yields parsed event objects: { chunk: string } | { searching: true } | { done: true }
   *
   * @param {string}  question           - User question
   * @param {string}  provider           - ollama | openai | anthropic | gemini | groq
   * @param {string}  model              - Model ID
   * @param {string}  apiKey             - API key (empty for Ollama)
   * @param {string}  mode               - "chat" | "legal"
   * @param {boolean} webSearchEnabled   - Whether to augment with live web search
   */
  async *queryStream(question, provider, model, apiKey = "", mode = "chat", webSearchEnabled = false) {
    const res = await fetch(`${BASE_URL}/query`, {
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
    });

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
