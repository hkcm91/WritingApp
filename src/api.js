import { getState } from "./store.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// safety_mode is a Cohere-only parameter; sending it to other providers
// (e.g. Cydonia) can error, so only attach it for cohere/* models.
function withProviderParams(model, body) {
  if (/^cohere\//i.test(model)) body.safety_mode = "NONE";
  return body;
}

async function throwApiError(res) {
  let detail = "";
  try { detail = (await res.json()).error?.message || ""; } catch { /* not json */ }
  throw new Error(`OpenRouter ${res.status}: ${detail || res.statusText}`);
}

// Returns { text, finishReason }. finishReason === "length" means the model
// stopped because it hit max_tokens — i.e. there's more to write.
export async function streamCompletion({ model, messages, temperature, onToken }) {
  const { apiKey, maxTokens } = getState();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(withProviderParams(model, {
      model, messages, temperature, stream: true, max_tokens: maxTokens,
    })),
  });
  if (!res.ok) await throwApiError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let finishReason = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line for next chunk
    for (const line of lines) {
      const data = line.replace(/^data: /, "").trim();
      if (!data || data === "[DONE]" || data.startsWith(":")) continue;
      try {
        const choice = JSON.parse(data).choices?.[0];
        const token = choice?.delta?.content;
        if (token) {
          full += token;
          onToken?.(token);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      } catch { /* partial JSON across chunks — buffered lines only */ }
    }
  }
  return { text: full, finishReason };
}

// Streams a completion and, if the model stops only because it hit the length
// cap, asks it to continue seamlessly until the piece is actually finished
// (or the safety round-limit is reached). Makes long chapters and rewrites
// come out whole instead of truncated.
export async function streamLongform({ system, userMessage, temperature, onToken }) {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
  let full = "";
  const maxRounds = getState().autoContinue ? 8 : 1;

  for (let round = 0; round < maxRounds; round++) {
    const { text, finishReason } = await streamCompletion({
      model: getState().model,
      temperature,
      messages,
      onToken,
    });
    full += text;
    if (finishReason !== "length" || !text.trim()) break;
    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content:
        "You stopped at the length limit. Continue seamlessly from the exact point you stopped — " +
        "same word, same sentence if mid-sentence. Do not repeat, recap, or summarize anything already written. " +
        "Write only the continuation.",
    });
  }
  return full;
}

export async function completeOnce({ model, messages, temperature }) {
  const { apiKey } = getState();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(withProviderParams(model, { model, messages, temperature })),
  });
  if (!res.ok) await throwApiError(res);
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || "";
}
