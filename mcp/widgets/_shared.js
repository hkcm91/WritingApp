// Tiny shared helper for the example widgets. The API base is same-origin when
// a widget is served from the companion server, or set via ?server=URL when
// embedded elsewhere (e.g. a StickerNest canvas on another origin).
window.CE = {
  base() {
    const p = new URLSearchParams(location.search).get("server");
    return (p || "").replace(/\/$/, "") || `${location.origin}`;
  },
  async get(path) {
    const res = await fetch(`${this.base()}/api${path}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
};
