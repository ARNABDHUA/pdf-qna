import { useState, useCallback } from "react";

const BASE_URL = "https://pdf-qna-backend.onrender.com";

export function useFollowUps() {
  const [followUps, setFollowUps]   = useState([]);
  const [loading,   setLoading]     = useState(false);

  const generateFollowUps = useCallback(async (question, answer, provider, model, apiKey = "") => {
    // Only in chat mode and when answer is substantial
    if (!answer || answer.length < 80) return;

    setLoading(true);
    setFollowUps([]);

    const prompt = `Based on this Q&A exchange, suggest exactly 3 brief, specific follow-up questions the user might want to ask next. Return ONLY a JSON array of 3 strings, nothing else.

User asked: "${question}"
AI answered: "${answer.slice(0, 600)}..."

Return format: ["question 1", "question 2", "question 3"]`;

    try {
      // Use the same backend /query endpoint with a lightweight model call
      const res = await fetch(`${BASE_URL}/followups`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, provider, model, api_key: apiKey }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) throw new Error("Follow-up generation failed");

      const data = await res.json();
      // data.suggestions is List[str] from backend
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setFollowUps(data.suggestions.slice(0, 3));
      }
    } catch {
      // Fallback: generate client-side heuristic suggestions
      setFollowUps(heuristicSuggestions(question, answer));
    } finally {
      setLoading(false);
    }
  }, []);

  const clearFollowUps = useCallback(() => setFollowUps([]), []);

  return { followUps, loading, generateFollowUps, clearFollowUps };
}

// Simple heuristic fallback — no API call needed
function heuristicSuggestions(question, answer) {
  const lowerQ = question.toLowerCase();
  const lowerA = answer.toLowerCase();

  if (lowerA.includes("clause") || lowerA.includes("contract") || lowerA.includes("agreement")) {
    return [
      "What are the termination clauses in this agreement?",
      "Who are the liable parties and what are their obligations?",
      "Are there any penalty or indemnity provisions?",
    ];
  }
  if (lowerA.includes("payment") || lowerA.includes("price") || lowerA.includes("cost")) {
    return [
      "What is the payment schedule?",
      "Are there any late payment penalties?",
      "What currency and payment method is specified?",
    ];
  }
  if (lowerA.includes("party") || lowerA.includes("parties") || lowerA.includes("signatory")) {
    return [
      "What are the rights of each party?",
      "Can either party assign their rights to a third party?",
      "What dispute resolution mechanism applies?",
    ];
  }
  if (lowerQ.includes("what") || lowerQ.includes("explain")) {
    return [
      "Can you elaborate further on this topic?",
      "What are the key risks associated with this?",
      "Are there any exceptions or special conditions?",
    ];
  }
  return [
    "Can you summarize the key points?",
    "What are the most important things to note here?",
    "Are there any risks or concerns I should be aware of?",
  ];
}