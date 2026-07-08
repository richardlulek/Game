import type { CSSProperties } from "react";
import type { Parcel } from "../engine/city";
import { expansionByBlock, hasAmbientBuilding, locationFactor, parcelById } from "../engine/city";
import { planFee, planMonths, rawLandPrice } from "../engine/cityPlan";
import { canUpgrade, orgLoadOf, tierForLevel, unlockLevelFor, unlockedWindows } from "../engine/company";
import { loanTerms } from "../engine/finance";
import { msek } from "../engine/format";
import { ambientAsk, ambientProfile } from "../engine/landDeals";
import { propMarketValue } from "../engine/property";
import type { GameState, Lot, PlanProcess, Property } from "../engine/types";
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
  samråd: "Samråd pågår",
  granskning: "Granskning pågår",
  överklagad: "Överklagad – hos domstolen",
};

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
      🔒 {label} – nivå {req.level}
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

  // Mark & privatägda hus – markstrategin direkt i kartan.
  if (sel.kind === "kommunal") {
    return (
      <div style={M.panel}>
        <div style={M.title}>Kommunal mark</div>
        <div style={M.sub}>Inhägnat expansionskvarter</div>
        <div style={{ ...M.row, color: "#777" }}>
          <span>Kommunen planlägger området och släpper det på detaljplaneauktion. Håll kassan redo.</span>
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
        <div style={M.title}>🌾 Planområde</div>
        <div style={M.sub}>Privat råmark · obyggbar tills detaljplan finns</div>
        {sel.areaState === "till-salu" && (
          <>
            <div style={M.row}>
              <span>Råmarkspris</span>
              <strong>{msek(price)}</strong>
            </div>
            <div style={M.row}>
              <span>Planavgift (senare)</span>
              <strong>{msek(fee)}</strong>
            </div>
            <div style={M.row}>
              <span>Planprocess</span>
              <strong>~{planMonths(blockId)} mån</strong>
            </div>
            <button
              style={M.btn}
              disabled={state.cash < price}
              onClick={() => dispatch({ type: "BUY_RAW_LAND", blockId })}
            >
              Köp råmarken {msek(price)}
            </button>
          </>
        )}
        {sel.areaState === "ägd" && (
          <>
            <div style={M.row}>
              <span>Råmarken</span>
              <strong style={{ color: "#4d8b52" }}>Din</strong>
            </div>
            <div style={M.row}>
              <span>Planavgift & utredningar</span>
              <strong>{msek(fee)}</strong>
            </div>
            <div style={{ ...M.row, color: "#999", fontSize: 12 }}>
              <span>Samråd, granskning… och kanske överklaganden. Gott anseende snabbar på processen.</span>
            </div>
            <button
              style={M.btn}
              disabled={state.cash < fee}
              onClick={() => dispatch({ type: "START_PLAN", blockId })}
            >
              Starta detaljplan {msek(fee)}
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
              <span>Klart om</span>
              <strong>~{sel.proc.monthsLeft} mån</strong>
            </div>
            {(sel.proc.parkParcels ?? []).length > 0 && (
              <div style={{ ...M.row, color: "#999", fontSize: 12 }}>
                <span>🌊 Strandskydd: {sel.proc.parkParcels!.length} tomt avstås som park</span>
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
        <div style={M.title}>{prof.typeLabel} · privatägd</div>
        <div style={M.sub}>
          Inte till salu — men allt har ett pris
        </div>
        <div style={M.row}>
          <span>Yta</span>
          <strong>{prof.area} m²</strong>
        </div>
        <div style={M.row}>
          <span>Skick</span>
          <strong>{prof.condition}</strong>
        </div>
        <LocationRow parcelId={sel.parcel.id} />
        <div style={M.row}>
          <span>Värdering</span>
          <strong>{msek(deal.value)}</strong>
        </div>
        <div style={M.row}>
          <span>Ägaren begär</span>
          <strong style={{ color: deal.holdout ? "#b5542a" : undefined }}>
            {msek(deal.ask)} (+{Math.round((deal.premium - 1) * 100)} %)
          </strong>
        </div>
        {deal.holdout && (
          <div style={{ ...M.row, color: "#b5542a", fontSize: 12 }}>
            <span>😤 Nejsägare — säljer bara mot rejäl överkurs</span>
          </div>
        )}
        <button
          style={M.btn}
          disabled={state.cash < down}
          title={state.cash < down ? `Kräver ${msek(down)} i handpenning` : `Handpenning ${msek(down)}`}
          onClick={() => dispatch({ type: "BUY_AMBIENT", parcelId: sel.parcel.id })}
        >
          Köp av ägaren {msek(deal.ask)}
        </button>
      </div>
    );
  }

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
          <ShortcutBtn id="build" label="Öppna Bygg" level={level} openWindow={openWindow} />
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
          {sel.kind === "rival" && (() => {
            // Direktbud på konkurrentens fastighet: ≥110 % övervägs,
            // ≥125 % accepteras alltid (samma regler som OFFER_TO_RIVAL).
            const ask = sel.prop.askPrice;
            const { maxLtv } = loanTerms(state);
            const mkBid = (mult: number) => Math.round((ask * mult) / 10_000) * 10_000;
            return (
              <>
                <div style={M.row}>
                  <span>Ägare</span>
                  <strong>{sel.owner}</strong>
                </div>
                <div style={M.row}>
                  <span>Värdering</span>
                  <strong>{msek(ask)}</strong>
                </div>
                <div style={{ ...M.row, color: "#999", fontSize: 12 }}>
                  <span>Inte till salu – men allt har ett pris</span>
                </div>
                {([[1.10, "Bud +10 %"], [1.25, "Bud +25 % (accepteras)"]] as const).map(([mult, label]) => {
                  const bid = mkBid(mult);
                  const down = bid * (1 - maxLtv);
                  return (
                    <button
                      key={mult}
                      style={mult === 1.25 ? M.btn : M.btn2}
                      disabled={state.cash < down}
                      title={state.cash < down ? `Kräver ${msek(down)} i handpenning` : `Handpenning ${msek(down)}`}
                      onClick={() =>
                        dispatch({ type: "OFFER_TO_RIVAL", competitorName: sel.owner, propertyId: sel.prop.id, amount: bid })
                      }
                    >
                      {label}: {msek(bid)}
                    </button>
                  );
                })}
                <ShortcutBtn id="acquisition" label="Öppna Förvärv (M&A)" level={level} openWindow={openWindow} />
              </>
            );
          })()}
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
  const poor = klar.filter((p) => p.condition < POOR);
  const poorCost = poor.reduce((a, p) => a + Math.round(propMarketValue(p, state) * 0.02), 0);
  // Underhållsskuld: uppskattad totalkostnad för att lyfta alla hus under
  // "gott skick" (70) dit – varje underhållsrunda ger +15 skick och
  // kostar 2 % av marknadsvärdet.
  const maintDebt = klar.reduce((a, p) => {
    if (p.condition >= GOOD) return a;
    const rounds = Math.ceil((GOOD - p.condition) / 15);
    return a + rounds * Math.round(propMarketValue(p, state) * 0.02);
  }, 0);
  const belowGood = klar.filter((p) => p.condition < GOOD).length;
  // En underhållsrunda (+15 skick) för alla hus under gott skick.
  const goodRoundCost = klar
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
        FÖRVALTNING · {klar.length} fastigheter
      </div>
      {offersCount > 0 && (
        <div style={{ ...T.hudRow, color: "#4757c8", fontWeight: 700 }}>
          <span>📨 {offersCount} bud väntar på svar</span>
          <button style={T.hudBtn} onClick={() => requestOpen("offers")}>
            Öppna inkorgen
          </button>
        </div>
      )}
      {up.qualified && (
        <div style={{ ...T.hudRow, color: "#4757c8", fontWeight: 700 }}>
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
      {nothing && <div style={{ color: "#4d8b52" }}>✓ Inga bud, vakanser eller underhållsbehov.</div>}
      {vacantSlots > 0 && (
        <div style={T.hudRow}>
          <span>
            🔑 {vacantSlots} vakanser i {vacantHouses} hus
            {totalApps > 0 ? ` · ${totalApps} sökande` : " · inga sökande"}
          </span>
          {totalApps > 0 ? (
            <button style={T.hudBtn} onClick={() => dispatch({ type: "LEASE_ALL" })}>
              Acceptera bästa
            </button>
          ) : (
            <button style={T.hudBtn2} onClick={() => openWindow("portfolio")}>
              Justera hyror →
            </button>
          )}
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
      {maintDebt > 0 && (
        <div style={T.hudRow}>
          <span style={{ color: poor.length > 0 ? "#b5542a" : "#666" }}>
            🔧 Underhållsskuld {msek(maintDebt)} ({belowGood} hus under skick {GOOD}
            {poor.length > 0 ? `, ${poor.length} akuta` : ""})
          </span>
          <button
            style={{ ...T.hudBtn, ...(state.cash < (poor.length > 0 ? poorCost : goodRoundCost) ? { opacity: 0.55 } : {}) }}
            title={
              poor.length > 0
                ? `Underhåller de akuta (skick < ${POOR}) för ca ${msek(poorCost)}. Hela skulden ${msek(maintDebt)} betas av i omgångar.`
                : `En underhållsrunda (+15 skick) för alla hus under ${GOOD} – hela skulden betas av i omgångar.`
            }
            onClick={() => dispatch({ type: "MAINTAIN_ALL", threshold: poor.length > 0 ? POOR : GOOD })}
          >
            Underhåll ({msek(poor.length > 0 ? poorCost : goodRoundCost)})
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
