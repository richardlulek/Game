import { useState } from "react";
import { DISTRICTS, PROP_TYPES, UPGRADES } from "../engine/data";
import { loanTerms } from "../engine/finance";
import { kr, msek } from "../engine/format";
import { makeTenant } from "../engine/generators";
import { propAnnualOpex, propMarketValue, propNOI, propPotentialRent } from "../engine/property";
import type { GameAction, GameState, Property, Tenant } from "../engine/types";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";
import { BuildingArt } from "./BuildingArt";
import { CondBar } from "./CondBar";

interface Props {
  p: Property;
  state: GameState;
  dispatch: (a: GameAction) => void;
}

const UPG_EFFECT: Record<string, string> = {
  renovering: "+18 % hyra · +35 skick",
  energi:     "−20 % driftkostnad · +10 skick",
  tillbygg:   "+25 % värde · +10 % hyra",
  smart:      "−30 % vakans",
};

const RAISE_OPTIONS  = [5, 10, 20] as const;
const LOWER_OPTIONS  = [5, 10, 15] as const;
const DEMAND_LABELS  = ["Mycket låg", "Låg", "Medel", "Hög", "Mycket hög"];

function demandLabel(d: number) {
  if (d < 0.5) return DEMAND_LABELS[0];
  if (d < 0.7) return DEMAND_LABELS[1];
  if (d < 0.85) return DEMAND_LABELS[2];
  if (d < 0.95) return DEMAND_LABELS[3];
  return DEMAND_LABELS[4];
}

function acceptProb(newRent: number, marketMo: number) {
  const r = newRent / marketMo;
  if (r < 1.0)  return { text: "Mycket låg risk",  color: "#27660a", prob: 97 };
  if (r < 1.1)  return { text: "Låg risk",         color: "#5a8a10", prob: 80 };
  if (r < 1.2)  return { text: "Medel risk",       color: "#b07010", prob: 55 };
  if (r < 1.35) return { text: "Hög risk",         color: "#b04010", prob: 28 };
  return             { text: "Mycket hög risk",  color: "#c0392b", prob: 10 };
}

function genCandidates(p: Property, state: GameState, enhanced = false): Tenant[] {
  const base  = propPotentialRent(p, state) / p.capacity;
  const count = enhanced ? 5 : 3;
  const pool  = Array.from({ length: count * 3 }, () =>
    makeTenant(base, state.demandMod, p.condition),
  );
  return enhanced
    ? pool.sort((a, b) => b.quality - a.quality).slice(0, count)
    : pool.slice(0, count);
}

export function PortfolioCard({ p, state, dispatch }: Props) {
  const [showDetails,       setShowDetails]       = useState(false);
  const [candidateSlot,     setCandidateSlot]     = useState<number | null>(null);
  const [candidates,        setCandidates]        = useState<Tenant[] | null>(null);
  const [marketingActive,   setMarketingActive]   = useState(false);
  const [showRaiseTenantId, setShowRaiseTenantId] = useState<number | null>(null);
  const [showLowerTenantId, setShowLowerTenantId] = useState<number | null>(null);

  // ── Beräknade värden ────────────────────────────────────────────
  const value        = propMarketValue(p, state);
  const noi          = propNOI(p, state);
  const terms        = loanTerms(state);
  const district     = DISTRICTS.find((d) => d.id === p.district);
  const maintainCost = Math.round(value * 0.02);
  const canMaintain  = state.cash >= maintainCost && !state.gameOver && p.status !== "bygger";

  const yieldPct    = value > 0 ? (noi / value) * 100 : 0;
  const condIn3     = Math.max(10, Math.round(p.condition - 3 * 0.45));
  const totalEarned = p.totalEarnedRent ?? 0;
  const unrealGain  = p.purchasePrice ? value - p.purchasePrice : 0;
  const cashOnCash  = p.purchasePrice
    ? ((totalEarned + unrealGain) / p.purchasePrice) * 100
    : null;

  // Kassaflödesanalys
  const grossRentMo  = p.tenants.reduce((s, t) => s + t.rent, 0);
  const opexMo       = propAnnualOpex(p, state) / 12;
  const portVal      = state.portfolio.reduce((a, x) => a + propMarketValue(x, state), 0);
  const propShare    = portVal > 0 ? value / portVal : 0;
  const interestMo   = (state.debt * propShare * (terms.rate / 100)) / 12;
  const netCashflow  = grossRentMo - opexMo - interestMo;

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
          <span style={valueText}>🏗️ Under byggnation</span>
        </div>
        <div style={statRow}>
          <Stat label="Yta"   value={`${p.area} m²`} />
          <Stat label="Klart" value={`om ${p.buildLeft} mån`} />
          <Stat label="Värde (nu)" value={msek(value)} />
        </div>
        <div style={progressWrap}>
          <div style={{ ...progressFill, width: `${progress * 100}%` }} />
        </div>
        <div style={hint}>Klart om {p.buildLeft} månader · Reputation +5 · 20 % lägre vakans vid inflyttning.</div>
      </div>
    );
  }

  return (
    <div style={card}>
      <CardHeader p={p} managed={p.managed} month={state.month} />

      {/* ── Värde ──────────────────────────────────────────────── */}
      <div style={valueRow}>
        <span style={valueText}>{msek(value)}</span>
        <span style={subText}>marknadsvärde</span>
      </div>

      {/* ── Snabbfakta rad 1 ───────────────────────────────────── */}
      <div style={statRow}>
        <Stat label="Yta" value={`${p.area} m²`} />
        <StatBar label="Skick" c={p.condition} nextC={condIn3} />
        <Stat label="NOI/mån" value={kr(noi / 12)} color={noi >= 0 ? "#27660a" : "#c0392b"} />
      </div>

      {/* ── Snabbfakta rad 2 ───────────────────────────────────── */}
      <div style={{ ...statRow, marginTop: 8 }}>
        <Stat
          label="Direktavk."
          value={`${yieldPct.toFixed(1)} %`}
          color={yieldPct >= 5 ? "#27660a" : yieldPct >= 3 ? "#b07010" : "#c0392b"}
        />
        {p.purchasePrice && (
          <Stat label="Köptes för" value={`${(p.purchasePrice / 1e6).toFixed(1)} Msek`} />
        )}
        {cashOnCash !== null && (
          <Stat
            label="Total avkastn."
            value={`${cashOnCash >= 0 ? "+" : ""}${cashOnCash.toFixed(0)} %`}
            color={cashOnCash >= 0 ? "#27660a" : "#c0392b"}
          />
        )}
      </div>

      {/* ── Kassaflöde & distrikt (vikbar) ─────────────────────── */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        style={detailToggleBtn}
      >
        {showDetails ? "▲ Dölj analys" : "▼ Kassaflöde & distriktsfakta"}
      </button>
      {showDetails && (
        <div style={detailBox}>
          <div style={sectionLabel}>Kassaflöde / mån</div>
          <CashRow label="Bruttohyra"      v={grossRentMo}    positive />
          <CashRow label="Driftkostnad"    v={-opexMo} />
          <CashRow label="≈ Räntedel"      v={-interestMo} />
          {p.managed && <CashRow label="Förvaltarkostnad" v={-managerCostMo} />}
          <div style={{ height: 1, background: "#eedede", margin: "5px 0" }} />
          <CashRow label="Nettokassaflöde" v={netCashflow} bold />

          {district && (
            <>
              <div style={{ ...sectionLabel, marginTop: 10 }}>Distrikt: {district.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                <Chip
                  label={`Tillväxt ${district.growth >= 1 ? "+" : ""}${((district.growth - 1) * 100).toFixed(0)} %/år`}
                  color={district.growth >= 1.05 ? "#27660a" : district.growth >= 1 ? "#5a8a10" : "#b04010"}
                />
                <Chip label={`Efterfrågan: ${demandLabel(district.demand)}`} color="#2a4a8a" />
                <Chip label={`Prestige ${district.prestige.toFixed(1)}×`} color="#5a2a7a" />
              </div>
            </>
          )}
        </div>
      )}

      <Divider />

      {/* ── Hyresgäster ────────────────────────────────────────── */}
      <div style={sectionLabel}>Hyresgäster</div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: emptySlots === 0 ? "#27660a" : "#7a4800" }}>
            {p.tenants.length} av {p.capacity} platser uthyrda
          </span>
          <span style={{ fontSize: 11, color: "#888" }}>
            {kr(grossRentMo)}/mån av max {kr(maxPossibleMo)}/mån
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
            Outnyttjad potential: +{kr(slotPotential * emptySlots)}/mån
          </div>
        )}
      </div>

      {/* ── Aktiva hyresgäster ─────────────────────────────────── */}
      {p.tenants.map((t) => {
        const rentVsMarket  = slotPotential > 0 ? t.rent / slotPotential : 1;
        const diffPct       = Math.round(Math.abs(rentVsMarket - 1) * 100);
        const marketChip    = rentVsMarket > 1.08
          ? { label: `+${diffPct}% över marknad`, color: "#27660a" }
          : rentVsMarket < 0.92
            ? { label: `−${diffPct}% under marknad`, color: "#c0392b" }
            : { label: "I nivå med marknad",         color: "#888" };

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
                  {t.profileName && <span style={profileTag}>{t.profileName}</span>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
                  <span style={tenantMeta}>{kr(t.rent)}/mån</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: marketChip.color }}>
                    {marketChip.label}
                  </span>
                </div>
                <div style={{ ...tenantMeta, marginTop: 2, color: critical ? "#c05000" : "#888" }}>
                  {critical ? `⚠ löper ut om ${t.monthsLeft} mån` : expiring ? `⚠ ${t.monthsLeft} mån kvar` : `${t.monthsLeft} mån kvar`}
                  {" "}· {t.termTotal} mån kontrakt · Risk {(t.defaultRisk * 100).toFixed(1)} %
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {expiring && (
                <SmallBtn
                  label="Förläng kontrakt"
                  color="#27660a"
                  onClick={() => {
                    dispatch({ type: "RENEW_LEASE", id: p.id, tenantId: t.id });
                  }}
                  disabled={state.gameOver}
                />
              )}
              <SmallBtn
                label={showRaise ? "✕ Stäng" : "Höj hyran"}
                color={BURGUNDY}
                onClick={() => {
                  setShowRaiseTenantId(showRaise ? null : t.id);
                  setShowLowerTenantId(null);
                }}
                disabled={state.gameOver}
              />
              <SmallBtn
                label={showLower ? "✕ Stäng" : "Sänk hyran"}
                color="#4a6aaa"
                onClick={() => {
                  setShowLowerTenantId(showLower ? null : t.id);
                  setShowRaiseTenantId(null);
                }}
                disabled={state.gameOver}
              />
              <SmallBtn
                label="Säg upp −3 rep"
                color="#a03010"
                onClick={() => dispatch({ type: "EVICT", id: p.id, tenantId: t.id })}
                disabled={state.gameOver}
              />
            </div>

            {/* ── Höj hyra ───────────────────────────────────── */}
            {showRaise && (
              <div style={subPanel}>
                <div style={sectionLabel}>Välj höjning</div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                  Marknadshyra: {kr(slotPotential)}/mån · Nu: {kr(t.rent)}/mån
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
                        <span style={{ fontWeight: 700, fontSize: 13 }}>+{pct}% → {kr(newR)}/mån</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: risk.color }}>{risk.prob}% chans</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginTop: 2 }}>
                        <span>+{kr(newR - t.rent)}/mån extra</span>
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
                <div style={sectionLabel}>Välj sänkning</div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                  Sänkt hyra accepteras alltid · Ökar chansen att stanna (reputation +0,5)
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
                        <span style={{ fontWeight: 700, fontSize: 13 }}>−{pct}% → {kr(newR)}/mån</span>
                        <span style={{ fontSize: 12, color: "#4a6aaa" }}>−{kr(t.rent - newR)}/mån</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Lediga platser ─────────────────────────────────────── */}
      {Array.from({ length: emptySlots }).map((_, i) => {
        const slotIndex   = p.tenants.length + i;
        const isPicking   = candidateSlot === slotIndex && candidates !== null;
        return (
          <div key={`empty-${i}`} style={vacantBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={vacantTitle}>Ledig plats</span>
              <span style={vacantSub}>Potential {kr(slotPotential)}/mån</span>
            </div>

            {isPicking ? (
              <div>
                <div style={{ ...sectionLabel, marginBottom: 6 }}>
                  {marketingActive ? "5 kvalificerade kandidater (kampanj aktiv)" : "Välj hyresgäst"}
                </div>
                {candidates!.map((t, ci) => (
                  <button
                    key={ci}
                    onClick={() => {
                      dispatch({ type: "LEASE_TENANT", id: p.id, tenant: t });
                      setCandidates(null);
                      setCandidateSlot(null);
                      setMarketingActive(false);
                    }}
                    style={candidateBtn}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>{t.name}</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#27660a" }}>{kr(t.rent)}/mån</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                      {t.termTotal} mån kontrakt · Kvalitet {t.quality.toFixed(2)} · Risk {(t.defaultRisk * 100).toFixed(1)} %
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => { setCandidates(null); setCandidateSlot(null); }}
                  style={{ fontSize: 12, color: "#999", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}
                >
                  Avvisa alla
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    setCandidates(genCandidates(p, state, marketingActive));
                    setCandidateSlot(slotIndex);
                  }}
                  disabled={state.gameOver}
                  style={showCandidatesBtn}
                >
                  {marketingActive ? "📣 Visa 5 kvalificerade kandidater" : "Välj hyresgäst →"}
                </button>
                {!marketingActive && (
                  <button
                    onClick={() => {
                      if (state.cash >= 25000 && !state.gameOver) {
                        dispatch({ type: "MARKET_BOOST", id: p.id });
                        setMarketingActive(true);
                      }
                    }}
                    disabled={state.cash < 25000 || state.gameOver}
                    style={{
                      padding: "7px 10px", borderRadius: 8, border: "1px solid #5a4aaa44",
                      background: state.cash >= 25000 ? "#5a4aaa18" : "#f5f5f5",
                      color: state.cash >= 25000 ? "#5a4aaa" : "#aaa",
                      fontSize: 12, fontWeight: 700, cursor: state.cash >= 25000 ? "pointer" : "default",
                    }}
                  >
                    📣 Kampanj 25 k
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <Divider />

      {/* ── Investeringar ───────────────────────────────────────── */}
      <div style={sectionLabel}>Investeringar</div>

      <ActionBtn
        label={`🔧 Underhåll · ${msek(maintainCost)}`}
        sub="+15 skick · minskar vakans och hyrestapp"
        color={canMaintain ? "#2a6a1a" : undefined}
        disabled={!canMaintain}
        onClick={() => dispatch({ type: "MAINTAIN", id: p.id })}
      />

      {UPGRADES.map((u) => {
        const done  = p.upgrades.includes(u.id);
        const cost  = Math.round(value * u.cost);
        const canDo = !done && state.cash >= cost && !state.gameOver;
        return (
          <ActionBtn
            key={u.id}
            label={done ? `✓ ${u.name}` : `${u.name} · ${msek(cost)}`}
            sub={UPG_EFFECT[u.id] ?? u.desc}
            color={done ? "#27660a" : canDo ? "#5a2a3a" : undefined}
            done={done}
            disabled={done || !canDo}
            onClick={() => dispatch({ type: "UPGRADE", id: p.id, upg: u.id })}
          />
        );
      })}

      <Divider />

      {/* ── Förvaltning ─────────────────────────────────────────── */}
      <div style={sectionLabel}>Förvaltning</div>

      <ActionBtn
        label={
          p.managed
            ? `✓ Förvaltare anställd · ${kr(managerCostMo)}/mån`
            : `👔 Anställ förvaltare · ${kr(managerCostMo)}/mån`
        }
        sub={
          p.managed
            ? "Auto-förnyar kontrakt och underhåller vid skick < 45. Klicka för att avsluta."
            : "Auto-förnyar kontrakt vid utgång och underhåller automatiskt."
        }
        color={p.managed ? "#27660a" : "#2a4a6a"}
        disabled={state.gameOver}
        onClick={() => dispatch({ type: "TOGGLE_MANAGER", id: p.id })}
      />

      <Divider />

      <ActionBtn
        label={`Sälj fastighet · ${msek(value)}`}
        sub="Realiserar vinst/förlust mot inköpspris"
        color="#7a5a00"
        disabled={state.gameOver}
        onClick={() => dispatch({ type: "SELL", id: p.id })}
      />
    </div>
  );
}

// ── Sub-komponenter ─────────────────────────────────────────────

function CardHeader({ p, managed, month }: { p: Property; managed?: boolean; month?: number }) {
  return (
    <div style={banner}>
      <BuildingArt p={p} month={month} />
      <div style={bannerOverlay}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={badge}>{p.typeLabel}</span>
          {managed && <span style={managedBadge}>🤝</span>}
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
        <div style={{ fontSize: 10, color: C.inkSoft, marginTop: 1 }}>~{nextC} om 3 mån</div>
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
  const bg     = disabled ? (done ? "#dfe9d6" : "#e3d8bf") : (color ? color + "1f" : "#ece0c6");
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
  background: "#ece0c6", border: `1px solid ${C.brassDim}`, borderRadius: 5,
  padding: "10px 12px", marginBottom: 4,
};
const subPanel: React.CSSProperties = {
  marginTop: 10, padding: "10px 12px",
  background: "#fbf5e6", borderRadius: 5, border: `1px solid ${C.brassDim}`,
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
  border: `1px solid ${C.brass}`, background: "#fbf5e6", cursor: "pointer",
};
const showCandidatesBtn: React.CSSProperties = {
  padding: "7px 12px", borderRadius: 4,
  border: `1px solid ${C.brass}`, background: BURGUNDY,
  color: C.brassBright, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONTS.body,
};

const tenantBox: React.CSSProperties = {
  background: "#ece0c6", borderRadius: 5, padding: "10px 12px", marginBottom: 6,
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
