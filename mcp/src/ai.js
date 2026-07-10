import { settings } from "./store.js";

// Server-side OpenRouter client. Uses OPENROUTER_API_KEY from the environment
// (never the app's browser-held key). Model/temperature default to whatever the
// app synced, overridable via env.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function aiConfig() {
  const s = settings();
  return {
    model: process.env.CE_MODEL || s.model || "cohere/command-a",
    temperature: Number(process.env.CE_TEMPERATURE ?? s.temperature ?? 1),
    topP: Number(process.env.CE_TOP_P ?? s.topP ?? 0.92),
    maxTokens: Number(process.env.CE_MAX_TOKENS ?? s.maxTokens ?? 8192),
  };
}

export function hasKey() {
  return !!process.env.OPENROUTER_API_KEY;
}

export async function complete(messages, { model, temperature, topP, maxTokens } = aiConfig()) {
  if (!hasKey()) throw new Error("OPENROUTER_API_KEY is not set on the server.");
  const body = { model, messages, temperature, top_p: topP, max_tokens: maxTokens };
  if (/^cohere\//i.test(model)) body.safety_mode = "NONE";
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content?.trim() || "",
    finishReason: json.choices?.[0]?.finish_reason,
  };
}

// Non-streaming equivalent of the app's streamLongform: continues across rounds
// while under the length cap or a word target, so long chapters come out whole.
export async function longform(system, user, { targetWords = 0, maxRounds = 6 } = {}) {
  const cfg = aiConfig();
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  let full = "";
  for (let i = 0; i < maxRounds; i++) {
    const { text, finishReason } = await complete(messages, cfg);
    full += text;
    if (!text.trim()) break;
    const words = full.trim().split(/\s+/).filter(Boolean).length;
    const under = targetWords > 0 && words < targetWords * 0.92;
    if (finishReason !== "length" && !under) break;
    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content: "Continue seamlessly from the exact point you stopped. Do not repeat, recap, or summarize anything already written. Write only the continuation.",
    });
  }
  return full;
}
