/* Laddbild/splash som visas när appen öppnas: logga, speltitel, tagline och
   info om utvecklaren. Tonar ut till titelskärmen efter några sekunder (eller
   vid klick). Egna varma färger (burgundy/guld) så den matchar loggan oavsett
   UI-temat. Redigera konstanterna nedan när namn/utvecklare är spikat. */

import { useEffect, useState } from "react";
import { Signet, Wordmark } from "./Brand";

// ── Redigera dessa när branding är bestämd ──────────────────────────────
const GAME_NAME = "The Landlord";
const STUDIO = "The Landlord Interactive";
const DEV_BLURB = "An independent property-tycoon game — a living 3D city, rival moguls and a boardroom of M&A.";
const YEAR = new Date().getFullYear();
// ────────────────────────────────────────────────────────────────────────

const GOLD = "#d6b25e";
const CREAM = "#f3ede0";
const MUTED = "#b9a894";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  const dismiss = () => {
    setLeaving(true);
    window.setTimeout(onDone, 550);
  };

  useEffect(() => {
    const t1 = window.setTimeout(() => setLeaving(true), 2800);
    const t2 = window.setTimeout(onDone, 3350);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [onDone]);

  return (
    <div
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        background: "radial-gradient(circle at 50% 38%, #2a1420 0%, #160b12 62%, #0d0810 100%)",
        color: CREAM,
        opacity: leaving ? 0 : 1,
        transition: "opacity 0.55s ease",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          borderRadius: 28,
          padding: 18,
          background: "rgba(255,255,255,0.03)",
          boxShadow: `0 18px 60px rgba(0,0,0,0.55), 0 0 0 1px ${GOLD}55`,
          animation: "fi-splash-rise 0.8s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <Signet size={128} title={GAME_NAME} />
      </div>
      <Wordmark
        style={{ width: 400, maxWidth: "82vw", marginTop: 22, height: "auto" }}
      />

      <div
        style={{
          marginTop: 30,
          fontSize: 12,
          letterSpacing: 2,
          color: GOLD,
          textTransform: "uppercase",
          animation: "fi-splash-pulse 1.4s ease-in-out infinite",
        }}
      >
        Loading…
      </div>

      <footer style={{ position: "absolute", bottom: 34, left: 0, right: 0, textAlign: "center", padding: "0 24px" }}>
        <div style={{ fontSize: 12, color: MUTED, maxWidth: 560, margin: "0 auto", lineHeight: 1.5 }}>
          {DEV_BLURB}
        </div>
        <div style={{ fontSize: 11, color: "#8c7c6c", marginTop: 8 }}>© {YEAR} {STUDIO} · Early Access</div>
      </footer>

      <style>{`
        @keyframes fi-splash-rise { from { opacity: 0; transform: translateY(14px) scale(0.96); } to { opacity: 1; transform: none; } }
        @keyframes fi-splash-pulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
      `}</style>
    </div>
  );
}
