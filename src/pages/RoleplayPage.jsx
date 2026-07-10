import React, { useEffect, useRef, useState } from "react";
import { useStore, setState, getState } from "../store.js";
import { streamCompletion, completeOnce } from "../api.js";
import {
  buildRoleplaySystem, buildRoleplayOpening,
  buildRoleplaySuggestMessage, parseActionSuggestions,
} from "../prompts.js";
import Icon from "../components/Icon.jsx";
import useDictation from "../hooks/useDictation.js";
import { toast } from "../toast.js";

// Interactive back-and-forth roleplay (Character.AI / Kindroid style) driven by
// the same story bible used for chapters. The AI embodies a chosen cast member
// (or a Narrator/GM), the human plays their own persona, and optional tappable
// action suggestions give it a choose-your-own-adventure feel.

const NARRATOR = { id: "narrator", name: "Narrator", description: "" };

export default function RoleplayPage({ openSettings }) {
  const s = useStore();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [status, setStatus] = useState({ msg: "", kind: "" });
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const logRef = useRef(null);
  const inputRef = useRef("");
  inputRef.current = input;

  const say = (msg, kind = "") => setStatus({ msg, kind });
  const dictation = useDictation(() => inputRef.current, setInput, say);

  const character = s.rpCharId === "narrator"
    ? NARRATOR
    : s.characters.find((c) => c.id === s.rpCharId) || null;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [s.rpMessages.length, live]);

  const needKey = () => {
    if (!getState().apiKey) {
      say("No API key — open Settings first.", "error");
      openSettings();
      return true;
    }
    return false;
  };

  // Stream one in-character reply given the full message history (system built
  // fresh each call so edits to the bible/persona take effect immediately).
  const streamReply = async (history) => {
    const st = getState();
    const char = st.rpCharId === "narrator" ? NARRATOR : st.characters.find((c) => c.id === st.rpCharId) || null;
    let acc = "";
    setLive("…");
    const { text } = await streamCompletion({
      model: st.model,
      temperature: st.temperature,
      messages: [
        { role: "system", content: buildRoleplaySystem(st, char?.id === "narrator" ? null : char, st.rpPersona) },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ],
      onToken: (t) => { acc += t; setLive(acc); },
    });
    setLive("");
    return (text || acc).trim();
  };

  const begin = async () => {
    if (needKey()) return;
    if (!getState().rpCharId) return say("Pick who you'll be talking to first.", "error");
    if (!getState().storyBible.trim()) return say("This book's Story Bible is empty — add some canon on the Write page first.", "error");
    setBusy(true);
    say("Setting the scene…");
    try {
      const reply = await streamReply([{ role: "user", content: buildRoleplayOpening(getState()) }]);
      if (!reply) throw new Error("The scene came back empty — try again.");
      setState({ rpStarted: true, rpMessages: [{ role: "assistant", content: reply }] });
      say("");
    } catch (err) {
      say(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const send = async (textOverride) => {
    if (needKey()) return;
    const userText = (textOverride ?? input).trim();
    if (!userText || busy) return;
    dictation.stop();
    setSuggestions([]);

    const history = [...s.rpMessages, { role: "user", content: userText }];
    setState({ rpMessages: history });
    setInput("");
    setBusy(true);
    try {
      const reply = await streamReply(history);
      if (!reply) throw new Error("Empty reply — try again.");
      setState({ rpMessages: [...history, { role: "assistant", content: reply }] });
      say("");
    } catch (err) {
      say(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (needKey() || busy) return;
    const msgs = getState().rpMessages;
    if (!msgs.length || msgs[msgs.length - 1].role !== "assistant") return;
    const history = msgs.slice(0, -1);
    setSuggestions([]);
    setBusy(true);
    try {
      const reply = await streamReply(history.length ? history : [{ role: "user", content: buildRoleplayOpening(getState()) }]);
      if (!reply) throw new Error("Empty reply — try again.");
      setState({ rpMessages: [...history, { role: "assistant", content: reply }] });
    } catch (err) {
      say(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const suggestActions = async () => {
    if (needKey() || suggesting) return;
    setSuggesting(true);
    try {
      const raw = await completeOnce({
        model: getState().model,
        temperature: 0.9,
        messages: [{ role: "user", content: buildRoleplaySuggestMessage(getState().rpMessages) }],
      });
      const list = parseActionSuggestions(raw);
      if (!list.length) throw new Error("No suggestions came back.");
      setSuggestions(list);
    } catch (err) {
      say(`Couldn't suggest actions: ${err.message}`, "error");
    } finally {
      setSuggesting(false);
    }
  };

  const resetScene = () => {
    if (!confirm("End this scene? The setup (character, persona, scenario) is kept so you can start fresh.")) return;
    setState({ rpStarted: false, rpMessages: [] });
    setSuggestions([]);
    say("");
  };

  // --- Setup view -------------------------------------------------------------
  if (!s.rpStarted) {
    const options = [...s.characters, NARRATOR];
    return (
      <div className="page">
        <div className="rp-setup">
          <h2 className="rp-setup-title">Play your story</h2>
          <p className="hint">
            An interactive, back-and-forth scene using <strong>{s.title}</strong>'s Story Bible — the same canon
            your chapters come from, played out as a conversation. Pick who you're talking to and jump in.
          </p>

          <span className="field-label">Who are you talking to?</span>
          {!s.characters.length && (
            <span className="hint">No cast yet — add characters on the Write page, or roleplay with the Narrator.</span>
          )}
          <div className="rp-char-grid">
            {options.map((c) => (
              <button
                key={c.id}
                className={`rp-char-card ${s.rpCharId === c.id ? "selected" : ""}`}
                onClick={() => setState({ rpCharId: c.id })}
              >
                <span className="rp-char-avatar">
                  {c.id === "narrator"
                    ? <Icon name="compass" size={20} />
                    : c.image ? <img src={c.image} alt="" /> : (c.name?.[0] || "?")}
                </span>
                <span className="rp-char-name">{c.name || "(unnamed)"}</span>
                {c.id === "narrator" && <span className="rp-char-sub">Game master — voices everyone</span>}
              </button>
            ))}
          </div>

          <label className="field">
            <span className="field-label">Who do you play? (optional)</span>
            <input
              type="text"
              value={s.rpPersona}
              onChange={(e) => setState({ rpPersona: e.target.value })}
              placeholder="A name and a line about your character — or leave blank to stay a mystery"
            />
          </label>

          <label className="field">
            <span className="field-label">Opening scene (optional)</span>
            <textarea
              value={s.rpScenario}
              onChange={(e) => setState({ rpScenario: e.target.value })}
              placeholder="Where and when does this start? e.g. “Late at the keep, snowed in, everyone else asleep.”"
            />
          </label>

          <button className="btn" onClick={begin} disabled={busy || !s.rpCharId}>
            {busy ? "Setting the scene…" : "Begin scene"}
          </button>
          <div className={`status ${status.kind}`}>{status.msg}</div>
        </div>
      </div>
    );
  }

  // --- Chat view --------------------------------------------------------------
  return (
    <div className="page chat-page">
      <div className="rp-header">
        <span className="rp-header-avatar">
          {character?.id === "narrator"
            ? <Icon name="compass" size={18} />
            : character?.image ? <img src={character.image} alt="" /> : (character?.name?.[0] || "?")}
        </span>
        <div className="rp-header-info">
          <span className="rp-header-name">{character?.name || "Scene"}</span>
          <span className="rp-header-sub">{s.rpPersona ? `You: ${s.rpPersona}` : "Interactive scene"}</span>
        </div>
        <button className="btn-secondary" onClick={resetScene}>End scene</button>
      </div>

      <div className="chat-log" ref={logRef}>
        {s.rpMessages.map((m, i) => (
          <div className={`chat-msg rp ${m.role}`} key={i}>{m.content}</div>
        ))}
        {live && <div className={`chat-msg rp assistant ${live === "…" ? "thinking" : ""}`}>{live}</div>}

        {!busy && s.rpMessages.length > 0 && s.rpMessages[s.rpMessages.length - 1].role === "assistant" && (
          <button className="rp-regen" onClick={regenerate} title="Regenerate their last reply">
            <Icon name="refresh" size={13} /> Try a different reply
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="rp-actions">
          {suggestions.map((a, i) => (
            <button key={i} className="rp-action-chip" onClick={() => send(a)}>{a}</button>
          ))}
        </div>
      )}

      <div className="rp-input-tools">
        <button className="btn-secondary" onClick={suggestActions} disabled={suggesting || busy}>
          <Icon name="compass" size={15} />
          {suggesting ? "Thinking…" : "What could I do?"}
        </button>
      </div>

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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={`Say or do something${character && character.id !== "narrator" ? ` — ${character.name} is waiting` : ""}…`}
        />
        <button className="send-btn" onClick={() => send()} disabled={busy} aria-label="Send">
          <Icon name="send" />
        </button>
      </div>
      <div className={`status ${status.kind}`}>{status.msg}</div>
    </div>
  );
}
