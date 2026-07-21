import { useState } from "react";
import { DEFAULT_COMPANY_NAME } from "../engine/company";
import { AI_NAMES } from "../engine/data";
import { calYear, formatMonthYear } from "../engine/date";
import { DIFFICULTIES, difficultyById } from "../engine/difficulty";
import { SCENARIOS } from "../engine/scenarios";
import type { DifficultyId, InitOptions, ScenarioId } from "../engine/types";
import { msek } from "../engine/format";
import type { SlotInfo } from "../store/persistence";
import { C, FONTS, THEME } from "../styles/tokens";

interface Props {
  slots: SlotInfo[];
  onNew: (scenarioId: ScenarioId, slot: number, companyName: string, options?: InitOptions) => void;
  onContinue: (slot: number) => void;
}

/** Nytt stadsfrö – aldrig 0 (0 = klassiska kartan). */
const rollCitySeed = (): number => 1 + Math.floor(Math.random() * 999_999);

/** Friläge-anpassningar (null = följ vald svårighet orörd). */
interface CustomOpts {
  cash: number;
  rate: number;
  rivals: number;
  strength: number;
  calm: boolean;
  immortal: boolean;
}

/** Art-deco titelskärm – "spelets entré". */
export function TitleScreen({ slots, onNew, onContinue }: Props) {
  const [phase, setPhase] = useState<"start" | "slots-continue" | "slots-new" | "scenario">("start");
  const [selectedId, setSelectedId] = useState<ScenarioId>("arvet");
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [companyName, setCompanyName] = useState("");
  // Lägesväljaren: toppvyn (3 val) eller scenariomappen.
  const [pickerView, setPickerView] = useState<"modes" | "folder">("modes");
  const [difficulty, setDifficulty] = useState<Exclude<DifficultyId, "custom">>("normal");
  const [showCustom, setShowCustom] = useState(false);
  const [custom, setCustom] = useState<CustomOpts | null>(null);
  // Stadskarta: klassiska staden eller en slumpad (samma distrikt, nya
  // lägen/storlekar). Kampanjen kör alltid den klassiska kartan.
  const [cityMap, setCityMap] = useState<"classic" | "random">("classic");
  const [citySeed, setCitySeed] = useState(() => rollCitySeed());
  const anySave = slots.some((s) => s.exists);

  const isChallenge = (id: ScenarioId) => id !== "arvet" && id !== "sandbox";
  const preset = difficultyById(difficulty).options;
  /** Effektiva Friläge-värden: anpassningar ovanpå vald svårighet. */
  const eff: CustomOpts = custom ?? {
    cash: preset.cash ?? 5_000_000,
    rate: preset.interestRate ?? 2.5,
    rivals: AI_NAMES.length,
    strength: preset.rivalStrength ?? 1,
    calm: false,
    immortal: false,
  };
  const editCustom = (patch: Partial<CustomOpts>) => setCustom({ ...eff, ...patch });
  const pickDifficulty = (d: Exclude<DifficultyId, "custom">) => {
    setDifficulty(d);
    setCustom(null); // ny svårighet nollställer anpassningarna
  };
  /** Startalternativ som skickas med RESET (arvet: inga – egen balans). */
  const buildOptions = (): InitOptions | undefined => {
    if (selectedId === "arvet") return undefined;
    const city = cityMap === "random" ? { citySeed } : {};
    if (selectedId === "sandbox" && custom) {
      return {
        cash: eff.cash,
        interestRate: eff.rate,
        rivalCount: eff.rivals,
        rivalStrength: eff.strength,
        ...(eff.calm ? { calmMode: true } : {}),
        ...(eff.immortal ? { noBankruptcy: true } : {}),
        difficulty: "custom",
        ...city,
      };
    }
    return { ...preset, ...city };
  };

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
            <div style={overline}>· ESTABLISHED 2000 ·</div>
            <div style={title}>PROPERTY&shy;EMPIRE</div>
            <div style={rule}>
              <span style={diamond}>◆</span>
            </div>
            <div style={subtitle}>Build an empire block by block</div>

            <div style={btnRow}>
              {anySave && (
                <button style={contBtn} onClick={() => setPhase("slots-continue")}>
                  Continue
                </button>
              )}
              <button style={newBtn} onClick={() => setPhase("slots-new")}>
                {anySave ? "New game" : "Start playing"}
              </button>
            </div>
          </>
        )}

        {(phase === "slots-continue" || phase === "slots-new") && (
          <>
            <div style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: 700, color: C.brassBright, marginBottom: 16 }}>
              {phase === "slots-continue" ? "Choose a save slot" : "Choose a slot for a new game"}
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
                      {sl.year !== undefined
                        ? sl.month
                          ? formatMonthYear(sl.month, sl.year)
                          : calYear(sl.year)
                        : ""}<br />
                      {sl.equity !== undefined ? msek(sl.equity) : ""}
                      {sl.properties !== undefined ? ` · ${sl.properties} properties` : ""}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: C.brassDim, marginTop: 4 }}>Empty slot</div>
                  )}
                </div>
              ))}
            </div>
            <div style={btnRow}>
              <button style={contBtn} onClick={() => setPhase("start")}>← Back</button>
              {phase === "slots-continue" ? (
                <button
                  style={{ ...newBtn, opacity: slots.find(s => s.slot === selectedSlot)?.exists ? 1 : 0.4 }}
                  disabled={!slots.find(s => s.slot === selectedSlot)?.exists}
                  onClick={() => onContinue(selectedSlot)}
                >
                  Load game
                </button>
              ) : (
                <button style={newBtn} onClick={() => setPhase("scenario")}>
                  Choose game mode →
                </button>
              )}
            </div>
          </>
        )}

        {phase === "scenario" && pickerView === "modes" && (
          <>
            <div style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: 700, color: C.brassBright, marginBottom: 16 }}>
              Choose game mode (Slot {selectedSlot})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 640, width: "100%", marginBottom: 14 }}>
              {/* 1. Berättelseläget */}
              {(() => {
                const sc = SCENARIOS.find((x) => x.id === "arvet")!;
                const sel = selectedId === "arvet";
                return (
                  <div onClick={() => setSelectedId("arvet")} style={modeCard(sel)}>
                    <div style={{ fontSize: 32 }}>{sc.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={modeTitle}>
                        {sc.title}
                        <span style={badge}>RECOMMENDED FIRST TIME</span>
                      </div>
                      <div style={modeDesc}>{sc.desc}</div>
                    </div>
                  </div>
                );
              })()}

              {/* 2. Friläge med anpassningar */}
              {(() => {
                const sel = selectedId === "sandbox";
                return (
                  <div onClick={() => setSelectedId("sandbox")} style={modeCard(sel)}>
                    <div style={{ fontSize: 32 }}>∞</div>
                    <div style={{ flex: 1 }}>
                      <div style={modeTitle}>Sandbox</div>
                      <div style={modeDesc}>
                        No win condition – build freely at your own pace.
                        {custom && <strong style={{ color: C.brassBright }}> · Custom</strong>}
                      </div>
                      {sel && (
                        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
                          <button
                            style={{ ...customToggle, color: showCustom ? C.brassBright : C.creamSoft }}
                            onClick={() => setShowCustom((v) => !v)}
                          >
                            {showCustom ? "▲ Hide options" : "⚙ Customize sandbox"}
                          </button>
                          {showCustom && (
                            <div style={customPanel}>
                              <label style={customLabel}>
                                Starting cash: <strong style={{ color: C.brassBright }}>{msek(eff.cash)}</strong>
                                <input
                                  type="range" min={1_000_000} max={20_000_000} step={500_000}
                                  value={eff.cash}
                                  onChange={(e) => editCustom({ cash: +e.target.value })}
                                  style={slider}
                                />
                              </label>
                              <label style={customLabel}>
                                Interest rate:
                                <span style={pillRow}>
                                  {([["Low", 1.5], ["Normal", 2.5], ["High", 4.5]] as const).map(([lbl, r]) => (
                                    <button key={lbl} style={pill(eff.rate === r)} onClick={() => editCustom({ rate: r })}>
                                      {lbl} {r.toFixed(1)}%
                                    </button>
                                  ))}
                                </span>
                              </label>
                              <label style={customLabel}>
                                Rivals: <strong style={{ color: C.brassBright }}>{eff.rivals}</strong>
                                <input
                                  type="range" min={0} max={AI_NAMES.length} step={1}
                                  value={eff.rivals}
                                  onChange={(e) => editCustom({ rivals: +e.target.value })}
                                  style={slider}
                                />
                              </label>
                              <label style={customLabel}>
                                Rival strength:
                                <span style={pillRow}>
                                  {([["Gentle", 0.7], ["Normal", 1], ["Hungry", 1.4]] as const).map(([lbl, v]) => (
                                    <button key={lbl} style={pill(eff.strength === v)} onClick={() => editCustom({ strength: v })}>
                                      {lbl}
                                    </button>
                                  ))}
                                </span>
                              </label>
                              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                                <label style={{ ...customLabel, flexDirection: "row", alignItems: "center", gap: 7, cursor: "pointer" }}>
                                  <input type="checkbox" checked={eff.calm} onChange={(e) => editCustom({ calm: e.target.checked })} style={{ accentColor: C.brass }} />
                                  Calm mode (events & crises off)
                                </label>
                                <label style={{ ...customLabel, flexDirection: "row", alignItems: "center", gap: 7, cursor: "pointer" }}>
                                  <input type="checkbox" checked={eff.immortal} onChange={(e) => editCustom({ immortal: e.target.checked })} style={{ accentColor: C.brass }} />
                                  Bankruptcy off
                                </label>
                              </div>
                              {custom && (
                                <button style={{ ...customToggle, alignSelf: "flex-start" }} onClick={() => setCustom(null)}>
                                  ↺ Reset to {difficultyById(difficulty).label.toLowerCase()}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 3. Scenariomappen */}
              <div onClick={() => setPickerView("folder")} style={modeCard(isChallenge(selectedId))}>
                <div style={{ fontSize: 32 }}>🗂️</div>
                <div style={{ flex: 1 }}>
                  <div style={modeTitle}>Scenarios & challenges</div>
                  <div style={modeDesc}>
                    {isChallenge(selectedId)
                      ? <>Selected: <strong style={{ color: C.brassBright }}>{SCENARIOS.find((x) => x.id === selectedId)?.title}</strong> – click to change</>
                      : `${SCENARIOS.filter((x) => isChallenge(x.id)).length} challenges with win goals – from The Quick Start to The Hotel King`}
                  </div>
                </div>
                <div style={{ color: C.brassDim, fontSize: 20 }}>›</div>
              </div>
            </div>

            {/* Svårighet (gäller Friläge & scenarier – Arvet har egen balans) */}
            {selectedId !== "arvet" && (
              <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 11, letterSpacing: 2, color: C.brass, fontWeight: 700 }}>DIFFICULTY</label>
                <div style={pillRow}>
                  {DIFFICULTIES.map((d) => (
                    <button key={d.id} style={pill(difficulty === d.id && !custom)} onClick={() => pickDifficulty(d.id)} title={d.desc}>
                      {d.icon} {d.label}
                    </button>
                  ))}
                  {custom && <span style={{ ...pill(true), cursor: "default" }}>⚙ Anpassad</span>}
                </div>
                <div style={{ fontSize: 11, color: C.creamSoft }}>{custom ? "Custom sandbox settings." : difficultyById(difficulty).desc}</div>
              </div>
            )}

            {/* Stadskarta (gäller Friläge & scenarier – kampanjen kör klassiska staden) */}
            {selectedId !== "arvet" && (
              <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 11, letterSpacing: 2, color: C.brass, fontWeight: 700 }}>CITY MAP</label>
                <div style={pillRow}>
                  <button style={pill(cityMap === "classic")} onClick={() => setCityMap("classic")}>
                    🏛 Classic city
                  </button>
                  <button
                    style={pill(cityMap === "random")}
                    onClick={() => {
                      if (cityMap === "random") setCitySeed(rollCitySeed()); // klick igen = ny stad
                      setCityMap("random");
                    }}
                  >
                    🎲 New random city{cityMap === "random" ? ` · #${citySeed}` : ""}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: C.creamSoft }}>
                  {cityMap === "random"
                    ? "Same seven districts in new positions and sizes. Click again to reroll."
                    : "The hand-built classic map."}
                </div>
              </div>
            )}

            {/* Bolagsnamn (arvet: namnet ärvs – byts i kapitel 6) */}
            <div style={{ marginBottom: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, visibility: selectedId === "arvet" ? "hidden" : "visible" }}>
              <label style={{ fontSize: 12, letterSpacing: 2, color: C.brass, fontWeight: 700 }}>
                YOUR COMPANY NAME
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value.slice(0, 32))}
                placeholder={DEFAULT_COMPANY_NAME}
                style={nameInput}
              />
            </div>
            <div style={btnRow}>
              <button style={contBtn} onClick={() => setPhase("slots-new")}>
                ← Back
              </button>
              <button
                style={newBtn}
                onClick={() => onNew(selectedId, selectedSlot, companyName.trim() || DEFAULT_COMPANY_NAME, buildOptions())}
              >
                {selectedId === "arvet" ? "📜 Open the will" : "Found the company"}
              </button>
            </div>
          </>
        )}

        {phase === "scenario" && pickerView === "folder" && (
          <>
            <div style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: 700, color: C.brassBright, marginBottom: 6 }}>
              🗂️ Scenarios & challenges
            </div>
            <div style={{ fontSize: 12, color: C.creamSoft, marginBottom: 14 }}>
              Game modes with win goals – rivals race for the same target. Pick one to go back.
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 10,
              marginBottom: 18,
              maxWidth: 700,
              width: "100%",
            }}>
              {SCENARIOS.filter((sc) => isChallenge(sc.id)).map((sc) => (
                <div
                  key={sc.id}
                  onClick={() => {
                    setSelectedId(sc.id);
                    setPickerView("modes");
                  }}
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
              <button style={contBtn} onClick={() => setPickerView("modes")}>
                ← Back to modes
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
const modeCard = (sel: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "flex-start", gap: 14, textAlign: "left",
  padding: "13px 16px", borderRadius: 6, cursor: "pointer",
  border: sel ? `2px solid ${C.brass}` : `1px solid ${C.brassDim}`,
  background: sel ? "rgba(201,161,59,0.14)" : "rgba(255,255,255,0.06)",
  boxShadow: sel ? "0 0 18px rgba(201,161,59,0.25)" : undefined,
});
const modeTitle: React.CSSProperties = {
  fontFamily: FONTS.heading, fontSize: 17, fontWeight: 800, color: C.brassBright,
};
const modeDesc: React.CSSProperties = { fontSize: 12, color: C.creamSoft, marginTop: 3 };
const badge: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: C.feltDark,
  background: C.brass, borderRadius: 3, padding: "2px 7px", marginLeft: 10, verticalAlign: "middle",
};
const pillRow: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 };
const pill = (sel: boolean): React.CSSProperties => ({
  padding: "5px 13px", borderRadius: 14, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  fontFamily: FONTS.body,
  border: sel ? `1px solid ${C.brass}` : `1px solid ${C.brassDim}`,
  background: sel ? C.burgundy : "transparent",
  color: sel ? C.brassBright : C.creamSoft,
});
const customToggle: React.CSSProperties = {
  background: "none", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
  color: C.creamSoft, padding: 0, fontFamily: FONTS.body, textDecoration: "underline",
};
const customPanel: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 10, marginTop: 10,
  padding: "12px 14px", borderRadius: 6,
  border: `1px solid ${C.brassDim}`, background: "rgba(0,0,0,0.25)",
};
const customLabel: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: C.creamSoft, fontWeight: 600,
};
const slider: React.CSSProperties = { width: "100%", accentColor: C.brass, cursor: "pointer" };
const nameInput: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: `1px solid ${C.brass}`,
  borderRadius: 4,
  color: C.brassBright,
  fontFamily: FONTS.heading,
  fontSize: 17,
  fontWeight: 700,
  textAlign: "center",
  padding: "9px 14px",
  width: 300,
  maxWidth: "80vw",
  outline: "none",
};
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
