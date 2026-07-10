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
  maxTokens: 8192,
  autoContinue: true,
  replicateToken: "",
  imageModel: "black-forest-labs/flux-schnell",
  readerTheme: "sepia",
  readerFontSize: 20,
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
  draftText: "",
  chapters: [],
  activeChapter: null,
  scenes: [], // [{ id, title, outline, text }] — workspace for the chapter in progress
  rewriteInput: "",
  rewritePrompt: "",
  rewriteOutput: "",
  rewriteContext: true,
  chatMessages: [],
};

let idCounter = Date.now();
export const uid = (prefix = "id") => `${prefix}${(idCounter++).toString(36)}`;

function freshBook(title) {
  return { ...BOOK_DEFAULTS, title: title || BOOK_DEFAULTS.title, id: uid("bk") };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        global: { ...GLOBAL_DEFAULTS, ...data.global },
        books: data.books && Object.keys(data.books).length ? data.books : { [uid("bk")]: freshBook() },
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
