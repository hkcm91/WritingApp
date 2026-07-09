import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Dev-only hooks so the app can be driven from automated tests.
if (import.meta.env.DEV) {
  import("./store.js").then((store) => {
    import("./importExport.js").then((ie) => {
      window.__app = { ...store, ...ie };
    });
  });
}

createRoot(document.getElementById("root")).render(<App />);
