import React, { useState } from "react";
import { useStore, setState, getState, nextChapterNumber } from "../store.js";
import { streamLongform, completeOnce } from "../api.js";
import {
  SYSTEM_PROMPT, SUMMARY_PROMPT,
  buildUserMessage, buildContinueMessage, buildSuggestMessage, parseSuggestions,
} from "../prompts.js";
import { wordCount } from "../wordCount.js";
import StoryPanel from "../components/StoryPanel.jsx";
import Card from "../components/Card.jsx";
import Icon from "../components/Icon.jsx";
import QuickPrompt from "../components/QuickPrompt.jsx";
import ScenesCard from "../components/ScenesCard.jsx";
import ArtCard from "../components/ArtCard.jsx";
import { toast } from "../toast.js";

// Fields that make up "the workbench" for whichever chapter is open — these
// snapshot into the chapter record on save, and restore when you reopen it,
// so switching chapters brings back the outline/instructions/scenes you used,
// not just the finished prose.
const WORKBENCH_KEYS = ["source", "instructions", "mode", "scenes", "targetWords"];

export default function WritePage({ onRead, openSettings, goRewrite }) {
  const s = useStore();
  const [progress, setProgress] = useState(""); // generation progress, inline
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);

  const needKey = () => {
    if (!getState().apiKey) {
      toast("No API key — add it in Settings first.", "error");
      openSettings();
      return true;
    }
    return false;
  };

  const saveChapter = () => {
    const st = getState();
    const text = st.draftText.trim();
    if (!text) return null;
    const workbench = Object.fromEntries(WORKBENCH_KEYS.map((k) => [k, st[k]]));
    let chapters, active;
    if (st.activeChapter !== null && st.chapters[st.activeChapter]) {
      chapters = st.chapters.map((c, i) => (i === st.activeChapter ? { ...c, text, ...workbench } : c));
      active = st.activeChapter;
    } else {
      chapters = [...st.chapters, { n: nextChapterNumber(st), text, summary: "", ...workbench }];
      active = chapters.length - 1;
    }
    setState({ chapters, activeChapter: active });
    return chapters[active];
  };

  const openChapter = (i) => {
    const c = s.chapters[i];
    if (!c) return;
    setState({
      activeChapter: i,
      draftText: c.text,
      source: c.source ?? "",
      instructions: c.instructions ?? "",
      mode: c.mode ?? "GENERATE",
      scenes: c.scenes ?? [],
      targetWords: c.targetWords ?? 2200,
    });
  };

  const newChapterDraft = () => {
    setState({
      activeChapter: null,
      draftText: "",
      source: "",
      instructions: "",
      scenes: [],
    });
    toast(`Starting Chapter ${nextChapterNumber(getState())}.`);
  };

  const generate = async () => {
    if (needKey()) return;
    const st = getState();
    if (!st.storyBible.trim()) return toast("Story Bible is empty — fill it in first.", "error");
    if (!st.source.trim()) {
      return toast(`Source is empty — paste ${st.mode === "REVISE" ? "the draft to revise" : "an outline to expand"}.`, "error");
    }

    setBusy(true);
    setState({ draftText: "" });
    setProgress("Writing…");

    try {
      const { text: chapterText, degenerate } = await streamLongform({
        system: SYSTEM_PROMPT,
        userMessage: buildUserMessage(st),
        temperature: st.temperature,
        targetWords: st.targetWords,
        onToken: (t) => setState((prev) => ({ draftText: prev.draftText + t })),
      });
      // onToken streams live as tokens arrive, before a round can be judged
      // degenerate — resync the pane to the clean accumulated text so a
      // dropped corrupted round never lingers on screen or gets saved.
      setState({ draftText: chapterText });
      if (!chapterText.trim()) {
        throw new Error(
          degenerate
            ? "The model produced corrupted/garbled output and nothing usable came through. Try again, or lower Temperature/top_p in Settings."
            : "Model returned an empty chapter."
        );
      }
      if (degenerate) {
        toast("Generation was stopped early after producing corrupted output — the chapter may be incomplete. Consider lowering Temperature or top_p in Settings.", "error");
      }

      const chapter = saveChapter();
      setProgress("Updating synopsis…");

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
        toast(`Chapter ${chapter.n} saved. Synopsis updated.`);
      } catch (e) {
        toast(`Chapter ${chapter.n} saved, but the synopsis call failed — add a summary by hand.`, "error");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const continueChapter = async () => {
    if (needKey()) return;
    const soFar = getState().draftText.trim();
    if (!soFar) return toast("Nothing to continue — write or open a chapter first.", "error");

    setBusy(true);
    setProgress("Continuing…");
    if (!/\s$/.test(getState().draftText)) setState((p) => ({ draftText: p.draftText + " " }));
    const baseText = getState().draftText;

    try {
      const { text: added, degenerate } = await streamLongform({
        system: SYSTEM_PROMPT,
        userMessage: buildContinueMessage(getState(), soFar),
        temperature: getState().temperature,
        targetWords: getState().targetWords,
        baselineWords: wordCount(soFar),
        onToken: (t) => setState((prev) => ({ draftText: prev.draftText + t })),
      });
      // Resync to base + clean result — see the same note in generate() above.
      setState({ draftText: baseText + added });
      if (!added.trim()) {
        throw new Error(
          degenerate
            ? "The model produced corrupted/garbled output. Try again, or lower Temperature/top_p in Settings."
            : "Model returned nothing to add."
        );
      }
      if (degenerate) {
        toast("Continuation was stopped early after producing corrupted output. Consider lowering Temperature or top_p in Settings.", "error");
      }
      const st = getState();
      if (st.activeChapter !== null && st.chapters[st.activeChapter]) {
        setState({
          chapters: st.chapters.map((c, i) => (i === st.activeChapter ? { ...c, text: st.draftText.trim() } : c)),
        });
      }
      toast("Continued — Save Chapter to keep it.");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const suggest = async () => {
    if (needKey()) return;
    if (!getState().storyBible.trim()) return toast("Story Bible is empty — suggestions need something to build on.", "error");
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
    } catch (err) {
      toast(`Suggestions failed: ${err.message}`, "error");
    } finally {
      setSuggesting(false);
    }
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
    : `Chapter ${nextChapterNumber(s)} — draft`;

  return (
    <div className="page write-layout">
      <div className="write-side">
        <QuickPrompt openSettings={openSettings} />
        <StoryPanel />

        <Card id="synopsis" title="Synopsis so far" defaultOpen={false}>
          <span className="hint">Auto-appends after each chapter — editable.</span>
          <textarea
            className="prose"
            placeholder="(empty — fills in automatically as chapters generate)"
            value={s.runningSynopsis}
            onChange={(e) => setState({ runningSynopsis: e.target.value })}
          />
        </Card>

        <Card id="nextChapter" title="Next chapter">
          <div className="segmented" role="group" aria-label="Mode">
            {["GENERATE", "REVISE"].map((m) => (
              <button key={m} aria-pressed={s.mode === m} onClick={() => setState({ mode: m })}>
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
          <label className="field">
            <span className="field-label">Target length (words) — 0 to disable</span>
            <input
              type="number"
              min="0"
              max="8000"
              step="100"
              value={s.targetWords ?? 2200}
              onChange={(e) => setState({ targetWords: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
          </label>
          <span className="hint">
            The model keeps writing — slowing down on scenes rather than padding — until it reaches this
            length, even past a natural stopping point. Set to 0 to let it stop whenever it wants.
          </span>
          <div className="status">{progress}</div>

          <div className="btn-row">
            <span className="field-label">Where next?</span>
            <span className="spacer" />
            <button className="btn-secondary" onClick={suggest} disabled={suggesting || busy}>
              <Icon name="list" />
              {suggesting ? "Thinking…" : "Suggest chapters"}
            </button>
          </div>
          {suggestions.map((sg, i) => (
            <div
              key={i}
              className="suggest-card"
              onClick={() => {
                setState({ source: sg.title ? `${sg.title}\n${sg.outline}` : sg.outline, mode: "GENERATE" });
                setSuggestions([]);
                toast("Outline loaded into Source.");
              }}
            >
              {sg.title && <h4>{sg.title}</h4>}
              <p>{sg.outline}</p>
              <span className="use">Tap to load as the next outline →</span>
            </div>
          ))}
        </Card>

        <ScenesCard openSettings={openSettings} />
        <ArtCard openSettings={openSettings} />

        <div className="cta-bar">
          <button className="btn" onClick={generate} disabled={busy}>
            {busy ? progress || "Working…" : "Write Chapter"}
          </button>
        </div>
      </div>

      <div className="write-main">
        {s.chapters.length > 0 && (
          <div className="chapter-strip" role="tablist" aria-label="Switch chapter">
            {s.chapters.map((c, i) => (
              <button
                key={c.n}
                className={`chapter-pill ${i === s.activeChapter ? "active" : ""}`}
                onClick={() => openChapter(i)}
                role="tab"
                aria-selected={i === s.activeChapter}
              >
                Ch {c.n}
              </button>
            ))}
            <button className="chapter-pill new" onClick={newChapterDraft}>
              <Icon name="plus" size={14} /> New
            </button>
          </div>
        )}

        <section className="manuscript" aria-label="Manuscript">
          <div className="manuscript-head">
            <span className="manuscript-title">{chapterLabel}</span>
            <span className="manuscript-words">
              {s.draftText.trim() ? `${wordCount(s.draftText).toLocaleString()} words` : ""}
            </span>
            <div className="manuscript-actions">
              <button
                className="icon-btn"
                title="Preview in reader"
                aria-label="Preview in reader"
                onClick={() => s.draftText.trim()
                  ? onRead([{ text: s.draftText, label: chapterLabel }])
                  : toast("Nothing to preview yet.", "error")}
              >
                <Icon name="book" size={17} />
              </button>
              <button
                className="icon-btn"
                title="Continue writing"
                aria-label="Continue writing"
                onClick={continueChapter}
                disabled={busy}
              >
                <Icon name="play" size={17} />
              </button>
              <button
                className="icon-btn"
                title="Ask the AI to edit this chapter"
                aria-label="Send to Rewrite"
                onClick={() => {
                  if (!s.draftText.trim()) return toast("Nothing to edit yet.", "error");
                  setState({ rewriteInput: s.draftText });
                  goRewrite();
                }}
              >
                <Icon name="wand" size={17} />
              </button>
              <button
                className="icon-btn"
                title="Copy"
                aria-label="Copy chapter text"
                onClick={async () => { await navigator.clipboard.writeText(s.draftText); toast("Copied."); }}
              >
                <Icon name="copy" size={17} />
              </button>
              <button
                className="icon-btn"
                title="Save chapter"
                aria-label="Save chapter"
                onClick={() => {
                  const ch = saveChapter();
                  toast(ch ? `Chapter ${ch.n} saved.` : "Nothing to save.", ch ? "ok" : "error");
                }}
              >
                <Icon name="save" size={17} />
              </button>
            </div>
          </div>
          <textarea
            placeholder="Your chapter streams in here — and it's editable, like any manuscript page."
            value={s.draftText}
            onChange={(e) => setState({ draftText: e.target.value })}
          />
        </section>

        <Card id="chapters" title="Chapters" badge={s.chapters.length || null}>
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
                <button
                  className="del"
                  title="Delete chapter"
                  aria-label={`Delete chapter ${c.n}`}
                  onClick={(e) => { e.stopPropagation(); deleteChapter(i); }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))}
          </div>
          {s.chapters.length > 0 && (
            <button
              className="btn-secondary"
              onClick={() => onRead(s.chapters.map((c) => ({ n: c.n, text: c.text })), s.activeChapter ?? 0)}
            >
              <Icon name="book" />
              Read the book
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}
