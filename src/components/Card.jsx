import React, { useState } from "react";
import Icon from "./Icon.jsx";

/** Collapsible card. `defaultOpen` sets the initial state only. */
export default function Card({ title, badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="card" open={open} onToggle={(e) => setOpen(e.target.open)}>
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
