import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// File-backed shared library. The Chapter Engine app pushes its library here
// (POST /api/sync); MCP tools/resources and StickerNest widgets read/write the
// same file. Secrets never land here — the server uses its own OPENROUTER_API_KEY.

const DATA_DIR = process.env.CHAPTER_ENGINE_DATA_DIR || path.join(os.homedir(), ".chapter-engine");
export const DATA_FILE = path.join(DATA_DIR, "library.json");

const EMPTY = { settings: {}, books: {}, currentBookId: null, updatedAt: null };

const wc = (t) => (t || "").trim().split(/\s+/).filter(Boolean).length;

export function readLibrary() {
  try {
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
  } catch {
    return { ...EMPTY };
  }
}

export function writeLibrary(lib) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const next = { ...lib, updatedAt: new Date().toISOString() };
  fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2));
  return next;
}

// --- Read helpers ------------------------------------------------------------

export function bookSummaries() {
  const lib = readLibrary();
  return Object.values(lib.books).map((b) => ({
    id: b.id,
    title: b.title,
    chapters: (b.chapters || []).length,
    words: (b.chapters || []).reduce((n, c) => n + wc(c.text), 0),
    characters: (b.characters || []).length,
    scenes: (b.scenes || []).length,
    current: b.id === lib.currentBookId,
  }));
}

export function getBook(id) {
  const lib = readLibrary();
  const book = lib.books[id] || (id === "current" ? lib.books[lib.currentBookId] : null);
  return book || null;
}

export function getManuscript(id) {
  const book = getBook(id);
  if (!book) return null;
  const chapters = [...(book.chapters || [])].sort((a, b) => a.n - b.n);
  return {
    title: book.title,
    words: chapters.reduce((n, c) => n + wc(c.text), 0),
    text: chapters.map((c) => `Chapter ${c.n}\n\n${c.text}`).join("\n\n\n"),
    chapters: chapters.map((c) => ({ n: c.n, words: wc(c.text), summary: c.summary || "" })),
  };
}

export function getChapter(id, n) {
  const book = getBook(id);
  return book ? (book.chapters || []).find((c) => c.n === Number(n)) || null : null;
}

export function getCharacters(id) {
  const book = getBook(id);
  return book ? (book.characters || []) : null;
}

// --- Write helpers (mutate + persist) ----------------------------------------

function mutate(id, fn) {
  const lib = readLibrary();
  const bookId = id === "current" ? lib.currentBookId : id;
  const book = lib.books[bookId];
  if (!book) throw new Error(`No book with id "${id}"`);
  fn(book, lib);
  writeLibrary(lib);
  return book;
}

export function saveChapter(id, n, text, summary) {
  return mutate(id, (book) => {
    book.chapters = book.chapters || [];
    const idx = book.chapters.findIndex((c) => c.n === Number(n));
    if (idx >= 0) book.chapters[idx] = { ...book.chapters[idx], text, ...(summary != null ? { summary } : {}) };
    else book.chapters.push({ n: Number(n), text, summary: summary || "" });
    book.chapters.sort((a, b) => a.n - b.n);
  });
}

export function updateBible(id, storyBible) {
  return mutate(id, (book) => { book.storyBible = storyBible; });
}

export function addCharacter(id, name, description) {
  return mutate(id, (book) => {
    book.characters = book.characters || [];
    book.characters.push({ id: `c${Date.now().toString(36)}`, name, description: description || "", image: "" });
  });
}

export function createBook(title) {
  const lib = readLibrary();
  const id = `bk${Date.now().toString(36)}`;
  lib.books[id] = {
    id, title: title || "Untitled book",
    storyBible: "", runningSynopsis: "", mode: "GENERATE", source: "", instructions: "",
    characters: [], notesWant: "", notesAvoid: "", targetWords: 2200, chapters: [], scenes: [],
  };
  lib.currentBookId = lib.currentBookId || id;
  writeLibrary(lib);
  return lib.books[id];
}

export function nextChapterNumber(book) {
  return (book.chapters || []).reduce((max, c) => Math.max(max, c.n), 0) + 1;
}

export function settings() {
  return readLibrary().settings || {};
}
