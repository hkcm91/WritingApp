#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

// Stdio entry for Claude Desktop / Claude Code MCP config. Reads the same
// library file the HTTP server and app sync to. Logs must go to stderr only —
// stdout is the JSON-RPC channel.
const server = buildServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("chapter-engine MCP server (stdio) ready");
