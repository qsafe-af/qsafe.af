import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import "./index.css";
import App from "./App.tsx";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

// Load development utilities in dev mode
if (import.meta.env.DEV) {
  import("./utils/dev-utils").catch(console.error);
}

// Initialize crypto before rendering
cryptoWaitReady()
  .then(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch(console.error);
