import React from "react";
import ReactDOM from "react-dom/client";
import FastighetsImperium from "./components/FastighetsImperium";
import { Gallery } from "./gallery/Gallery";
import "./styles/global.css";

// ?gallery renderar UI-galleriet (alla paneler isolerat, ingen 3D/klocka)
// för visuell QA. Annars startar spelet som vanligt.
const isGallery = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("gallery");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isGallery ? <Gallery /> : <FastighetsImperium />}
  </React.StrictMode>,
);
