// AI operations for the server, reusing the app's prompt builders verbatim
// (src/prompts.js is pure and framework-free) so chapters/rewrites/roleplay
// come out identical whether generated in the app or via MCP.

import {
  SYSTEM_PROMPT, REWRITE_SYSTEM_PROMPT,
  buildUserMessage, buildRewriteMessage, buildSuggestMessage, parseSuggestions,
  buildRoleplaySystem, buildRoleplayOpening,
} from "../../src/prompts.js";
import { complete, longform } from "./ai.js";
import { getBook, saveChapter, nextChapterNumber } from "./store.js";

function requireBook(id) {
  const book = getBook(id);
  if (!book) throw new Error(`No book with id "${id}"`);
  return book;
}

export async function writeChapter(id, { outline, instructions = "", targetWords, save = true }) {
  const book = requireBook(id);
  const s = {
    ...book,
    mode: "GENERATE",
    source: outline ?? book.source ?? "",
    instructions: instructions || book.instructions || "",
    targetWords: targetWords ?? book.targetWords ?? 0,
  };
  if (!s.source.trim()) throw new Error("Provide an `outline` (or set the book's source) to expand.");
  const text = await longform(SYSTEM_PROMPT, buildUserMessage(s), { targetWords: s.targetWords });
  let n = null;
  if (save && text.trim()) {
    n = nextChapterNumber(book);
    saveChapter(id, n, text, "");
  }
  return { chapterNumber: n, text };
}

export async function rewriteText(id, { text, instructions, includeContext = true }) {
  const book = requireBook(id);
  if (!text?.trim()) throw new Error("Provide `text` to rewrite.");
  if (!instructions?.trim()) throw new Error("Provide `instructions` for the rewrite.");
  const user = buildRewriteMessage(book, { input: text, prompt: instructions, includeContext });
  return { text: await longform(REWRITE_SYSTEM_PROMPT, user) };
}

export async function suggestChapters(id) {
  const book = requireBook(id);
  const { text } = await complete([
    { role: "system", content: "You are a story-development editor for adult fiction. All characters are adults (18+). You propose sharp, varied next-chapter directions." },
    { role: "user", content: buildSuggestMessage(book) },
  ]);
  return { suggestions: parseSuggestions(text) };
}

export async function roleplayReply(id, { characterId, persona = "", history = [], userMessage }) {
  const book = requireBook(id);
  const character = characterId && characterId !== "narrator"
    ? (book.characters || []).find((c) => c.id === characterId) || null
    : null;
  const turns = [...history];
  if (userMessage?.trim()) turns.push({ role: "user", content: userMessage });
  const seed = turns.length ? turns : [{ role: "user", content: buildRoleplayOpening(book) }];
  const { text } = await complete([
    { role: "system", content: buildRoleplaySystem(book, character, persona, characterId) },
    ...seed.map((m) => ({ role: m.role, content: m.content })),
  ]);
  return { reply: text };
}
