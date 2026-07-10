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
