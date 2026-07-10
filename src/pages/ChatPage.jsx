import React, { useEffect, useRef, useState } from "react";
import { useStore, setState, getState } from "../store.js";
import { streamCompletion } from "../api.js";
import { CHAT_SYSTEM_PROMPT, CHAT_GREETING, extractProjectJson } from "../prompts.js";
import { applyImport } from "../importExport.js";
import Icon from "../components/Icon.jsx";
import useDictation from "../hooks/useDictation.js";
import { toast } from "../toast.js";

export default function ChatPage({ openSettings, goWrite }) {
  const s = useStore();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(""); // streaming assistant text
  const [status, setStatus] = useState({ msg: "", kind: "" });
  const logRef = useRef(null);
  const inputRef = useRef("");
  inputRef.current = input;

  const say = (msg, kind = "") => setStatus({ msg, kind });

  const dictation = useDictation(() => inputRef.current, setInput, say);

  const messages = s.chatMessages.length
    ? s.chatMessages
    : [{ role: "assistant", content: CHAT_GREETING }];

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages.length, live]);

  // --- Sending ----------------------------------------------------------------
  const send = async () => {
    if (!getState().apiKey) {
      say("No API key — open Settings first.", "error");
      openSettings();
      return;
    }
    const userText = input.trim();
    if (!userText || busy) return;
    dictation.stop();

    const history = [...messages, { role: "user", content: userText }];
    setState({ chatMessages: history });
    setInput("");
    setBusy(true);
    setLive("…");
    say("Thinking…");

    try {
      let acc = "";
      const { text } = await streamCompletion({
        model: getState().model,
        temperature: Math.min(getState().temperature, 0.9),
        messages: [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          ...history.map((m) => ({ role: m.role, content: m.content })),
        ],
        onToken: (t) => { acc += t; setLive(acc); },
      });
      const reply = (text || acc).trim();
      if (!reply) throw new Error("Empty reply.");
      setState({ chatMessages: [...history, { role: "assistant", content: reply }] });
      say(extractProjectJson(reply) ? "Draft project ready — review it, then Apply." : "");
    } catch (err) {
      say(err.message, "error");
    } finally {
      setLive("");
      setBusy(false);
    }
  };

  const clear = () => {
    if (!confirm("Clear this conversation? Your project isn't affected.")) return;
    setState({ chatMessages: [{ role: "assistant", content: CHAT_GREETING }] });
    say("");
  };

  return (
    <div className="page chat-page">
      <div className="btn-row">
        <span className="card-title">Brain dump → outline</span>
        <span className="spacer" />
        <button className="btn-secondary" onClick={clear}>Clear</button>
      </div>

      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => {
          if (m.role === "assistant") {
            const json = extractProjectJson(m.content);
            const prose = json ? m.content.replace(/```[\s\S]*?```/g, "").trim() : m.content;
            return (
              <React.Fragment key={i}>
                {prose && <div className="chat-msg assistant">{prose}</div>}
                {json && (
                  <div className="chat-json">
                    <div className="json-label">Project JSON</div>
                    <pre>{JSON.stringify(json, null, 2)}</pre>
                    <div className="btn-row">
                      <button
                        className="btn-apply"
                        onClick={() => {
                          try {
                            const filled = applyImport(json);
                            toast(`Applied: ${filled.join(", ")}.`);
                            goWrite();
                          } catch (err) {
                            toast(`Couldn't apply: ${err.message}`, "error");
                          }
                        }}
                      >
                        Apply to project
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={async () => {
                          await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
                          toast("JSON copied.");
                        }}
                      >
                        Copy JSON
                      </button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          }
          return <div className="chat-msg user" key={i}>{m.content}</div>;
        })}
        {live && <div className={`chat-msg assistant ${live === "…" ? "thinking" : ""}`}>{live}</div>}
      </div>

      <div className="chat-input-row">
        <button
          className={`mic-btn ${dictation.dictating ? "listening" : ""}`}
          onClick={dictation.toggle}
          disabled={!dictation.supported}
          aria-label={dictation.dictating ? "Stop dictation" : "Start dictation"}
          title={dictation.supported ? "Dictate (speech to text)" : "Speech-to-text isn't supported in this browser (try Chrome or Edge)."}
        >
          <Icon name="mic" />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Dump your idea — or hit the mic and just talk."
        />
        <button className="send-btn" onClick={send} disabled={busy} aria-label="Send">
          <Icon name="send" />
        </button>
      </div>
      <div className={`status ${status.kind}`}>{status.msg}</div>
    </div>
  );
}
