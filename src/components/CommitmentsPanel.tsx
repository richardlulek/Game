/* Åtaganden – instrumentbrädan för allt som PÅGÅR i affärsverksamheten:
   förhandlingar, fientliga bud, due diligence, integrationer, earn-outs,
   avyttringskrav och stängda dörrar. Tidigare levde allt detta bara i
   loggen – motor utan mätare. Renderas överst i förvärvsfönstret. */

import { msek } from "../engine/format";
import { HOSTILE_REALIZE, INTEGRATION_MONTHS } from "../engine/mna";
import { propAnnualOpex, propPotentialRent } from "../engine/property";
import type { GameAction, GameState } from "../engine/types";
import { C, FONTS } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

const row: React.CSSProperties = {
  background: "#141008",
  border: `1px solid ${C.brass}55`,
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
};

export function CommitmentsPanel({ state, dispatch }: Props) {
  const absNow = state.year * 12 + state.month;
  const deal = state.pendingDeal;
  const items: React.ReactNode[] = [];

  // Pågående förhandling
  if (deal) {
    items.push(
      <div key="deal" style={row}>
        <span>
          🤝 <strong>Negotiating {deal.target}</strong> · round {deal.round} · your bid {msek(deal.offer)}
          {deal.status === "countered" && deal.counter != null && (
            <span style={{ color: C.negativeBright }}> · countered at {msek(deal.counter)}</span>
          )}
          {deal.status === "accepted" && <span style={{ color: C.positive }}> · AGREED — choose financing below</span>}
          {deal.rivalBidder && (
            <span style={{ color: C.negativeBright }}> · ⚡ {deal.rivalBidder} bids {msek(deal.rivalBid ?? 0)} — top it or lose the target</span>
          )}
        </span>
        <button onClick={() => dispatch({ type: "WITHDRAW_DEAL" })} style={btn}>Walk away</button>
      </div>,
    );
  }

  // Fientligt bud i marknaden
  if (state.hostileBid) {
    items.push(
      <div key="hostile" style={row}>
        <span>⚔️ <strong>Hostile bid for {state.hostileBid.target}</strong> · {msek(state.hostileBid.offer)} — the board answers at the next month's close.</span>
      </div>,
    );
  }

  // Due diligence
  for (const dd of state.ddInProgress ?? []) {
    items.push(
      <div key={`dd-${dd.target}`} style={row}>
        <span>🔍 <strong>Due diligence: {dd.target}</strong> · report in {Math.max(0, dd.doneAbs - absNow)} month(s)</span>
      </div>,
    );
  }

  // Integrationer med progress och förväntad realisering
  for (const integ of state.integrations ?? []) {
    const done = Math.min(integ.months, absNow - integ.startAbs);
    const pct = Math.round((done / integ.months) * 100);
    items.push(
      <div key={`int-${integ.target}-${integ.startAbs}`} style={{ ...row, flexDirection: "column", alignItems: "stretch", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            🧩 <strong>Integrating {integ.target}</strong>
            {integ.hostile && <span style={{ color: C.negativeBright }}> (hostile — max {Math.round(HOSTILE_REALIZE * 100)}% realization)</span>}
            {" "}· {Math.max(0, integ.startAbs + integ.months - absNow)} of {INTEGRATION_MONTHS} months left
          </span>
          <span style={{ color: C.gold }}>synergy goal {msek(integ.synergyGoal)}</span>
        </div>
        <div style={{ height: 6, background: C.woodDark, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: C.brass, borderRadius: 3 }} />
        </div>
      </div>,
    );
  }

  // Earn-outs: nedräkning och beståndets leverans mot målet
  for (const eo of state.earnOuts ?? []) {
    const ids = new Set(eo.propertyIds);
    const held = state.portfolio.filter((p) => ids.has(p.id) && p.status === "klar");
    const noi = Math.round(held.reduce((a, p) => a + (propPotentialRent(p, state) - propAnnualOpex(p, state)) / 12, 0));
    const onTrack = noi >= eo.noiTarget;
    items.push(
      <div key={`eo-${eo.target}-${eo.dueAbs}`} style={row}>
        <span>
          📜 <strong>Earn-out: {eo.target}</strong> · {msek(eo.amount)} due in {Math.max(0, eo.dueAbs - absNow)} mo ·
          portfolio NOI {msek(noi)}/mo vs target {msek(eo.noiTarget)}{" "}
          <span style={{ color: onTrack ? C.negativeBright : C.positive, fontWeight: 700 }}>
            {onTrack ? "→ you will pay" : "→ currently lapsing"}
          </span>
        </span>
      </div>,
    );
  }

  // Konkurrensmyndighetens avyttringskrav
  for (const order of state.divestOrders ?? []) {
    const mine = state.portfolio.filter((p) => p.district === order.district && p.status === "klar").length;
    const left = Math.max(0, order.dueAbs - absNow);
    items.push(
      <div key={`div-${order.district}`} style={{ ...row, border: `1px solid ${C.negativeBright}88` }}>
        <span>
          ⚖️ <strong>Divestment order: {order.district}</strong> · {mine} owned, cap {order.maxAllowed} ·{" "}
          <span style={{ color: left <= 2 ? C.negativeBright : C.gold, fontWeight: 700 }}>
            {left} month(s) to deadline
          </span>{" "}
          — sell {Math.max(0, mine - order.maxAllowed)} or face fines
        </span>
      </div>,
    );
  }

  // Stängda dörrar
  const cooldowns = Object.entries(state.dealCooldowns ?? {}).filter(([, until]) => until > absNow);
  if (cooldowns.length > 0) {
    items.push(
      <div key="cd" style={{ ...row, color: C.creamSoft }}>
        <span>🚪 Closed doors: {cooldowns.map(([n, until]) => `${n} (${until - absNow} mo)`).join(" · ")}</span>
      </div>,
    );
  }

  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ fontFamily: FONTS.heading, color: C.gold, fontSize: 15, marginBottom: 10 }}>
        ⏳ Ongoing commitments
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{items}</div>
    </section>
  );
}

const btn: React.CSSProperties = {
  background: C.woodDark,
  color: C.brassBright,
  border: `1px solid ${C.brass}`,
  borderRadius: 4,
  padding: "4px 10px",
  fontSize: 11,
  cursor: "pointer",
  fontWeight: 700,
};
