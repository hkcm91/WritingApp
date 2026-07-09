import React, { useEffect, useRef, useState } from "react";
import { useStore, setState, getState } from "../store.js";
import { streamCompletion } from "../api.js";
import { CHAT_SYSTEM_PROMPT, CHAT_GREETING, extractProjectJson } from "../prompts.js";
import { applyImport } from "../importExport.js";
import Icon from "../components/Icon.jsx";
import { toast } from "../toast.js";

export default function ChatPage({ openSettings, goWrite }) {
  const s = useStore();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(""); // streaming assistant text
  const [status, setStatus] = useState({ msg: "", kind: "" });
  const [dictating, setDictating] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const logRef = useRef(null);
  const recRef = useRef(null);
  const dictatingRef = useRef(false);
  const committedRef = useRef("");

  const say = (msg, kind = "") => setStatus({ msg, kind });

  const messages = s.chatMessages.length
    ? s.chatMessages
    : [{ role: "assistant", content: CHAT_GREETING }];

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages.length, live]);

  // --- Speech to text (Web Speech API) --------------------------------------
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMicSupported(false); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.addEventListener("result", (e) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk + " ";
        else interim += chunk;
      }
      if (finalText) committedRef.current += finalText;
      setInput(committedRef.current + interim);
    });
    rec.addEventListener("error", (e) => {
      say(e.error === "not-allowed"
        ? "Microphone permission denied — allow it in the browser to dictate."
        : `Dictation error: ${e.error}`, "error");
      dictatingRef.current = false;
      setDictating(false);
    });
    rec.addEventListener("end", () => {
      if (dictatingRef.current) { try { rec.start(); } catch { /* already running */ } }
    });
    recRef.current = rec;
    return () => { dictatingRef.current = false; try { rec.stop(); } catch {} };
  }, []);

  const toggleMic = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (dictatingRef.current) {
      dictatingRef.current = false;
      setDictating(false);
      try { rec.stop(); } catch {}
    } else {
      committedRef.current = input && !/\s$/.test(input) ? input + " " : input;
      dictatingRef.current = true;
      setDictating(true);
      say("Listening… speak, then tap the mic again to stop.");
      try { rec.start(); } catch {}
    }
  };

  // --- Sending ----------------------------------------------------------------
  const send = async () => {
    if (!getState().apiKey) {
      say("No API key — open Settings first.", "error");
      openSettings();
      return;
    }
    const userText = input.trim();
    if (!userText || busy) return;
    if (dictatingRef.current) toggleMic();

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
          className={`mic-btn ${dictating ? "listening" : ""}`}
          onClick={toggleMic}
          disabled={!micSupported}
          aria-label={dictating ? "Stop dictation" : "Start dictation"}
          title={micSupported ? "Dictate (speech to text)" : "Speech-to-text isn't supported in this browser (try Chrome or Edge)."}
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
