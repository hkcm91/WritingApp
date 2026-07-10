import React, { useState } from "react";
import { setState, getState } from "../store.js";
import { completeOnce } from "../api.js";
import { SMART_FILL_SYSTEM, buildSmartFillMessage, extractProjectJson } from "../prompts.js";
import { newCharId } from "../importExport.js";
import useDictation from "../hooks/useDictation.js";
import Card from "./Card.jsx";
import Icon from "./Icon.jsx";
import { toast } from "../toast.js";

const appendText = (base, extra) => (base.trim() ? `${base.trim()}\n${extra.trim()}` : extra.trim());

function applySmartFill(json) {
  const s = getState();
  const patch = {};
  const filled = [];

  if (typeof json.bible_add === "string" && json.bible_add.trim()) {
    patch.storyBible = appendText(s.storyBible, json.bible_add);
    filled.push("Bible");
  }
  if (Array.isArray(json.characters_add) && json.characters_add.length) {
    // Upsert by first name: mentioning an existing character updates their
    // entry (the AI can now edit cast members, not just add duplicates).
    let characters = s.characters;
    let updated = 0;
    let added = 0;
    const firstToken = (name) => (name || "").trim().split(/[\s(]/)[0].toLowerCase();

    for (const raw of json.characters_add) {
      if (!raw || !(raw.name || raw.description)) continue;
      const name = String(raw.name || "");
      const description = String(raw.description || "");
      const token = firstToken(name);
      const matchIdx = token ? characters.findIndex((c) => firstToken(c.name) === token) : -1;
      if (matchIdx !== -1) {
        characters = characters.map((c, i) => (i === matchIdx ? { ...c, name: name || c.name, description: description || c.description } : c));
        updated++;
      } else {
        characters = [...characters, { id: newCharId(), name, description, image: "" }];
        added++;
      }
    }
    if (updated || added) {
      patch.characters = characters;
      const parts = [];
      if (added) parts.push(`+${added}`);
      if (updated) parts.push(`${updated} updated`);
      filled.push(`Cast (${parts.join(", ")})`);
    }
  }
  if (typeof json.notes_want_add === "string" && json.notes_want_add.trim()) {
    patch.notesWant = appendText(s.notesWant, json.notes_want_add);
    filled.push("Steer-toward");
  }
  if (typeof json.notes_avoid_add === "string" && json.notes_avoid_add.trim()) {
    patch.notesAvoid = appendText(s.notesAvoid, json.notes_avoid_add);
    filled.push("Avoid");
  }
  if (typeof json.source === "string" && json.source.trim()) {
    patch.source = json.source.trim();
    filled.push("Source");
  }
  if (typeof json.instructions === "string" && json.instructions.trim()) {
    patch.instructions = json.instructions.trim();
    filled.push("Instructions");
  }
  if (typeof json.synopsis_add === "string" && json.synopsis_add.trim()) {
    patch.runningSynopsis = appendText(s.runningSynopsis, json.synopsis_add);
    filled.push("Synopsis");
  }

  if (!filled.length) throw new Error("Nothing recognizable to file — try being more specific.");
  setState(patch);
  return filled;
}

export default function QuickPrompt({ openSettings }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ msg: "", kind: "" });
  const dictation = useDictation(
    () => text,
    setText,
    (msg, kind) => setStatus({ msg, kind: kind || "" })
  );

  const organize = async () => {
    if (!getState().apiKey) {
      toast("No API key — add it in Settings first.", "error");
      openSettings();
      return;
    }
    const promptText = text.trim();
    if (!promptText) return toast("Nothing to organize — talk or type first.", "error");
    dictation.stop();
    setBusy(true);
    setStatus({ msg: "Filing it into the right places…", kind: "" });
    try {
      const raw = await completeOnce({
        model: getState().model,
        temperature: 0.4,
        messages: [
          { role: "system", content: SMART_FILL_SYSTEM },
          { role: "user", content: buildSmartFillMessage(getState(), promptText) },
        ],
      });
      const json = extractProjectJson(raw);
      if (!json) throw new Error("Couldn't parse the organizer's response.");
      const filled = applySmartFill(json);
      setText("");
      setStatus({ msg: "", kind: "" });
      toast(`Filed into: ${filled.join(", ")}.`);
    } catch (err) {
      setStatus({ msg: err.message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="quickPrompt" title="Quick prompt">
      <span className="hint">
        Talk or type anything — world details, new characters, what happens next.
        It gets filed into the Bible, Cast, Notes, Source, or Instructions automatically.
      </span>
      <div className="chat-input-row">
        <button
          className={`mic-btn ${dictation.dictating ? "listening" : ""}`}
          onClick={dictation.toggle}
          disabled={!dictation.supported}
          aria-label={dictation.dictating ? "Stop dictation" : "Start dictation"}
          title={dictation.supported ? "Dictate" : "Speech-to-text isn't supported in this browser."}
        >
          <Icon name="mic" />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. “Give Thorne a scar he won't explain, and next chapter they get snowed into the map room…”"
        />
        <button className="send-btn" onClick={organize} disabled={busy} aria-label="Organize into project">
          <Icon name="send" />
        </button>
      </div>
      <div className={`status ${status.kind}`}>{busy ? "Organizing…" : status.msg}</div>
    </Card>
  );
}
