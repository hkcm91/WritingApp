import React, { useState } from "react";
import { useStore, setState } from "../store.js";
import Card from "./Card.jsx";
import Icon from "./Icon.jsx";
import ImagePromptSheet from "./ImagePromptSheet.jsx";
import { toast } from "../toast.js";

// Freeform art/covers/reference images. The prompt is built from whatever
// story context you highlight (see ImagePromptSheet); character portraits
// already in the Bible are offered as reference images automatically.

export default function ArtCard({ openSettings }) {
  const s = useStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastImage, setLastImage] = useState("");
  const [portraitTarget, setPortraitTarget] = useState("");

  const setPortrait = () => {
    if (!portraitTarget) return toast("Pick a character first.", "error");
    setState({ characters: s.characters.map((c) => (c.id === portraitTarget ? { ...c, image: lastImage } : c)) });
    toast("Portrait set.");
  };

  return (
    <Card id="art" title="Art" defaultOpen={false}>
      <span className="hint">
        Scene art, covers, and reference images. Highlight what to draw from and the AI writes the prompt —
        it can use existing character portraits as reference.
      </span>
      <button className="btn-secondary" onClick={() => setSheetOpen(true)}>
        <Icon name="image" />
        Generate image
      </button>

      {lastImage && (
        <>
          <img className="art-result" src={lastImage} alt="Generated art" />
          <div className="btn-row">
            <button
              className="btn-secondary"
              onClick={() => {
                const a = document.createElement("a");
                a.href = lastImage;
                a.download = "chapter-engine-art.jpg";
                a.click();
              }}
            >
              Download
            </button>
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

      {sheetOpen && (
        <ImagePromptSheet
          title="Generate image"
          onClose={() => setSheetOpen(false)}
          onSave={(dataUrl) => setLastImage(dataUrl)}
          openSettings={openSettings}
        />
      )}
    </Card>
  );
}
