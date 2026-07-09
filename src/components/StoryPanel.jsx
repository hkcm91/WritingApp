import React, { useRef, useState } from "react";
import { useStore, setState } from "../store.js";
import { resizeImage, newCharId } from "../importExport.js";

const BIBLE_PLACEHOLDER = `TITLE / FANDOM:
POV & TENSE:        (e.g. first person, past tense)
HEAT LEVEL:         (1–5; 5 = fully explicit)
TONE:               (dark, angsty, comedic, romantic…)
WORLD / CANON RULES:
CONTINUITY NOTES:

(Characters live in the Cast tab — added to every prompt automatically.)`;

export default function StoryPanel() {
  const s = useStore();
  const [tab, setTab] = useState("bible");
  const fileRef = useRef(null);
  const pendingChar = useRef(null);

  const updateChar = (id, patch) => {
    setState({
      characters: s.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const onPortrait = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !pendingChar.current) return;
    try {
      const image = await resizeImage(file);
      updateChar(pendingChar.current, { image });
    } catch { /* unreadable image — leave as-is */ }
    pendingChar.current = null;
  };

  return (
    <details className="card" open>
      <summary>
        <span className="card-title"><span className="dot">●</span> Story</span>
        <span className="chev">›</span>
      </summary>
      <div className="card-body">
        <div className="segmented">
          {["bible", "cast", "notes"].map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t === "bible" ? "Bible" : t === "cast" ? `Cast${s.characters.length ? ` · ${s.characters.length}` : ""}` : "Notes"}
            </button>
          ))}
        </div>

        {tab === "bible" && (
          <textarea
            className="prose"
            placeholder={BIBLE_PLACEHOLDER}
            value={s.storyBible}
            onChange={(e) => setState({ storyBible: e.target.value })}
          />
        )}

        {tab === "cast" && (
          <>
            {s.characters.map((c) => (
              <div className="char-card" key={c.id}>
                <div
                  className="char-img"
                  title="Set portrait"
                  onClick={() => { pendingChar.current = c.id; fileRef.current?.click(); }}
                >
                  {c.image ? <img src={c.image} alt={c.name || "portrait"} /> : "+"}
                </div>
                <input
                  placeholder="Name (18+)"
                  value={c.name}
                  onChange={(e) => updateChar(c.id, { name: e.target.value })}
                />
                <button
                  className="char-del"
                  title="Remove character"
                  onClick={() => {
                    if (confirm(`Remove ${c.name || "this character"}?`)) {
                      setState({ characters: s.characters.filter((x) => x.id !== c.id) });
                    }
                  }}
                >
                  ✕
                </button>
                <textarea
                  placeholder="Role, voice, wants, kinks/limits, relationships…"
                  value={c.description}
                  onChange={(e) => updateChar(c.id, { description: e.target.value })}
                />
              </div>
            ))}
            <button
              className="btn-ghost"
              onClick={() =>
                setState({ characters: [...s.characters, { id: newCharId(), name: "", description: "", image: "" }] })
              }
            >
              + Add character
            </button>
            <span className="hint">Names & descriptions go into every prompt. Portraits are for your reference only.</span>
            <input type="file" ref={fileRef} accept="image/*" hidden onChange={onPortrait} />
          </>
        )}

        {tab === "notes" && (
          <>
            <label className="field">
              <span className="field-label">Steer toward — things you want to happen</span>
              <textarea
                placeholder="Beats, dynamics, or moments to work in when the timing is right…"
                value={s.notesWant}
                onChange={(e) => setState({ notesWant: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Avoid — hard rules for every chapter</span>
              <textarea
                placeholder="Tropes, phrases, acts, or plot turns that must never appear…"
                value={s.notesAvoid}
                onChange={(e) => setState({ notesAvoid: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
    </details>
  );
}
