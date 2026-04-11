import { useState, useCallback } from "react";

const BASE_URL = "https://pdf-qna-backend.onrender.com";

/**
 * Hook that generates and caches per-document summaries.
 * Summaries are stored in sessionStorage so they survive re-renders
 * but reset on page close (no stale summaries across sessions).
 */
export function useDocSummary() {
  const [summaries, setSummaries] = useState(() => {
    try {
      const raw = sessionStorage.getItem("qna_doc_summaries");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [loading, setLoading] = useState({});

  const persist = (next) => {
    setSummaries(next);
    try { sessionStorage.setItem("qna_doc_summaries", JSON.stringify(next)); } catch {}
  };

  const generateSummary = useCallback(async (docName, provider, model, apiKey = "") => {
    if (!docName) return;

    setLoading(prev => ({ ...prev, [docName]: true }));
    try {
      const res = await fetch(`${BASE_URL}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_name: docName,
          provider,
          model,
          api_key: apiKey,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("Summary request failed");
      const data = await res.json();
      if (data.summary) {
        persist({ ...summaries, [docName]: data.summary });
      }
    } catch (err) {
      console.warn("Summary generation failed:", err.message);
    } finally {
      setLoading(prev => ({ ...prev, [docName]: false }));
    }
  }, [summaries]);

  const clearSummary = useCallback((docName) => {
    const next = { ...summaries };
    delete next[docName];
    persist(next);
  }, [summaries]);

  return { summaries, loading, generateSummary, clearSummary };
}