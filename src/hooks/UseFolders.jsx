import { useState, useCallback } from "react";

const STORAGE_KEY = "qna_doc_folders";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { folders: [], assignments: {} };
  } catch {
    return { folders: [], assignments: {} };
  }
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function genId() {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Manages document collections/folders.
 * 
 * folders: [{ id, name, color }]
 * assignments: { [docName]: folderId | null }
 */
export function useFolders() {
  const [state, setState] = useState(load);

  const update = (next) => { setState(next); save(next); };

  const createFolder = useCallback((name, color = "#5b8af0") => {
    setState(prev => {
      const next = {
        ...prev,
        folders: [...prev.folders, { id: genId(), name: name.trim() || "New Folder", color }],
      };
      save(next);
      return next;
    });
  }, []);

  const renameFolder = useCallback((id, name) => {
    if (!name?.trim()) return;
    setState(prev => {
      const next = {
        ...prev,
        folders: prev.folders.map(f => f.id === id ? { ...f, name: name.trim() } : f),
      };
      save(next);
      return next;
    });
  }, []);

  const deleteFolder = useCallback((id) => {
    setState(prev => {
      const assignments = { ...prev.assignments };
      // Unassign all docs from this folder
      Object.keys(assignments).forEach(doc => {
        if (assignments[doc] === id) assignments[doc] = null;
      });
      const next = {
        folders: prev.folders.filter(f => f.id !== id),
        assignments,
      };
      save(next);
      return next;
    });
  }, []);

  const assignDoc = useCallback((docName, folderId) => {
    setState(prev => {
      const next = {
        ...prev,
        assignments: { ...prev.assignments, [docName]: folderId },
      };
      save(next);
      return next;
    });
  }, []);

  const unassignDoc = useCallback((docName) => {
    setState(prev => {
      const assignments = { ...prev.assignments };
      delete assignments[docName];
      const next = { ...prev, assignments };
      save(next);
      return next;
    });
  }, []);

  const getFolderForDoc = (docName) => state.assignments[docName] ?? null;

  const getDocsInFolder = (folderId, allDocs) =>
    allDocs.filter(d => state.assignments[d.name] === folderId);

  const getUnassignedDocs = (allDocs) =>
    allDocs.filter(d => !state.assignments[d.name]);

  return {
    folders: state.folders,
    assignments: state.assignments,
    createFolder,
    renameFolder,
    deleteFolder,
    assignDoc,
    unassignDoc,
    getFolderForDoc,
    getDocsInFolder,
    getUnassignedDocs,
  };
}