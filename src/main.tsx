import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent "TypeError: Cannot set property fetch of #<Window> which has only a getter"
// Some outdated dependencies might try to overwrite window.fetch.
if (typeof window !== "undefined") {
  try {
    const originalFetch = window.fetch;
    Object.defineProperty(window, "fetch", {
      configurable: true,
      enumerable: true,
      get: () => originalFetch,
      set: () => {
        console.warn("Blocked attempt to overwrite window.fetch");
      },
    });
  } catch (err) {
    console.warn("Could not define customizable window.fetch in main.tsx:", err);
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
