import type { CSSProperties } from "react";
import { loanTerms } from "../engine/finance";
import { msek } from "../engine/format";
import { propMarketValue } from "../engine/property";
import type { GameState, Lot, Property } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { BURGUNDY } from "../styles/tokens";

const M: Record<string, CSSProperties> = {
  legend: {
    position: "absolute",
    left: 12,
    bottom: 12,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    color: "#444",
    pointerEvents: "none",
  },
  panel: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 252,
    background: "rgba(255,255,255,0.96)",
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: "#1a1a1a",
    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
    pointerEvents: "auto",
  },
  title: { fontWeight: 800, fontSize: 15, marginBottom: 2 },
  sub: { color: "#888", fontSize: 12, marginBottom: 8 },
  row: { display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#444" },
  btn: {
    width: "100%",
    marginTop: 8,
    background: BURGUNDY,
    color: "#fff",
    border: "none",
    padding: "8px",
    borderRadius: 7,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  btn2: {
    width: "100%",
    marginTop: 6,
    background: "#fff",
    color: "#444",
    border: "1px solid #ccc",
    padding: "7px",
    borderRadius: 7,
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
  },
};

/** Färgförklaring för kartans markeringsringar. */
export function MapLegend() {
  return (
    <div style={M.legend}>
      <span style={{ color: "#b58a2a" }}>⬤</span> Till salu ·{" "}
      <span style={{ color: BURGUNDY }}>⬤</span> Din ·{" "}
      <span style={{ color: "#4d8b52" }}>⬤</span> Tomt ·{" "}
      <span style={{ color: "#8a8f98" }}>⬤</span> Konkurrent
    </div>
  );
}

type Selection =
  | { kind: "owned"; prop: Property }
  | { kind: "listing"; prop: Property }
  | { kind: "lot"; lot: Lot }
  | { kind: "rival"; prop: Property; owner: string }
  | null;

function resolveSelection(state: GameState, parcelId: string | null): Selection {
  if (!parcelId) return null;
  const owned = state.portfolio.find((p) => p.parcelId === parcelId);
  if (owned) return { kind: "owned", prop: owned };
  const listing = state.listings.find((p) => p.parcelId === parcelId);
  if (listing) return { kind: "listing", prop: listing };
  const lot = state.lots.find((l) => l.parcelId === parcelId);
  if (lot) return { kind: "lot", lot };
  for (const c of state.competitors) {
    const p = c.portfolio.find((x) => x.parcelId === parcelId);
    if (p) return { kind: "rival", prop: p, owner: c.name };
  }
  return null;
}

/** Snabbinfo för vald byggnad/tomt med genvägar till rätt fönster. */
export function MapSelectionCard({ openWindow }: { openWindow: (id: string) => void }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const selectedId = useUiStore((s) => s.selectedParcelId);
  const sel = resolveSelection(state, selectedId);
  if (!sel) return null;

  return (
    <div style={M.panel}>
      {sel.kind === "lot" ? (
        <>
          <div style={M.title}>Tomt {sel.lot.owned ? "(din)" : "till salu"}</div>
          <div style={M.sub}>
            {sel.lot.districtName} · {sel.lot.area} m²
          </div>
          {!sel.lot.owned && (
            <>
              <div style={M.row}>
                <span>Pris</span>
                <strong>{msek(sel.lot.price)}</strong>
              </div>
              <button
                style={M.btn}
                disabled={state.cash < sel.lot.price}
                onClick={() => dispatch({ type: "BUY_LOT", id: sel.lot.id })}
              >
                Köp tomt {msek(sel.lot.price)}
              </button>
            </>
          )}
          <button style={M.btn2} onClick={() => openWindow("build")}>
            Öppna Bygg
          </button>
        </>
      ) : (
        <>
          <div style={M.title}>{sel.prop.typeLabel}</div>
          <div style={M.sub}>
            {sel.prop.districtName} · {sel.prop.area} m² · skick {Math.round(sel.prop.condition)}
          </div>
          {sel.kind === "owned" && (
            <>
              <div style={M.row}>
                <span>Värde</span>
                <strong>{msek(propMarketValue(sel.prop, state))}</strong>
              </div>
              <div style={M.row}>
                <span>Uthyrt</span>
                <strong>
                  {sel.prop.tenants.length}/{sel.prop.capacity}
                </strong>
              </div>
              <button style={M.btn} onClick={() => openWindow("portfolio")}>
                Öppna Portfölj
              </button>
            </>
          )}
          {sel.kind === "listing" && (
            <>
              <div style={M.row}>
                <span>Pris</span>
                <strong>{msek(sel.prop.askPrice)}</strong>
              </div>
              <div style={M.row}>
                <span>Handpenning</span>
                <strong>{msek(sel.prop.askPrice * (1 - loanTerms(state).maxLtv))}</strong>
              </div>
              <button
                style={M.btn}
                disabled={state.cash < sel.prop.askPrice * (1 - loanTerms(state).maxLtv)}
                onClick={() => dispatch({ type: "BUY", id: sel.prop.id })}
              >
                Köp {msek(sel.prop.askPrice)}
              </button>
              <button style={M.btn2} onClick={() => openWindow("market")}>
                Öppna Marknad (bud m.m.)
              </button>
            </>
          )}
          {sel.kind === "rival" && (
            <>
              <div style={M.row}>
                <span>Ägare</span>
                <strong>{sel.owner}</strong>
              </div>
              <div style={{ ...M.row, color: "#999" }}>
                <span>Inte till salu</span>
              </div>
              <button style={M.btn2} onClick={() => openWindow("acquisition")}>
                Öppna Förvärv (M&A)
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
