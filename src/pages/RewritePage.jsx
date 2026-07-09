import React, { useState } from "react";
import { useStore, setState, getState } from "../store.js";
import { streamLongform } from "../api.js";
import { REWRITE_SYSTEM_PROMPT, buildRewriteMessage } from "../prompts.js";

const wordCount = (t) => t.trim().split(/\s+/).filter(Boolean).length;

export default function RewritePage({ onRead, openSettings, goWrite }) {
  const s = useStore();
  const [status, setStatus] = useState({ msg: "", kind: "" });
  const [busy, setBusy] = useState(false);

  const say = (msg, kind = "") => setStatus({ msg, kind });

  const rewrite = async () => {
    if (!getState().apiKey) {
      say("No API key — open Settings first.", "error");
      openSettings();
      return;
    }
    const input = getState().rewriteInput.trim();
    const prompt = getState().rewritePrompt.trim();
    if (!input) return say("Nothing to rewrite — paste text first.", "error");
    if (!prompt) return say("Rewrite prompt is empty — say what to do with it.", "error");

    setBusy(true);
    setState({ rewriteOutput: "" });
    say("Rewriting…");
    try {
      const result = await streamLongform({
        system: REWRITE_SYSTEM_PROMPT,
        userMessage: buildRewriteMessage(getState(), { input, prompt, includeContext: getState().rewriteContext }),
        temperature: getState().temperature,
        onToken: (t) => setState((prev) => ({ rewriteOutput: prev.rewriteOutput + t })),
      });
      if (!result.trim()) throw new Error("Model returned nothing.");
      say("Done.", "ok");
    } catch (err) {
      say(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <details className="card" open>
        <summary>
          <span className="card-title"><span className="dot">●</span> Text to rewrite</span>
          <span className="chev">›</span>
        </summary>
        <div className="card-body">
          <textarea
            className="prose"
            placeholder="Paste the chapter or passage to rework…"
            value={s.rewriteInput}
            onChange={(e) => setState({ rewriteInput: e.target.value })}
          />
          <span className="hint">{s.rewriteInput.trim() ? `${wordCount(s.rewriteInput).toLocaleString()} words` : ""}</span>
        </div>
      </details>

      <details className="card" open>
        <summary>
          <span className="card-title"><span className="dot">●</span> Rewrite prompt</span>
          <span className="chev">›</span>
        </summary>
        <div className="card-body">
          <textarea
            placeholder={"What to do with it, e.g.\n- Tighten by ~20%, kill filter words\n- Convert to present tense\n- Raise the heat of the middle scene to level 4"}
            value={s.rewritePrompt}
            onChange={(e) => setState({ rewritePrompt: e.target.value })}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={s.rewriteContext}
              onChange={(e) => setState({ rewriteContext: e.target.checked })}
            />
            Include Story Bible, cast & avoid-notes as context
          </label>
          <button className="btn" onClick={rewrite} disabled={busy}>
            {busy ? "Rewriting…" : "Rewrite"}
          </button>
          <div className={`status ${status.kind}`}>{status.msg}</div>
        </div>
      </details>

      <details className="card" open>
        <summary>
          <span className="card-title"><span className="dot">●</span> Rewritten</span>
          <span className="chev">›</span>
        </summary>
        <div className="card-body">
          <textarea
            className="prose"
            style={{ minHeight: "260px" }}
            placeholder="The rewrite streams in here — editable once it lands."
            value={s.rewriteOutput}
            onChange={(e) => setState({ rewriteOutput: e.target.value })}
          />
          <div className="btn-row">
            <span className="hint">{s.rewriteOutput.trim() ? `${wordCount(s.rewriteOutput).toLocaleString()} words` : ""}</span>
            <span className="spacer" />
            <button
              className="btn-ghost"
              onClick={() => {
                if (!s.rewriteOutput.trim()) return say("Nothing to read yet — run a rewrite first.", "error");
                onRead([{ text: s.rewriteOutput, label: "Rewritten" }]);
              }}
            >
              📖 Read
            </button>
            <button
              className="btn-ghost"
              onClick={async () => { await navigator.clipboard.writeText(s.rewriteOutput); say("Copied.", "ok"); }}
            >
              Copy
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                const text = s.rewriteOutput.trim();
                if (!text) return say("Nothing to send yet.", "error");
                setState({ source: text, mode: "REVISE" });
                goWrite();
              }}
            >
              Send to Source
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
