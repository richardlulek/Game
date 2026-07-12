import { useRef } from "react";
import { getVolume, playClick, setVolume } from "../audio/sound";
import { formatGameDate } from "../engine/date";
import { exportSaveFile, importSaveFile, saveGame } from "../store/persistence";
import { BURGUNDY } from "../styles/tokens";
import { S } from "../styles/styles";
import { ClockControls } from "./ClockControls";
import type { GameAction, GameState } from "../engine/types";

interface ToolbarProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  saved: boolean;
  onSave: () => void;
  onLoad: () => void;
  offersCount: number;
  onOpenOffers: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
}

export function Toolbar({
  state, dispatch, saved, onSave, onLoad,
  offersCount, onOpenOffers, soundOn, onToggleSound,
}: ToolbarProps) {
  // Count warnings: tenants with monthsLeft <= 3 OR condition < 40 on klar properties
  const warnCount = state.portfolio.filter(
    (p) => p.status === "klar" && (
      p.tenants.some((t) => t.monthsLeft <= 3) || p.condition < 40
    )
  ).length;

  const next = (a: GameAction) => { playClick(); dispatch(a); };
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
        onClick={() => next({ type: "NEXT_MONTH" })}
        title="Stega en månad manuellt"
      >
        ⏭ Månad
      </button>
      <button
        style={S.toolbarFwdBtn}
        disabled={blocked}
        onClick={() => next({ type: "FAST_FORWARD", months: 3 })}
        title="Hoppa 3 månader framåt"
      >
        ×3
      </button>
      <button
        style={S.toolbarFwdBtn}
        disabled={blocked}
        onClick={() => next({ type: "FAST_FORWARD", months: 12 })}
        title="Hoppa 12 månader framåt"
      >
        ×12
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
      <button
        style={S.toolbarMiniBtn}
        onClick={onToggleSound}
        title={soundOn ? "Stäng av ljud" : "Sätt på ljud"}
      >
        {soundOn ? "🔊" : "🔇"}
      </button>
      {soundOn && <VolumeSlider />}
      <button style={S.toolbarMiniBtn} onClick={onSave}>
        {saved ? "✓ Sparat" : "Spara"}
      </button>
      <button style={S.toolbarMiniBtn} onClick={onLoad}>
        Ladda
      </button>
      <SaveFileButtons state={state} onLoad={onLoad} />
      {warnCount > 0 && (
        <div style={S.toolbarWarn} title="Fastigheter som kräver åtgärd">
          ⚠ {warnCount}
        </div>
      )}
    </div>
  );
}

/** Sparfil till/från disk – försäkring mot att Safari rensar localStorage. */
function SaveFileButtons({ state, onLoad }: { state: GameState; onLoad: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <>
      <button style={S.toolbarMiniBtn} onClick={doExport} title="Ladda ner en sparfil (JSON) som säkerhetskopia">
        ⬇︎ Fil
      </button>
      <button style={S.toolbarMiniBtn} onClick={() => fileRef.current?.click()} title="Läs in en tidigare exporterad sparfil">
        ⬆︎ Fil
      </button>
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
    </>
  );
}

function VolumeSlider() {
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.05}
      defaultValue={getVolume()}
      onChange={(e) => setVolume(parseFloat(e.target.value))}
      title="Volym"
      style={{ width: 64, accentColor: BURGUNDY, cursor: "pointer" }}
    />
  );
}
