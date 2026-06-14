import { BURGUNDY } from "../styles/tokens";
import { S } from "../styles/styles";
import type { GameAction, GameState } from "../engine/types";

interface ToolbarProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  saved: boolean;
  onSave: () => void;
  onLoad: () => void;
}

export function Toolbar({ state, dispatch, saved, onSave, onLoad }: ToolbarProps) {
  // Count warnings: tenants with monthsLeft <= 3 OR condition < 40 on klar properties
  const warnCount = state.portfolio.filter(
    (p) => p.status === "klar" && (
      (p.tenant && p.tenant.monthsLeft <= 3) || p.condition < 40
    )
  ).length;

  return (
    <div style={S.toolbar}>
      <div style={S.toolbarLogo}>
        FASTIGHETS<span style={{ color: BURGUNDY }}>IMPERIUM</span>
      </div>
      <div style={S.toolbarDate}>
        {state.month}/{state.year}
      </div>
      <button
        style={{ ...S.toolbarNextBtn, ...(state.gameOver ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
        disabled={state.gameOver}
        onClick={() => dispatch({ type: "NEXT_MONTH" })}
      >
        ► Nästa månad
      </button>
      <button
        style={S.toolbarFwdBtn}
        disabled={state.gameOver}
        onClick={() => dispatch({ type: "FAST_FORWARD", months: 3 })}
        title="Hoppa 3 månader framåt"
      >
        ×3
      </button>
      <button
        style={S.toolbarFwdBtn}
        disabled={state.gameOver}
        onClick={() => dispatch({ type: "FAST_FORWARD", months: 12 })}
        title="Hoppa 12 månader framåt"
      >
        ×12
      </button>
      <div style={{ flex: 1 }} />
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
