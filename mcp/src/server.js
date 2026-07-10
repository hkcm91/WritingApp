import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as store from "./store.js";
import * as engine from "./engine.js";
import { hasKey } from "./ai.js";

const json = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const text = (t) => ({ content: [{ type: "text", text: t }] });

// Builds a fresh McpServer with all tools + resources. A new instance is used
// per stateless HTTP request and once for the long-lived stdio transport.
export function buildServer() {
  const server = new McpServer(
    { name: "chapter-engine", version: "1.0.0" },
    { capabilities: { resources: {}, tools: {} } }
  );

  // --- Resources (read-only, addressable) ------------------------------------

  server.registerResource(
    "library", "library://books",
    { title: "Library", description: "All books with title and counts", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, text: JSON.stringify(store.bookSummaries(), null, 2) }] })
  );

  server.registerResource(
    "book",
    new ResourceTemplate("library://book/{id}", { list: undefined }),
    { title: "Book", description: "A book's bible, cast, notes, and chapter list", mimeType: "application/json" },
    async (uri, { id }) => {
      const book = store.getBook(id);
      if (!book) throw new Error(`No book "${id}"`);
      const { chapters, ...rest } = book;
      const payload = { ...rest, chapters: (chapters || []).map((c) => ({ n: c.n, words: (c.text || "").split(/\s+/).filter(Boolean).length, summary: c.summary || "" })) };
      return { contents: [{ uri: uri.href, text: JSON.stringify(payload, null, 2) }] };
    }
  );

  server.registerResource(
    "manuscript",
    new ResourceTemplate("library://book/{id}/manuscript", { list: undefined }),
    { title: "Manuscript", description: "Full assembled manuscript text", mimeType: "text/plain" },
    async (uri, { id }) => {
      const m = store.getManuscript(id);
      if (!m) throw new Error(`No book "${id}"`);
      return { contents: [{ uri: uri.href, text: m.text }] };
    }
  );

  // --- Read tools ------------------------------------------------------------

  server.registerTool("list_books",
    { title: "List books", description: "List every book in the library with counts.", inputSchema: {} },
    async () => json(store.bookSummaries()));

  server.registerTool("get_book",
    { title: "Get book", description: "Get a book's bible, cast, notes, synopsis, and chapter list.", inputSchema: { bookId: z.string().describe('Book id, or "current"') } },
    async ({ bookId }) => { const b = store.getBook(bookId); return b ? json(b) : text(`No book "${bookId}".`); });

  server.registerTool("get_manuscript",
    { title: "Get manuscript", description: "Get the full assembled manuscript text for a book.", inputSchema: { bookId: z.string() } },
    async ({ bookId }) => { const m = store.getManuscript(bookId); return m ? text(m.text) : text(`No book "${bookId}".`); });

  server.registerTool("get_chapter",
    { title: "Get chapter", description: "Get one chapter's text by number.", inputSchema: { bookId: z.string(), n: z.number().int() } },
    async ({ bookId, n }) => { const c = store.getChapter(bookId, n); return c ? text(c.text) : text(`No chapter ${n}.`); });

  server.registerTool("get_characters",
    { title: "Get characters", description: "Get a book's cast (names, descriptions, whether they have a portrait).", inputSchema: { bookId: z.string() } },
    async ({ bookId }) => {
      const cast = store.getCharacters(bookId);
      return cast ? json(cast.map((c) => ({ id: c.id, name: c.name, description: c.description, hasPortrait: !!c.image }))) : text(`No book "${bookId}".`);
    });

  // --- Write tools -----------------------------------------------------------

  server.registerTool("create_book",
    { title: "Create book", description: "Create a new empty book.", inputSchema: { title: z.string() } },
    async ({ title }) => json({ created: store.createBook(title) }));

  server.registerTool("update_bible",
    { title: "Update bible", description: "Replace a book's Story Bible text.", inputSchema: { bookId: z.string(), storyBible: z.string() } },
    async ({ bookId, storyBible }) => { store.updateBible(bookId, storyBible); return text("Bible updated."); });

  server.registerTool("add_character",
    { title: "Add character", description: "Add a cast member to a book.", inputSchema: { bookId: z.string(), name: z.string(), description: z.string().optional() } },
    async ({ bookId, name, description }) => { store.addCharacter(bookId, name, description); return text(`Added ${name}.`); });

  server.registerTool("save_chapter",
    { title: "Save chapter", description: "Create or overwrite a chapter's text by number.", inputSchema: { bookId: z.string(), n: z.number().int(), text: z.string(), summary: z.string().optional() } },
    async ({ bookId, n, text: body, summary }) => { store.saveChapter(bookId, n, body, summary); return text(`Saved chapter ${n}.`); });

  // --- AI tools (need OPENROUTER_API_KEY on the server) -----------------------

  const guardedAi = (fn) => async (args) => {
    if (!hasKey()) return text("This tool needs OPENROUTER_API_KEY set on the server (read-only tools work without it).");
    try { return json(await fn(args)); } catch (e) { return text(`Error: ${e.message}`); }
  };

  server.registerTool("write_chapter",
    { title: "Write chapter", description: "Generate a full chapter from an outline using the book's bible, and save it.", inputSchema: { bookId: z.string(), outline: z.string(), instructions: z.string().optional(), targetWords: z.number().int().optional(), save: z.boolean().optional() } },
    guardedAi(({ bookId, ...rest }) => engine.writeChapter(bookId, rest)));

  server.registerTool("rewrite_text",
    { title: "Rewrite text", description: "Rewrite a passage per instructions, optionally with the book's bible/cast as context.", inputSchema: { bookId: z.string(), text: z.string(), instructions: z.string(), includeContext: z.boolean().optional() } },
    guardedAi(({ bookId, ...rest }) => engine.rewriteText(bookId, rest)));

  server.registerTool("suggest_next_chapters",
    { title: "Suggest next chapters", description: "Propose 3 next-chapter directions from the book's bible and synopsis.", inputSchema: { bookId: z.string() } },
    guardedAi(({ bookId }) => engine.suggestChapters(bookId)));

  server.registerTool("roleplay_reply",
    { title: "Roleplay reply", description: "Get one in-character reply for an interactive scene. Pass the prior history and the user's message.", inputSchema: { bookId: z.string(), characterId: z.string().describe('Cast id, or "narrator"'), persona: z.string().optional(), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(), userMessage: z.string().optional() } },
    guardedAi(({ bookId, ...rest }) => engine.roleplayReply(bookId, rest)));

  return server;
}
