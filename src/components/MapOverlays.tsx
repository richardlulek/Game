import type { CSSProperties } from "react";
import { locationFactor } from "../engine/city";
import { canUpgrade, orgLoadOf } from "../engine/company";
import { loanTerms } from "../engine/finance";
import { msek } from "../engine/format";
import { propMarketValue } from "../engine/property";
import type { GameState, Lot, Property } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import type { OverlayMode } from "../store/uiStore";
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

/** Lägesfaktor som läsbar rad: centralt läge ger premie, utkant rabatt. */
function LocationRow({ parcelId }: { parcelId?: string }) {
  const loc = locationFactor(parcelId);
  if (loc === 1) return null;
  const pctVal = Math.round((loc - 1) * 100);
  return (
    <div style={M.row}>
      <span>Läge</span>
      <strong style={{ color: pctVal >= 0 ? "#4d8b52" : "#b5542a" }}>
        {pctVal >= 0 ? "+" : ""}
        {pctVal} % {pctVal >= 4 ? "· centralt" : pctVal <= -3 ? "· utkant" : ""}
      </strong>
    </div>
  );
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
          <LocationRow parcelId={sel.lot.parcelId} />
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
          <LocationRow parcelId={sel.prop.parcelId} />
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

const OVERLAYS: { id: OverlayMode; label: string }[] = [
  { id: "ingen", label: "Karta" },
  { id: "vakans", label: "Vakans" },
  { id: "skick", label: "Skick" },
  { id: "avkastning", label: "Avkastning" },
];

const T: Record<string, CSSProperties> = {
  toggle: {
    position: "absolute",
    left: 12,
    bottom: 44,
    display: "flex",
    gap: 4,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: 4,
  },
  toggleBtn: {
    border: "none",
    background: "transparent",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "#555",
    cursor: "pointer",
  },
  toggleActive: { background: BURGUNDY, color: "#fff" },
  hud: {
    position: "absolute",
    left: 12,
    top: 12,
    width: 250,
    background: "rgba(255,255,255,0.96)",
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12.5,
    color: "#333",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
  },
  hudRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    padding: "4px 0",
  },
  hudBtn: {
    background: BURGUNDY,
    color: "#fff",
    border: "none",
    padding: "4px 9px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  hudBtn2: {
    background: "#fff",
    color: "#555",
    border: "1px solid #ccc",
    padding: "4px 9px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};

/** Kartlager-väljare à la Capitalism Lab: färga husen efter metrik. */
export function OverlayToggle() {
  const overlay = useUiStore((s) => s.overlay);
  const setOverlay = useUiStore((s) => s.setOverlay);
  return (
    <div style={T.toggle}>
      {OVERLAYS.map((o) => (
        <button
          key={o.id}
          style={{ ...T.toggleBtn, ...(overlay === o.id ? T.toggleActive : {}) }}
          onClick={() => setOverlay(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * "Att göra"-panel: sammanfattar portföljens driftläge och erbjuder
 * batch-åtgärder – förvaltning i stor skala istället för hus-för-hus.
 */
export function TodoHud({ openWindow }: { openWindow: (id: string) => void }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const klar = state.portfolio.filter((p) => p.status === "klar");
  if (klar.length === 0) return null;

  const vacantSlots = klar
    .filter((p) => !p.shortTerm)
    .reduce((a, p) => a + Math.max(0, p.capacity - p.tenants.length), 0);
  const totalApps = klar.reduce((a, p) => a + (p.applications ?? []).length, 0);
  const expiring = klar.reduce(
    (a, p) => a + p.tenants.filter((t) => t.monthsLeft <= 3).length,
    0,
  );
  const POOR = 45;
  const poor = klar.filter((p) => p.condition < POOR);
  const poorCost = poor.reduce((a, p) => a + Math.round(propMarketValue(p, state) * 0.02), 0);
  const unmanaged = klar.filter((p) => !p.managed).length;
  const nothing = vacantSlots === 0 && expiring === 0 && poor.length === 0;
  const up = canUpgrade(state);
  const load = orgLoadOf(state);

  return (
    <div style={T.hud}>
      <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 1, marginBottom: 4 }}>
        FÖRVALTNING · {klar.length} fastigheter
      </div>
      {up.qualified && (
        <div style={{ ...T.hudRow, color: "#8a6d1a", fontWeight: 700 }}>
          <span>📈 Redo att expandera bolaget!</span>
          <button style={T.hudBtn} onClick={() => openWindow("company")}>
            Öppna Bolag
          </button>
        </div>
      )}
      {load.over > 0 && (
        <div style={{ ...T.hudRow, color: "#b5542a" }}>
          <span>🏢 {load.over} hus över kapacitet ({load.selfManaged}/{load.cap})</span>
          <button style={T.hudBtn2} onClick={() => openWindow("company")}>
            Bolag →
          </button>
        </div>
      )}
      {nothing && <div style={{ color: "#4d8b52" }}>✓ Allt uthyrt, förnyat och i gott skick.</div>}
      {totalApps > 0 && (
        <div style={T.hudRow}>
          <span>📬 {totalApps} ansökningar väntar</span>
          <button style={T.hudBtn} onClick={() => dispatch({ type: "LEASE_ALL" })}>
            Acceptera bästa
          </button>
        </div>
      )}
      {vacantSlots > 0 && totalApps === 0 && (
        <div style={T.hudRow}>
          <span>🏠 {vacantSlots} vakanser, inga sökande</span>
          <button style={T.hudBtn2} onClick={() => openWindow("portfolio")}>
            Justera hyror →
          </button>
        </div>
      )}
      {expiring > 0 && (
        <div style={T.hudRow}>
          <span>📄 {expiring} kontrakt löper ut ≤3 mån</span>
          <button style={T.hudBtn} onClick={() => dispatch({ type: "RENEW_ALL", monthsLeft: 3 })}>
            Förnya alla
          </button>
        </div>
      )}
      {poor.length > 0 && (
        <div style={T.hudRow}>
          <span>
            🔧 {poor.length} med skick &lt; {POOR}
          </span>
          <button
            style={{ ...T.hudBtn, ...(state.cash < poorCost ? { opacity: 0.55 } : {}) }}
            title={`Kostnad ca ${msek(poorCost)}`}
            onClick={() => dispatch({ type: "MAINTAIN_ALL", threshold: POOR })}
          >
            Underhåll ({msek(poorCost)})
          </button>
        </div>
      )}
      <div style={{ ...T.hudRow, borderTop: "1px solid #eee", marginTop: 4, paddingTop: 8 }}>
        {unmanaged > 0 ? (
          <button style={T.hudBtn2} onClick={() => dispatch({ type: "MANAGE_ALL", managed: true })}>
            👔 Förvaltare på alla ({unmanaged})
          </button>
        ) : (
          <span style={{ color: "#888", fontSize: 11 }}>👔 Förvaltare överallt</span>
        )}
        <button style={T.hudBtn2} onClick={() => openWindow("tenants")}>
          Direktör →
        </button>
      </div>
    </div>
  );
}
