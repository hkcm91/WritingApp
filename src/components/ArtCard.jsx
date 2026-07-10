import React, { useState } from "react";
import { useStore, setState, getState } from "../store.js";
import { generateImage, imageUrlToDataUrl } from "../api.js";
import Card from "./Card.jsx";
import { toast } from "../toast.js";

// Image generation via Replicate — scene art, covers, reference images.
// Character portraits also have a one-tap generator on each cast card.

export default function ArtCard({ openSettings }) {
  const s = useStore();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState(""); // data URL of the last generation
  const [status, setStatus] = useState({ msg: "", kind: "" });
  const [portraitTarget, setPortraitTarget] = useState("");

  const generate = async () => {
    if (!getState().replicateToken) {
      toast("No Replicate token — add one in Settings first.", "error");
      openSettings();
      return;
    }
    if (!prompt.trim()) return toast("Describe the image first.", "error");
    setBusy(true);
    setStatus({ msg: "Generating…", kind: "" });
    try {
      const url = await generateImage(prompt.trim());
      setStatus({ msg: "Fetching image…", kind: "" });
      const dataUrl = await imageUrlToDataUrl(url).catch(() => url); // fall back to the raw URL
      setImage(dataUrl);
      setStatus({ msg: "", kind: "" });
      toast("Image ready.");
    } catch (err) {
      setStatus({ msg: err.message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = image;
    a.download = "chapter-engine-art.jpg";
    a.click();
  };

  const setPortrait = () => {
    if (!portraitTarget) return toast("Pick a character first.", "error");
    setState({
      characters: s.characters.map((c) => (c.id === portraitTarget ? { ...c, image } : c)),
    });
    toast("Portrait set.");
  };

  return (
    <Card id="art" title="Art" defaultOpen={false}>
      <span className="hint">
        Scene art, covers, and reference images via Replicate. The image model is set in Settings.
      </span>
      <textarea
        placeholder="Describe the image — subject, mood, framing, style…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <button className="btn-secondary" onClick={generate} disabled={busy}>
        {busy ? "Generating…" : "Generate image"}
      </button>
      <div className={`status ${status.kind}`}>{status.msg}</div>

      {image && (
        <>
          <img className="art-result" src={image} alt="Generated art" />
          <div className="btn-row">
            <button className="btn-secondary" onClick={download}>Download</button>
            {s.characters.length > 0 && (
              <>
                <select
                  className="art-select"
                  value={portraitTarget}
                  onChange={(e) => setPortraitTarget(e.target.value)}
                  aria-label="Character to receive this portrait"
                >
                  <option value="">Set as portrait of…</option>
                  {s.characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || "(unnamed)"}</option>
                  ))}
                </select>
                <button className="btn-secondary" onClick={setPortrait}>Set</button>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
