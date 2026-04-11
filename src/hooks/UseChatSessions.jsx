import { useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "qna_ai_sessions";
const ACTIVE_KEY  = "qna_ai_active_session";

function generateId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function loadSessionsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Validate it's a non-null object
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function loadActiveIdFromStorage() {
  try {
    return localStorage.getItem(ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

function saveSessionsToStorage(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // storage quota exceeded — silent fail
  }
}

function saveActiveIdToStorage(id) {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // silent
  }
}

const DEFAULT_MESSAGE = {
  id: 0,
  role: "ai",
  content:
    "Hello! Upload a PDF and ask me anything. Pick a provider in the sidebar — use local Ollama for free, or connect ChatGPT, Claude, Gemini, or Groq ⚡ with your API key. Enable Web Search to augment answers with live results.",
};

function makeNewSession(name = "") {
  const id  = generateId();
  const now = Date.now();
  const label = name.trim() || `Chat ${new Date(now).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })}`;
  return {
    id,
    name: label,
    messages: [{ ...DEFAULT_MESSAGE, id: Date.now() }],
    createdAt: now,
    updatedAt: now,
  };
}

export function useChatSessions() {
  // ── Initialise synchronously from localStorage ───────────────────────────
  // useState lazy initialiser runs only once on mount — no async, no effect needed
  const [sessions, setSessions] = useState(() => {
    const stored = loadSessionsFromStorage();
    const keys   = Object.keys(stored);

    // Nothing stored yet → create the very first session right here
    if (keys.length === 0) {
      const first = makeNewSession("New Chat");
      const initial = { [first.id]: first };
      saveSessionsToStorage(initial);
      saveActiveIdToStorage(first.id);
      return initial;
    }

    return stored;
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    const stored   = loadSessionsFromStorage();
    const savedId  = loadActiveIdFromStorage();
    const keys     = Object.keys(stored);

    // If saved active ID still exists in sessions, use it
    if (savedId && stored[savedId]) return savedId;

    // Otherwise fall back to most recently updated session
    if (keys.length > 0) {
      const sorted = Object.values(stored).sort((a, b) => b.updatedAt - a.updatedAt);
      return sorted[0].id;
    }

    return null;
  });

  // Guard against double-init in React StrictMode (dev only)
  const initGuard = useRef(false);

  // ── Persist sessions whenever they change ────────────────────────────────
  useEffect(() => {
    saveSessionsToStorage(sessions);
  }, [sessions]);

  // ── Persist active ID whenever it changes ────────────────────────────────
  useEffect(() => {
    saveActiveIdToStorage(activeSessionId);
  }, [activeSessionId]);

  // ── Derived values ────────────────────────────────────────────────────────
  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const messages      = activeSession?.messages ?? [{ ...DEFAULT_MESSAGE }];
  const sessionList   = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);

  // ── Create session ────────────────────────────────────────────────────────
  const createSession = useCallback((name = "") => {
    const session = makeNewSession(name);
    setSessions(prev => {
      const next = { ...prev, [session.id]: session };
      saveSessionsToStorage(next);
      return next;
    });
    setActiveSessionId(session.id);
    saveActiveIdToStorage(session.id);
    return session.id;
  }, []);

  // ── Switch session ────────────────────────────────────────────────────────
  const switchSession = useCallback((id) => {
    setSessions(prev => {
      if (!prev[id]) return prev; // guard: session must exist
      return prev;
    });
    setActiveSessionId(id);
    saveActiveIdToStorage(id);
  }, []);

  // ── Rename session ────────────────────────────────────────────────────────
  const renameSession = useCallback((id, newName) => {
    if (!newName?.trim()) return;
    setSessions(prev => {
      if (!prev[id]) return prev;
      const next = {
        ...prev,
        [id]: { ...prev[id], name: newName.trim(), updatedAt: Date.now() },
      };
      saveSessionsToStorage(next);
      return next;
    });
  }, []);

  // ── Delete session ────────────────────────────────────────────────────────
  const deleteSession = useCallback((id) => {
    setSessions(prev => {
      const next = { ...prev };
      delete next[id];

      // If we just deleted the active session, switch to the next available one
      setActiveSessionId(current => {
        if (current !== id) return current;

        const remaining = Object.values(next).sort((a, b) => b.updatedAt - a.updatedAt);
        if (remaining.length > 0) {
          saveActiveIdToStorage(remaining[0].id);
          return remaining[0].id;
        }

        // No sessions left → create a fresh one immediately
        const fresh = makeNewSession("New Chat");
        next[fresh.id] = fresh;
        saveActiveIdToStorage(fresh.id);
        saveSessionsToStorage(next);   // save includes the new session
        return fresh.id;
      });

      saveSessionsToStorage(next);
      return next;
    });
  }, []);

  // ── Set messages for active session ──────────────────────────────────────
  const setMessages = useCallback((updater) => {
    if (!activeSessionId) return;

    setSessions(prev => {
      const session = prev[activeSessionId];
      if (!session) return prev;

      const newMsgs = typeof updater === "function"
        ? updater(session.messages ?? [{ ...DEFAULT_MESSAGE }])
        : updater;

      // Auto-name session from first user message if it still has default name
      let name = session.name;
      if (session.name.startsWith("Chat ") || session.name === "New Chat") {
        const firstUser = newMsgs.find(m => m.role === "user");
        if (firstUser) {
          name = firstUser.content.slice(0, 42) +
                 (firstUser.content.length > 42 ? "…" : "");
        }
      }

      const next = {
        ...prev,
        [activeSessionId]: {
          ...session,
          name,
          messages: newMsgs,
          updatedAt: Date.now(),
        },
      };
      saveSessionsToStorage(next);
      return next;
    });
  }, [activeSessionId]);

  // ── Clear ALL sessions ────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    // Create a brand-new single session to replace everything
    const fresh = makeNewSession("New Chat");
    const next  = { [fresh.id]: fresh };

    setSessions(next);
    setActiveSessionId(fresh.id);

    // Write to storage immediately (don't rely on effect timing)
    saveSessionsToStorage(next);
    saveActiveIdToStorage(fresh.id);
  }, []);

  return {
    sessions,
    sessionList,
    activeSessionId,
    activeSession,
    messages,
    createSession,
    switchSession,
    renameSession,
    deleteSession,
    setMessages,
    clearAll,
  };
}
