import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { restRouter } from "./rest.js";
import { buildServer } from "./server.js";
import { DATA_FILE } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);

const app = express();
app.use(cors()); // widgets fetch cross-origin from StickerNest
app.use(express.json({ limit: "25mb" }));

// REST API for widgets + the app's sync.
app.use("/api", restRouter());

// Example StickerNest widgets, served same-origin so they work out of the box.
app.use("/widgets", express.static(path.join(__dirname, "..", "widgets")));

// MCP over Streamable HTTP (stateless: a fresh server+transport per request).
app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: String(err) }, id: null });
  }
});

// GET/DELETE /mcp aren't used in stateless mode.
const noSession = (_req, res) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)." }, id: null });
app.get("/mcp", noSession);
app.delete("/mcp", noSession);

app.listen(PORT, () => {
  console.log(`Chapter Engine companion server on http://localhost:${PORT}`);
  console.log(`  REST for widgets : http://localhost:${PORT}/api`);
  console.log(`  MCP (HTTP)       : http://localhost:${PORT}/mcp`);
  console.log(`  Example widgets  : http://localhost:${PORT}/widgets/library.html`);
  console.log(`  Data file        : ${DATA_FILE}`);
  console.log(`  AI tools         : ${process.env.OPENROUTER_API_KEY ? "enabled" : "disabled (set OPENROUTER_API_KEY)"}`);
});
