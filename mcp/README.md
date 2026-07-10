# Chapter Engine — MCP + Widget companion server

Exposes your Chapter Engine library to **AI agents (via MCP)** and to
**StickerNest widgets (via a CORS REST API)**. The Chapter Engine app stays the
source of truth — it *syncs* its library to this server, which holds a shared
copy that widgets and agents can read (and, with a key, write/generate against).

```
Chapter Engine app  ──POST /api/sync──▶  companion server  ──▶  MCP tools/resources (agents)
   (browser)                              (this package)    ──▶  REST /api/* (StickerNest widgets)
```

## Run

```bash
cd mcp
npm install
# read-only (widgets, library browsing) needs no key:
npm start
# to enable the AI tools (write_chapter, rewrite_text, roleplay_reply, …):
OPENROUTER_API_KEY=sk-or-... npm start
```

Server comes up on `http://localhost:8787`:

- `http://localhost:8787/api` — REST API (widgets + app sync)
- `http://localhost:8787/mcp` — MCP over Streamable HTTP
- `http://localhost:8787/widgets/library.html` — example widgets
- Data file: `~/.chapter-engine/library.json`

## Sync from the app

In the Chapter Engine app → **Settings → Widget / MCP server**, set the URL
(`http://localhost:8787`) and hit **Push to server**. Widgets and agents now see
your books. **Pull from server** brings server-side edits back into the app.

## Connect an agent (MCP)

**HTTP (StickerNest, other MCP-over-HTTP clients):** point the client at
`http://localhost:8787/mcp`.

**stdio (Claude Desktop / Claude Code):** add to your MCP config —

```json
{
  "mcpServers": {
    "chapter-engine": {
      "command": "node",
      "args": ["ABSOLUTE/PATH/TO/mcp/src/stdio.js"],
      "env": { "OPENROUTER_API_KEY": "sk-or-..." }
    }
  }
}
```

### MCP surface

**Resources:** `library://books`, `library://book/{id}`, `library://book/{id}/manuscript`

**Read tools:** `list_books`, `get_book`, `get_manuscript`, `get_chapter`,
`get_characters`

**Write tools:** `create_book`, `update_bible`, `add_character`, `save_chapter`

**AI tools** (need `OPENROUTER_API_KEY`): `write_chapter`, `rewrite_text`,
`suggest_next_chapters`, `roleplay_reply`

## REST API (for widgets)

`GET /api/health` · `GET /api/books` · `GET /api/books/:id` ·
`GET /api/books/:id/manuscript` · `GET /api/books/:id/chapters/:n` ·
`GET /api/books/:id/characters` · `POST /api/sync` · `GET /api/sync` ·
`POST /api/books/:id/generate-chapter`

Widgets accept a `?server=` query param to target a server on another origin
(e.g. an embedded StickerNest canvas): `library.html?server=http://localhost:8787`.

## Building your own StickerNest widget

Fetch the REST API from any widget:

```js
const books = await fetch("http://localhost:8787/api/books").then(r => r.json());
const manuscript = await fetch(`http://localhost:8787/api/books/${id}/manuscript`).then(r => r.json());
```

See `widgets/library.html`, `widgets/manuscript.html`, `widgets/dashboard.html`.

## Notes

- Your OpenRouter/Replicate keys never leave the browser and are never synced.
  AI tools use the server's own `OPENROUTER_API_KEY`.
- The store is a single JSON file — back it up by copying `~/.chapter-engine/library.json`.
