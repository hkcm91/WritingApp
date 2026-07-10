import express from "express";
import * as store from "./store.js";
import * as engine from "./engine.js";
import { hasKey } from "./ai.js";

// Plain CORS-enabled REST API — the interface StickerNest widgets (browser
// iframes) actually consume, since they fetch() rather than speak MCP.
export function restRouter() {
  const r = express.Router();

  r.get("/health", (_req, res) => {
    const lib = store.readLibrary();
    res.json({ ok: true, books: Object.keys(lib.books).length, updatedAt: lib.updatedAt, ai: hasKey() });
  });

  r.get("/books", (_req, res) => res.json(store.bookSummaries()));

  r.get("/books/:id", (req, res) => {
    const book = store.getBook(req.params.id);
    if (!book) return res.status(404).json({ error: "not found" });
    res.json(book);
  });

  r.get("/books/:id/manuscript", (req, res) => {
    const m = store.getManuscript(req.params.id);
    if (!m) return res.status(404).json({ error: "not found" });
    res.json(m);
  });

  r.get("/books/:id/chapters/:n", (req, res) => {
    const c = store.getChapter(req.params.id, req.params.n);
    if (!c) return res.status(404).json({ error: "not found" });
    res.json(c);
  });

  r.get("/books/:id/characters", (req, res) => {
    const cast = store.getCharacters(req.params.id);
    if (!cast) return res.status(404).json({ error: "not found" });
    res.json(cast);
  });

  // App → server: push the whole library (the app stays the source of truth).
  r.post("/sync", (req, res) => {
    const { books, currentBookId, settings } = req.body || {};
    if (!books || typeof books !== "object") return res.status(400).json({ error: "expected { books }" });
    const saved = store.writeLibrary({ books, currentBookId: currentBookId ?? null, settings: settings || {} });
    res.json({ ok: true, books: Object.keys(saved.books).length, updatedAt: saved.updatedAt });
  });

  // Server → app: pull the current library back.
  r.get("/sync", (_req, res) => {
    const lib = store.readLibrary();
    res.json({ books: lib.books, currentBookId: lib.currentBookId });
  });

  // Widget-triggered generation (needs a server key).
  r.post("/books/:id/generate-chapter", async (req, res) => {
    try {
      const out = await engine.writeChapter(req.params.id, req.body || {});
      res.json(out);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  return r;
}
