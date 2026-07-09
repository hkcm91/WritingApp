// Tiny toast bus: toast("Saved.", "ok") from anywhere; <Toasts /> renders them.

let nextId = 0;
const listeners = new Set();

export function toast(msg, kind = "ok") {
  const t = { id: ++nextId, msg, kind };
  listeners.forEach((l) => l(t));
}

export function onToast(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
