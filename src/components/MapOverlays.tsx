import type { CSSProperties } from "react";
import type { Parcel } from "../engine/city";
import { expansionByBlock, hasAmbientBuilding, locationFactor, parcelById } from "../engine/city";
import { planFee, planMonths, rawLandPrice } from "../engine/cityPlan";
import { canUpgrade, orgLoadOf, tierForLevel, unlockLevelFor, unlockedWindows } from "../engine/company";
import { DISTRICTS } from "../engine/data";
import { loanTerms } from "../engine/finance";
import { districtLocked } from "../engine/story";
import { msek } from "../engine/format";
import { ambientAsk, ambientProfile } from "../engine/landDeals";
import { pendingWork, propMarketValue } from "../engine/property";
import type { GameState, Lot, PlanProcess, Property } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import type { OverlayMode } from "../store/uiStore";
import { useUiStore } from "../store/uiStore";
import { BURGUNDY } from "../styles/tokens";
import { RivalCard } from "./RivalCard";

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
      🔵 Yours · 🟡 For sale · 🟢 Lot · 🔴 Competitor
    </div>
  );
}

type Selection =
  | { kind: "owned"; prop: Property }
  | { kind: "listing"; prop: Property }
  | { kind: "lot"; lot: Lot }
  | { kind: "rival"; prop: Property; owner: string }
  | { kind: "ambient"; parcel: Parcel }
  | { kind: "planArea"; parcel: Parcel; areaState: "till-salu" | "ägd" | "process"; proc?: PlanProcess }
  | { kind: "kommunal"; parcel: Parcel }
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
  // Mark utan spelobjekt: låst expansionsmark eller privatägt dekorhus.
  const parcel = parcelById(parcelId);
  if (!parcel) return null;
  if (parcel.expansion && !(state.unlockedBlocks ?? []).includes(parcel.blockId)) {
    const def = expansionByBlock(parcel.blockId);
    if (def?.kind === "plan") {
      const proc = (state.planProcesses ?? []).find((p) => p.blockId === parcel.blockId);
      const areaState = proc
        ? ("process" as const)
        : (state.ownedPlanAreas ?? []).includes(parcel.blockId)
          ? ("ägd" as const)
          : ("till-salu" as const);
      return { kind: "planArea", parcel, areaState, proc };
    }
    return { kind: "kommunal", parcel };
  }
  if (hasAmbientBuilding(parcel, new Set(state.ambientGrown ?? []))) {
    return { kind: "ambient", parcel };
  }
  return null;
}

const STAGE_LABEL: Record<PlanProcess["stage"], string> = {
  samråd: "Consultation in progress",
  granskning: "Review in progress",
  överklagad: "Appealed – with the court",
};

/** Lägesfaktor som läsbar rad: centralt läge ger premie, utkant rabatt. */
function LocationRow({ parcelId }: { parcelId?: string }) {
  const loc = locationFactor(parcelId);
  if (loc === 1) return null;
  const pctVal = Math.round((loc - 1) * 100);
  return (
    <div style={M.row}>
      <span>Location</span>
      <strong style={{ color: pctVal >= 0 ? "#4d8b52" : "#b5542a" }}>
        {pctVal >= 0 ? "+" : ""}
        {pctVal}% {pctVal >= 4 ? "· central" : pctVal <= -3 ? "· outskirts" : ""}
      </strong>
    </div>
  );
}

/** Genväg till ett fönster – visar 🔒 + nivåkrav i stället för att
 *  tyst göra ingenting när fönstret inte är upplåst ännu. */
function ShortcutBtn({
  id, label, level, openWindow,
}: { id: string; label: string; level: number; openWindow: (id: string) => void }) {
  if (unlockedWindows(level).has(id)) {
    return (
      <button style={M.btn2} onClick={() => openWindow(id)}>
        {label}
      </button>
    );
  }
  const req = tierForLevel(unlockLevelFor(id));
  return (
    <button style={{ ...M.btn2, opacity: 0.55, cursor: "default" }} disabled>
      🔒 {label} – level {req.level}
    </button>
  );
}

/** Snabbinfo för vald byggnad/tomt med genvägar till rätt fönster. */
export function MapSelectionCard({ openWindow }: { openWindow: (id: string) => void }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const selectedId = useUiStore((s) => s.selectedParcelId);
  const level = state.companyLevel ?? 1;
  const sel = resolveSelection(state, selectedId);
  if (!sel) return null;

  // Berättelseläget: låsta distrikt går inte att handla i alls – kortet
  // visar låset i stället för köpknappar (egna hus visas som vanligt).
  const selDistrict =
    "prop" in sel ? sel.prop.district : "lot" in sel ? sel.lot.district : sel.parcel.district;
  if (sel.kind !== "owned" && districtLocked(state, selDistrict)) {
    return (
      <div style={M.panel}>
        <div style={M.title}>🔒 The area is locked</div>
        <div style={M.sub}>{DISTRICTS.find((d) => d.id === selDistrict)?.name ?? selDistrict}</div>
        <div style={{ ...M.row, color: "#777" }}>
          <span>The story opens the city chapter by chapter. Continue the campaign to open this area for deals.</span>
        </div>
      </div>
    );
  }

  // Mark & privatägda hus – markstrategin direkt i kartan.
  if (sel.kind === "kommunal") {
    return (
      <div style={M.panel}>
        <div style={M.title}>Municipal land</div>
        <div style={M.sub}>Fenced expansion block</div>
        <div style={{ ...M.row, color: "#777" }}>
          <span>The municipality zones the area and releases it at a plan auction. Keep cash ready.</span>
        </div>
      </div>
    );
  }
  if (sel.kind === "planArea") {
    const blockId = sel.parcel.blockId;
    const price = rawLandPrice(blockId, state);
    const fee = planFee(blockId);
    return (
      <div style={M.panel}>
        <div style={M.title}>🌾 Plan area</div>
        <div style={M.sub}>Private raw land · unbuildable until a zoning plan exists</div>
        {sel.areaState === "till-salu" && (
          <>
            <div style={M.row}>
              <span>Raw land price</span>
              <strong>{msek(price)}</strong>
            </div>
            <div style={M.row}>
              <span>Plan fee (later)</span>
              <strong>{msek(fee)}</strong>
            </div>
            <div style={M.row}>
              <span>Plan process</span>
              <strong>~{planMonths(blockId)} mo</strong>
            </div>
            <button
              style={M.btn}
              disabled={state.cash < price}
              onClick={() => dispatch({ type: "BUY_RAW_LAND", blockId })}
            >
              Buy the raw land {msek(price)}
            </button>
          </>
        )}
        {sel.areaState === "ägd" && (
          <>
            <div style={M.row}>
              <span>Raw land</span>
              <strong style={{ color: "#4d8b52" }}>Yours</strong>
            </div>
            <div style={M.row}>
              <span>Plan fee & studies</span>
              <strong>{msek(fee)}</strong>
            </div>
            <div style={{ ...M.row, color: "#999", fontSize: 12 }}>
              <span>Consultation, review… and maybe appeals. Good reputation speeds up the process.</span>
            </div>
            <button
              style={M.btn}
              disabled={state.cash < fee}
              onClick={() => dispatch({ type: "START_PLAN", blockId })}
            >
              Start zoning plan {msek(fee)}
            </button>
          </>
        )}
        {sel.areaState === "process" && sel.proc && (
          <>
            <div style={M.row}>
              <span>Status</span>
              <strong>{STAGE_LABEL[sel.proc.stage]}</strong>
            </div>
            <div style={M.row}>
              <span>Done in</span>
              <strong>~{sel.proc.monthsLeft} mo</strong>
            </div>
            {(sel.proc.parkParcels ?? []).length > 0 && (
              <div style={{ ...M.row, color: "#999", fontSize: 12 }}>
                <span>🌊 Shoreline protection: {sel.proc.parkParcels!.length} lot ceded as park</span>
              </div>
            )}
          </>
        )}
      </div>
    );
  }
  if (sel.kind === "ambient") {
    const prof = ambientProfile(sel.parcel);
    const deal = ambientAsk(sel.parcel, state);
    const down = deal.ask * (1 - loanTerms(state).maxLtv);
    return (
      <div style={M.panel}>
        <div style={M.title}>{prof.typeLabel} · privately owned</div>
        <div style={M.sub}>
          Not for sale — but everything has a price
        </div>
        <div style={M.row}>
          <span>Area</span>
          <strong>{prof.area} m²</strong>
        </div>
        <div style={M.row}>
          <span>Condition</span>
          <strong>{prof.condition}</strong>
        </div>
        <LocationRow parcelId={sel.parcel.id} />
        <div style={M.row}>
          <span>Valuation</span>
          <strong>{msek(deal.value)}</strong>
        </div>
        <div style={M.row}>
          <span>Owner asks</span>
          <strong style={{ color: deal.holdout ? "#b5542a" : undefined }}>
            {msek(deal.ask)} (+{Math.round((deal.premium - 1) * 100)}%)
          </strong>
        </div>
        {deal.holdout && (
          <div style={{ ...M.row, color: "#b5542a", fontSize: 12 }}>
            <span>😤 Holdout — only sells at a steep premium</span>
          </div>
        )}
        <button
          style={M.btn}
          disabled={state.cash < down}
          title={state.cash < down ? `Requires ${msek(down)} down payment` : `Down payment ${msek(down)}`}
          onClick={() => dispatch({ type: "BUY_AMBIENT", parcelId: sel.parcel.id })}
        >
          Buy from owner {msek(deal.ask)}
        </button>
      </div>
    );
  }

  return (
    <div style={M.panel}>
      {sel.kind === "lot" ? (
        <>
          <div style={M.title}>Lot {sel.lot.owned ? "(yours)" : "for sale"}</div>
          <div style={M.sub}>
            {sel.lot.districtName} · {sel.lot.area} m²
          </div>
          <LocationRow parcelId={sel.lot.parcelId} />
          {!sel.lot.owned && (
            <>
              <div style={M.row}>
                <span>Price</span>
                <strong>{msek(sel.lot.price)}</strong>
              </div>
              <button
                style={M.btn}
                disabled={state.cash < sel.lot.price}
                onClick={() => dispatch({ type: "BUY_LOT", id: sel.lot.id })}
              >
                Buy lot {msek(sel.lot.price)}
              </button>
            </>
          )}
          <ShortcutBtn id="build" label="Open Build" level={level} openWindow={openWindow} />
        </>
      ) : (
        <>
          <div style={M.title}>{sel.prop.typeLabel}</div>
          <div style={M.sub}>
            {sel.prop.districtName} · {sel.prop.area} m² · condition {Math.round(sel.prop.condition)}
          </div>
          <LocationRow parcelId={sel.prop.parcelId} />
          {sel.kind === "owned" && (
            <>
              <div style={M.row}>
                <span>Value</span>
                <strong>{msek(propMarketValue(sel.prop, state))}</strong>
              </div>
              <div style={M.row}>
                <span>Rented</span>
                <strong>
                  {sel.prop.tenants.length}/{sel.prop.capacity}
                </strong>
              </div>
              <button style={M.btn} onClick={() => openWindow("portfolio")}>
                Open Portfolio
              </button>
            </>
          )}
          {sel.kind === "listing" && (
            <>
              <div style={M.row}>
                <span>Price</span>
                <strong>{msek(sel.prop.askPrice)}</strong>
              </div>
              <div style={M.row}>
                <span>Down payment</span>
                <strong>{msek(sel.prop.askPrice * (1 - loanTerms(state).maxLtv))}</strong>
              </div>
              <button
                style={M.btn}
                disabled={state.cash < sel.prop.askPrice * (1 - loanTerms(state).maxLtv)}
                onClick={() => dispatch({ type: "BUY", id: sel.prop.id })}
              >
                Buy {msek(sel.prop.askPrice)}
              </button>
              <button style={M.btn2} onClick={() => openWindow("market")}>
                Open Market (bids etc.)
              </button>
            </>
          )}
          {sel.kind === "rival" && (() => {
            // Direktbud på konkurrentens fastighet: ≥110 % övervägs,
            // ≥125 % accepteras alltid (samma regler som OFFER_TO_RIVAL).
            const ask = sel.prop.askPrice;
            const { maxLtv } = loanTerms(state);
            const mkBid = (mult: number) => Math.round((ask * mult) / 10_000) * 10_000;
            return (
              <>
                <div style={{ marginBottom: 8 }}>
                  <RivalCard company={sel.owner} showSignature />
                </div>
                <div style={M.row}>
                  <span>Valuation</span>
                  <strong>{msek(ask)}</strong>
                </div>
                <div style={{ ...M.row, color: "#999", fontSize: 12 }}>
                  <span>Not for sale – but everything has a price</span>
                </div>
                {([[1.10, "Bid +10%"], [1.25, "Bid +25% (accepted)"]] as const).map(([mult, label]) => {
                  const bid = mkBid(mult);
                  const down = bid * (1 - maxLtv);
                  return (
                    <button
                      key={mult}
                      style={mult === 1.25 ? M.btn : M.btn2}
                      disabled={state.cash < down}
                      title={state.cash < down ? `Requires ${msek(down)} down payment` : `Down payment ${msek(down)}`}
                      onClick={() =>
                        dispatch({ type: "OFFER_TO_RIVAL", competitorName: sel.owner, propertyId: sel.prop.id, amount: bid })
                      }
                    >
                      {label}: {msek(bid)}
                    </button>
                  );
                })}
                <ShortcutBtn id="acquisition" label="Open Acquisition (M&A)" level={level} openWindow={openWindow} />
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}

const OVERLAYS: { id: OverlayMode; label: string }[] = [
  { id: "ingen", label: "Map" },
  { id: "vakans", label: "Vacancy" },
  { id: "skick", label: "Condition" },
  { id: "avkastning", label: "Yield" },
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
  const requestOpen = useUiStore((s) => s.requestOpen);
  const klar = state.portfolio.filter((p) => p.status === "klar");
  if (klar.length === 0) return null;

  const vacantSlots = klar
    .filter((p) => !p.shortTerm)
    .reduce((a, p) => a + Math.max(0, p.capacity - p.tenants.length), 0);
  const vacantHouses = klar.filter((p) => !p.shortTerm && p.tenants.length < p.capacity).length;
  const totalApps = klar.reduce((a, p) => a + (p.applications ?? []).length, 0);
  const expiring = klar.reduce(
    (a, p) => a + p.tenants.filter((t) => t.monthsLeft <= 3).length,
    0,
  );
  const POOR = 45;
  const GOOD = 70;
  // Hus med beställt underhåll räknas inte in – jobbet är redan betalt
  // och HUD-knappen ska inte kunna dubbelköa.
  const maintainable = klar.filter((p) => !pendingWork(p, "underhåll"));
  const pendingJobs = klar.reduce((a, p) => a + (p.pendingWorks?.length ?? 0), 0);
  const poor = maintainable.filter((p) => p.condition < POOR);
  const poorCost = poor.reduce((a, p) => a + Math.round(propMarketValue(p, state) * 0.02), 0);
  // Underhållsskuld: uppskattad totalkostnad för att lyfta alla hus under
  // "gott skick" (70) dit – varje underhållsrunda ger +15 skick och
  // kostar 2 % av marknadsvärdet.
  const maintDebt = maintainable.reduce((a, p) => {
    if (p.condition >= GOOD) return a;
    const rounds = Math.ceil((GOOD - p.condition) / 15);
    return a + rounds * Math.round(propMarketValue(p, state) * 0.02);
  }, 0);
  const belowGood = maintainable.filter((p) => p.condition < GOOD).length;
  // En underhållsrunda (+15 skick) för alla hus under gott skick.
  const goodRoundCost = maintainable
    .filter((p) => p.condition < GOOD)
    .reduce((a, p) => a + Math.round(propMarketValue(p, state) * 0.02), 0);
  const offersCount = (state.offers ?? []).length;
  const unmanaged = klar.filter((p) => !p.managed).length;
  const nothing =
    vacantSlots === 0 && expiring === 0 && maintDebt === 0 && offersCount === 0;
  const up = canUpgrade(state);
  const load = orgLoadOf(state);

  return (
    <div style={T.hud}>
      <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 1, marginBottom: 4 }}>
        MANAGEMENT · {klar.length} properties
      </div>
      {offersCount > 0 && (
        <div style={{ ...T.hudRow, color: "#4757c8", fontWeight: 700 }}>
          <span>📨 {offersCount} bids awaiting response</span>
          <button style={T.hudBtn} onClick={() => requestOpen("offers")}>
            Open inbox
          </button>
        </div>
      )}
      {up.qualified && (
        <div style={{ ...T.hudRow, color: "#4757c8", fontWeight: 700 }}>
          <span>📈 Ready to expand the company!</span>
          <button style={T.hudBtn} onClick={() => openWindow("company")}>
            Open Company
          </button>
        </div>
      )}
      {load.over > 0 && (
        <div style={{ ...T.hudRow, color: "#b5542a" }}>
          <span>🏢 {load.over} buildings over capacity ({load.selfManaged}/{load.cap})</span>
          <button style={T.hudBtn2} onClick={() => openWindow("company")}>
            Company →
          </button>
        </div>
      )}
      {nothing && <div style={{ color: "#4d8b52" }}>✓ No bids, vacancies or maintenance needs.</div>}
      {vacantSlots > 0 && (
        <div style={T.hudRow}>
          <span>
            🔑 {vacantSlots} vacancies in {vacantHouses} buildings
            {totalApps > 0 ? ` · ${totalApps} applicants` : " · no applicants"}
          </span>
          {totalApps > 0 ? (
            <button style={T.hudBtn} onClick={() => dispatch({ type: "LEASE_ALL" })}>
              Accept best
            </button>
          ) : (
            <button style={T.hudBtn2} onClick={() => openWindow("portfolio")}>
              Adjust rents →
            </button>
          )}
        </div>
      )}
      {expiring > 0 && (
        <div style={T.hudRow}>
          <span>📄 {expiring} contracts expire ≤3 mo</span>
          <button style={T.hudBtn} onClick={() => dispatch({ type: "RENEW_ALL", monthsLeft: 3 })}>
            Renew all
          </button>
        </div>
      )}
      {pendingJobs > 0 && (
        <div style={{ ...T.hudRow, color: "#7a5c2a" }}>
          <span>⏳ {pendingJobs} ordered jobs completing at upcoming month-ends</span>
        </div>
      )}
      {maintDebt > 0 && (
        <div style={T.hudRow}>
          <span style={{ color: poor.length > 0 ? "#b5542a" : "#666" }}>
            🔧 Maintenance debt {msek(maintDebt)} ({belowGood} buildings under condition {GOOD}
            {poor.length > 0 ? `, ${poor.length} urgent` : ""})
          </span>
          <button
            style={{ ...T.hudBtn, ...(state.cash < (poor.length > 0 ? poorCost : goodRoundCost) ? { opacity: 0.55 } : {}) }}
            title={
              poor.length > 0
                ? `Maintains the urgent ones (condition < ${POOR}) for ~${msek(poorCost)}. The whole debt ${msek(maintDebt)} is paid down in rounds.`
                : `One maintenance round (+15 condition) for all buildings under ${GOOD} – the whole debt is paid down in rounds.`
            }
            onClick={() => dispatch({ type: "MAINTAIN_ALL", threshold: poor.length > 0 ? POOR : GOOD })}
          >
            Maintain ({msek(poor.length > 0 ? poorCost : goodRoundCost)})
          </button>
        </div>
      )}
      <div style={{ ...T.hudRow, borderTop: "1px solid #eee", marginTop: 4, paddingTop: 8 }}>
        {unmanaged > 0 ? (
          <button style={T.hudBtn2} onClick={() => dispatch({ type: "MANAGE_ALL", managed: true })}>
            👔 Manager on all ({unmanaged})
          </button>
        ) : (
          <span style={{ color: "#888", fontSize: 11 }}>👔 Managers everywhere</span>
        )}
        <button style={T.hudBtn2} onClick={() => openWindow("tenants")}>
          Director →
        </button>
      </div>
    </div>
  );
}
