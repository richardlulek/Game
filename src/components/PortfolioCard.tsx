import { useState } from "react";
import { blockGap } from "../engine/blocks";
import { DISTRICTS, PROP_TYPES, UPGRADES } from "../engine/data";
import { workPaybackYears, workSpec, type WorkId } from "../engine/works";
import { propInsurancePremium } from "../engine/property";
import { canStartPhased, phaseCost, phasedTotalCost, phasedTotalMonths } from "../engine/phased";
import { loanTerms } from "../engine/finance";
import { kr, msek } from "../engine/format";
import { CONTRACTS, effectiveAskRent, maxCapacityFor } from "../engine/leasing";
import { pendingWork, propAnnualOpex, propInvestedCost, propMarketValue, propNOI, propPotentialRent, propStabilisedValue, propYieldOnCost } from "../engine/property";
import { buildingAge, isObsolete, obsolescenceFactor } from "../engine/lifecycle";
import { districtTier, maxDevLevel } from "../engine/districtTiers";
import { buildCostMult } from "../engine/progression";
import { QUICK_SALE_FACTOR, attractiveness, equityRecycle, interestChance, interestLabel } from "../engine/selling";
import type { GameAction, GameState, Property } from "../engine/types";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";
import { BuildingArt } from "./BuildingArt";
import { CondBar } from "./CondBar";

interface Props {
  p: Property;
  state: GameState;
  dispatch: (a: GameAction) => void;
  /** Bred layout: sektionerna flödar i flera kolumner i stället för ett
      smalt kort. Används i portföljlistans utfällda detaljvy. */
  wide?: boolean;
}

/* Vad varje åtgärd gör med hyra respektive värde – hämtas ur åtgärds-
   katalogen (engine/works.ts) så panelen och renoveringsprogrammet i
   Policy visar exakt samma tal. */
const FAMILY_TAG: Record<string, { t: string; c: string }> = {
  hyra:  { t: "RENT",  c: "#2a6a1a" },
  värde: { t: "VALUE", c: "#7a5c2a" },
  drift: { t: "COST",  c: "#2a4a6a" },
};

function workSummary(id: string): string {
  const w = workSpec(id as WorkId);
  if (!w) return "";
  return [
    w.rent ? `+${Math.round(w.rent * 100)}% rent` : null,
    w.value ? `+${Math.round(w.value * 100)}% value` : null,
    w.capacity ? `+${w.capacity} unit` : null,
    w.opex ? `−${Math.round(w.opex * 100)}% operating cost` : null,
    w.vacancy ? `−${Math.round(w.vacancy * 100)}% vacancy` : null,
    w.conditionTo ? `condition → ${w.conditionTo}` : w.condition ? `+${w.condition} condition` : null,
  ].filter(Boolean).join(" · ");
}

const RAISE_OPTIONS  = [5, 10, 20] as const;
const LOWER_OPTIONS  = [5, 10, 15] as const;
const DEMAND_LABELS  = ["Very low", "Low", "Medium", "High", "Very high"];

function demandLabel(d: number) {
  if (d < 0.5) return DEMAND_LABELS[0];
  if (d < 0.7) return DEMAND_LABELS[1];
  if (d < 0.85) return DEMAND_LABELS[2];
  if (d < 0.95) return DEMAND_LABELS[3];
  return DEMAND_LABELS[4];
}

function acceptProb(newRent: number, marketMo: number) {
  const r = newRent / marketMo;
  if (r < 1.0)  return { text: "Very low risk",  color: "#27660a", prob: 97 };
  if (r < 1.1)  return { text: "Low risk",       color: "#5a8a10", prob: 80 };
  if (r < 1.2)  return { text: "Medium risk",    color: "#c07f16", prob: 55 };
  if (r < 1.35) return { text: "High risk",      color: "#b04010", prob: 28 };
  return             { text: "Very high risk", color: "#c0392b", prob: 10 };
}

/** Nöjdhets-chip för en hyresgäst (U3). */
function satChip(sat: number): { icon: string; color: string } {
  if (sat >= 75) return { icon: "😀", color: "#27660a" };
  if (sat >= 50) return { icon: "🙂", color: "#7b8a2e" };
  if (sat >= 30) return { icon: "😐", color: "#c07f16" };
  return { icon: "☹️", color: "#c0392b" };
}

export function PortfolioCard({ p, state, dispatch, wide }: Props) {
  const [showDetails,        setShowDetails]        = useState(false);
  const [showRaiseTenantId,  setShowRaiseTenantId]  = useState<number | null>(null);
  const [showLowerTenantId,  setShowLowerTenantId]  = useState<number | null>(null);
  const [showMgrSettings,    setShowMgrSettings]    = useState(false);
  const [askPct,             setAskPct]             = useState(100);

  // ── Beräknade värden ────────────────────────────────────────────
  const value        = propMarketValue(p, state);
  const noi          = propNOI(p, state);
  const terms        = loanTerms(state);
  const district     = DISTRICTS.find((d) => d.id === p.district);
  const maintainCost = Math.round(value * 0.02);
  const maintPending = !!pendingWork(p, "underhåll");
  const canMaintain  = state.cash >= maintainCost && !state.gameOver && p.status !== "bygger" && !maintPending;

  // Yield on cost: driftnetto genom investerat kapital (inköp + förbättringar
  // och omkostnader) – avkastningen på pengarna du faktiskt lagt in.
  const invested    = propInvestedCost(p);
  const yieldPct    = propYieldOnCost(p, state) * 100;
  const marketYield = value > 0 ? (noi / value) * 100 : 0;
  // Vad vakansen kostar i VÄRDE (inte bara kassaflöde) – den nya
  // avkastningsvärderingens tydligaste konsekvens för spelaren.
  const vacancyValueGap = (propStabilisedValue(p, state) - value) / 1e6;
  const condIn3     = Math.max(10, Math.round(p.condition - 3 * 0.45));
  const totalEarned = p.totalEarnedRent ?? 0;
  const unrealGain  = value - invested;
  const cashOnCash  = invested > 0
    ? ((totalEarned + unrealGain) / invested) * 100
    : null;
  // Övervärdet som köpkraft (selling.equityRecycle) – visas när det är stort
  // nog att betyda något, så att omsättning av beståndet blir en synlig väg
  // och inte en hemlighet man måste räkna ut själv.
  const recycle = equityRecycle(p, state);

  // Kassaflödesanalys
  const grossRentMo  = p.tenants.reduce((s, t) => s + t.rent, 0);
  const opexMo       = propAnnualOpex(p, state) / 12;
  const portVal      = state.portfolio.reduce((a, x) => a + propMarketValue(x, state), 0);
  const propShare    = portVal > 0 ? value / portVal : 0;
  const interestMo   = (state.debt * propShare * (terms.rate / 100)) / 12;
  const netCashflow  = grossRentMo - opexMo - interestMo;

  const currentMgrSettings = p.managerSettings ?? { maintainThreshold: 45, rentTargetPct: 1.0, minTenantQuality: 0.8 };
  const directorActive = !!state.globalManager?.active;

  const slotPotential  = Math.round(propPotentialRent(p, state) / p.capacity / 12);
  const maxPossibleMo  = Math.round(propPotentialRent(p, state) / 12);
  const emptySlots     = p.capacity - p.tenants.length;
  const managerCostMo  = Math.max(2000, Math.round(grossRentMo * 0.03));

  // ── Under byggnation ─────────────────────────────────────────
  if (p.status === "bygger") {
    const progress = 1 - p.buildLeft / PROP_TYPES[p.type].buildMonths;
    return (
      <div style={card}>
        <CardHeader p={p} month={state.month} />
        <div style={valueRow}>
          <span style={valueText}>🏗️ Under construction</span>
        </div>
        <div style={statRow}>
          <Stat label="Area"  value={`${p.area} m²`} />
          <Stat label="Done"  value={`in ${p.buildLeft} mo`} />
          <Stat label="Value (now)" value={msek(value)} />
        </div>
        <div style={progressWrap}>
          <div style={{ ...progressFill, width: `${progress * 100}%` }} />
        </div>
        <div style={hint}>Done in {p.buildLeft} months · Reputation +5 · 20% lower vacancy on move-in.</div>
      </div>
    );
  }

  // Bred layout: tre tematiska kolumner (auto-fit → 1 kolumn i smalt kort,
  // 2–3 i utfälld lista). Smalt läge = vanlig vertikal stapling.
  const colGridStyle: React.CSSProperties = wide
    ? { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, alignItems: "start" }
    : undefined as unknown as React.CSSProperties;
  const colStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 };

  return (
    <div style={card}>
      <CardHeader p={p} managed={p.managed} month={state.month} wide={wide} />

      {/* ── Värde ──────────────────────────────────────────────── */}
      <div style={valueRow}>
        <span style={valueText}>{msek(value)}</span>
        <span style={subText}>market value</span>
      </div>

      {/* ── Helkvartersstatus (slutna kvarter) ─────────────────── */}
      {(() => {
        const gap = blockGap(p, state);
        if (gap === null) return null;
        return gap === 0 ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4757c8", margin: "2px 0 6px" }}>
            🏆 Whole block: +10% rent · −15% operating cost
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "#8291a3", margin: "2px 0 6px" }}>
            Block puzzle: {gap} {gap === 1 ? "property" : "properties"} left for the whole-block bonus.
          </div>
        );
      })()}

      {/* ── Snabbfakta rad 1 ───────────────────────────────────── */}
      <div style={statRow}>
        <Stat label="Area" value={`${p.area} m²`} />
        <StatBar label="Condition" c={p.condition} nextC={condIn3} />
        <Stat label="NOI/mo" value={kr(noi / 12)} color={noi >= 0 ? "#27660a" : "#c0392b"} />
      </div>

      {/* ── Snabbfakta rad 2 ───────────────────────────────────── */}
      <div style={{ ...statRow, marginTop: 8 }}>
        <Stat
          label="Yield on cost"
          value={`${yieldPct.toFixed(1)}%`}
          color={yieldPct >= 5 ? "#27660a" : yieldPct >= 3 ? "#c07f16" : "#c0392b"}
        />
        <Stat label="Invested" value={`$${(invested / 1e6).toFixed(1)}M`} />
        <Stat
          label="Unrealised gain"
          value={`${unrealGain >= 0 ? "+" : "−"}$${Math.abs(unrealGain / 1e6).toFixed(1)}M`}
          color={unrealGain >= 0 ? "#27660a" : "#c0392b"}
        />
        {cashOnCash !== null && (
          <Stat
            label="Total return"
            value={`${cashOnCash >= 0 ? "+" : ""}${cashOnCash.toFixed(0)}%`}
            color={cashOnCash >= 0 ? "#27660a" : "#c0392b"}
          />
        )}
      </div>
      <div style={{ fontSize: 10.5, color: "#8291a3", marginTop: 2 }}>
        Yield = NOI / (purchase {((p.purchasePrice ?? p.askPrice) / 1e6).toFixed(1)} M
        {(p.capexTotal ?? 0) > 0 ? ` + capex ${((p.capexTotal ?? 0) / 1e6).toFixed(1)} M` : ""})
        · {marketYield.toFixed(1)}% on market value
      </div>
      {recycle && (
        <div style={{ fontSize: 10.5, color: "#7a5c2a", marginTop: 3 }}>
          ${(recycle.uplift / 1e6).toFixed(1)}M of this value is gain you have never banked. Sold at
          market it frees about ${(recycle.net / 1e6).toFixed(1)}M in cash — at your {Math.round(recycle.ltv * 100)}%
          purchase leverage, the deposit on roughly {recycle.count} more {recycle.count === 1 ? "property" : "properties"}.
          Early on that is often the only way to grow: the rent alone will not save it up.
        </div>
      )}
      {vacancyValueGap > 0.05 && (
        <div style={{ fontSize: 10.5, color: "#c0392b", marginTop: 3 }}>
          Empty space is holding the value back by ~${vacancyValueGap.toFixed(1)}M — let it and the
          valuation follows.
        </div>
      )}

      {/* Avdelare mellan nyckeltalen ovan och inställningar/funktioner nedan. */}
      <div style={{ height: 1, background: "#cdd6e2", margin: "12px 0 14px" }} />

      {/* ── Kassaflöde & distriktsfakta (vikbar) – full bredd ovanför kolumnerna ── */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        style={detailToggleBtn}
      >
        {showDetails ? "▲ Hide analysis" : "▼ Cash flow & district facts"}
      </button>
      {showDetails && (
        <div style={detailBox}>
          <div style={sectionLabel}>Cash flow / mo</div>
          <CashRow label="Gross rent"      v={grossRentMo}    positive />
          <CashRow label="Operating cost"    v={-opexMo} />
          <CashRow label="≈ Interest portion"      v={-interestMo} />
          {p.managed && <CashRow label="Manager cost" v={-managerCostMo} />}
          <div style={{ height: 1, background: "#eedede", margin: "5px 0" }} />
          <CashRow label="Net cash flow" v={netCashflow} bold />

          {district && (
            <>
              <div style={{ ...sectionLabel, marginTop: 10 }}>District: {district.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                <Chip
                  label={`Growth ${district.growth >= 1 ? "+" : ""}${((district.growth - 1) * 100).toFixed(0)}%/yr`}
                  color={district.growth >= 1.05 ? "#27660a" : district.growth >= 1 ? "#5a8a10" : "#b04010"}
                />
                <Chip label={`Demand: ${demandLabel(district.demand)}`} color="#2a4a8a" />
                <Chip label={`Prestige ${district.prestige.toFixed(1)}×`} color="#5a2a7a" />
              </div>
            </>
          )}
        </div>
      )}

      <Divider />

      {/* ── Tematiska kolumner ───────────────────────────────────── */}
      <div style={colGridStyle}>
      {/* Kolumn 1 – Hyresgäst & förhandling */}
      <div style={colStyle}>
      {/* ── Hyresgäster ────────────────────────────────────────── */}
      <div style={sectionLabel}>Tenants</div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: emptySlots === 0 ? "#27660a" : "#7a4800" }}>
            {p.tenants.length} of {p.capacity} units leased
          </span>
          <span style={{ fontSize: 11, color: "#888" }}>
            {kr(grossRentMo)}/mo of max {kr(maxPossibleMo)}/mo
          </span>
        </div>
        <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
          {Array.from({ length: p.capacity }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: 6, borderRadius: 3,
                background: i < p.tenants.length ? BURGUNDY : "#e8d8d0",
              }}
            />
          ))}
        </div>
        {emptySlots > 0 && (
          <div style={{ fontSize: 11, color: "#a05000" }}>
            Untapped potential: +{kr(slotPotential * emptySlots)}/mo
          </div>
        )}
      </div>

      {/* ── Aktiva hyresgäster ─────────────────────────────────── */}
      {p.tenants.map((t) => {
        const rentVsMarket  = slotPotential > 0 ? t.rent / slotPotential : 1;
        const diffPct       = Math.round(Math.abs(rentVsMarket - 1) * 100);
        const marketChip    = rentVsMarket > 1.08
          ? { label: `+${diffPct}% above market`, color: "#27660a" }
          : rentVsMarket < 0.92
            ? { label: `−${diffPct}% below market`, color: "#c0392b" }
            : { label: "In line with market",         color: "#888" };

        const expiring = t.monthsLeft <= 12;
        const critical = t.monthsLeft <= 3;
        const showRaise = showRaiseTenantId === t.id;
        const showLower = showLowerTenantId === t.id;

        return (
          <div key={t.id} style={tenantBox}>
            {/* Tenant header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={tenantName}>{t.name}</span>
                  {t.veteran && <span style={{ fontSize: 11 }} title="Pillar tenant: loyal for five years or more — lower default risk">🏅</span>}
                  {t.profileName && <span style={profileTag}>{t.profileName}</span>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
                  <span style={tenantMeta}>{kr(t.rent)}/mo</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: marketChip.color }}>
                    {marketChip.label}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: satChip(t.satisfaction ?? 60).color }} title="Satisfaction: drives renewals and tolerance for rent increases">
                    {satChip(t.satisfaction ?? 60).icon} {t.satisfaction ?? 60}%
                  </span>
                  {t.anchorDeal && <span style={{ fontSize: 11 }} title="Anchor deal: lifts the whole block">⭐</span>}
                </div>
                <div style={{ ...tenantMeta, marginTop: 2, color: critical ? "#c05000" : "#888" }}>
                  {critical ? `⚠ expires in ${t.monthsLeft} mo` : expiring ? `⚠ ${t.monthsLeft} mo left` : `${t.monthsLeft} mo left`}
                  {" "}· {t.termTotal} mo contract · Risk {(t.defaultRisk * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {expiring && (
                <SmallBtn
                  label="Renew contract"
                  color="#27660a"
                  onClick={() => {
                    dispatch({ type: "RENEW_LEASE", id: p.id, tenantId: t.id });
                  }}
                  disabled={state.gameOver}
                />
              )}
              <SmallBtn
                label={showRaise ? "✕ Close" : "Raise rent"}
                color={BURGUNDY}
                onClick={() => {
                  setShowRaiseTenantId(showRaise ? null : t.id);
                  setShowLowerTenantId(null);
                }}
                disabled={state.gameOver}
              />
              <SmallBtn
                label={showLower ? "✕ Close" : "Lower rent"}
                color="#4a6aaa"
                onClick={() => {
                  setShowLowerTenantId(showLower ? null : t.id);
                  setShowRaiseTenantId(null);
                }}
                disabled={state.gameOver}
              />
              <SmallBtn
                label="Evict −3 rep"
                color="#a03010"
                onClick={() => dispatch({ type: "EVICT", id: p.id, tenantId: t.id })}
                disabled={state.gameOver}
              />
            </div>

            {/* ── Höj hyra ───────────────────────────────────── */}
            {showRaise && (
              <div style={subPanel}>
                <div style={sectionLabel}>Choose increase</div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                  Market rent: {kr(slotPotential)}/mo · Now: {kr(t.rent)}/mo
                </div>
                {RAISE_OPTIONS.map((pct) => {
                  const newR = Math.round(t.rent * (1 + pct / 100));
                  const risk = acceptProb(newR, slotPotential);
                  return (
                    <button
                      key={pct}
                      onClick={() => {
                        dispatch({ type: "RAISE_RENT", id: p.id, tenantId: t.id, increasePercent: pct });
                        setShowRaiseTenantId(null);
                      }}
                      disabled={state.gameOver}
                      style={rentOptionBtn(risk.color)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>+{pct}% → {kr(newR)}/mo</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: risk.color }}>{risk.prob}% chance</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginTop: 2 }}>
                        <span>+{kr(newR - t.rent)}/mo extra</span>
                        <span style={{ color: risk.color }}>{risk.text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Sänk hyra ──────────────────────────────────── */}
            {showLower && (
              <div style={subPanel}>
                <div style={sectionLabel}>Choose decrease</div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                  A rent cut is always accepted · Improves the chance they stay (reputation +0.5)
                </div>
                {LOWER_OPTIONS.map((pct) => {
                  const newR = Math.round(t.rent * (1 - pct / 100));
                  return (
                    <button
                      key={pct}
                      onClick={() => {
                        dispatch({ type: "LOWER_RENT", id: p.id, tenantId: t.id, decreasePercent: pct });
                        setShowLowerTenantId(null);
                      }}
                      disabled={state.gameOver}
                      style={rentOptionBtn("#4a6aaa")}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>−{pct}% → {kr(newR)}/mo</span>
                        <span style={{ fontSize: 12, color: "#4a6aaa" }}>−{kr(t.rent - newR)}/mo</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Uthyrning (U1): utgångshyra + ansökningsinkorg ─────── */}
      {emptySlots > 0 && !p.regulated && (
        <div style={vacantBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={vacantTitle}>
              {emptySlots} {emptySlots === 1 ? "vacant unit" : "vacant units"}
            </span>
            <span style={vacantSub}>Market rent {kr(slotPotential)}/mo</span>
          </div>
          {/* Utgångshyra: låg = kö av sökande, hög = glest och sämre mix.
              Utan egen inställning gäller bolagspolicyn. */}
          {(() => {
            const eff = effectiveAskRent(p, state);
            return (
              <div style={{ marginBottom: 6 }}>
                {/* Etikett + värde på egen rad → slidern i full bredd under, så
                    värdet aldrig trycks ut ur det smala kortet. */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, color: "#666" }}>
                    Asking rent{p.askRentPct === undefined ? " (policy)" : ""}
                  </span>
                  <strong style={{ fontSize: 12.5, whiteSpace: "nowrap", color: eff > 1.1 ? "#b5542a" : eff < 0.95 ? "#4d8b52" : "#333" }}>
                    {Math.round(eff * 100)}% · {kr(Math.round(slotPotential * eff))}
                  </strong>
                </div>
                <input
                  type="range"
                  min={80}
                  max={130}
                  step={5}
                  value={Math.round(eff * 100)}
                  onChange={(e) => dispatch({ type: "SET_ASK_RENT", id: p.id, pct: +e.target.value / 100 })}
                  style={{ width: "100%", accentColor: BURGUNDY }}
                />
              </div>
            );
          })()}
          {/* Inkomna ansökningar */}
          {(p.applications ?? []).length === 0 ? (
            <div style={{ fontSize: 12, color: "#8291a3", marginBottom: 6 }}>
              No applications yet — {(p.askRentPct ?? 1) > 1.05 ? "the asking rent is above market, lower it or wait" : "applicants usually appear within a month"}.
            </div>
          ) : (
            (p.applications ?? []).map((a) => (
              <div key={a.id} style={candidateBtn}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>
                    {a.tenant.name}
                    {a.anchorEligible ? " ⭐" : ""}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#27660a" }}>{kr(a.tenant.rent)}/mo</span>
                </div>
                <div style={{ fontSize: 11, color: "#888", margin: "2px 0 5px" }}>
                  {a.tenant.profileName ?? a.tenant.profile} · Quality {a.tenant.quality.toFixed(2)} · Risk {(a.tenant.defaultRisk * 100).toFixed(1)}%
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {(["kort", "standard", "långt"] as const).map((c) => (
                    <button
                      key={c}
                      title={CONTRACTS[c].desc}
                      onClick={() => dispatch({ type: "ACCEPT_APPLICATION", id: p.id, applicationId: a.id, contract: c })}
                      style={contractBtn}
                    >
                      {CONTRACTS[c].label}
                    </button>
                  ))}
                  {a.anchorEligible && (
                    <button
                      title={CONTRACTS["ankare"].desc}
                      onClick={() => dispatch({ type: "ACCEPT_APPLICATION", id: p.id, applicationId: a.id, contract: "ankare" })}
                      style={{ ...contractBtn, background: "#4757c8", borderColor: "#4757c8", color: "#fff" }}
                    >
                      Anchor ⭐
                    </button>
                  )}
                  <button
                    onClick={() => dispatch({ type: "REJECT_APPLICATION", id: p.id, applicationId: a.id })}
                    style={{ ...contractBtn, color: "#8291a3", borderColor: "#ddd" }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {(() => {
              const campaignOn = !!pendingWork(p, "kampanj");
              const canBoost = !campaignOn && state.cash >= 25000 && !state.gameOver;
              return (
                <button
                  onClick={() => dispatch({ type: "MARKET_BOOST", id: p.id })}
                  disabled={!canBoost}
                  style={{
                    padding: "6px 10px", borderRadius: 8, border: "1px solid #5a4aaa44",
                    background: canBoost ? "#5a4aaa18" : "#f5f5f5",
                    color: canBoost ? "#5a4aaa" : "#aaa",
                    fontSize: 12, fontWeight: 700, cursor: canBoost ? "pointer" : "default",
                  }}
                >
                  {campaignOn ? "⏳ Campaign running – response at month end" : "📣 Ad campaign 25k (3 applications next month)"}
                </button>
              );
            })()}
            <button
              onClick={() => dispatch({ type: "TOGGLE_BROKER", id: p.id })}
              style={{
                padding: "6px 10px", borderRadius: 8,
                border: `1px solid ${p.brokerMandate ? "#27660a" : "#ccc"}`,
                background: p.brokerMandate ? "#27660a14" : "#fff",
                color: p.brokerMandate ? "#27660a" : "#666",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              {p.brokerMandate ? "✓ Broker mandate active · 15k/mo" : "🤝 Broker mandate 15k/mo"}
            </button>
          </div>
        </div>
      )}
      {p.regulated && emptySlots > 0 && (
        <div style={{ ...vacantBox, borderColor: "#4d8b52" }}>
          <span style={{ fontSize: 12.5, color: "#27660a", fontWeight: 700 }}>
            🏛️ The housing queue assigns {emptySlots} {emptySlots === 1 ? "apartment" : "apartments"} next month.
          </span>
        </div>
      )}

      <Divider />

      </div>
      {/* Kolumn 2 – Investeringar & utveckling */}
      <div style={colStyle}>
      {/* ── Investeringar ───────────────────────────────────────── */}
      <div style={sectionLabel}>Investments</div>

      <ActionBtn
        label={maintPending ? "⏳ Maintenance in progress" : `🔧 Maintenance · ${msek(maintainCost)}`}
        sub={maintPending ? "+15 condition at month end – rent keeps flowing" : "+15 condition · reduces vacancy and rent loss"}
        color={canMaintain ? "#2a6a1a" : undefined}
        disabled={!canMaintain}
        onClick={() => dispatch({ type: "MAINTAIN", id: p.id })}
      />

      {UPGRADES.map((u) => {
        const done    = p.upgrades.includes(u.id);
        const pending = pendingWork(p, "uppgradering", u.id);
        const cost    = Math.round(value * u.cost);
        const canDo   = !done && !pending && state.cash >= cost && !state.gameOver;
        return (
          <ActionBtn
            key={u.id}
            label={done ? `✓ ${u.name}` : pending ? `⏳ ${u.name} in progress (${pending.monthsLeft} mo left)` : `${u.name} · ${msek(cost)}`}
            sub={
              pending
                ? "Tenants stay and pay rent during the work"
                : `${FAMILY_TAG[workSpec(u.id as WorkId)?.family ?? "drift"]?.t ?? ""} · ${workSummary(u.id) || u.desc}${
                    Number.isFinite(workPaybackYears(p, state, u.id as WorkId))
                      ? ` · pays for itself in ${workPaybackYears(p, state, u.id as WorkId).toFixed(1)} yr`
                      : ""
                  }`
            }
            color={done ? "#27660a" : canDo ? "#5a2a3a" : undefined}
            done={done}
            disabled={done || !canDo}
            onClick={() => dispatch({ type: "UPGRADE", id: p.id, upg: u.id })}
          />
        );
      })}

      {/* Etapprenovering: föryngring UTAN att tömma huset. */}
      {p.status === "klar" && (p.phased || canStartPhased(p)) && (
        p.phased ? (
          <ActionBtn
            label={`🔨 Phased renovation · stage ${p.phased.done + 1} of ${p.phased.total}`}
            sub={
              p.phased.monthsLeft > 0
                ? `${p.phased.monthsLeft} mo left on this stage · the unit being worked on pays half rent · click to stop after it`
                : `Waiting for cash — the next stage costs ${msek(phaseCost(p, state))}. Click to stop; what is done stays done.`
            }
            color="#7a5c2a"
            onClick={() => dispatch({ type: "STOP_PHASED", id: p.id })}
          />
        ) : (
          <ActionBtn
            label={`🔨 Phased renovation · ${msek(phasedTotalCost(p, state))}`}
            sub={`RENT · ${p.capacity} stages, ${phasedTotalMonths(p)} mo · age reset, condition 100, energy class A · nobody moves out, the unit under work pays half rent`}
            color="#5a2a3a"
            disabled={state.gameOver}
            onClick={() => dispatch({ type: "START_PHASED", id: p.id })}
          />
        )
      )}

      {/* ── Utvecklingsprojekt (kräver vakant fastighet) ─────────── */}
      {p.status === "klar" && (
        <>
          <div style={sectionLabel}>Development projects</div>
          {p.tenants.length > 0 && (
            <div style={{ fontSize: 11.5, color: "#8291a3", margin: "2px 0 6px" }}>
              Requires a vacant property — evict or wait out the contracts.
            </div>
          )}
          <ActionBtn
            label={`✨ Full renovation · ${msek(Math.round(value * 0.18))}`}
            sub="6 mo · condition 100, energy class A, +15% rent · resets building age"
            color="#7a5c2a"
            disabled={p.tenants.length > 0 || state.cash < value * 0.18 || state.gameOver}
            onClick={() => dispatch({ type: "START_RENOVATION", id: p.id, kind: "totalrenovering" })}
          />
          <ActionBtn
            label={`🏗️ Extension · ${msek(Math.round(value * 0.3))}`}
            sub={
              (p.devLevel ?? 0) >= maxDevLevel(state, p.district)
                ? `10 mo · +25% area, +1 unit, +20% value · height cap reached (${districtTier(state, p.district).name}) – lift the district to build higher`
                : "10 mo · +25% area, +1 unit, +20% value · the building rises on the map"
            }
            color="#7a5c2a"
            disabled={p.tenants.length > 0 || state.cash < value * 0.3 || state.gameOver}
            onClick={() => dispatch({ type: "START_RENOVATION", id: p.id, kind: "påbyggnad" })}
          />
          {/* Livscykel: rivning & nybyggnation för åldrade hus */}
          {(() => {
            const age = buildingAge(p, state);
            const obs = obsolescenceFactor(p, state);
            const redevCost = Math.round(p.area * PROP_TYPES[p.type].buildCostM2 * buildCostMult(state) * 1.1);
            const obsolete = isObsolete(p, state);
            if (age < 15) return null;
            return (
              <ActionBtn
                label={`🏙️ Demolish & rebuild · ${msek(redevCost)}`}
                sub={`Age ${age} yr${obsolete ? ` · outdated (−${Math.round((1 - obs) * 100)}% value)` : ""} · resets age, +15% area, +1 unit, energy class A`}
                color={obsolete ? BURGUNDY : "#7a5c2a"}
                disabled={p.tenants.length > 0 || state.cash < redevCost || state.gameOver}
                onClick={() => dispatch({ type: "REDEVELOP", id: p.id })}
              />
            );
          })()}
          {/* Lokalanpassning: single- vs multi-tenant */}
          {maxCapacityFor(p) > 1 && (
            <div style={{ margin: "4px 0 8px" }}>
              <div style={{ fontSize: 11.5, color: "#666", marginBottom: 4 }}>
                🔨 Unit conversion (3 mo): {p.capacity} {p.capacity === 1 ? "large unit" : "units"} today ·
                {p.capacity === 1 ? " premium rent +10%" : " risk spread"} · convert to:
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {Array.from({ length: maxCapacityFor(p) }, (_, i) => i + 1).map((target) => {
                  if (target === p.capacity) return null;
                  const cost = Math.max(150_000, Math.round(value * 0.04 * Math.abs(target - p.capacity)));
                  const blocked = p.tenants.length > target || state.cash < cost || state.gameOver;
                  return (
                    <button
                      key={target}
                      title={
                        p.tenants.length > target
                          ? `Requires at most ${target} leased (now ${p.tenants.length})`
                          : `${target === 1 ? "One large unit: +10% rent/m², −5% opex" : `${target} units`} · ${msek(cost)}`
                      }
                      disabled={blocked}
                      onClick={() => dispatch({ type: "START_RENOVATION", id: p.id, kind: "lokalanpassning", targetCapacity: target })}
                      style={{
                        ...contractBtn,
                        opacity: blocked ? 0.45 : 1,
                        cursor: blocked ? "default" : "pointer",
                      }}
                    >
                      {target === 1 ? "1 (premium)" : target} · {msek(cost)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <Divider />

      </div>
      {/* Kolumn 3 – Förvaltning, energi & försäljning */}
      <div style={colStyle}>
      {/* ── Förvaltning ─────────────────────────────────────────── */}
      <div style={sectionLabel}>Management</div>

      {p.type === "bostad" && (
        <ActionBtn
          label={p.regulated ? "✓ Enrolled in the housing queue" : "🏛️ Join the housing queue"}
          sub={
            p.regulated
              ? "Regulated rent −20% · zero vacancy · +goodwill. Click to leave."
              : "Regulated rent −20% but the queue fills all vacancies instantly and builds reputation."
          }
          color={p.regulated ? "#27660a" : "#2a4a6a"}
          disabled={state.gameOver}
          onClick={() => dispatch({ type: "TOGGLE_REGULATED", id: p.id })}
        />
      )}

      {/* Vem sköter huset just nu? Egen förvaltare > direktören > du själv. */}
      <div style={{ fontSize: 11.5, color: C.inkSoft, margin: "2px 0 6px" }}>
        Styrs av:{" "}
        <strong style={{ color: p.managed ? "#27660a" : directorActive ? "#2a4a6a" : "#7a5c2a" }}>
          {p.managed ? "own manager" : directorActive ? "the portfolio director" : "yourself"}
        </strong>
        {p.managed
          ? " — follows the instructions below."
          : directorActive
            ? " — follows the director's instructions (Policy tab)."
            : " — you renew contracts and order maintenance manually."}
      </div>
      <ActionBtn
        label={
          p.managed
            ? `✓ Manager hired · ${kr(managerCostMo)}/mo`
            : `👔 Hire manager · ${kr(managerCostMo)}/mo`
        }
        sub={
          p.managed
            ? `Auto-renews contracts and maintains at condition < ${currentMgrSettings.maintainThreshold}. Click to end.`
            : directorActive
              ? "The director already manages this property — an own manager is only needed for differing instructions (extra fee)."
              : "Auto-renews contracts at expiry and maintains automatically."
        }
        color={p.managed ? "#27660a" : "#2a4a6a"}
        disabled={state.gameOver}
        onClick={() => dispatch({ type: "TOGGLE_MANAGER", id: p.id })}
      />

      {p.managed && (
        <>
          <button
            onClick={() => setShowMgrSettings(!showMgrSettings)}
            style={detailToggleBtn}
          >
            {showMgrSettings ? "▲ Hide management instructions" : "▼ Adjust the manager's instructions"}
          </button>
          {showMgrSettings && (
            <div style={detailBox}>
              <div style={sectionLabel}>Maintenance threshold</div>
              <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 8 }}>
                The manager maintains automatically when condition drops below this level.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <input
                  type="range" min={20} max={100} step={5}
                  value={currentMgrSettings.maintainThreshold}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_MANAGER_SETTINGS",
                      id: p.id,
                      settings: { ...currentMgrSettings, maintainThreshold: +e.target.value },
                    })
                  }
                  style={{ flex: 1 }}
                />
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 26 }}>{currentMgrSettings.maintainThreshold}</span>
                <Chip
                  label={
                    currentMgrSettings.maintainThreshold <= 30 ? "Low standard" :
                    currentMgrSettings.maintainThreshold <= 55 ? "Standard" :
                    currentMgrSettings.maintainThreshold <= 85 ? "High standard" : "Top condition"
                  }
                  color={
                    currentMgrSettings.maintainThreshold <= 30 ? "#c07f16" :
                    currentMgrSettings.maintainThreshold <= 55 ? "#2a4a8a" : "#27660a"
                  }
                />
              </div>

              <div style={sectionLabel}>Rent target on renewal</div>
              <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 8 }}>
                Share of market rent the manager aims for. A target&nbsp;&gt;&nbsp;110% raises the risk the tenant leaves.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="range" min={80} max={130} step={5}
                  value={Math.round(currentMgrSettings.rentTargetPct * 100)}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_MANAGER_SETTINGS",
                      id: p.id,
                      settings: { ...currentMgrSettings, rentTargetPct: +e.target.value / 100 },
                    })
                  }
                  style={{ flex: 1 }}
                />
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 38 }}>{Math.round(currentMgrSettings.rentTargetPct * 100)}%</span>
                <Chip
                  label={
                    currentMgrSettings.rentTargetPct < 0.95 ? "Trygg" :
                    currentMgrSettings.rentTargetPct <= 1.05 ? "Marknad" :
                    currentMgrSettings.rentTargetPct <= 1.15 ? "Premium" : "Aggressiv"
                  }
                  color={
                    currentMgrSettings.rentTargetPct < 0.95 ? "#2a4a8a" :
                    currentMgrSettings.rentTargetPct <= 1.05 ? "#27660a" :
                    currentMgrSettings.rentTargetPct <= 1.15 ? "#c07f16" : "#c0392b"
                  }
                />
              </div>
              {currentMgrSettings.rentTargetPct > 1.10 && (
                <div style={{ fontSize: 11, color: "#c07f16", marginTop: 6 }}>
                  ⚠ Target {Math.round(currentMgrSettings.rentTargetPct * 100)}% — 60% chance tenants leave at renewal.
                </div>
              )}

              <div style={{ ...sectionLabel, marginTop: 14 }}>Min. tenant quality</div>
              <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 8 }}>
                The manager only signs applications of at least this quality.
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[0, 0.8, 0.9, 1.0].map((q) => {
                  const active = (currentMgrSettings.minTenantQuality ?? 0.8) === q;
                  return (
                    <button
                      key={q}
                      onClick={() =>
                        dispatch({
                          type: "SET_MANAGER_SETTINGS",
                          id: p.id,
                          settings: { ...currentMgrSettings, minTenantQuality: q },
                        })
                      }
                      style={{
                        padding: "3px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                        border: `1px solid ${active ? "#5a2a3a" : "#ccc"}`,
                        background: active ? "#5a2a3a" : "#fff",
                        color: active ? "#fff" : "#555",
                      }}
                    >
                      {q === 0 ? "All" : q.toFixed(2)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <Divider />

      {/* Insurance */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: p.insurance ? "#27660a" : C.inkSoft }}>
            {p.insurance ? "🛡️ Insured" : "⚠️ Not insured"}
          </span>
          <span style={{ fontSize: 11, color: C.inkSoft, marginLeft: 6 }}>
            {p.insurance ? `(${kr(propInsurancePremium(p, state))}/mo)` : "(fire, water, liability)"}
          </span>
        </div>
        <button
          style={{
            padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${p.insurance ? "#c0392b" : "#27660a"}`,
            background: "transparent", color: p.insurance ? "#c0392b" : "#27660a",
          }}
          disabled={state.gameOver || p.status !== "klar"}
          onClick={() => dispatch({ type: p.insurance ? "CANCEL_INSURANCE" : "BUY_INSURANCE", id: p.id })}
        >
          {p.insurance ? "Cancel" : "Buy"}
        </button>
      </div>

      {/* Energy upgrade */}
      {p.status === "klar" && (p.energyClass ?? "D") !== "A" && (() => {
        const CLASSES = ["F", "E", "D", "C", "B", "A"] as const;
        const COSTS: Record<string, number> = { F: 80_000, E: 120_000, D: 180_000, C: 250_000, B: 350_000 };
        const cur = (p.energyClass ?? "D") as string;
        const idx = CLASSES.indexOf(cur as (typeof CLASSES)[number]);
        const next = CLASSES[idx + 1];
        const cost = COSTS[cur] ?? 150_000;
        return (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft }}>
                ⚡ Energy upgrade: {cur} → {next}
              </span>
              <span style={{ fontSize: 11, color: C.inkSoft, marginLeft: 6 }}>
                +3% rent · +5 condition · −3% tax (class A)
              </span>
            </div>
            <button
              style={{
                padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700,
                border: `1px solid ${C.brass}`, background: "transparent", color: C.brass,
                cursor: pendingWork(p, "energi") ? "default" : "pointer",
                opacity: pendingWork(p, "energi") ? 0.6 : 1,
              }}
              disabled={state.gameOver || state.cash < cost || !!pendingWork(p, "energi")}
              onClick={() => dispatch({ type: "IMPROVE_ENERGY", id: p.id })}
            >
              {pendingWork(p, "energi") ? "⏳ in progress" : kr(cost)}
            </button>
          </div>
        );
      })()}

      {/* ── Försäljning: annonsera och invänta köpare, eller snabbsälj ── */}
      {p.forSale?.packageId != null ? (
        <div style={{ fontSize: 12, color: "#4757c8", fontWeight: 700, padding: "8px 10px", background: "#eef2f6", borderRadius: 6 }}>
          📦 Part of a sale package – managed in Company → Overview.
        </div>
      ) : p.forSale ? (
        (() => {
          const A = attractiveness(p, state);
          const chance = interestChance(A, p.forSale.ask, value, state.marketSentiment ?? 1);
          const il = interestLabel(chance);
          return (
            <div style={{ padding: "8px 10px", background: "#eef2f6", borderRadius: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4757c8" }}>
                🏷️ For sale at {msek(p.forSale.ask)}
              </div>
              <div style={{ fontSize: 11.5, marginTop: 2 }}>
                Buyer interest: <strong style={{ color: il.color }}>{il.label}</strong>
                {" · "}bids land in the 💼 inbox
              </div>
              <button
                style={{ ...contractBtn, marginTop: 6 }}
                onClick={() => dispatch({ type: "UNLIST", id: p.id })}
              >
                Remove from market
              </button>
            </div>
          );
        })()
      ) : (
        <>
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: C.inkSoft }}>Asking price</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                {msek(Math.round((value * askPct) / 100))} ({askPct}%)
              </span>
            </div>
            <input
              type="range" min={90} max={115} step={1}
              value={askPct}
              onChange={(e) => setAskPct(+e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          {(() => {
            const ask = Math.round((value * askPct) / 100);
            const chance = interestChance(attractiveness(p, state), ask, value, state.marketSentiment ?? 1);
            const il = interestLabel(chance);
            return (
              <ActionBtn
                label={`🏷️ List for sale · ${msek(ask)}`}
                sub={`Expected buyer interest: ${il.label} – good condition, high occupancy and the right price sell fast`}
                color="#3d54d8"
                disabled={state.gameOver}
                onClick={() => dispatch({ type: "LIST_FOR_SALE", id: p.id, ask })}
              />
            );
          })()}
          <ActionBtn
            label={`⚡ Quick sale · ${msek(Math.round(value * QUICK_SALE_FACTOR))}`}
            sub="Buyers pay immediately but take 15% off market value"
            color="#8a4a2a"
            disabled={state.gameOver}
            onClick={() => dispatch({ type: "SELL", id: p.id })}
          />
        </>
      )}
      </div>
      </div>
    </div>
  );
}

// ── Sub-komponenter ─────────────────────────────────────────────

const ESG_COLOR: Record<string, string> = { A: "#1a7a1a", B: "#2d8a2d", C: "#8a7a10", D: "#8a5a10", E: "#8a3010", F: "#7a1010" };

function CardHeader({ p, managed, month, wide }: { p: Property; managed?: boolean; month?: number; wide?: boolean }) {
  const esg = p.energyClass;
  return (
    <div style={wide ? { ...banner, maxHeight: undefined, height: 150 } : banner}>
      <BuildingArt p={p} month={month} cover={wide} />
      <div style={bannerOverlay}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={badge}>{p.typeLabel}</span>
          {managed && <span style={managedBadge}>🤝</span>}
          {esg && (
            <span style={{
              fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 3,
              background: ESG_COLOR[esg] ?? "#555", color: "#fff", letterSpacing: 0.5,
            }}>
              {esg}
            </span>
          )}
        </div>
        <span style={bannerDistrict}>{p.districtName}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={statLabel}>{label}</div>
      <div style={{ ...statValue, color: color ?? C.ink }}>{value}</div>
    </div>
  );
}

function StatBar({ label, c, nextC }: { label: string; c: number; nextC?: number }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={statLabel}>{label}</div>
      <CondBar c={c} />
      {nextC !== undefined && nextC < c - 0.5 && (
        <div style={{ fontSize: 10, color: C.inkSoft, marginTop: 1 }}>~{nextC} in 3 mo</div>
      )}
    </div>
  );
}

function CashRow({ label, v, positive, bold }: { label: string; v: number; positive?: boolean; bold?: boolean }) {
  const color = positive ? C.positive : v < 0 ? C.negative : C.ink;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
      <span style={{ color: C.inkSoft }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400, color }}>
        {v >= 0 ? "+" : ""}{kr(Math.round(v))}
      </span>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
      background: color + "18", color, border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 2, background: THEME.goldRule, opacity: 0.5, margin: "11px 0" }} />;
}

function SmallBtn({ label, color, onClick, disabled }: {
  label: string; color: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "5px 12px", borderRadius: 4,
        border: `1px solid ${disabled ? C.brassDim : color}`,
        background: disabled ? "#e3d8bf" : color + "1a",
        color: disabled ? C.inkSoft : color,
        fontWeight: 700, fontSize: 12, fontFamily: FONTS.body,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

interface ActionBtnProps {
  label: string; sub: string; color?: string;
  disabled?: boolean; done?: boolean; onClick: () => void;
}
function ActionBtn({ label, sub, color, disabled, done, onClick }: ActionBtnProps) {
  const bg     = disabled ? (done ? "#dfe9d6" : "#e3d8bf") : (color ? color + "1f" : "#dfe6f0");
  const border = disabled ? (done ? C.positive + "66" : C.brassDim) : (color ?? C.brassDim);
  const tc     = disabled ? (done ? C.positive : C.inkSoft) : (color ?? C.ink);
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "block", width: "100%", textAlign: "left",
      marginTop: 7, padding: "9px 12px", borderRadius: 4,
      border: `1px solid ${border}`, background: bg, fontFamily: FONTS.body,
      cursor: disabled ? "default" : "pointer",
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: tc }}>{label}</div>
      <div style={{ fontSize: 11, color: disabled ? C.inkSoft : C.inkSoft, marginTop: 2 }}>{sub}</div>
    </button>
  );
}

// ── Stilkonstanter ─────────────────────────────────────────────

const card: React.CSSProperties = {
  background: THEME.parchment, border: `1px solid ${C.brass}`, borderRadius: 6,
  padding: 16, color: C.ink,
  boxShadow: `${THEME.insetGold}, 0 6px 18px rgba(0,0,0,0.35)`,
};
const badge: React.CSSProperties = {
  background: BURGUNDY, color: C.brassBright, fontSize: 10, fontWeight: 700,
  letterSpacing: 1, textTransform: "uppercase",
  padding: "3px 9px", borderRadius: 3, border: `1px solid ${C.brass}99`,
};
const managedBadge: React.CSSProperties = {
  background: "rgba(47,125,63,0.95)", color: C.brassBright, fontSize: 12, fontWeight: 700,
  padding: "2px 6px", borderRadius: 4, border: `1px solid ${C.brass}99`,
};
const banner: React.CSSProperties = {
  position: "relative", margin: "-16px -16px 12px",
  borderRadius: "6px 6px 0 0", overflow: "hidden", maxHeight: 160,
  borderBottom: `2px solid ${C.brass}`,
};
const bannerOverlay: React.CSSProperties = {
  position: "absolute", left: 0, right: 0, bottom: 0,
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 12px",
  background: "linear-gradient(to top, rgba(20,12,4,0.6), rgba(20,12,4,0))",
};
const bannerDistrict: React.CSSProperties = {
  fontSize: 13, color: C.brassBright, fontWeight: 700, fontFamily: FONTS.heading,
  textShadow: "0 1px 3px rgba(0,0,0,0.7)",
};
const valueRow: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 };
const valueText: React.CSSProperties = { fontSize: 25, fontWeight: 800, color: C.ink, fontFamily: FONTS.heading };
const subText: React.CSSProperties = { fontSize: 12, color: C.inkSoft };
const statRow: React.CSSProperties = { display: "flex", gap: 12, marginBottom: 4 };
const statLabel: React.CSSProperties = {
  fontSize: 10, color: C.brassDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, fontWeight: 600,
};
const statValue: React.CSSProperties = { fontSize: 14, fontWeight: 700, fontFamily: FONTS.heading };

const detailToggleBtn: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  marginTop: 8, padding: "6px 0",
  background: "none", border: "none",
  fontSize: 12, color: C.inkSoft, cursor: "pointer", fontWeight: 600,
};
const detailBox: React.CSSProperties = {
  background: "#dfe6f0", border: `1px solid ${C.brassDim}`, borderRadius: 5,
  padding: "10px 12px", marginBottom: 4,
};
const subPanel: React.CSSProperties = {
  marginTop: 10, padding: "10px 12px",
  background: "#f0f4f9", borderRadius: 5, border: `1px solid ${C.brassDim}`,
};
const rentOptionBtn = (color: string): React.CSSProperties => ({
  display: "block", width: "100%", textAlign: "left",
  marginBottom: 6, padding: "8px 10px", borderRadius: 4,
  border: `1px solid ${color}66`, background: color + "14",
  cursor: "pointer", fontFamily: FONTS.body,
});
const candidateBtn: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  marginBottom: 6, padding: "9px 10px", borderRadius: 4,
  border: `1px solid ${C.brass}`, background: "#f0f4f9", cursor: "pointer",
};
const contractBtn: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 5,
  border: `1px solid ${C.brass}`, background: "#fff",
  color: "#5a2a3a", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONTS.body,
};

const tenantBox: React.CSSProperties = {
  background: "#dfe6f0", borderRadius: 5, padding: "10px 12px", marginBottom: 6,
  border: `1px solid ${C.brassDim}66`,
};
const tenantName: React.CSSProperties = { fontWeight: 700, fontSize: 14, color: BURGUNDY, fontFamily: FONTS.heading };
const profileTag: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: C.green, background: "#e2ecd9",
  padding: "1px 6px", borderRadius: 8, border: `1px solid ${C.green}44`,
};
const tenantMeta: React.CSSProperties = { fontSize: 12, color: C.inkSoft };
const vacantBox: React.CSSProperties = {
  background: "#f4ead2", border: `1px dashed ${C.brass}`,
  borderRadius: 5, padding: "10px 12px", marginBottom: 6,
};
const vacantTitle: React.CSSProperties = { fontWeight: 700, fontSize: 13, color: BURGUNDY };
const vacantSub: React.CSSProperties = { fontSize: 12, color: C.inkSoft };
const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: C.brassDim,
  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2,
};
const progressWrap: React.CSSProperties = {
  height: 8, background: "#d8c7a0", borderRadius: 4, overflow: "hidden", margin: "10px 0",
};
const progressFill: React.CSSProperties = {
  height: "100%", background: BURGUNDY, borderRadius: 4, transition: "width 0.3s",
};
const hint: React.CSSProperties = { fontSize: 12, color: C.inkSoft, marginTop: 4 };
