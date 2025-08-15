import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
// ⬇️ 這行一定要加，否則會出現 "BrowserRouter is not defined"
import { BrowserRouter } from "react-router-dom";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
      <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
