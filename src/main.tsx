import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

// HashRouter, not BrowserRouter: GitHub Pages is a static file host with no
// server-side rewrite rules, so a deep link like /matches/123 404s on
// refresh (there's no real file there) and doesn't respect the /dota-dashboard/
// base path on click either. Routing via the URL hash (#/matches/123) never
// touches the server at all - every link and every refresh always load the
// same real index.html, and the route is read from the hash client-side.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
