import React, { useState } from "react";
import { useStore, setState, getState } from "../store.js";
import { streamLongform } from "../api.js";
import { REWRITE_SYSTEM_PROMPT, buildRewriteMessage } from "../prompts.js";
import Card from "../components/Card.jsx";
import Icon from "../components/Icon.jsx";
import { toast } from "../toast.js";

const wordCount = (t) => t.trim().split(/\s+/).filter(Boolean).length;

export default function RewritePage({ onRead, openSettings, goWrite }) {
  const s = useStore();
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);

  const rewrite = async () => {
    if (!getState().apiKey) {
      toast("No API key — add it in Settings first.", "error");
      openSettings();
      return;
    }
    const input = getState().rewriteInput.trim();
    const prompt = getState().rewritePrompt.trim();
    if (!input) return toast("Nothing to rewrite — paste text first.", "error");
    if (!prompt) return toast("Rewrite prompt is empty — say what to do with it.", "error");

    setBusy(true);
    setState({ rewriteOutput: "" });
    setProgress("Rewriting…");
    try {
      const { text: result, degenerate } = await streamLongform({
        system: REWRITE_SYSTEM_PROMPT,
        userMessage: buildRewriteMessage(getState(), { input, prompt, includeContext: getState().rewriteContext }),
        temperature: getState().temperature,
        onToken: (t) => setState((prev) => ({ rewriteOutput: prev.rewriteOutput + t })),
      });
      // Resync to the clean accumulated text — see the note in WritePage.generate().
      setState({ rewriteOutput: result });
      if (!result.trim()) {
        throw new Error(
          degenerate
            ? "The model produced corrupted/garbled output. Try again, or lower Temperature/top_p in Settings."
            : "Model returned nothing."
        );
      }
      toast(degenerate
        ? "Rewrite stopped early after producing corrupted output. Consider lowering Temperature or top_p in Settings."
        : "Rewrite done.", degenerate ? "error" : "ok");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <div className="page write-layout">
      <div className="write-side">
        <Card title="Text to rewrite">
          <textarea
            className="prose"
            placeholder="Paste the chapter or passage to rework…"
            value={s.rewriteInput}
            onChange={(e) => setState({ rewriteInput: e.target.value })}
          />
          <span className="hint">{s.rewriteInput.trim() ? `${wordCount(s.rewriteInput).toLocaleString()} words` : ""}</span>
        </Card>

        <Card title="Rewrite prompt">
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
          <div className="status">{progress}</div>
        </Card>

        <div className="cta-bar">
          <button className="btn" onClick={rewrite} disabled={busy}>
            {busy ? progress || "Working…" : "Rewrite"}
          </button>
        </div>
      </div>

      <div className="write-main">
        <section className="manuscript" aria-label="Rewritten text">
          <div className="manuscript-head">
            <span className="manuscript-title">Rewritten</span>
            <span className="manuscript-words">
              {s.rewriteOutput.trim() ? `${wordCount(s.rewriteOutput).toLocaleString()} words` : ""}
            </span>
            <div className="manuscript-actions">
              <button
                className="icon-btn"
                title="Preview in reader"
                aria-label="Preview in reader"
                onClick={() => s.rewriteOutput.trim()
                  ? onRead([{ text: s.rewriteOutput, label: "Rewritten" }])
                  : toast("Nothing to read yet — run a rewrite first.", "error")}
              >
                <Icon name="book" size={17} />
              </button>
              <button
                className="icon-btn"
                title="Copy"
                aria-label="Copy rewritten text"
                onClick={async () => { await navigator.clipboard.writeText(s.rewriteOutput); toast("Copied."); }}
              >
                <Icon name="copy" size={17} />
              </button>
              <button
                className="icon-btn"
                title="Send to Source (REVISE mode)"
                aria-label="Send to Source"
                onClick={() => {
                  const text = s.rewriteOutput.trim();
                  if (!text) return toast("Nothing to send yet.", "error");
                  setState({ source: text, mode: "REVISE" });
                  toast("Loaded into Source in REVISE mode.");
                  goWrite();
                }}
              >
                <Icon name="send" size={17} />
              </button>
            </div>
          </div>
          <textarea
            placeholder="The rewrite streams in here — editable once it lands."
            value={s.rewriteOutput}
            onChange={(e) => setState({ rewriteOutput: e.target.value })}
          />
        </section>
      </div>
    </div>
  );
}
