import { playClick } from "../audio/sound";
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

  return (
    <div style={S.toolbar}>
      <div style={S.toolbarLogo}>
        FASTIGHETS<span style={{ color: BURGUNDY }}>IMPERIUM</span>
      </div>
      <div style={S.toolbarDate}>
        {state.month}/{state.year}
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
      <button style={S.toolbarMiniBtn} onClick={onSave}>
        {saved ? "✓ Sparat" : "Spara"}
      </button>
      <button style={S.toolbarMiniBtn} onClick={onLoad}>
        Ladda
      </button>
      {warnCount > 0 && (
        <div style={S.toolbarWarn} title="Fastigheter som kräver åtgärd">
          ⚠ {warnCount}
        </div>
      )}
    </div>
  );
}
