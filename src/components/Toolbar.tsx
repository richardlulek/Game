import { useEffect, useRef, useState } from "react";
import { getVolume, playClick, setVolume } from "../audio/sound";
import { formatGameDate } from "../engine/date";
import { useGameStore } from "../store/gameStore";
import { exportSaveFile, importSaveFile, saveGame } from "../store/persistence";
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
}

export function Toolbar({
  state, saved, onSave, onLoad,
  offersCount, onOpenOffers, soundOn, onToggleSound,
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
        FASTIGHETS<span style={{ color: BURGUNDY }}>IMPERIUM</span>
      </div>
      <div style={S.toolbarDate}>
        {formatGameDate(state.day ?? 1, state.month, state.year)}
      </div>
      <ClockControls />
      <button
        style={{ ...S.toolbarNextBtn, ...(blocked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
        disabled={blocked}
        onClick={() => { playClick(); rollToNextMonth(); }}
        title="Spola fram till nästa månadsskifte – dagarna rullar synligt"
      >
        ⏭ Månad
      </button>
      <div style={{ flex: 1 }} />
      {state.portfolio.length > 0 && (
        <div
          style={{ ...S.toolbarMiniBtn, cursor: "default", color: "#ffd080" }}
          title="Antal fastigheter du äger"
        >
          🏠 {ownedHouses}{buildingHouses > 0 ? ` (+${buildingHouses})` : ""}
        </div>
      )}
      {offersCount > 0 && (
        <button
          style={{ ...S.toolbarMiniBtn, borderColor: BURGUNDY, color: "#ffd080" }}
          onClick={onOpenOffers}
          title="Inkommande bud på dina fastigheter"
        >
          📨 {offersCount}
        </button>
      )}
      <button style={S.toolbarMiniBtn} onClick={onSave}>
        {saved ? "✓ Sparat" : "Spara"}
      </button>
      <SettingsMenu
        state={state}
        onLoad={onLoad}
        soundOn={soundOn}
        onToggleSound={onToggleSound}
      />
      {warnCount > 0 && (
        <div style={S.toolbarWarn} title="Fastigheter som kräver åtgärd">
          ⚠ {warnCount}
        </div>
      )}
    </div>
  );
}

/** Inställningsmeny (⚙): ljud/volym, ladda och sparfil till/från disk –
 *  samlade bakom en knapp så översta raden får luft (viktigt på iPad). */
function SettingsMenu({ state, onLoad, soundOn, onToggleSound }: {
  state: GameState;
  onLoad: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Stäng vid klick utanför menyn.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const doExport = () => {
    const blob = new Blob([exportSaveFile(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fastighetsimperium-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const doImport = async (file: File) => {
    const imported = importSaveFile(await file.text());
    if (!imported) {
      window.alert("Filen gick inte att läsa som en sparfil.");
      return;
    }
    if (!window.confirm("Importera sparfilen? Den skriver över spelet i aktiv slot.")) return;
    saveGame(imported); // in i aktiv slot …
    onLoad();           // … och ladda den direkt.
  };

  const row: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 12, padding: "7px 4px", fontSize: 13, whiteSpace: "nowrap",
  };
  const rowBtn: React.CSSProperties = {
    ...S.toolbarMiniBtn, width: "100%", textAlign: "left" as const,
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        style={{ ...S.toolbarMiniBtn, ...(open ? { borderColor: BURGUNDY, color: "#ffd080" } : {}) }}
        onClick={() => setOpen(!open)}
        title="Inställningar: ljud, ladda och sparfiler"
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
            <span style={{ color: C.creamSoft }}>Ljud</span>
            <button style={S.toolbarMiniBtn} onClick={onToggleSound}>
              {soundOn ? "🔊 På" : "🔇 Av"}
            </button>
          </div>
          {soundOn && (
            <div style={row}>
              <span style={{ color: C.creamSoft }}>Volym</span>
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
          <div style={{ height: 1, background: `${C.brass}44`, margin: "6px 0" }} />
          <div style={row}>
            <button style={rowBtn} onClick={() => { setOpen(false); onLoad(); }}>
              📂 Ladda sparat spel
            </button>
          </div>
          <div style={row}>
            <button style={rowBtn} onClick={doExport} title="Ladda ner en sparfil (JSON) som säkerhetskopia">
              ⬇︎ Exportera sparfil
            </button>
          </div>
          <div style={row}>
            <button style={rowBtn} onClick={() => fileRef.current?.click()} title="Läs in en tidigare exporterad sparfil">
              ⬆︎ Importera sparfil
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
