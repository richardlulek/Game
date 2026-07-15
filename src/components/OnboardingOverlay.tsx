import { msek } from "../engine/format";
import type { GameAction, GameState } from "../engine/types";
import { FONTS } from "../styles/tokens";
import { BURGUNDY } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

function deriveTutorialStep(state: GameState): number {
  if (state.tutorialDismissed) return -1;
  if (state.portfolio.length === 0) return 0;
  if (state.portfolio.every((p) => p.tenants.length === 0)) return 1;
  if (state.history.length < 3) return 2;
  return -1; // done automatically
}

const STEPS = [
  {
    title: "Welcome to Property Empire!",
    // Startkapitalet varierar med svårighet/anpassningar – fyll i vid render.
    body: "You start with {CASH} in the bank. Open the Market tab and buy your first property — pick one that fits your budget and click Buy.",
    icon: "🏠",
  },
  {
    title: "Lease the property",
    body: "Great! Now you need tenants. Open the property card and click Lease to fill vacant units — more tenants means better cash flow.",
    icon: "🤝",
  },
  {
    title: "Run the first month",
    body: "Click Next Month (▶) in the toolbar to start the cash flow. Then check the Finance tab for a rundown of your revenue, interest and taxes.",
    icon: "📅",
  },
];

export function OnboardingOverlay({ state, dispatch }: Props) {
  const step = deriveTutorialStep(state);
  if (step < 0 || step >= STEPS.length) return null;

  const s = STEPS[step];

  return (
    <div style={{
      // Nere i mitten – händelse-toasts bor i nedre högra hörnet.
      position: "fixed", bottom: 56, left: "50%", transform: "translateX(-50%)", zIndex: 2000,
      maxWidth: 400, width: "90%",
      background: "linear-gradient(160deg, #eef2f7, #d6dfeb)",
      border: `2px solid ${BURGUNDY}`,
      borderRadius: 8, padding: "18px 20px",
      boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
      fontFamily: FONTS.body,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>{s.icon}</span>
          <div style={{ fontFamily: FONTS.heading, fontWeight: 800, fontSize: 14, color: BURGUNDY }}>
            {s.title}
          </div>
        </div>
        <button
          onClick={() => dispatch({ type: "DISMISS_TUTORIAL" })}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 16, lineHeight: 1, padding: 0 }}
          title="Close the guide"
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 13, color: "#3a2a0a", lineHeight: 1.6, marginBottom: 10 }}>
        {s.body.replace("{CASH}", msek(state.cash))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: "#888" }}>
          Steg {step + 1} av {STEPS.length}
        </div>
        <button
          onClick={() => dispatch({ type: "DISMISS_TUTORIAL" })}
          style={{ fontSize: 12, color: "#888", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
        >
          Hoppa över guide
        </button>
      </div>
    </div>
  );
}
