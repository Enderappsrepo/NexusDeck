/** Local preview of the NexusDeck companion app against a mocked device API. */
import "./tw.css";
import { installFetchMock } from "./mock";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "../../src/App";

installFetchMock();
// Seed a paired device so the app opens straight into Browse.
localStorage.setItem(
  "nexusdeck_paired_deck",
  JSON.stringify({ name: "Steam Deck", host: "192.168.1.42", port: 8731, token: "preview-token" })
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
