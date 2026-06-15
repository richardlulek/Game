import { useState } from "react";
import { SCENARIOS } from "../engine/scenarios";
import type { ScenarioId } from "../engine/types";
import { msek } from "../engine/format";
import type { SlotInfo } from "../store/persistence";
import { C, FONTS, THEME } from "../styles/tokens";

interface Props {
  slots: SlotInfo[];
  onNew: (scenarioId: ScenarioId, slot: number) => void;
  onContinue: (slot: number) => void;
}

/** Art-deco titelskärm – "spelets entré". */
export function TitleScreen({ slots, onNew, onContinue }: Props) {
  const [phase, setPhase] = useState<"start" | "slots-continue" | "slots-new" | "scenario">("start");
  const [selectedId, setSelectedId] = useState<ScenarioId>("equity50");
  const [selectedSlot, setSelectedSlot] = useState(1);
  const anySave = slots.some((s) => s.exists);

  return (
    <div style={wrap}>
      {/* Solstråle-motiv */}
      <svg viewBox="0 0 1000 700" style={burst} aria-hidden preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="ts-glow" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="#1f4a39" />
            <stop offset="100%" stopColor="#0e241d" />
          </radialGradient>
        </defs>
        <rect width="1000" height="700" fill="url(#ts-glow)" />
        <g transform="translate(500,300)" opacity="0.16">
          {Array.from({ length: 36 }).map((_, i) => (
            <polygon
              key={i}
              points="0,0 -26,-680 26,-680"
              fill={i % 2 ? C.brass : C.brassBright}
              transform={`rotate(${i * 10})`}
            />
          ))}
        </g>
      </svg>

      {/* Skyline-siluett */}
      <svg viewBox="0 0 1000 200" style={skyline} preserveAspectRatio="xMidYMax slice" aria-hidden>
        <g fill="#0c1f18">
          <rect x="40" y="90" width="60" height="110" />
          <rect x="110" y="50" width="44" height="150" />
          <rect x="160" y="110" width="70" height="90" />
          <rect x="245" y="30" width="40" height="170" />
          <rect x="300" y="80" width="80" height="120" />
          <rect x="395" y="60" width="48" height="140" />
          <rect x="455" y="20" width="54" height="180" />
          <rect x="520" y="95" width="74" height="105" />
          <rect x="610" y="55" width="46" height="145" />
          <rect x="665" y="105" width="86" height="95" />
          <rect x="760" y="40" width="50" height="160" />
          <rect x="820" y="85" width="70" height="115" />
          <rect x="900" y="60" width="60" height="140" />
        </g>
        <g fill={C.brass} opacity="0.5">
          {Array.from({ length: 60 }).map((_, i) => (
            <rect key={i} x={48 + (i % 30) * 31} y={70 + ((i * 37) % 90)} width="4" height="5" />
          ))}
        </g>
      </svg>

      {/* Mässingsram med titel */}
      <div style={frame}>
        {phase === "start" && (
          <>
            <div style={overline}>· ETABLERAT 1925 ·</div>
            <div style={title}>FASTIGHETS&shy;IMPERIUM</div>
            <div style={rule}>
              <span style={diamond}>◆</span>
            </div>
            <div style={subtitle}>Res ett imperium kvarter för kvarter</div>

            <div style={btnRow}>
              {anySave && (
                <button style={contBtn} onClick={() => setPhase("slots-continue")}>
                  Fortsätt spela
                </button>
              )}
              <button style={newBtn} onClick={() => setPhase("slots-new")}>
                {anySave ? "Nytt spel" : "Börja spela"}
              </button>
            </div>
          </>
        )}

        {(phase === "slots-continue" || phase === "slots-new") && (
          <>
            <div style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: 700, color: C.brassBright, marginBottom: 16 }}>
              {phase === "slots-continue" ? "Välj sparslot" : "Välj slot för nytt spel"}
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", justifyContent: "center" }}>
              {slots.map((sl) => (
                <div
                  key={sl.slot}
                  onClick={() => {
                    if (phase === "slots-continue" && !sl.exists) return;
                    setSelectedSlot(sl.slot);
                  }}
                  style={{
                    padding: "16px 20px", borderRadius: 6, minWidth: 160, textAlign: "center",
                    border: selectedSlot === sl.slot ? `2px solid ${C.brass}` : `1px solid ${C.brassDim}`,
                    background: sl.exists ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                    cursor: phase === "slots-continue" && !sl.exists ? "default" : "pointer",
                    opacity: phase === "slots-continue" && !sl.exists ? 0.4 : 1,
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>
                    {sl.exists ? "💾" : "➕"}
                  </div>
                  <div style={{ fontFamily: FONTS.heading, fontWeight: 700, color: C.brassBright, fontSize: 14 }}>
                    Slot {sl.slot}
                  </div>
                  {sl.exists ? (
                    <div style={{ fontSize: 11, color: C.creamSoft, marginTop: 4 }}>
                      År {sl.year} · {sl.month ? `Mån ${sl.month}` : ""}<br />
                      {sl.equity !== undefined ? msek(sl.equity) : ""}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: C.brassDim, marginTop: 4 }}>Tom slot</div>
                  )}
                </div>
              ))}
            </div>
            <div style={btnRow}>
              <button style={contBtn} onClick={() => setPhase("start")}>← Tillbaka</button>
              {phase === "slots-continue" ? (
                <button
                  style={{ ...newBtn, opacity: slots.find(s => s.slot === selectedSlot)?.exists ? 1 : 0.4 }}
                  disabled={!slots.find(s => s.slot === selectedSlot)?.exists}
                  onClick={() => onContinue(selectedSlot)}
                >
                  Ladda spel
                </button>
              ) : (
                <button style={newBtn} onClick={() => setPhase("scenario")}>
                  Välj spelläge →
                </button>
              )}
            </div>
          </>
        )}

        {phase === "scenario" && (
          <>
            <div style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: 700, color: C.brassBright, marginBottom: 16 }}>
              Välj spelläge (Slot {selectedSlot})
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 10,
              marginBottom: 18,
              maxWidth: 700,
              width: "100%",
            }}>
              {SCENARIOS.map((sc) => (
                <div
                  key={sc.id}
                  onClick={() => setSelectedId(sc.id)}
                  style={{
                    padding: 12,
                    borderRadius: 5,
                    border: selectedId === sc.id ? `2px solid ${C.brass}` : `1px solid ${C.brassDim}`,
                    background: "rgba(255,255,255,0.07)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 26 }}>{sc.icon}</div>
                  <div style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: 700, color: C.brassBright, marginTop: 4 }}>{sc.title}</div>
                  <div style={{ fontSize: 11, color: C.brass, marginTop: 2 }}>{sc.subtitle}</div>
                  <div style={{ fontSize: 12, color: C.creamSoft, marginTop: 4 }}>{sc.desc}</div>
                </div>
              ))}
            </div>
            <div style={btnRow}>
              <button style={contBtn} onClick={() => setPhase("slots-new")}>
                ← Tillbaka
              </button>
              <button style={newBtn} onClick={() => onNew(selectedId, selectedSlot)}>
                Starta
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 3000,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: C.feltDark, overflow: "hidden",
  fontFamily: FONTS.body,
  animation: "fi-overlay-fade 0.4s ease",
};
const burst: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
const skyline: React.CSSProperties = { position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: 200 };
const frame: React.CSSProperties = {
  position: "relative",
  textAlign: "center",
  padding: "44px 54px",
  border: `2px solid ${C.brass}`,
  outline: `1px solid ${C.brassDim}`,
  outlineOffset: 5,
  background: "rgba(16,32,26,0.72)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
  maxWidth: "90vw",
};
const overline: React.CSSProperties = {
  fontFamily: FONTS.body, fontSize: 13, letterSpacing: 6,
  color: C.brass, fontWeight: 600, marginBottom: 14,
};
const title: React.CSSProperties = {
  fontFamily: FONTS.display, fontSize: "clamp(34px, 7vw, 64px)", fontWeight: 900,
  color: C.brassBright, letterSpacing: 3, lineHeight: 1.05,
  textShadow: "0 2px 10px rgba(0,0,0,0.7)",
};
const rule: React.CSSProperties = {
  height: 2, background: THEME.goldRule, margin: "20px auto 16px", maxWidth: 320,
  position: "relative",
};
const diamond: React.CSSProperties = {
  position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
  color: C.brass, fontSize: 16, background: "rgba(16,32,26,0.9)", padding: "0 8px",
};
const subtitle: React.CSSProperties = {
  fontFamily: FONTS.heading, fontStyle: "italic", fontSize: "clamp(14px,2.2vw,19px)",
  color: C.creamText, marginBottom: 30,
};
const btnRow: React.CSSProperties = { display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" };
const newBtn: React.CSSProperties = {
  background: C.burgundy, color: C.brassBright,
  border: `1px solid ${C.brass}`, padding: "13px 32px", borderRadius: 4,
  fontFamily: FONTS.body, fontWeight: 700, fontSize: 16, letterSpacing: 1, cursor: "pointer",
};
const contBtn: React.CSSProperties = {
  background: "transparent", color: C.brassBright,
  border: `1px solid ${C.brass}`, padding: "13px 28px", borderRadius: 4,
  fontFamily: FONTS.body, fontWeight: 600, fontSize: 16, letterSpacing: 0.5, cursor: "pointer",
};
