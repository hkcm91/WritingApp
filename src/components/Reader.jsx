import React, { useEffect, useMemo, useState } from "react";
import { useStore, setState } from "../store.js";
import Icon from "./Icon.jsx";

const THEMES = ["sepia", "light", "dark"];

function paragraphsFrom(text) {
  const parts = /\n\s*\n/.test(text) ? text.split(/\n\s*\n/) : text.split(/\n/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const isSceneBreak = (p) => /^[*#✦◆•·—-]{1,7}$/.test(p.replace(/\s/g, ""));

export default function Reader({ items, startIndex = 0, onClose }) {
  const s = useStore();
  const [index, setIndex] = useState(Math.max(0, Math.min(startIndex, items.length - 1)));
  const item = items[index];

  const paragraphs = useMemo(() => paragraphsFrom(item.text), [item.text]);
  const heading = item.label || (item.n != null ? `Chapter ${item.n}` : "Draft");

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(items.length - 1, i + 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [items.length]);

  useEffect(() => {
    document.querySelector(".reader-page")?.scrollTo({ top: 0 });
  }, [index]);

  const close = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.querySelector(".reader")?.requestFullscreen().catch(() => {});
  };

  return (
    <div className="reader" data-theme={s.readerTheme} style={{ fontSize: `${s.readerFontSize}px` }}>
      <div className="reader-bar">
        <span>{heading}</span>
        <div className="reader-tools">
          <button
            className="reader-btn"
            title="Page theme"
            onClick={() => setState({ readerTheme: THEMES[(THEMES.indexOf(s.readerTheme) + 1) % THEMES.length] })}
          >
            ◑
          </button>
          <button className="reader-btn" title="Smaller text" onClick={() => setState({ readerFontSize: Math.max(15, s.readerFontSize - 1) })}>A−</button>
          <button className="reader-btn" title="Larger text" onClick={() => setState({ readerFontSize: Math.min(30, s.readerFontSize + 1) })}>A+</button>
          <button className="reader-btn" title="Toggle full screen" aria-label="Toggle full screen" onClick={toggleFullscreen}><Icon name="maximize" /></button>
          <button className="reader-btn" title="Close (Esc)" aria-label="Close reader" onClick={close}><Icon name="x" /></button>
        </div>
      </div>

      <div className="reader-page">
        <article className="reader-content">
          <h2 className="chapter-title">{heading}</h2>
          {paragraphs.map((p, i) =>
            isSceneBreak(p) ? <div className="scene-break" key={i} /> : <p key={i}>{p}</p>
          )}
        </article>
      </div>

      <div className="reader-nav">
        <button className="reader-btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹ Prev</button>
        <span>{index + 1} / {items.length}</span>
        <button className="reader-btn" disabled={index === items.length - 1} onClick={() => setIndex(index + 1)}>Next ›</button>
      </div>
    </div>
  );
}
