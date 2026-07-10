import React from "react";
import { useStore, createBook, switchBook, renameBook, deleteBook } from "../store.js";
import Icon from "../components/Icon.jsx";
import { toast } from "../toast.js";

export default function LibraryPage({ goWrite }) {
  const s = useStore();

  return (
    <div className="page">
      <div className="btn-row">
        <span className="card-title">Library</span>
        <span className="spacer" />
        <button
          className="btn-secondary"
          onClick={() => {
            const title = prompt("Title for the new book?");
            if (title === null) return;
            createBook(title.trim() || undefined);
            toast("New book created.");
            goWrite();
          }}
        >
          <Icon name="plus" />
          New book
        </button>
      </div>

      <div className="book-grid">
        {s.books.map((b) => (
          <div
            key={b.id}
            className={`book-card ${b.id === s.bookId ? "current" : ""}`}
            onClick={() => { switchBook(b.id); goWrite(); }}
          >
            <div className="book-spine" />
            <div className="book-info">
              <h4>{b.title}</h4>
              <span className="hint">
                {b.chapters} chapter{b.chapters === 1 ? "" : "s"} · {b.words.toLocaleString()} words · {b.characters} cast
              </span>
              {b.id === s.bookId && <span className="book-badge">Open now</span>}
            </div>
            <div className="book-actions">
              <button
                className="icon-btn"
                title="Rename"
                aria-label={`Rename ${b.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const title = prompt("Rename book:", b.title);
                  if (title !== null) renameBook(b.id, title);
                }}
              >
                <Icon name="pen" size={15} />
              </button>
              <button
                className="icon-btn"
                title="Delete"
                aria-label={`Delete ${b.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${b.title}" and all its chapters? This can't be undone.`)) {
                    deleteBook(b.id);
                    toast("Book deleted.");
                  }
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <span className="hint">
        Each book keeps its own bible, cast, notes, chapters, scenes, and brain-dump conversation.
        Settings and your API keys are shared. Export from Settings backs up the open book.
      </span>
    </div>
  );
}
