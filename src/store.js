import { useSyncExternalStore } from "react";

// Multi-book store. Internally: { global, books: {id: book}, currentBookId }.
// Externally (via useStore/getState): a flat snapshot of global settings +
// the current book's fields, so components read s.storyBible etc. directly.
// setState(patch) routes each key to the book or the global bucket.

const STORE_KEY = "chapter-engine-react-v2";
const V1_KEY = "chapter-engine-react-v1";

const GLOBAL_DEFAULTS = {
  apiKey: "",
  model: "cohere/command-a",
  summaryModel: "cohere/command-a",
  temperature: 1.0,
  topP: 0.92,
  maxTokens: 8192,
  autoContinue: true,
  replicateToken: "",
  imageModel: "black-forest-labs/flux-schnell",
  readerTheme: "sepia",
  readerFontSize: 20,
  uiTheme: "rose", // rose | slate | evergreen | graphite
  serverUrl: "http://localhost:8787", // MCP / widget companion server
  cardOpen: {}, // persisted per-section collapse state, keyed by card id
};

const BOOK_DEFAULTS = {
  title: "Untitled book",
  storyBible: "",
  runningSynopsis: "",
  mode: "GENERATE",
  source: "",
  instructions: "",
  characters: [],
  notesWant: "",
  notesAvoid: "",
  targetWords: 2200, // 0 disables forced continuation toward a length target
  draftText: "",
  chapters: [], // [{ n, text, summary, source, instructions, mode, scenes, targetWords }]
  activeChapter: null,
  scenes: [], // [{ id, title, outline, text }] — workspace for the chapter in progress
  rewriteInput: "",
  rewritePrompt: "",
  rewriteOutput: "",
  rewriteContext: true,
  chatMessages: [],
  // Roleplay ("Play" page) — interactive back-and-forth using the same bible.
  rpCharId: "", // cast character id the AI embodies, or "narrator" for GM mode
  rpPersonaCharId: "", // cast id the user plays AS ("" = custom/typed persona)
  rpPersona: "", // typed persona (used when rpPersonaCharId is empty)
  rpScenario: "", // opening scene setup; optional
  rpOpeningChapterN: null, // saved chapter number to seed the opening scene, or null
  rpMessages: [], // [{ role, content }] — the roleplay transcript
  rpStarted: false,
};

let idCounter = Date.now();
export const uid = (prefix = "id") => `${prefix}${(idCounter++).toString(36)}`;

function freshBook(title) {
  return { ...BOOK_DEFAULTS, title: title || BOOK_DEFAULTS.title, id: uid("bk") };
}

// Backfill any BOOK_DEFAULTS keys a persisted book predates (e.g. a field
// added in a later version) so components never see undefined for them.
function withBookDefaults(book) {
  return { ...BOOK_DEFAULTS, ...book };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const books = data.books && Object.keys(data.books).length
        ? Object.fromEntries(Object.entries(data.books).map(([id, book]) => [id, withBookDefaults(book)]))
        : { [uid("bk")]: freshBook() };
      return {
        global: { ...GLOBAL_DEFAULTS, ...data.global },
        books,
        currentBookId: data.currentBookId,
      };
    }
    // Migrate a v1 single-project store into book #1.
    const v1raw = localStorage.getItem(V1_KEY);
    if (v1raw) {
      const v1 = JSON.parse(v1raw);
      const book = { ...freshBook("My book") };
      for (const k of Object.keys(BOOK_DEFAULTS)) if (v1[k] !== undefined) book[k] = v1[k];
      const global = { ...GLOBAL_DEFAULTS };
      for (const k of Object.keys(GLOBAL_DEFAULTS)) if (v1[k] !== undefined) global[k] = v1[k];
      return { global, books: { [book.id]: book }, currentBookId: book.id };
    }
  } catch (e) {
    console.warn("Could not load saved state:", e);
  }
  const book = freshBook();
  return { global: { ...GLOBAL_DEFAULTS }, books: { [book.id]: book }, currentBookId: book.id };
}

let internal = load();
if (!internal.books[internal.currentBookId]) {
  internal.currentBookId = Object.keys(internal.books)[0];
}

const listeners = new Set();
let snapshotCache = null;

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(internal));
  } catch (e) {
    console.warn("Storage full:", e);
  }
}

function emit() {
  snapshotCache = null;
  persist();
  listeners.forEach((l) => l());
}

function buildSnapshot() {
  const book = internal.books[internal.currentBookId];
  return {
    ...internal.global,
    ...book,
    bookId: internal.currentBookId,
    books: Object.values(internal.books).map((b) => ({
      id: b.id,
      title: b.title,
      chapters: b.chapters.length,
      words: b.chapters.reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0),
      characters: b.characters.length,
    })),
  };
}

export function getState() {
  if (!snapshotCache) snapshotCache = buildSnapshot();
  return snapshotCache;
}

/** Merge a patch (object or updater fn) — keys route to book or global. */
export function setState(patch) {
  const next = typeof patch === "function" ? patch(getState()) : patch;
  const book = internal.books[internal.currentBookId];
  for (const [k, v] of Object.entries(next)) {
    if (k in BOOK_DEFAULTS || k === "title") book[k] = v;
    else if (k in GLOBAL_DEFAULTS) internal.global[k] = v;
  }
  emit();
}

// --- Library operations -------------------------------------------------------

export function createBook(title) {
  const book = freshBook(title);
  internal.books[book.id] = book;
  internal.currentBookId = book.id;
  emit();
  return book.id;
}

export function switchBook(id) {
  if (internal.books[id]) {
    internal.currentBookId = id;
    emit();
  }
}

export function renameBook(id, title) {
  if (internal.books[id] && title.trim()) {
    internal.books[id].title = title.trim();
    emit();
  }
}

export function deleteBook(id) {
  if (!internal.books[id]) return;
  delete internal.books[id];
  if (!Object.keys(internal.books).length) {
    const book = freshBook();
    internal.books[book.id] = book;
  }
  if (internal.currentBookId === id) {
    internal.currentBookId = Object.keys(internal.books)[0];
  }
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore() {
  return useSyncExternalStore(subscribe, getState);
}

export function nextChapterNumber(s = getState()) {
  return s.chapters.reduce((max, ch) => Math.max(max, ch.n), 0) + 1;
}

// --- Library sync (to the MCP / widget companion server) ---------------------

// The full raw library for pushing to the companion server. Excludes secrets
// (API keys/tokens) — those stay in the browser and the server uses its own.
export function getFullLibrary() {
  const { apiKey, replicateToken, ...settings } = internal.global;
  return {
    settings: {
      model: settings.model,
      summaryModel: settings.summaryModel,
      temperature: settings.temperature,
      topP: settings.topP,
      maxTokens: settings.maxTokens,
    },
    books: internal.books,
    currentBookId: internal.currentBookId,
  };
}

// Replace books from a pulled library (server → app). Keeps local settings.
export function replaceLibrary({ books, currentBookId }) {
  if (!books || !Object.keys(books).length) return;
  internal.books = Object.fromEntries(
    Object.entries(books).map(([id, b]) => [id, withBookDefaults(b)])
  );
  internal.currentBookId = currentBookId && internal.books[currentBookId]
    ? currentBookId
    : Object.keys(internal.books)[0];
  emit();
}
