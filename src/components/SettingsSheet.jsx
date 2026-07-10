import React, { useRef, useState } from "react";
import { useStore, setState } from "../store.js";
import { applyImport, exportProject } from "../importExport.js";
import Icon from "./Icon.jsx";
import { toast } from "../toast.js";

export default function SettingsSheet({ onClose }) {
  const s = useStore();
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState("");
  const fileRef = useRef(null);

  const runImport = (jsonText) => {
    try {
      const filled = applyImport(JSON.parse(jsonText));
      setImportText("");
      setImportErr("");
      toast(`Imported: ${filled.join(", ")}.`);
    } catch (err) {
      setImportErr(err instanceof SyntaxError ? `Not valid JSON: ${err.message}` : err.message);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label="Settings">
        <div className="sheet-head">
          <h3>Settings</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <Icon name="x" />
          </button>
        </div>

        <div className="sheet-section-title">Connection</div>
        <label className="field">
          <span className="field-label">OpenRouter API key</span>
          <input
            type="password"
            placeholder="sk-or-…"
            autoComplete="off"
            value={s.apiKey}
            onChange={(e) => setState({ apiKey: e.target.value.trim() })}
          />
        </label>

        <div className="sheet-section-title">Generation</div>
        <label className="field">
          <span className="field-label">Model</span>
          <input
            type="text"
            list="model-options"
            value={s.model}
            onChange={(e) => setState({ model: e.target.value.trim() || "cohere/command-a" })}
          />
        </label>
        <label className="field">
          <span className="field-label">Summary model (cheap call for the synopsis)</span>
          <input
            type="text"
            list="model-options"
            value={s.summaryModel}
            onChange={(e) => setState({ summaryModel: e.target.value.trim() || s.model })}
          />
        </label>
        <datalist id="model-options">
          <option value="cohere/command-a">Cohere Command A</option>
          <option value="thedrummer/cydonia-24b-v4.1">Cydonia 24B v4.1 (uncensored creative)</option>
        </datalist>

        <div className="range-row">
          <span className="field-label">Temperature</span>
          <input
            type="range"
            min="0.5"
            max="1.2"
            step="0.05"
            value={s.temperature}
            onChange={(e) => setState({ temperature: Number(e.target.value) })}
          />
          <span>{s.temperature.toFixed(2)}</span>
        </div>

        <label className="field">
          <span className="field-label">Max length per request (tokens; ~750 words per 1,000)</span>
          <input
            type="number"
            min="512"
            max="32000"
            step="256"
            value={s.maxTokens}
            onChange={(e) => {
              const mt = parseInt(e.target.value, 10);
              setState({ maxTokens: Number.isFinite(mt) ? Math.min(32000, Math.max(512, mt)) : 8192 });
            }}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={s.autoContinue}
            onChange={(e) => setState({ autoContinue: e.target.checked })}
          />
          Auto-continue if a chapter or rewrite hits the length limit
        </label>

        <div className="sheet-section-title">Images</div>
        <label className="field">
          <span className="field-label">Replicate API token (for portraits & scene art)</span>
          <input
            type="password"
            placeholder="r8_…"
            autoComplete="off"
            value={s.replicateToken}
            onChange={(e) => setState({ replicateToken: e.target.value.trim() })}
          />
        </label>
        <label className="field">
          <span className="field-label">Image model (owner/name on Replicate)</span>
          <input
            type="text"
            list="image-model-options"
            value={s.imageModel}
            onChange={(e) => setState({ imageModel: e.target.value.trim() || "black-forest-labs/flux-schnell" })}
          />
        </label>
        <datalist id="image-model-options">
          <option value="black-forest-labs/flux-schnell">Flux Schnell (fast & cheap)</option>
          <option value="black-forest-labs/flux-dev">Flux Dev (higher quality)</option>
          <option value="stability-ai/sdxl">SDXL</option>
        </datalist>
        <span className="hint">
          Any Replicate model that takes a "prompt" input works. The safety checker is disabled
          when the model supports it; pick a model whose license fits your content.
        </span>

        <div className="sheet-section-title">Project data</div>
        <textarea
          style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.8rem", minHeight: "110px" }}
          placeholder='Paste project JSON — fills only the fields present, e.g. {"story_bible": "...", "mode": "GENERATE"}'
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        {importErr && <div className="status error">{importErr}</div>}
        <div className="btn-row">
          <button
            className="btn-secondary"
            onClick={() => {
              if (!importText.trim()) return setImportErr("Nothing pasted yet.");
              runImport(importText);
            }}
          >
            Import pasted JSON
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>Import file…</button>
          <button className="btn-secondary" onClick={exportProject}>Export project</button>
          <input
            type="file"
            ref={fileRef}
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files[0];
              e.target.value = "";
              if (file) runImport(await file.text());
            }}
          />
        </div>
        <span className="hint">
          Everything is stored locally in your browser. Nothing leaves this device except the calls to OpenRouter.
          Exports never include your API key.
        </span>
      </div>
    </div>
  );
}
