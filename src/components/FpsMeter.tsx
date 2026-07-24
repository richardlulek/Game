/* ============================================================
   FPS-mätare + renderarstatistik. En lätt rAF-baserad räknare visar
   verklig bildfrekvens (browserns frame-loop) nere till höger. En
   separat sond inuti Canvas (PerfProbe) läser three's renderer.info
   (draw calls + trianglar) så vi kan se OM det är draw-call-bundet.
   Togglas i inställningsmenyn (uiStore.showFps), persisteras i localStorage.
   ============================================================ */

import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { perfStats } from "./perfStats";

/** Renderas inuti Canvas: speglar förra bildrutans draw calls/trianglar. */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    perfStats.calls = gl.info.render.calls;
    perfStats.tris = gl.info.render.triangles;
  });
  return null;
}

export function FpsMeter() {
  const [fps, setFps] = useState(0);
  const [ms, setMs] = useState(0);
  const [calls, setCalls] = useState(0);
  const [tris, setTris] = useState(0);

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
        setCalls(perfStats.calls);
        setTris(perfStats.tris);
        frames = 0;
        last = now;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const color = fps >= 50 ? "#5ad469" : fps >= 30 ? "#e6c34a" : "#e06666";
  const ktris = tris >= 1000 ? `${(tris / 1000).toFixed(0)}k` : `${tris}`;
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
        fontSize: 11.5,
        lineHeight: 1.4,
        color: "#cdd6df",
        pointerEvents: "none",
        userSelect: "none",
        minWidth: 108,
      }}
    >
      <div style={{ fontWeight: 700, color, fontSize: 15 }}>{fps} FPS</div>
      <div style={{ opacity: 0.75 }}>{ms.toFixed(1)} ms/frame</div>
      <div style={{ opacity: 0.75 }}>{calls} draws · {ktris} tris</div>
    </div>
  );
}
