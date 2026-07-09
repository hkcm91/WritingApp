import React, { useState } from "react";
import { useStore, setState, getState, nextChapterNumber } from "../store.js";
import { streamLongform, completeOnce } from "../api.js";
import {
  SYSTEM_PROMPT, SUMMARY_PROMPT,
  buildUserMessage, buildContinueMessage, buildSuggestMessage, parseSuggestions,
} from "../prompts.js";
import StoryPanel from "../components/StoryPanel.jsx";

const wordCount = (t) => t.trim().split(/\s+/).filter(Boolean).length;

export default function WritePage({ onRead, openSettings }) {
  const s = useStore();
  const [status, setStatus] = useState({ msg: "", kind: "" });
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);

  const say = (msg, kind = "") => setStatus({ msg, kind });

  const needKey = () => {
    if (!getState().apiKey) {
      say("No API key — open Settings first.", "error");
      openSettings();
      return true;
    }
    return false;
  };

  const saveChapter = () => {
    const st = getState();
    const text = st.draftText.trim();
    if (!text) return null;
    let chapters, active;
    if (st.activeChapter !== null && st.chapters[st.activeChapter]) {
      chapters = st.chapters.map((c, i) => (i === st.activeChapter ? { ...c, text } : c));
      active = st.activeChapter;
    } else {
      chapters = [...st.chapters, { n: nextChapterNumber(st), text, summary: "" }];
      active = chapters.length - 1;
    }
    setState({ chapters, activeChapter: active });
    return chapters[active];
  };

  const generate = async () => {
    if (needKey()) return;
    const st = getState();
    if (!st.storyBible.trim()) return say("Story Bible is empty — fill it in first.", "error");
    if (!st.source.trim()) {
      return say(`Source is empty — paste ${st.mode === "REVISE" ? "the draft to revise" : "an outline to expand"}.`, "error");
    }

    setBusy(true);
    setState({ draftText: "", activeChapter: null });
    say("Writing…");

    try {
      const chapterText = await streamLongform({
        system: SYSTEM_PROMPT,
        userMessage: buildUserMessage(st),
        temperature: st.temperature,
        onToken: (t) => setState((prev) => ({ draftText: prev.draftText + t })),
      });
      if (!chapterText.trim()) throw new Error("Model returned an empty chapter.");

      const chapter = saveChapter();
      say("Chapter done — updating synopsis…");

      // Continuity trick: cheap second call appended to the running synopsis.
      try {
        const summary = await completeOnce({
          model: getState().summaryModel,
          temperature: 0.3,
          messages: [{ role: "user", content: `${SUMMARY_PROMPT}\n\nCHAPTER:\n${chapterText}` }],
        });
        if (summary) {
          setState((prev) => ({
            chapters: prev.chapters.map((c) => (c.n === chapter.n ? { ...c, summary } : c)),
            runningSynopsis: (prev.runningSynopsis.trim() + `\n\nCh ${chapter.n}: ${summary}`).trim(),
          }));
        }
        say(`Chapter ${chapter.n} saved. Synopsis updated.`, "ok");
      } catch (e) {
        say(`Chapter ${chapter.n} saved, but the synopsis call failed: ${e.message}. Add a summary by hand.`, "error");
      }
    } catch (err) {
      say(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const continueChapter = async () => {
    if (needKey()) return;
    const soFar = getState().draftText.trim();
    if (!soFar) return say("Nothing to continue — write or open a chapter first.", "error");

    setBusy(true);
    say("Continuing…");
    if (!/\s$/.test(getState().draftText)) setState((p) => ({ draftText: p.draftText + " " }));

    try {
      const added = await streamLongform({
        system: SYSTEM_PROMPT,
        userMessage: buildContinueMessage(getState(), soFar),
        temperature: getState().temperature,
        onToken: (t) => setState((prev) => ({ draftText: prev.draftText + t })),
      });
      if (!added.trim()) throw new Error("Model returned nothing to add.");
      const st = getState();
      if (st.activeChapter !== null && st.chapters[st.activeChapter]) {
        setState({
          chapters: st.chapters.map((c, i) => (i === st.activeChapter ? { ...c, text: st.draftText.trim() } : c)),
        });
      }
      say("Continued. Save Chapter to keep it; the synopsis won't auto-update on a continue.", "ok");
    } catch (err) {
      say(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const suggest = async () => {
    if (needKey()) return;
    if (!getState().storyBible.trim()) return say("Story Bible is empty — suggestions need something to build on.", "error");
    setSuggesting(true);
    setSuggestions([]);
    try {
      const raw = await completeOnce({
        model: getState().model,
        temperature: Math.max(getState().temperature, 0.9),
        messages: [
          { role: "system", content: "You are a story-development editor for adult fiction. All characters are adults (18+). You propose sharp, varied next-chapter directions." },
          { role: "user", content: buildSuggestMessage(getState()) },
        ],
      });
      const list = parseSuggestions(raw);
      if (!list.length) throw new Error("No usable suggestions came back.");
      setSuggestions(list);
      say(`${list.length} directions suggested — tap one to load it.`, "ok");
    } catch (err) {
      say(`Suggestions failed: ${err.message}`, "error");
    } finally {
      setSuggesting(false);
    }
  };

  const openChapter = (i) => {
    setState({ activeChapter: i, draftText: s.chapters[i].text });
  };

  const deleteChapter = (i) => {
    if (!confirm(`Delete Chapter ${s.chapters[i].n}? This won't touch the synopsis.`)) return;
    const st = getState();
    const chapters = st.chapters.filter((_, idx) => idx !== i);
    let active = st.activeChapter;
    if (active === i) active = null;
    else if (active > i) active--;
    setState({ chapters, activeChapter: active });
  };

  const chapterLabel = s.activeChapter !== null && s.chapters[s.activeChapter]
    ? `Chapter ${s.chapters[s.activeChapter].n}`
    : `Chapter ${nextChapterNumber(s)} (draft)`;

  return (
    <div className="page write-grid">
      <div className="col">
        <StoryPanel />

        <details className="card">
          <summary>
            <span className="card-title"><span className="dot">●</span> Synopsis so far</span>
            <span className="chev">›</span>
          </summary>
          <div className="card-body">
            <span className="hint">Auto-appends after each chapter — editable.</span>
            <textarea
              className="prose"
              placeholder="(empty — fills in automatically as chapters generate)"
              value={s.runningSynopsis}
              onChange={(e) => setState({ runningSynopsis: e.target.value })}
            />
          </div>
        </details>

        <details className="card" open>
          <summary>
            <span className="card-title"><span className="dot">●</span> Next chapter</span>
            <span className="chev">›</span>
          </summary>
          <div className="card-body">
            <div className="segmented">
              {["GENERATE", "REVISE"].map((m) => (
                <button key={m} className={s.mode === m ? "on" : ""} onClick={() => setState({ mode: m })}>
                  {m === "GENERATE" ? "Expand outline" : "Revise draft"}
                </button>
              ))}
            </div>
            <label className="field">
              <span className="field-label">Source</span>
              <textarea
                placeholder={s.mode === "GENERATE" ? "Paste the chapter outline to expand…" : "Paste the existing draft to rework…"}
                value={s.source}
                onChange={(e) => setState({ source: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Instructions for this chapter</span>
              <textarea
                placeholder="What to do for this specific chapter…"
                value={s.instructions}
                onChange={(e) => setState({ instructions: e.target.value })}
              />
            </label>
            <button className="btn" onClick={generate} disabled={busy}>
              {busy ? "Writing…" : "Write Chapter"}
            </button>
            <div className={`status ${status.kind}`}>{status.msg}</div>

            <div className="btn-row">
              <span className="field-label">Where next?</span>
              <span className="spacer" />
              <button className="btn-ghost" onClick={suggest} disabled={suggesting || busy}>
                {suggesting ? "Thinking…" : "Suggest next chapters"}
              </button>
            </div>
            {suggestions.map((sg, i) => (
              <div
                key={i}
                className="suggest-card"
                onClick={() => {
                  setState({ source: sg.title ? `${sg.title}\n${sg.outline}` : sg.outline, mode: "GENERATE" });
                  setSuggestions([]);
                  say("Outline loaded into Source. Add instructions, then Write Chapter.", "ok");
                }}
              >
                {sg.title && <h4>{sg.title}</h4>}
                <p>{sg.outline}</p>
                <span className="use">Tap to load as the next outline →</span>
              </div>
            ))}
          </div>
        </details>
      </div>

      <div className="col">
        <details className="card" open>
          <summary>
            <span className="card-title"><span className="dot">●</span> {chapterLabel}</span>
            <span className="chev">›</span>
          </summary>
          <div className="card-body">
            <textarea
              className="prose"
              style={{ minHeight: "300px" }}
              placeholder="The chapter streams in here — editable once it lands."
              value={s.draftText}
              onChange={(e) => setState({ draftText: e.target.value })}
            />
            <div className="btn-row">
              <span className="hint">{s.draftText.trim() ? `${wordCount(s.draftText).toLocaleString()} words` : ""}</span>
              <span className="spacer" />
              <button
                className="btn-ghost"
                onClick={() => s.draftText.trim() && onRead([{ text: s.draftText, label: chapterLabel }])}
              >
                📖 Read
              </button>
              <button className="btn-ghost" onClick={continueChapter} disabled={busy}>Continue</button>
              <button
                className="btn-ghost"
                onClick={async () => { await navigator.clipboard.writeText(s.draftText); say("Copied.", "ok"); }}
              >
                Copy
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  const ch = saveChapter();
                  say(ch ? `Chapter ${ch.n} saved.` : "Nothing to save.", ch ? "ok" : "error");
                }}
              >
                Save Chapter
              </button>
            </div>
          </div>
        </details>

        <details className="card" open>
          <summary>
            <span className="card-title"><span className="dot">●</span> Chapters {s.chapters.length ? `· ${s.chapters.length}` : ""}</span>
            <span className="chev">›</span>
          </summary>
          <div className="card-body">
            {!s.chapters.length && <span className="hint">Saved chapters land here — tap one to reopen it.</span>}
            <div className="chapter-list">
              {s.chapters.map((c, i) => (
                <div
                  key={c.n}
                  className={`chapter-item ${i === s.activeChapter ? "active" : ""}`}
                  onClick={() => openChapter(i)}
                >
                  <span>Chapter {c.n}</span>
                  <span className="meta">{wordCount(c.text).toLocaleString()} words</span>
                  <button className="del" title="Delete" onClick={(e) => { e.stopPropagation(); deleteChapter(i); }}>✕</button>
                </div>
              ))}
            </div>
            {s.chapters.length > 0 && (
              <button
                className="btn-ghost"
                onClick={() => onRead(s.chapters.map((c) => ({ n: c.n, text: c.text })), s.activeChapter ?? 0)}
              >
                📖 Read the book
              </button>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
