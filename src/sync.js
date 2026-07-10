import { getState, getFullLibrary, replaceLibrary } from "./store.js";

// Push the whole library (minus secrets) to the companion server, or pull it
// back. The app remains the source of truth; the server is a shared mirror
// that MCP agents and StickerNest widgets read.

function baseUrl() {
  return (getState().serverUrl || "").replace(/\/$/, "");
}

export async function pushLibrary() {
  const base = baseUrl();
  if (!base) throw new Error("Set the server URL first.");
  const res = await fetch(`${base}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(getFullLibrary()),
  });
  if (!res.ok) throw new Error(`Server ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.json();
}

export async function pullLibrary() {
  const base = baseUrl();
  if (!base) throw new Error("Set the server URL first.");
  const res = await fetch(`${base}/api/sync`);
  if (!res.ok) throw new Error(`Server ${res.status}: ${res.statusText}`);
  const lib = await res.json();
  replaceLibrary(lib);
  return lib;
}
