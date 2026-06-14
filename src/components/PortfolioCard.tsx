import { useState } from "react";
import { PROP_TYPES, UPGRADES } from "../engine/data";
import { kr, msek } from "../engine/format";
import { makeTenant } from "../engine/generators";
import { propMarketValue, propNOI, propPotentialRent } from "../engine/property";
import type { GameAction, GameState, Property, Tenant } from "../engine/types";
import { BURGUNDY } from "../styles/tokens";
import { CondBar } from "./CondBar";

interface Props {
  p: Property;
  state: GameState;
  dispatch: (action: GameAction) => void;
}

const UPG_EFFECT: Record<string, string> = {
  renovering: "+18 % hyra · +35 skick",
  energi:     "−20 % driftkostnad · +10 skick",
  tillbygg:   "+25 % värde · +10 % hyra",
  smart:      "−30 % vakans",
};

const RAISE_OPTIONS = [5, 10, 20] as const;

// Beräknar acceptanssannolikhet (speglar reducer-logiken exakt)
function riskLabel(newRent: number, marketMo: number): { text: string; color: string; prob: number } {
  const r = newRent / marketMo;
  if (r < 1.0)  return { text: "Mycket låg risk",  color: "#27660a", prob: 97 };
  if (r < 1.1)  return { text: "Låg risk",         color: "#5a8a10", prob: 80 };
  if (r < 1.2)  return { text: "Medel risk",       color: "#b07010", prob: 55 };
  if (r < 1.35) return { text: "Hög risk",         color: "#b04010", prob: 28 };
  return             { text: "Mycket hög risk",  color: "#c0392b", prob: 10 };
}

// Genererar 3 hyresgästkandidater per plats (baseRent proportionellt per kapacitetsplats)
function genCandidates(p: Property, state: GameState): Tenant[] {
  const base = propPotentialRent(p, state) / p.capacity;
  return Array.from({ length: 3 }, () => makeTenant(base, state.demandMod, p.condition));
}

export function PortfolioCard({ p, state, dispatch }: Props) {
  const [candidateSlot, setCandidateSlot] = useState<number | null>(null); // which empty slot index is picking
  const [candidates, setCandidates] = useState<Tenant[] | null>(null);
  const [showRaiseTenantId, setShowRaiseTenantId] = useState<number | null>(null);

  const value        = propMarketValue(p, state);
  const noi          = propNOI(p, state);
  const maintainCost = Math.round(value * 0.02);
  const canMaintain  = state.cash >= maintainCost && !state.gameOver && p.status !== "bygger";
  const yieldPct     = value > 0 ? (noi / value) * 100 : 0;
  const condIn3      = Math.max(10, Math.round(p.condition - 3 * 0.45));
  const totalEarned  = p.totalEarnedRent ?? 0;
  const unrealGain   = p.purchasePrice ? value - p.purchasePrice : 0;
  const totalReturn  = totalEarned + unrealGain;
  const cashOnCash   = p.purchasePrice && p.purchasePrice > 0
    ? (totalReturn / p.purchasePrice) * 100 : null;

  // ── Under byggnation ─────────────────────────────────────────
  if (p.status === "bygger") {
    const progress = 1 - p.buildLeft / PROP_TYPES[p.type].buildMonths;
    return (
      <div style={card}>
        <CardHeader p={p} />
        <div style={valueRow}>
          <span style={valueText}>🏗️ Under byggnation</span>
          <span style={subText}>{p.buildLeft} månader kvar</span>
        </div>
        <div style={statRow}>
          <Stat label="Yta" value={`${p.area} m²`} />
          <Stat label="Klart" value={`om ${p.buildLeft} mån`} />
        </div>
        <div style={progressWrap}>
          <div style={{ ...progressFill, width: `${progress * 100}%` }} />
        </div>
        <div style={hint}>Nybygget är klart och hyresklart om {p.buildLeft} månader.</div>
      </div>
    );
  }

  const marketMo = propPotentialRent(p, state) / 12;
  const slotPotential = Math.round(propPotentialRent(p, state) / p.capacity / 12);
  const emptySlots = p.capacity - p.tenants.length;
  const totalActualIncome = p.tenants.reduce((s, t) => s + t.rent, 0);
  const maxPossibleIncome = Math.round(marketMo);

  return (
    <div style={card}>
      <CardHeader p={p} />

      {/* Marknadsvärde */}
      <div style={valueRow}>
        <span style={valueText}>{msek(value)}</span>
        <span style={subText}>marknadsvärde</span>
      </div>

      {/* Snabbfakta rad 1 */}
      <div style={statRow}>
        <Stat label="Yta" value={`${p.area} m²`} />
        <StatBar label="Skick" c={p.condition} nextC={condIn3} />
        <Stat label="NOI/mån" value={kr(noi / 12)} color={noi >= 0 ? "#27660a" : "#c0392b"} />
      </div>
      {/* Snabbfakta rad 2 */}
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

      <Divider />

      {/* ── Kapacitetsindikator ──────────────────────────────── */}
      <div style={sectionLabel}>Hyresgäster</div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: p.tenants.length === p.capacity ? "#27660a" : "#7a4800" }}>
            {p.tenants.length} av {p.capacity} platser uthyrda
          </span>
          <span style={{ fontSize: 11, color: "#888" }}>
            {kr(totalActualIncome)}/mån av max {kr(maxPossibleIncome)}/mån
          </span>
        </div>
        {/* Kapacitetsstapel */}
        <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
          {Array.from({ length: p.capacity }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: i < p.tenants.length ? BURGUNDY : "#e8d8d0",
              }}
            />
          ))}
        </div>
        {emptySlots > 0 && (
          <div style={{ fontSize: 11, color: "#a05000" }}>
            Ytterligare potential: +{kr(slotPotential * emptySlots)}/mån
          </div>
        )}
      </div>

      {/* ── Hyresgästplatser ────────────────────────────────── */}
      {p.tenants.map((t) => {
        const contractExpiring = t.monthsLeft <= 12;
        const showRaise = showRaiseTenantId === t.id;
        return (
          <div key={t.id} style={tenantBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div>
                <div style={tenantName}>{t.name}</div>
                <div style={tenantMeta}>
                  {kr(t.rent)}/mån ·{" "}
                  <span style={{ color: contractExpiring ? "#c05000" : "#666" }}>
                    {contractExpiring
                      ? `⚠ kontrakt löper ut om ${t.monthsLeft} mån`
                      : `${t.monthsLeft} mån kvar`}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {contractExpiring && (
                <SmallBtn
                  label="Förläng kontrakt"
                  color="#27660a"
                  onClick={() => dispatch({ type: "RENEW_LEASE", id: p.id, tenantId: t.id })}
                  disabled={state.gameOver}
                />
              )}
              <SmallBtn
                label={showRaise ? "Stäng" : "Höj hyran"}
                color={BURGUNDY}
                onClick={() => setShowRaiseTenantId(showRaise ? null : t.id)}
                disabled={state.gameOver}
              />
              <SmallBtn
                label="Säg upp  −3 rep"
                color="#a03010"
                onClick={() => dispatch({ type: "EVICT", id: p.id, tenantId: t.id })}
                disabled={state.gameOver}
              />
            </div>

            {/* ── Höj hyra-panel ─────────────────────────── */}
            {showRaise && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: "#fff", borderRadius: 8, border: "1px solid #e8d8d0" }}>
                <div style={sectionLabel}>Välj hur mycket du vill höja</div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                  Marknadshyra: {kr(Math.round(slotPotential))}/mån · Nu: {kr(t.rent)}/mån
                </div>
                {RAISE_OPTIONS.map((pct) => {
                  const newR  = Math.round(t.rent * (1 + pct / 100));
                  const risk  = riskLabel(newR, slotPotential);
                  const canDo = state.cash >= 0 && !state.gameOver;
                  return (
                    <button
                      key={pct}
                      onClick={() => {
                        dispatch({ type: "RAISE_RENT", id: p.id, tenantId: t.id, increasePercent: pct });
                        setShowRaiseTenantId(null);
                      }}
                      disabled={!canDo}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        marginBottom: 6,
                        padding: "8px 10px",
                        borderRadius: 7,
                        border: `1px solid ${risk.color}44`,
                        background: risk.color + "0f",
                        cursor: canDo ? "pointer" : "default",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>+{pct}%  →  {kr(newR)}/mån</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: risk.color }}>{risk.prob}% chans</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginTop: 2 }}>
                        <span>{newR > t.rent ? `+${kr(newR - t.rent)}/mån extra` : ""}</span>
                        <span style={{ color: risk.color }}>{risk.text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Lediga platser ──────────────────────────────────── */}
      {Array.from({ length: emptySlots }).map((_, i) => {
        const slotIndex = p.tenants.length + i;
        const isPickingThis = candidateSlot === slotIndex && candidates !== null;
        return (
          <div key={`empty-${i}`} style={vacantBox}>
            <div style={vacantTitle}>Ledig plats</div>
            <div style={vacantSub}>Potential: {kr(slotPotential)}/mån</div>

            {isPickingThis ? (
              <div>
                <div style={{ ...sectionLabel, marginBottom: 6 }}>Välj hyresgäst</div>
                {candidates!.map((t, ci) => (
                  <button
                    key={ci}
                    onClick={() => {
                      dispatch({ type: "LEASE_TENANT", id: p.id, tenant: t });
                      setCandidates(null);
                      setCandidateSlot(null);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      marginBottom: 6,
                      padding: "9px 10px",
                      borderRadius: 8,
                      border: `1px solid ${BURGUNDY}33`,
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>{t.name}</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#27660a" }}>{kr(t.rent)}/mån</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                      Kontrakt: {t.termTotal} mån · Kvalitet: {t.quality.toFixed(2)} · Risk: {(t.defaultRisk * 100).toFixed(1)} %
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => { setCandidates(null); setCandidateSlot(null); }}
                  style={{ fontSize: 12, color: "#999", background: "none", border: "none", cursor: "pointer", marginTop: 2 }}
                >
                  Avvisa alla
                </button>
              </div>
            ) : (
              <ActionBtn
                label="Välj hyresgäst"
                sub="Se 3 kandidater med olika hyra, kontrakt och risk"
                color={BURGUNDY}
                disabled={state.gameOver}
                onClick={() => {
                  setCandidates(genCandidates(p, state));
                  setCandidateSlot(slotIndex);
                }}
              />
            )}
          </div>
        );
      })}

      <Divider />

      {/* ── Investeringar ────────────────────────────────────── */}
      <div style={sectionLabel}>Investeringar</div>

      <ActionBtn
        label={`🔧 Underhåll  · ${msek(maintainCost)}`}
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
            label={done ? `✓ ${u.name}` : `${u.name}  · ${msek(cost)}`}
            sub={UPG_EFFECT[u.id] ?? u.desc}
            color={done ? "#27660a" : canDo ? "#5a2a3a" : undefined}
            done={done}
            disabled={done || !canDo}
            onClick={() => dispatch({ type: "UPGRADE", id: p.id, upg: u.id })}
          />
        );
      })}

      <Divider />

      <ActionBtn
        label={`Sälj fastighet  · ${msek(value)}`}
        sub="Realiserar vinst/förlust mot inköpspris"
        color="#7a5a00"
        disabled={state.gameOver}
        onClick={() => dispatch({ type: "SELL", id: p.id })}
      />
    </div>
  );
}

// ── Sub-komponenter ────────────────────────────────────────────

function CardHeader({ p }: { p: Property }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <span style={badge}>{p.typeLabel}</span>
      <span style={districtText}>{p.districtName}</span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={statLabel}>{label}</div>
      <div style={{ ...statValue, color: color ?? "#1a1a1a" }}>{value}</div>
    </div>
  );
}

function StatBar({ label, c, nextC }: { label: string; c: number; nextC?: number }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={statLabel}>{label}</div>
      <CondBar c={c} />
      {nextC !== undefined && nextC < c - 0.5 && (
        <div style={{ fontSize: 10, color: "#bbb", marginTop: 1 }}>~{nextC} om 3 mån</div>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#f0ece8", margin: "10px 0" }} />;
}

function SmallBtn({
  label, color, onClick, disabled,
}: {
  label: string; color: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "5px 12px",
        borderRadius: 6,
        border: `1px solid ${color}44`,
        background: color + "15",
        color: disabled ? "#aaa" : color,
        fontWeight: 700,
        fontSize: 12,
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
  const bg     = disabled ? (done ? "#eef5ee" : "#f5f5f5") : (color ? color + "18" : "#f5f0ed");
  const border = disabled ? (done ? "#27660a33" : "#e8e8e8") : (color ? color + "55" : "#ddd");
  const tc     = disabled ? (done ? "#27660a" : "#aaa") : (color ?? "#333");
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block", width: "100%", textAlign: "left",
        marginTop: 7, padding: "9px 12px", borderRadius: 8,
        border: `1px solid ${border}`, background: bg,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: tc }}>{label}</div>
      <div style={{ fontSize: 11, color: disabled ? "#bbb" : "#888", marginTop: 2 }}>{sub}</div>
    </button>
  );
}

// ── Stilkonstanter ──────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #eee", borderRadius: 14,
  padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,.05)",
};
const badge: React.CSSProperties = {
  background: BURGUNDY, color: "#fff", fontSize: 11, fontWeight: 700,
  padding: "3px 10px", borderRadius: 6,
};
const districtText: React.CSSProperties = { fontSize: 12, color: "#888", fontWeight: 600 };
const valueRow: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 };
const valueText: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: "#1a1a1a" };
const subText: React.CSSProperties = { fontSize: 12, color: "#999" };
const statRow: React.CSSProperties = { display: "flex", gap: 12, marginBottom: 4 };
const statLabel: React.CSSProperties = {
  fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2,
};
const statValue: React.CSSProperties = { fontSize: 14, fontWeight: 700 };
const tenantBox: React.CSSProperties = { background: "#f7f2f8", borderRadius: 10, padding: "10px 12px", marginBottom: 6 };
const tenantName: React.CSSProperties = { fontWeight: 700, fontSize: 14, color: BURGUNDY };
const tenantMeta: React.CSSProperties = { fontSize: 12, color: "#666", marginTop: 2 };
const vacantBox: React.CSSProperties = {
  background: "#fff8f0", border: "1px dashed #e8c090", borderRadius: 10, padding: "10px 12px", marginBottom: 6,
};
const vacantTitle: React.CSSProperties = { fontWeight: 700, fontSize: 13, color: "#a05000" };
const vacantSub: React.CSSProperties = { fontSize: 12, color: "#a06820", marginBottom: 6 };
const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2,
};
const progressWrap: React.CSSProperties = {
  height: 8, background: "#eee", borderRadius: 4, overflow: "hidden", margin: "10px 0",
};
const progressFill: React.CSSProperties = {
  height: "100%", background: BURGUNDY, borderRadius: 4, transition: "width 0.3s",
};
const hint: React.CSSProperties = { fontSize: 12, color: "#999", marginTop: 4 };
