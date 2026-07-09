import React, { useState } from "react";
import { useStore } from "./store.js";
import WritePage from "./pages/WritePage.jsx";
import RewritePage from "./pages/RewritePage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import Reader from "./components/Reader.jsx";
import SettingsSheet from "./components/SettingsSheet.jsx";

const NAV = [
  { id: "write", label: "Write", ico: "✒️" },
  { id: "rewrite", label: "Rewrite", ico: "🪄" },
  { id: "chat", label: "Brain Dump", ico: "💬" },
];

export default function App() {
  const state = useStore();
  const [page, setPage] = useState("write");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // readerItems: null = closed; otherwise [{ n?, text, label? }]
  const [readerItems, setReaderItems] = useState(null);
  const [readerStart, setReaderStart] = useState(0);

  const openReader = (items, startIndex = 0) => {
    if (!items?.length) return;
    setReaderItems(items);
    setReaderStart(startIndex);
  };

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">Chapter Engine</h1>
        <div className="header-actions">
          <button
            className="icon-btn"
            title="Read chapters"
            onClick={() => {
              const items = state.chapters.length
                ? state.chapters.map((c) => ({ n: c.n, text: c.text }))
                : state.draftText.trim()
                  ? [{ text: state.draftText, label: "Draft" }]
                  : null;
              openReader(items, state.activeChapter ?? 0);
            }}
          >
            📖
          </button>
          <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
            ⚙️
          </button>
        </div>
      </header>

      {page === "write" && <WritePage onRead={openReader} openSettings={() => setSettingsOpen(true)} />}
      {page === "rewrite" && <RewritePage onRead={openReader} openSettings={() => setSettingsOpen(true)} goWrite={() => setPage("write")} />}
      {page === "chat" && <ChatPage openSettings={() => setSettingsOpen(true)} goWrite={() => setPage("write")} />}

      <nav className="bottom-nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-btn ${page === n.id ? "active" : ""}`}
            onClick={() => setPage(n.id)}
          >
            <span className="nav-ico">{n.ico}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {readerItems && (
        <Reader items={readerItems} startIndex={readerStart} onClose={() => setReaderItems(null)} />
      )}
    </>
  );
}
