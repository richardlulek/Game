import { useEffect, useRef, useState } from "react";
import { getVolume, playClick, setVolume } from "../audio/sound";
import { formatGameDate } from "../engine/date";
import { useGameStore } from "../store/gameStore";
import { exportSaveFile, getActiveSlot, importSaveFile, listSaveSlots, saveGame, setActiveSlot } from "../store/persistence";
import { getAutosave, getReduceMotion, setAutosave, setReduceMotion } from "../store/prefs";
import { useUiStore } from "../store/uiStore";
import { loadGameFile, saveGameFile } from "../native";
import { BURGUNDY, C } from "../styles/tokens";
import { S } from "../styles/styles";
import { ClockControls } from "./ClockControls";
import type { GameState } from "../engine/types";

interface ToolbarProps {
  state: GameState;
  saved: boolean;
  onSave: () => void;
  onLoad: () => void;
  offersCount: number;
  onOpenOffers: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  onQuitToTitle: () => void;
}

export function Toolbar({
  state, saved, onSave, onLoad,
  offersCount, onOpenOffers, soundOn, onToggleSound, onQuitToTitle,
}: ToolbarProps) {
  // Count warnings: tenants with monthsLeft <= 3 OR condition < 40 on klar properties
  const warnCount = state.portfolio.filter(
    (p) => p.status === "klar" && (
      p.tenants.some((t) => t.monthsLeft <= 3) || p.condition < 40
    )
  ).length;

  const rollToNextMonth = useGameStore((s) => s.rollToNextMonth);
  const blocked = state.gameOver || !!state.pendingDecision;

  // Alltid synlig husräkning – hela beståndet, oavsett förvaltning.
  const ownedHouses = state.portfolio.filter((p) => p.status === "klar").length;
  const buildingHouses = state.portfolio.length - ownedHouses;

  return (
    <div style={S.toolbar}>
      <div style={S.toolbarLogo}>
        PROPERTY<span style={{ color: BURGUNDY }}>EMPIRE</span>
      </div>
      <div style={S.toolbarDate}>
        {formatGameDate(state.day ?? 1, state.month, state.year)}
      </div>
      <ClockControls />
      <button
        style={{ ...S.toolbarNextBtn, ...(blocked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
        disabled={blocked}
        onClick={() => { playClick(); rollToNextMonth(); }}
        title="Fast-forward to the next month – days roll visibly"
      >
        ⏭ Month
      </button>
      <div style={{ flex: 1 }} />
      {state.portfolio.length > 0 && (
        <div
          style={{ ...S.toolbarMiniBtn, cursor: "default", color: "#ffd080" }}
          title="Number of properties you own"
        >
          🏠 {ownedHouses}{buildingHouses > 0 ? ` (+${buildingHouses})` : ""}
        </div>
      )}
      {offersCount > 0 && (
        <button
          style={{ ...S.toolbarMiniBtn, borderColor: BURGUNDY, color: "#ffd080" }}
          onClick={onOpenOffers}
          title="Incoming bids on your properties"
        >
          📨 {offersCount}
        </button>
      )}
      <button style={S.toolbarMiniBtn} onClick={onSave}>
        {saved ? "✓ Saved" : "Save"}
      </button>
      <SettingsMenu
        state={state}
        onLoad={onLoad}
        soundOn={soundOn}
        onToggleSound={onToggleSound}
        onQuitToTitle={onQuitToTitle}
      />
      {warnCount > 0 && (
        <div style={S.toolbarWarn} title="Properties needing attention">
          ⚠ {warnCount}
        </div>
      )}
    </div>
  );
}

/** Inställningsmeny (⚙): ljud/volym, spar-slots, autospar, rörelse,
 *  kortkommandon, sparfil till/från disk och avsluta till titeln –
 *  samlade bakom en knapp så översta raden får luft (viktigt på iPad). */
function SettingsMenu({ state, onLoad, soundOn, onToggleSound, onQuitToTitle }: {
  state: GameState;
  onLoad: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  onQuitToTitle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const showFpsMeter = useUiStore((s) => s.showFps);
  const setShowFpsMeter = useUiStore((s) => s.setShowFps);
  const graphics = useUiStore((s) => s.graphics);
  const setGraphicsQuality = useUiStore((s) => s.setGraphics);
  const [autosaveOn, setAutosaveOn] = useState(getAutosave());
  const [reduceMotionOn, setReduceMotionOn] = useState(getReduceMotion());
  const [showKeys, setShowKeys] = useState(false);
  const [slots, setSlots] = useState(() => listSaveSlots());
  const [activeSlot, setActiveSlotState] = useState(() => getActiveSlot());
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const refreshSlots = () => { setSlots(listSaveSlots()); setActiveSlotState(getActiveSlot()); };

  // Stäng vid klick utanför menyn.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  // Gemensam import-hantering: validera → bekräfta → in i aktiv slot → ladda.
  const applyImport = (text: string) => {
    const imported = importSaveFile(text);
    if (!imported) {
      window.alert("The file could not be read as a save file.");
      return;
    }
    if (!window.confirm("Import the save file? It overwrites the game in the active slot.")) return;
    saveGame(imported); // in i aktiv slot …
    onLoad();           // … och ladda den direkt.
  };

  // Export: native "Spara som…"-dialog på desktop, annars webbläsar-nedladdning.
  const doExport = async () => {
    const json = exportSaveFile(state);
    const name = `the-landlord-${new Date().toISOString().slice(0, 10)}.json`;
    if ((await saveGameFile(json, name)) !== "web") return; // native skötte det (eller avbröts)
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Import: native "Öppna…"-dialog på desktop, annars webbläsarens filväljare.
  const startImport = async () => {
    const res = await loadGameFile();
    if (res === "web") { fileRef.current?.click(); return; } // webb: dölj filinput
    if (res === null) return;                                 // avbrutet
    applyImport(res);
  };

  // Spara till en vald slot och gör den aktiv (skriv-över bekräftas).
  const saveToSlot = (slot: number) => {
    const info = slots.find((s) => s.slot === slot);
    if (info?.exists && slot !== activeSlot &&
        !window.confirm(`Overwrite the save in slot ${slot} (year ${info.year})?`)) return;
    saveGame(state, slot);
    setActiveSlot(slot);
    refreshSlots();
  };

  const row: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 12, padding: "7px 4px", fontSize: 13, whiteSpace: "nowrap",
  };
  const rowBtn: React.CSSProperties = {
    ...S.toolbarMiniBtn, width: "100%", textAlign: "left" as const,
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase",
    color: C.brass, fontWeight: 700, padding: "2px 4px 6px",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        style={{ ...S.toolbarMiniBtn, ...(open ? { borderColor: BURGUNDY, color: "#ffd080" } : {}) }}
        onClick={() => { if (!open) refreshSlots(); setOpen(!open); }}
        title="Settings: sound, save slots, autosave and more"
      >
        ⚙
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
          minWidth: 230, padding: "10px 12px", borderRadius: 8,
          background: "#1c242e", border: `1px solid ${C.brass}`,
          boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
        }}>
          <div style={row}>
            <span style={{ color: C.creamSoft }}>Sound</span>
            <button style={S.toolbarMiniBtn} onClick={onToggleSound}>
              {soundOn ? "🔊 On" : "🔇 Off"}
            </button>
          </div>
          {soundOn && (
            <div style={row}>
              <span style={{ color: C.creamSoft }}>Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                defaultValue={getVolume()}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                style={{ width: 110, accentColor: BURGUNDY, cursor: "pointer" }}
              />
            </div>
          )}
          <div style={row}>
            <span style={{ color: C.creamSoft }} title="Automatically save to the active slot at the turn of each month">Autosave</span>
            <button style={S.toolbarMiniBtn} onClick={() => { const v = !autosaveOn; setAutosave(v); setAutosaveOn(v); }}>
              {autosaveOn ? "💾 On" : "Off"}
            </button>
          </div>
          <div style={row}>
            <span style={{ color: C.creamSoft }} title="Skip the story's camera pauses and shorten sweeps">Reduce motion</span>
            <button style={S.toolbarMiniBtn} onClick={() => { const v = !reduceMotionOn; setReduceMotion(v); setReduceMotionOn(v); }}>
              {reduceMotionOn ? "On" : "Off"}
            </button>
          </div>
          <div style={row}>
            <span style={{ color: C.creamSoft }} title="Show a live frames-per-second meter (bottom-right)">Show FPS</span>
            <button style={S.toolbarMiniBtn} onClick={() => setShowFpsMeter(!showFpsMeter)}>
              {showFpsMeter ? "On" : "Off"}
            </button>
          </div>
          <div style={row}>
            <span style={{ color: C.creamSoft }} title="Lower it if the game runs slowly. Low turns off shadows, ambient life and renders leaner — best for integrated graphics.">Graphics</span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["low", "medium", "high"] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setGraphicsQuality(q)}
                  title={q === "low" ? "No shadows, no ambient life, lean render" : q === "medium" ? "Balanced" : "Full detail"}
                  style={{ ...S.toolbarMiniBtn, padding: "4px 8px", ...(graphics === q ? { borderColor: BURGUNDY, color: "#ffd080" } : {}) }}
                >
                  {q === "low" ? "Low" : q === "medium" ? "Med" : "High"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: `${C.brass}44`, margin: "6px 0" }} />
          <div style={{ ...sectionLabel }}>Save slots</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 2 }}>
            {slots.map((info) => (
              <button
                key={info.slot}
                onClick={() => saveToSlot(info.slot)}
                title={info.exists ? `Save to slot ${info.slot} (currently year ${info.year})` : `Save to empty slot ${info.slot}`}
                style={{
                  ...S.toolbarMiniBtn, flex: 1, textAlign: "center",
                  ...(info.slot === activeSlot ? { borderColor: BURGUNDY, color: "#ffd080" } : {}),
                }}
              >
                <div style={{ fontWeight: 700 }}>{info.slot === activeSlot ? "●" : "○"} {info.slot}</div>
                <div style={{ fontSize: 10, color: C.creamSoft }}>{info.exists ? `yr ${info.year}` : "empty"}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: C.creamSoft, padding: "2px 4px 4px" }}>
            Click a slot to save there. ● is active.
          </div>
          <div style={row}>
            <button style={rowBtn} onClick={() => { setOpen(false); onLoad(); }}>
              📂 Load active slot
            </button>
          </div>
          <div style={row}>
            <button style={rowBtn} onClick={() => void doExport()} title="Save a backup file (JSON)">
              ⬇︎ Export save file
            </button>
          </div>
          <div style={row}>
            <button style={rowBtn} onClick={() => void startImport()} title="Load a previously exported save file">
              ⬆︎ Import save file
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then(applyImport);
              e.target.value = "";
            }}
          />

          <div style={{ height: 1, background: `${C.brass}44`, margin: "6px 0" }} />
          <div style={row}>
            <button style={rowBtn} onClick={() => setShowKeys((v) => !v)}>
              ⌨︎ Keyboard shortcuts {showKeys ? "▲" : "▼"}
            </button>
          </div>
          {showKeys && (
            <div style={{ fontSize: 11.5, color: C.creamSoft, padding: "2px 6px 6px", lineHeight: 1.7 }}>
              <div><strong style={{ color: C.parchment }}>Esc</strong> — close the top window</div>
              <div><strong style={{ color: C.parchment }}>Space</strong> — pause / resume time</div>
              <div><strong style={{ color: C.parchment }}>1–4</strong> — set game speed</div>
              <div><strong style={{ color: C.parchment }}>Any key / click</strong> — skip a story pause</div>
            </div>
          )}
          <div style={row}>
            <button
              style={{ ...rowBtn, color: "#e8a0a0", borderColor: "#7a3a3a" }}
              onClick={() => {
                if (window.confirm("Quit to the title screen? Save first if you want to keep unsaved progress.")) {
                  setOpen(false);
                  onQuitToTitle();
                }
              }}
            >
              🚪 Quit to title
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
