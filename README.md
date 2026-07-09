# Chapter Engine

A mobile-first React app for writing long-form adult fiction with an LLM, one chapter at a time, via [OpenRouter](https://openrouter.ai).

## Features

- **Write** — Story Bible / Cast (with portraits) / standing Notes, running synopsis with automatic per-chapter summaries, outline-to-chapter generation (GENERATE) or draft revision (REVISE), streamed output, Continue, AI next-chapter suggestions, and a saved chapter list.
- **Rewrite** — paste any passage plus an editing prompt; optionally sends your Bible/cast/avoid-list as context.
- **Brain Dump** — a story-development chatbot with speech-to-text dictation that interviews you and emits an importable project JSON.
- **Reader** — full-screen ebook view (serif, drop caps, scene breaks, sepia/light/dark, adjustable type, chapter paging).
- **Long outputs** — configurable `max_tokens` plus automatic seamless continuation when a generation stops at the length limit.
- **JSON in/out** — import a project from pasted JSON or a file (camelCase or snake_case keys); export everything (minus your API key).

Everything is stored in `localStorage`. Nothing leaves the device except calls to OpenRouter with your key.

## Run

```bash
npm install
npm run dev      # http://localhost:5174
npm run build    # production build in dist/
```

## Setup

Open **⚙ Settings**, paste your OpenRouter API key, and pick a model — `cohere/command-a` and `thedrummer/cydonia-24b-v4.1` are suggested, but any OpenRouter model ID works. A sample project lives at `public/sample-project.json`; import it from Settings → Project to try the app.
