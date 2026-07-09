import { useSyncExternalStore } from "react";

// Single localStorage-backed store. Components read via useStore() and write
// via setState(patch) — every write persists and re-renders subscribers.

const STORE_KEY = "chapter-engine-react-v1";

const defaults = {
  // Settings
  apiKey: "",
  model: "cohere/command-a",
  summaryModel: "cohere/command-a",
  temperature: 1.0,
  maxTokens: 8192,
  autoContinue: true,

  // Project
  storyBible: "",
  runningSynopsis: "",
  mode: "GENERATE", // GENERATE | REVISE
  source: "",
  instructions: "",
  characters: [], // [{ id, name, description, image }]
  notesWant: "",
  notesAvoid: "",

  // Draft & chapters
  draftText: "",
  chapters: [], // [{ n, text, summary }]
  activeChapter: null,

  // Rewrite page
  rewriteInput: "",
  rewritePrompt: "",
  rewriteOutput: "",
  rewriteContext: true,

  // Brain Dump chat
  chatMessages: [],

  // Reader prefs
  readerTheme: "sepia",
  readerFontSize: 20,
};

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (e) {
    console.warn("Could not load saved state:", e);
  }
  return { ...defaults };
}

let state = load();
const listeners = new Set();

export function getState() {
  return state;
}

/** Merge a patch (object or updater fn) into the store and persist. */
export function setState(patch) {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    // Storage full — surface via a transient, non-persisted flag.
    state = { ...state, storageError: true };
  }
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore() {
  return useSyncExternalStore(subscribe, getState);
}

export function nextChapterNumber(s = state) {
  return s.chapters.reduce((max, ch) => Math.max(max, ch.n), 0) + 1;
}
