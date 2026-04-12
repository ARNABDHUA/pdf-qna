import { useState, useCallback, useEffect, useRef } from "react";

// ── Default welcome messages per page ─────────────────────────────────────────
const DEFAULT_MESSAGES = {
  app: {
    id: 0,
    role: "ai",
    content:
      "Hello! Upload a PDF and ask me anything. Pick a provider in the sidebar — use local Ollama for free, or connect ChatGPT, Claude, Gemini, or Groq ⚡ with your API key. Enable Web Search to augment answers with live results.",
  },
  user: {
    id: 0,
    role: "ai",
    content:
      "Hi! I'm your coding assistant. Ask me anything about programming — debugging, code review, architecture, algorithms, or any language.",
  },
};

// ── Storage quota constants ───────────────────────────────────────────────────
const STORAGE_QUOTA_BYTES  = 5 * 1024 * 1024; // 5 MB (typical localStorage limit)
const CLEANUP_THRESHOLD    = 0.80;             // trigger cleanup at 80% usage
const CLEANUP_TARGET       = 0.60;             // free down to 60% after cleanup

// ── Estimate current localStorage usage in bytes ─────────────────────────────
function estimateStorageUsage() {
  try {
    let total = 0;
    for (const key of Object.keys(localStorage)) {
      // key length × 2 (UTF-16) + value length × 2
      total += (key.length + (localStorage.getItem(key) || "").length) * 2;
    }
    return total;
  } catch {
    return 0;
  }
}

// ── Auto-cleanup: delete oldest messages until usage drops to CLEANUP_TARGET ──
// Returns how many sessions were trimmed (for logging).
function autoCleanupIfNeeded(storageKey) {
  const usageBytes = estimateStorageUsage();
  const usageRatio = usageBytes / STORAGE_QUOTA_BYTES;

  if (usageRatio < CLEANUP_THRESHOLD) return 0; // nothing to do

  let trimmed = 0;

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return 0;

    const sessions = JSON.parse(raw);
    if (typeof sessions !== "object" || !sessions) return 0;

    // Sort oldest → newest
    const sorted = Object.values(sessions).sort((a, b) => a.updatedAt - b.updatedAt);

    // Keep deleting oldest sessions until we're below CLEANUP_TARGET
    while (
      estimateStorageUsage() / STORAGE_QUOTA_BYTES > CLEANUP_TARGET &&
      sorted.length > 1           // always keep at least 1 session
    ) {
      const oldest = sorted.shift();
      delete sessions[oldest.id];
      localStorage.setItem(storageKey, JSON.stringify(sessions));
      trimmed++;
    }

    // If only 1 session left but it's huge, trim its messages (keep last 10)
    if (sorted.length === 1 && estimateStorageUsage() / STORAGE_QUOTA_BYTES > CLEANUP_TARGET) {
      const lastSession = sessions[sorted[0].id];
      if (lastSession?.messages?.length > 10) {
        lastSession.messages = lastSession.messages.slice(-10);
        sessions[lastSession.id] = lastSession;
        localStorage.setItem(storageKey, JSON.stringify(sessions));
        trimmed++;
      }
    }
  } catch {
    // silent
  }

  return trimmed;
}

// ── Generic localStorage helpers ──────────────────────────────────────────────
function loadSessionsFromStorage(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function loadActiveIdFromStorage(activeKey) {
  try {
    return localStorage.getItem(activeKey) || null;
  } catch {
    return null;
  }
}

function saveSessionsToStorage(storageKey, sessions) {
  try {
    // Run cleanup BEFORE writing so we don't push over the limit
    autoCleanupIfNeeded(storageKey);
    localStorage.setItem(storageKey, JSON.stringify(sessions));
  } catch (e) {
    // Quota exceeded even after cleanup — try trimming more aggressively
    try {
      const keys = Object.keys(sessions).sort(
        (a, b) => sessions[a].updatedAt - sessions[b].updatedAt
      );
      // Remove oldest 30% of sessions
      const toRemove = Math.ceil(keys.length * 0.3);
      for (let i = 0; i < toRemove; i++) delete sessions[keys[i]];
      localStorage.setItem(storageKey, JSON.stringify(sessions));
    } catch {
      // silent — storage completely full
    }
  }
}

function saveActiveIdToStorage(activeKey, id) {
  try {
    if (id) localStorage.setItem(activeKey, id);
    else localStorage.removeItem(activeKey);
  } catch {
    // silent
  }
}

// ── ID + session factory ──────────────────────────────────────────────────────
function generateId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeNewSession(defaultMessage, name = "") {
  const id  = generateId();
  const now = Date.now();
  const label = name.trim() || `Chat ${new Date(now).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })}`;
  return {
    id,
    name:      label,
    messages:  [{ ...defaultMessage, id: now }],
    createdAt: now,
    updatedAt: now,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
/**
 * useChatSessions(namespace)
 *
 * @param {"app" | "user"} namespace
 *   "app"  → keys: qna_ai_sessions       / qna_ai_active_session
 *   "user" → keys: qna_user_sessions     / qna_user_active_session
 *
 * Each namespace is completely independent in localStorage.
 * Storage is auto-cleaned when usage exceeds 80% of the 5 MB quota.
 */
export function useChatSessions(namespace = "app") {
  // Derive storage keys from namespace
  const STORAGE_KEY = namespace === "user" ? "qna_user_sessions"      : "qna_ai_sessions";
  const ACTIVE_KEY  = namespace === "user" ? "qna_user_active_session" : "qna_ai_active_session";
  const DEFAULT_MSG = DEFAULT_MESSAGES[namespace] ?? DEFAULT_MESSAGES.app;

  // Keep refs stable across renders (keys never change after mount)
  const storageKeyRef = useRef(STORAGE_KEY);
  const activeKeyRef  = useRef(ACTIVE_KEY);
  const defaultMsgRef = useRef(DEFAULT_MSG);

  // ── Initialise synchronously from localStorage ───────────────────────────
  const [sessions, setSessions] = useState(() => {
    const stored = loadSessionsFromStorage(storageKeyRef.current);
    const keys   = Object.keys(stored);

    if (keys.length === 0) {
      const first   = makeNewSession(defaultMsgRef.current, "New Chat");
      const initial = { [first.id]: first };
      saveSessionsToStorage(storageKeyRef.current, initial);
      saveActiveIdToStorage(activeKeyRef.current, first.id);
      return initial;
    }
    return stored;
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    const stored  = loadSessionsFromStorage(storageKeyRef.current);
    const savedId = loadActiveIdFromStorage(activeKeyRef.current);
    const keys    = Object.keys(stored);

    if (savedId && stored[savedId]) return savedId;
    if (keys.length > 0) {
      const sorted = Object.values(stored).sort((a, b) => b.updatedAt - a.updatedAt);
      return sorted[0].id;
    }
    return null;
  });

  // ── Storage usage state (shown in UI if desired) ─────────────────────────
  const [storageUsage, setStorageUsage] = useState(() => {
    const bytes = estimateStorageUsage();
    return { bytes, ratio: bytes / STORAGE_QUOTA_BYTES };
  });

  // Refresh usage estimate whenever sessions change
  useEffect(() => {
    const bytes = estimateStorageUsage();
    setStorageUsage({ bytes, ratio: bytes / STORAGE_QUOTA_BYTES });
  }, [sessions]);

  // ── Persist sessions ─────────────────────────────────────────────────────
  useEffect(() => {
    saveSessionsToStorage(storageKeyRef.current, sessions);
  }, [sessions]);

  // ── Persist active ID ────────────────────────────────────────────────────
  useEffect(() => {
    saveActiveIdToStorage(activeKeyRef.current, activeSessionId);
  }, [activeSessionId]);

  // ── Derived values ────────────────────────────────────────────────────────
  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const messages      = activeSession?.messages ?? [{ ...DEFAULT_MSG }];
  const sessionList   = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);

  // ── Create session ────────────────────────────────────────────────────────
  const createSession = useCallback((name = "") => {
    const session = makeNewSession(defaultMsgRef.current, name);
    setSessions(prev => {
      const next = { ...prev, [session.id]: session };
      saveSessionsToStorage(storageKeyRef.current, next);
      return next;
    });
    setActiveSessionId(session.id);
    saveActiveIdToStorage(activeKeyRef.current, session.id);
    return session.id;
  }, []);

  // ── Switch session ────────────────────────────────────────────────────────
  const switchSession = useCallback((id) => {
    setSessions(prev => {
      if (!prev[id]) return prev;
      return prev;
    });
    setActiveSessionId(id);
    saveActiveIdToStorage(activeKeyRef.current, id);
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
      saveSessionsToStorage(storageKeyRef.current, next);
      return next;
    });
  }, []);

  // ── Delete session ────────────────────────────────────────────────────────
  const deleteSession = useCallback((id) => {
    setSessions(prev => {
      const next = { ...prev };
      delete next[id];

      setActiveSessionId(current => {
        if (current !== id) return current;

        const remaining = Object.values(next).sort((a, b) => b.updatedAt - a.updatedAt);
        if (remaining.length > 0) {
          saveActiveIdToStorage(activeKeyRef.current, remaining[0].id);
          return remaining[0].id;
        }

        const fresh = makeNewSession(defaultMsgRef.current, "New Chat");
        next[fresh.id] = fresh;
        saveActiveIdToStorage(activeKeyRef.current, fresh.id);
        saveSessionsToStorage(storageKeyRef.current, next);
        return fresh.id;
      });

      saveSessionsToStorage(storageKeyRef.current, next);
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
        ? updater(session.messages ?? [{ ...DEFAULT_MSG }])
        : updater;

      // Auto-name from first user message
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
          messages:  newMsgs,
          updatedAt: Date.now(),
        },
      };
      saveSessionsToStorage(storageKeyRef.current, next);
      return next;
    });
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clear ALL sessions ────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    const fresh = makeNewSession(defaultMsgRef.current, "New Chat");
    const next  = { [fresh.id]: fresh };

    setSessions(next);
    setActiveSessionId(fresh.id);
    saveSessionsToStorage(storageKeyRef.current, next);
    saveActiveIdToStorage(activeKeyRef.current, fresh.id);
  }, []);

  return {
    sessions,
    sessionList,
    activeSessionId,
    activeSession,
    messages,
    storageUsage,        // { bytes: number, ratio: 0–1 } — use in UI if desired
    createSession,
    switchSession,
    renameSession,
    deleteSession,
    setMessages,
    clearAll,
  };
}
