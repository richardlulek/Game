/* Bolagspolicyn – företagsledarens styrdokument. Sätter portfölj-
   standarder som enskilda fastigheter kan överstyra. Verkställighet
   kräver rätt chef: uthyrning → portföljdirektör, ekonomi → CFO,
   skydd/energi → förvaltningschef. */

import { CONTRACTS } from "../engine/leasing";
import { kr, msek } from "../engine/format";
import type { CompanyPolicy, ContractKind, GameAction, GameState, GlobalManagerSettings } from "../engine/types";
import { BURGUNDY } from "../styles/tokens";

const P: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, color: "#1a1a1a" },
  intro: { fontSize: 13, color: "#555" },
  card: {
    background: "#f7f9fb",
    border: "1px solid #dde4ec",
    borderRadius: 10,
    padding: "12px 14px",
  },
  cardTitle: { fontWeight: 800, fontSize: 14, marginBottom: 2 },
  gate: { fontSize: 11.5, fontWeight: 700, marginBottom: 8 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "5px 0", flexWrap: "wrap" },
  label: { fontSize: 12.5, color: "#444", minWidth: 190 },
  value: { fontSize: 12.5, fontWeight: 700, minWidth: 74 },
  hint: { fontSize: 11, color: "#888", marginTop: 4 },
};

const toggleStyle = (on: boolean): React.CSSProperties => ({
  padding: "4px 12px",
  borderRadius: 6,
  border: `1px solid ${on ? "#27660a" : "#ccc"}`,
  background: on ? "#27660a14" : "#fff",
  color: on ? "#27660a" : "#666",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
});

const chipStyle = (on: boolean): React.CSSProperties => ({
  padding: "3px 10px",
  borderRadius: 6,
  border: `1px solid ${on ? BURGUNDY : "#ccc"}`,
  background: on ? BURGUNDY : "#fff",
  color: on ? "#fff" : "#555",
  fontSize: 11.5,
  fontWeight: 700,
  cursor: "pointer",
});

function Gate({ ok, need }: { ok: boolean; need: string }) {
  return (
    <div style={{ ...P.gate, color: ok ? "#27660a" : "#b5542a" }}>
      {ok ? `✓ ${need} enforces the policy` : `🔒 Requires ${need} — the policy stays dormant until you hire`}
    </div>
  );
}

export function PolicyPanel({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (a: GameAction) => void;
}) {
  const pol: CompanyPolicy = state.policy ?? {};
  const set = (patch: Partial<CompanyPolicy>) => dispatch({ type: "SET_POLICY", policy: patch });
  const hasDirector = !!state.globalManager?.active;
  const hasCfo = (state.staff?.["cfo"] ?? 0) > 0;
  const hasOps = (state.staff?.["forvaltning"] ?? 0) > 0;

  // Portföljdirektören anlitas och instrueras HÄR – Portfölj och
  // Hyresgäster visar bara status med länk hit.
  const gmS: GlobalManagerSettings =
    state.globalManager ?? { active: false, minCondition: 45, minTenantQuality: 0.8, rentTargetPct: 1.0 };
  const setGm = (patch: Partial<GlobalManagerSettings>) =>
    dispatch({ type: "SET_GLOBAL_MANAGER", settings: { ...gmS, ...patch } });
  const gmFee = 15_000 + state.portfolio.length * 1_500;

  const aa = pol.autoAccept ?? { enabled: false, minQuality: 1.0, contract: "standard" as ContractKind };
  const am = pol.autoAmort ?? { enabled: false, ltvTarget: 0.6, cashFloor: 2_000_000 };
  const ai = pol.autoInsure ?? { enabled: false, minValue: 10_000_000 };
  const ae = pol.autoEnergy ?? { enabled: false, targetClass: "B" as const, cashFloor: 3_000_000 };

  return (
    <div style={P.wrap}>
      <div style={P.intro}>
        The policy sets defaults for the whole portfolio — settings on individual properties always
        take precedence. Enforcement requires the right manager in the organization.
      </div>

      {/* ── Uthyrningspolicy ─────────────────────────────────────── */}
      <div style={P.card}>
        <div style={P.cardTitle}>🏷️ Leasing</div>
        <Gate ok={hasDirector} need="portfolio director (Tenants → Director)" />
        <div style={P.row}>
          <span style={P.label}>Default asking rent</span>
          <input
            type="range" min={80} max={130} step={5}
            value={Math.round((pol.askRentPct ?? 1) * 100)}
            onChange={(e) => set({ askRentPct: +e.target.value / 100 })}
            style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
          />
          <span style={P.value}>{Math.round((pol.askRentPct ?? 1) * 100)}%</span>
        </div>
        <div style={P.row}>
          <span style={P.label}>Accept applications automatically</span>
          <button style={toggleStyle(aa.enabled)} onClick={() => set({ autoAccept: { ...aa, enabled: !aa.enabled } })}>
            {aa.enabled ? "ON" : "OFF"}
          </button>
        </div>
        {aa.enabled && (
          <>
            <div style={P.row}>
              <span style={P.label}>… with quality at least</span>
              <input
                type="range" min={80} max={115} step={5}
                value={Math.round(aa.minQuality * 100)}
                onChange={(e) => set({ autoAccept: { ...aa, minQuality: +e.target.value / 100 } })}
                style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
              />
              <span style={P.value}>{aa.minQuality.toFixed(2)}</span>
            </div>
            <div style={P.row}>
              <span style={P.label}>… and contract package</span>
              {(["kort", "standard", "långt"] as const).map((c) => (
                <button key={c} title={CONTRACTS[c].desc} style={chipStyle(aa.contract === c)}
                  onClick={() => set({ autoAccept: { ...aa, contract: c } })}>
                  {CONTRACTS[c].label}
                </button>
              ))}
            </div>
          </>
        )}
        <div style={P.row}>
          <span style={P.label}>Reject applications below quality</span>
          {[0, 0.9, 0.95, 1.0].map((q) => (
            <button key={q} style={chipStyle((pol.rejectBelowQuality ?? 0) === q)}
              onClick={() => set({ rejectBelowQuality: q })}>
              {q === 0 ? "Off" : q.toFixed(2)}
            </button>
          ))}
        </div>
        <div style={P.hint}>
          The asking rent applies to properties without their own setting. Auto-accept takes the best
          applicant as soon as one meets the bar — set it higher for a better mix, lower for fast leasing.
        </div>
      </div>

      {/* ── Ekonomipolicy ────────────────────────────────────────── */}
      <div style={P.card}>
        <div style={P.cardTitle}>💼 Finance</div>
        <Gate ok={hasCfo} need="Finance chief/CFO (Staff)" />
        <div style={P.row}>
          <span style={P.label}>Amortize automatically toward target LTV</span>
          <button style={toggleStyle(am.enabled)} onClick={() => set({ autoAmort: { ...am, enabled: !am.enabled } })}>
            {am.enabled ? "ON" : "OFF"}
          </button>
        </div>
        {am.enabled && (
          <>
            <div style={P.row}>
              <span style={P.label}>Target LTV</span>
              <input
                type="range" min={30} max={80} step={5}
                value={Math.round(am.ltvTarget * 100)}
                onChange={(e) => set({ autoAmort: { ...am, ltvTarget: +e.target.value / 100 } })}
                style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
              />
              <span style={P.value}>{Math.round(am.ltvTarget * 100)}%</span>
            </div>
            <div style={P.row}>
              <span style={P.label}>Keep cash buffer</span>
              {[1, 2, 5, 10].map((m) => (
                <button key={m} style={chipStyle(am.cashFloor === m * 1_000_000)}
                  onClick={() => set({ autoAmort: { ...am, cashFloor: m * 1_000_000 } })}>
                  {m} MSEK
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Skydds- och energipolicy ─────────────────────────────── */}
      <div style={P.card}>
        <div style={P.cardTitle}>🛡️ Protection & energy</div>
        <Gate ok={hasOps} need="Operations chief (Staff)" />
        <div style={P.row}>
          <span style={P.label}>Insure automatically above value</span>
          <button style={toggleStyle(ai.enabled)} onClick={() => set({ autoInsure: { ...ai, enabled: !ai.enabled } })}>
            {ai.enabled ? "ON" : "OFF"}
          </button>
          {ai.enabled && [5, 10, 20].map((m) => (
            <button key={m} style={chipStyle(ai.minValue === m * 1_000_000)}
              onClick={() => set({ autoInsure: { ...ai, minValue: m * 1_000_000 } })}>
              {msek(m * 1_000_000)}
            </button>
          ))}
        </div>
        <div style={P.row}>
          <span style={P.label}>Energy-upgrade toward class</span>
          <button style={toggleStyle(ae.enabled)} onClick={() => set({ autoEnergy: { ...ae, enabled: !ae.enabled } })}>
            {ae.enabled ? "ON" : "OFF"}
          </button>
          {ae.enabled && (
            <>
              {(["B", "A"] as const).map((c) => (
                <button key={c} style={chipStyle(ae.targetClass === c)}
                  onClick={() => set({ autoEnergy: { ...ae, targetClass: c } })}>
                  Class {c}
                </button>
              ))}
              {[3, 5, 10].map((m) => (
                <button key={m} style={chipStyle(ae.cashFloor === m * 1_000_000)}
                  onClick={() => set({ autoEnergy: { ...ae, cashFloor: m * 1_000_000 } })}>
                  buffer {m} M
                </button>
              ))}
            </>
          )}
        </div>
        <div style={P.hint}>
          One energy upgrade is done per month (cheapest first) as long as cash stays above the
          buffer — the path to a green loan (ESG B+) without micromanaging.
        </div>
      </div>

      {/* ── Förvaltning: portföljdirektören anlitas och styrs här ── */}
      <div style={{ ...P.card, background: "#eef2f6" }}>
        <div style={P.cardTitle}>👔 The portfolio director (management & maintenance)</div>
        <div style={P.row}>
          <span style={P.label}>Portfolio director</span>
          <button style={toggleStyle(hasDirector)} onClick={() => setGm({ active: !hasDirector })}>
            {hasDirector ? "HIRED" : "HIRE"}
          </button>
          <span style={{ fontSize: 11.5, color: "#777" }}>
            {hasDirector
              ? `Fee ${kr(gmFee)}/mo — manages the whole portfolio per the instructions below.`
              : `Fee ${kr(gmFee)}/mo (15,000 kr + 1,500 kr per property). Without a director you manage yourself – free, but above the office capacity an extra cost applies.`}
          </span>
        </div>
        <div style={P.row}>
          <span style={P.label}>Maintenance threshold</span>
          <input
            type="range" min={0} max={100} step={5}
            value={gmS.minCondition}
            onChange={(e) => setGm({ minCondition: +e.target.value })}
            style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
          />
          <span style={P.value}>
            {gmS.minCondition === 100 ? "100 (always)" : gmS.minCondition === 0 ? "0 (never)" : gmS.minCondition}
          </span>
        </div>
        <div style={P.row}>
          <span style={P.label}>Rent target on renewal</span>
          <input
            type="range" min={80} max={130} step={5}
            value={Math.round(gmS.rentTargetPct * 100)}
            onChange={(e) => setGm({ rentTargetPct: +e.target.value / 100 })}
            style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
          />
          <span style={P.value}>{Math.round(gmS.rentTargetPct * 100)}%</span>
        </div>
        <div style={P.row}>
          <span style={P.label}>Min. tenant quality (autofill)</span>
          {[0, 0.8, 0.9, 1.0].map((q) => (
            <button key={q} style={chipStyle(gmS.minTenantQuality === q)}
              onClick={() => setGm({ minTenantQuality: q })}>
              {q === 0 ? "All" : q.toFixed(2)}
            </button>
          ))}
        </div>
        <div style={P.hint}>
          Maintenance is ordered when condition falls below the threshold (+15 condition at month-end, just
          like manual maintenance) — 100 keeps every building in top shape but costs accordingly. Properties
          with their own employed manager follow that manager's instructions instead.
          {hasDirector ? "" : " The instructions are saved and apply as soon as the director is hired."}
        </div>
      </div>
    </div>
  );
}
