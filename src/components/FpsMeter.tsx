/* ============================================================
   FPS-mätare: en lätt rAF-baserad räknare som visar verklig
   bildfrekvens (browserns frame-loop) nere till höger. Uppdaterar
   texten två gånger per sekund så själva mätningen inte hackar.
   Färgas grön (≥50), gul (≥30) eller röd (<30). Togglas i
   inställningsmenyn (uiStore.showFps) och persisteras i localStorage.
   Fristående DOM-komponent – ingen R3F-kontext behövs; rAF speglar
   samma loop som Canvas ritar i.
   ============================================================ */

import { useEffect, useState } from "react";

export function FpsMeter() {
  const [fps, setFps] = useState(0);
  const [ms, setMs] = useState(0);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frames++;
      raf = requestAnimationFrame(loop);
      const elapsed = now - last;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        setMs(Math.round((elapsed / frames) * 10) / 10);
        frames = 0;
        last = now;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const color = fps >= 50 ? "#5ad469" : fps >= 30 ? "#e6c34a" : "#e06666";
  return (
    <div
      style={{
        position: "fixed",
        right: 10,
        bottom: 42,
        zIndex: 4000,
        background: "rgba(12,18,24,0.82)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 6,
        padding: "5px 9px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        lineHeight: 1.35,
        color: "#cdd6df",
        pointerEvents: "none",
        userSelect: "none",
        minWidth: 84,
      }}
    >
      <div style={{ fontWeight: 700, color, fontSize: 15 }}>{fps} FPS</div>
      <div style={{ opacity: 0.75 }}>{ms.toFixed(1)} ms/frame</div>
    </div>
  );
}
