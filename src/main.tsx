import React from "react";
import ReactDOM from "react-dom/client";
import FastighetsImperium from "./components/FastighetsImperium";
import { Gallery } from "./gallery/Gallery";
import { ModelGallery } from "./gallery/ModelGallery";
import "./styles/global.css";

// ?gallery renderar UI-galleriet (alla paneler isolerat, ingen 3D/klocka),
// ?models renderar 3D-modellbiblioteket (alla husmodeller uppställda).
// Annars startar spelet som vanligt.
const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
const isGallery = !!params?.has("gallery");
const isModels = !!params?.has("models");

// PWA: registrera service workern i produktion (cache + offlinestart).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isModels ? <ModelGallery /> : isGallery ? <Gallery /> : <FastighetsImperium />}
  </React.StrictMode>,
);
