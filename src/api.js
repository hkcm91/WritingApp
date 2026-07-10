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

// --- Replicate image generation ----------------------------------------------

const REPLICATE_BASE = "https://api.replicate.com/v1";

async function replicateRequest(model, input, token) {
  return fetch(`${REPLICATE_BASE}/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ input }),
  });
}

const schemaCache = new Map();

// Fetch the model's input schema so we know whether it accepts a safety-checker
// flag and/or a reference-image field, instead of guessing blindly.
async function getModelInputSchema(model, token) {
  if (schemaCache.has(model)) return schemaCache.get(model);
  try {
    const res = await fetch(`${REPLICATE_BASE}/models/${model}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const props = data?.latest_version?.openapi_schema?.components?.schemas?.Input?.properties || null;
    schemaCache.set(model, props);
    return props;
  } catch {
    schemaCache.set(model, null);
    return null;
  }
}

const IMAGE_FIELD_CANDIDATES = ["image_input", "input_image", "image", "images", "reference_images", "control_image"];

function pickImageField(props) {
  if (!props) return null;
  for (const name of IMAGE_FIELD_CANDIDATES) {
    if (props[name]) return { name, isArray: props[name].type === "array" };
  }
  return null;
}

/**
 * Generate an image from a prompt, optionally with character-portrait
 * reference images (data URLs). Returns { url, usedReference } — Replicate
 * models vary wildly in schema, so reference images are only attached when
 * the model's own schema exposes a matching field; otherwise it falls back
 * to a plain text-to-image call and reports that no reference was used.
 */
export async function generateImage(prompt, referenceImages = []) {
  const { replicateToken, imageModel } = getState();
  if (!replicateToken) throw new Error("No Replicate API token — add one in Settings.");
  if (!imageModel.includes("/")) throw new Error("Image model must be owner/name, e.g. black-forest-labs/flux-schnell.");

  const props = await getModelInputSchema(imageModel, replicateToken);
  const input = { prompt };
  if (props?.disable_safety_checker) input.disable_safety_checker = true;

  let usedReference = false;
  if (referenceImages.length) {
    const field = pickImageField(props);
    if (field) {
      input[field.name] = field.isArray ? referenceImages : referenceImages[0];
      usedReference = true;
    }
  }

  let res = await replicateRequest(imageModel, input, replicateToken);
  if (res.status === 422) {
    // Schema guess was wrong somewhere — retry with prompt only.
    res = await replicateRequest(imageModel, { prompt }, replicateToken);
    usedReference = false;
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail || ""; } catch { /* not json */ }
    throw new Error(`Replicate ${res.status}: ${detail || res.statusText}`);
  }

  let prediction = await res.json();
  // Prefer: wait usually returns a finished prediction; poll if it didn't.
  for (let i = 0; i < 30 && ["starting", "processing"].includes(prediction.status); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`${REPLICATE_BASE}/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${replicateToken}` },
    });
    prediction = await poll.json();
  }
  if (prediction.status !== "succeeded") {
    throw new Error(`Image generation ${prediction.status}: ${prediction.error || "no output"}`);
  }
  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!url) throw new Error("Model returned no image.");
  return { url, usedReference };
}

/** Fetch a generated image and downscale to a data URL for local storage. */
export async function imageUrlToDataUrl(url, maxDim = 512) {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.87);
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
