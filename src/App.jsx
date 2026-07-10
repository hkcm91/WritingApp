import React, { useEffect, useState } from "react";
import { useStore } from "./store.js";
import { onToast } from "./toast.js";
import WritePage from "./pages/WritePage.jsx";
import RewritePage from "./pages/RewritePage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import LibraryPage from "./pages/LibraryPage.jsx";
import RoleplayPage from "./pages/RoleplayPage.jsx";
import Reader from "./components/Reader.jsx";
import SettingsSheet from "./components/SettingsSheet.jsx";
import Icon from "./components/Icon.jsx";

const NAV = [
  { id: "library", label: "Library", icon: "library" },
  { id: "write", label: "Write", icon: "pen" },
  { id: "play", label: "Play", icon: "compass" },
  { id: "rewrite", label: "Rewrite", icon: "wand" },
  { id: "chat", label: "Ideas", icon: "chat" },
];

function NavButtons({ page, setPage }) {
  return NAV.map((n) => (
    <button
      key={n.id}
      className={`nav-btn ${page === n.id ? "active" : ""}`}
      onClick={() => setPage(n.id)}
      aria-current={page === n.id ? "page" : undefined}
    >
      <Icon name={n.icon} />
      {n.label}
    </button>
  ));
}

function Toasts() {
  const [toasts, setToasts] = useState([]);
  useEffect(
    () =>
      onToast((t) => {
        setToasts((prev) => [...prev, t]);
        setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 2600);
      }),
    []
  );
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
      ))}
    </div>
  );
}

export default function App() {
  const state = useStore();
  const [page, setPage] = useState("write");

  useEffect(() => {
    document.documentElement.dataset.uiTheme = state.uiTheme;
  }, [state.uiTheme]);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        <button className="app-title" title="Open library" onClick={() => setPage("library")}>
          {state.title || "Chapter Engine"}
        </button>
        <nav className="top-tabs" aria-label="Pages">
          <NavButtons page={page} setPage={setPage} />
        </nav>
        <div className="header-actions">
          <button
            className="icon-btn"
            title="Read chapters"
            aria-label="Read chapters"
            onClick={() => {
              const items = state.chapters.length
                ? state.chapters.map((c) => ({ n: c.n, text: c.text }))
                : state.draftText.trim()
                  ? [{ text: state.draftText, label: "Draft" }]
                  : null;
              openReader(items, state.activeChapter ?? 0);
            }}
          >
            <Icon name="book" />
          </button>
          <button
            className="icon-btn"
            title="Settings"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>

      {page === "library" && <LibraryPage goWrite={() => setPage("write")} />}
      {page === "write" && <WritePage onRead={openReader} openSettings={() => setSettingsOpen(true)} goRewrite={() => setPage("rewrite")} />}
      {page === "play" && <RoleplayPage openSettings={() => setSettingsOpen(true)} />}
      {page === "rewrite" && <RewritePage onRead={openReader} openSettings={() => setSettingsOpen(true)} goWrite={() => setPage("write")} />}
      {page === "chat" && <ChatPage openSettings={() => setSettingsOpen(true)} goWrite={() => setPage("write")} />}

      <nav className="bottom-nav" aria-label="Pages">
        <NavButtons page={page} setPage={setPage} />
      </nav>

      <Toasts />
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {readerItems && (
        <Reader items={readerItems} startIndex={readerStart} onClose={() => setReaderItems(null)} />
      )}
    </>
  );
}
