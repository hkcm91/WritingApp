import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Replicate's API doesn't allow direct browser calls (no CORS headers), so
// /api/replicate is proxied same-origin — here for local dev/preview, and via
// api/replicate/[...path].js (Vercel serverless function) once deployed.
const replicateProxy = {
  "/api/replicate": {
    target: "https://api.replicate.com",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/replicate/, "/v1"),
  },
};

export default defineConfig({
  // GitHub Pages project sites are served from a repository subpath
  // (for example, /WritingApp/). Relative asset URLs keep the built app
  // portable so the JS/CSS load correctly from that subpath instead of
  // from the domain root.
  base: "./",
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: replicateProxy,
  },
  preview: {
    proxy: replicateProxy,
  },
});
