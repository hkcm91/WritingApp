import React, { useState } from "react";
import { useStore, setState } from "../store.js";
import Icon from "./Icon.jsx";

/**
 * Collapsible card. Pass `id` to persist the open/closed state across
 * sessions (stored in settings.cardOpen); without an id it's local-only.
 */
export default function Card({ id, title, badge, defaultOpen = true, children }) {
  const s = useStore();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = id ? (s.cardOpen[id] ?? defaultOpen) : localOpen;

  const onToggle = (e) => {
    const isOpen = e.target.open;
    if (isOpen === open) return;
    if (id) setState({ cardOpen: { ...s.cardOpen, [id]: isOpen } });
    else setLocalOpen(isOpen);
  };

  return (
    <details className="card" open={open} onToggle={onToggle}>
      <summary>
        <span className="card-title">
          {title}
          {badge != null && <span> · {badge}</span>}
        </span>
        <span className="chev"><Icon name="chevron" /></span>
      </summary>
      <div className="card-body">{children}</div>
    </details>
  );
}
