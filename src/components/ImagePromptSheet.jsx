import React, { useState } from "react";
import { useStore, getState } from "../store.js";
import { completeOnce, generateImage, imageUrlToDataUrl } from "../api.js";
import { IMAGE_PROMPT_SYSTEM, buildImagePromptMessage, serializeCharacters } from "../prompts.js";
import Icon from "./Icon.jsx";
import { toast } from "../toast.js";

/**
 * "Highlight what this image should draw from" — a checklist of story areas
 * (chips, highlighted when selected) that the AI turns into an image prompt.
 * Selected characters' existing portraits are sent as reference images when
 * the chosen Replicate model supports it, so scene art stays on-model.
 *
 * forcedContext: optional { label, text } for scene/chapter prose that's
 * relevant to this specific image (e.g. the scene being illustrated).
 */
export default function ImagePromptSheet({ title = "Generate image", forcedContext, onClose, onSave, openSettings }) {
  const s = useStore();
  const [includeBible, setIncludeBible] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeSynopsis, setIncludeSynopsis] = useState(false);
  const [includeForced, setIncludeForced] = useState(true);
  const [charIds, setCharIds] = useState(() => {
    if (!forcedContext?.text) return new Set();
    const text = forcedContext.text.toLowerCase();
    return new Set(
      s.characters
        .filter((c) => {
          const first = (c.name || "").split(/[\s(]/)[0].toLowerCase();
          return first && text.includes(first);
        })
        .map((c) => c.id)
    );
  });
  const [extra, setExtra] = useState("");
  const [promptText, setPromptText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState({ msg: "", kind: "" });
  const [resultImage, setResultImage] = useState("");

  const toggleChar = (id) => {
    setCharIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedCharacters = s.characters.filter((c) => charIds.has(c.id));
  const referenceImages = selectedCharacters.filter((c) => c.image).map((c) => c.image);

  const assembleContext = () => {
    let ctx = "";
    if (includeBible && s.storyBible.trim()) ctx += `STORY BIBLE:\n${s.storyBible.trim()}\n\n`;
    if (selectedCharacters.length) {
      ctx += `CHARACTERS IN THIS IMAGE (all adults, 18+):\n${serializeCharacters(selectedCharacters)}\n\n`;
    }
    if (includeNotes) {
      if (s.notesWant.trim()) ctx += `STEER TOWARD:\n${s.notesWant.trim()}\n\n`;
      if (s.notesAvoid.trim()) ctx += `AVOID:\n${s.notesAvoid.trim()}\n\n`;
    }
    if (includeSynopsis && s.runningSynopsis.trim()) ctx += `SYNOPSIS SO FAR:\n${s.runningSynopsis.trim()}\n\n`;
    if (includeForced && forcedContext?.text?.trim()) ctx += `${forcedContext.label.toUpperCase()}:\n${forcedContext.text.trim()}\n\n`;
    if (extra.trim()) ctx += `ADDITIONAL DIRECTION:\n${extra.trim()}\n\n`;
    return ctx.trim();
  };

  const draftPrompt = async () => {
    if (!getState().apiKey) {
      toast("No API key — add it in Settings first.", "error");
      openSettings();
      return;
    }
    const ctx = assembleContext();
    if (!ctx) return setStatus({ msg: "Highlight at least one area to include.", kind: "error" });
    setDrafting(true);
    setStatus({ msg: "Drafting prompt…", kind: "" });
    try {
      const raw = await completeOnce({
        model: getState().model,
        temperature: 0.8,
        messages: [
          { role: "system", content: IMAGE_PROMPT_SYSTEM },
          { role: "user", content: buildImagePromptMessage(ctx) },
        ],
      });
      if (!raw.trim()) throw new Error("Model returned nothing.");
      setPromptText(raw.trim());
      setStatus({ msg: "", kind: "" });
    } catch (err) {
      setStatus({ msg: err.message, kind: "error" });
    } finally {
      setDrafting(false);
    }
  };

  const generate = async () => {
    if (!getState().replicateToken) {
      toast("No Replicate token — add one in Settings first.", "error");
      openSettings();
      return;
    }
    if (!promptText.trim()) return setStatus({ msg: "Draft or write a prompt first.", kind: "error" });
    setGenerating(true);
    setStatus({ msg: "Generating…", kind: "" });
    try {
      const { url, usedReference } = await generateImage(promptText.trim(), referenceImages);
      setStatus({ msg: "Fetching image…", kind: "" });
      const dataUrl = await imageUrlToDataUrl(url).catch(() => url);
      setResultImage(dataUrl);
      setStatus({
        msg: referenceImages.length
          ? usedReference
            ? "Generated using character portraits as reference."
            : "Generated — this model doesn't support reference images, so portraits weren't used."
          : "",
        kind: "ok",
      });
    } catch (err) {
      setStatus({ msg: err.message, kind: "error" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <span className="hint">Highlight what this image should draw from — the AI writes the prompt from your selection.</span>

        <div className="chip-row">
          <button className={`chip ${includeBible ? "selected" : ""}`} aria-pressed={includeBible} onClick={() => setIncludeBible((v) => !v)}>
            Story Bible
          </button>
          <button className={`chip ${includeNotes ? "selected" : ""}`} aria-pressed={includeNotes} onClick={() => setIncludeNotes((v) => !v)}>
            Notes
          </button>
          <button className={`chip ${includeSynopsis ? "selected" : ""}`} aria-pressed={includeSynopsis} onClick={() => setIncludeSynopsis((v) => !v)}>
            Synopsis
          </button>
          {forcedContext && (
            <button className={`chip ${includeForced ? "selected" : ""}`} aria-pressed={includeForced} onClick={() => setIncludeForced((v) => !v)}>
              {forcedContext.label}
            </button>
          )}
        </div>

        {s.characters.length > 0 && (
          <>
            <span className="field-label">Characters in this image</span>
            <div className="chip-row">
              {s.characters.map((c) => (
                <button
                  key={c.id}
                  className={`chip char-chip ${charIds.has(c.id) ? "selected" : ""}`}
                  aria-pressed={charIds.has(c.id)}
                  onClick={() => toggleChar(c.id)}
                >
                  <span className="chip-avatar">
                    {c.image ? <img src={c.image} alt="" /> : <Icon name="plus" size={11} />}
                  </span>
                  {c.name || "(unnamed)"}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="field">
          <span className="field-label">Anything else? (mood, composition, style)</span>
          <textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="e.g. wide shot, candlelight, watercolor style…"
          />
        </label>

        <div className="btn-row">
          <button className="btn-secondary" onClick={draftPrompt} disabled={drafting}>
            <Icon name="wand" />
            {drafting ? "Drafting…" : "Draft prompt with AI"}
          </button>
        </div>

        <label className="field">
          <span className="field-label">Image prompt (editable)</span>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Draft one above, or write your own image prompt here…"
          />
        </label>

        {referenceImages.length > 0 && (
          <div className="ref-row">
            <span className="hint">Reference portraits:</span>
            {referenceImages.map((img, i) => (
              <img key={i} className="ref-thumb" src={img} alt="" />
            ))}
          </div>
        )}

        <button className="btn" onClick={generate} disabled={generating}>
          {generating ? "Generating…" : "Generate image"}
        </button>
        <div className={`status ${status.kind}`}>{status.msg}</div>

        {resultImage && (
          <>
            <img className="art-result" src={resultImage} alt="Generated art" />
            <div className="btn-row">
              <button
                className="btn-secondary"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = resultImage;
                  a.download = "chapter-engine-art.jpg";
                  a.click();
                }}
              >
                Download
              </button>
              <button
                className="btn-secondary"
                onClick={() => { onSave(resultImage); onClose(); }}
              >
                Use this image
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
