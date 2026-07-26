/* Bolagspolicyn – företagsledarens styrdokument. Sätter portfölj-
   standarder som enskilda fastigheter kan överstyra. Verkställighet
   kräver rätt chef: uthyrning → portföljdirektör, ekonomi → CFO,
   skydd/energi → förvaltningschef. */

import { CONTRACTS } from "../engine/leasing";
import { kr, msek } from "../engine/format";
import type { CompanyPolicy, ContractKind, GameAction, GameState, GlobalManagerSettings } from "../engine/types";
import { loanTerms } from "../engine/finance";
import { globalManagerFee } from "../engine/simulation";
import { WORKS, pickManagerWork, workSpec } from "../engine/works";
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
  // Arvodet som det faktiskt räknas i simulationen – även när direktören
  // ännu inte är anlitad (då som förhandsbesked om vad det skulle kosta).
  const gmFee = globalManagerFee(
    hasDirector ? state : { ...state, globalManager: { ...gmS, active: true } },
  );

  const aa = pol.autoAccept ?? { enabled: false, minQuality: 1.0, contract: "standard" as ContractKind };
  const am = pol.autoAmort ?? { enabled: false, ltvTarget: 0.6, cashFloor: 2_000_000 };
  // Bankens tak – policyn kan bara välja lägre.
  const { maxLtv } = loanTerms(state);
  const ad = pol.autoDividend ?? { enabled: false, pct: 0.25, cashFloor: 5_000_000 };
  const ai = pol.autoInsure ?? { enabled: false, minValue: 10_000_000 };
  const ae = pol.autoEnergy ?? { enabled: false, targetClass: "B" as const, cashFloor: 3_000_000 };
  const aw = pol.autoWorks ?? { enabled: false, allowed: ["energi", "smart"], cashFloor: 3_000_000 };
  const toggleWork = (id: string) =>
    set({
      autoWorks: {
        ...aw,
        allowed: aw.allowed.includes(id) ? aw.allowed.filter((x) => x !== id) : [...aw.allowed, id],
      },
    });
  // Vad programmet skulle beställa just nu – gör policyn konkret i stället
  // för abstrakt.
  const nextJob = pickManagerWork(state);

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

        {/* Belåningsgrad vid förvärv. Utan val lånar varje köp maximalt –
            hävstången blir då en regel i stället för en strategi. */}
        <div style={P.row}>
          <span style={P.label}>Leverage on purchases</span>
          <button
            style={toggleStyle(pol.purchaseLtv !== undefined)}
            onClick={() => set({ purchaseLtv: pol.purchaseLtv === undefined ? Math.round(maxLtv * 100) / 100 : undefined })}
          >
            {pol.purchaseLtv === undefined ? "MAX" : "SET"}
          </button>
        </div>
        {pol.purchaseLtv !== undefined && (
          <div style={P.row}>
            <span style={P.label}>Buy at LTV</span>
            <input
              type="range" min={0} max={85} step={5}
              value={Math.round(pol.purchaseLtv * 100)}
              onChange={(e) => set({ purchaseLtv: +e.target.value / 100 })}
              style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
            />
            <span style={P.value}>{Math.round(pol.purchaseLtv * 100)}%</span>
          </div>
        )}
        <div style={{ ...P.hint, marginTop: -2 }}>
          {pol.purchaseLtv === undefined
            ? `Every purchase borrows the most the bank allows — ${Math.round(maxLtv * 100)}% at your reputation.`
            : pol.purchaseLtv > maxLtv
              ? `The bank caps you at ${Math.round(maxLtv * 100)}% — purchases use that.`
              : `Purchases use ${Math.round(pol.purchaseLtv * 100)}% debt. Lower leverage means a bigger down payment, but stronger interest coverage and a better credit rating.`}
        </div>

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
                  ${m}M
                </button>
              ))}
            </div>
          </>
        )}
        <div style={P.row}>
          <span style={P.label}>Quarterly dividend from excess cash</span>
          <button style={toggleStyle(ad.enabled)} onClick={() => set({ autoDividend: { ...ad, enabled: !ad.enabled } })}>
            {ad.enabled ? "ON" : "OFF"}
          </button>
        </div>
        {ad.enabled && (
          <>
            <div style={P.row}>
              <span style={P.label}>Share of excess cash</span>
              {[0.1, 0.25, 0.5].map((p) => (
                <button key={p} style={chipStyle(ad.pct === p)}
                  onClick={() => set({ autoDividend: { ...ad, pct: p } })}>
                  {Math.round(p * 100)}%
                </button>
              ))}
            </div>
            <div style={P.row}>
              <span style={P.label}>Keep cash buffer</span>
              {[2, 5, 10, 20].map((m) => (
                <button key={m} style={chipStyle(ad.cashFloor === m * 1_000_000)}
                  onClick={() => set({ autoDividend: { ...ad, cashFloor: m * 1_000_000 } })}>
                  ${m}M
                </button>
              ))}
            </div>
            <div style={P.hint}>
              Paid every quarter. After the IPO you receive your ownership share of each dividend
              privately — the rest goes to the market and calms the activist fund.
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
              : `Fee ${kr(gmFee)}/mo — a small fixed staff plus 3% of the rent per property. Without a director you manage yourself – free, but above the office capacity an extra cost applies.`}
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

      {/* ── Renoveringsprogrammet ────────────────────────────────── */}
      <div style={{ ...P.card, background: "#eef2f6" }}>
        <div style={P.cardTitle}>🛠️ Renovation programme (what the director is allowed to do)</div>
        <Gate ok={hasDirector} need="portfolio director (above)" />
        <div style={P.row}>
          <span style={P.label}>Let the director invest</span>
          <button style={toggleStyle(aw.enabled)} onClick={() => set({ autoWorks: { ...aw, enabled: !aw.enabled } })}>
            {aw.enabled ? "ON" : "OFF"}
          </button>
          <span style={{ fontSize: 11.5, color: "#777" }}>
            One job a month across the whole portfolio — whichever ticked job returns the most per krona.
          </span>
        </div>

        {aw.enabled && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "6px 0 8px" }}>
              {WORKS.map((w) => {
                // Underhållet står med för jämförelsens skull men beställs av
                // skicktröskeln ovanför – inte av programmet. Två system som
                // beställer samma jobb vore bara förvirrande.
                const byThreshold = w.id === "underhåll";
                const on = !byThreshold && aw.allowed.includes(w.id);
                const family =
                  w.family === "hyra" ? { t: "RENT", c: "#2a6a1a" }
                  : w.family === "värde" ? { t: "VALUE", c: "#7a5c2a" }
                  : { t: "COST", c: "#2a4a6a" };
                return (
                  <button
                    key={w.id}
                    onClick={() => { if (!byThreshold) toggleWork(w.id); }}
                    disabled={byThreshold}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                      padding: "6px 8px", borderRadius: 6,
                      cursor: byThreshold ? "default" : "pointer",
                      border: `1px solid ${on ? BURGUNDY : "#c6cfd8"}`,
                      background: on ? "#fff" : "#e4e9ee",
                      opacity: byThreshold ? 0.55 : on ? 1 : 0.7,
                    }}
                  >
                    <span style={{ width: 14 }}>{on ? "✓" : ""}</span>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, color: "#fff",
                      background: family.c, padding: "2px 5px", borderRadius: 3, minWidth: 42, textAlign: "center",
                    }}>
                      {family.t}
                    </span>
                    <span style={{ minWidth: 150, fontWeight: 600, fontSize: 12 }}>{w.name}</span>
                    <span style={{ fontSize: 11, color: "#555", minWidth: 210 }}>
                      {[
                        w.rent ? `rent +${Math.round(w.rent * 100)}%` : null,
                        w.value ? `value +${Math.round(w.value * 100)}%` : null,
                        w.capacity ? `+${w.capacity} unit` : null,
                        w.opex ? `opex −${Math.round(w.opex * 100)}%` : null,
                        w.vacancy ? `vacancy −${Math.round(w.vacancy * 100)}%` : null,
                        w.conditionTo ? `condition → ${w.conditionTo}` : w.condition ? `condition +${w.condition}` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                    <span style={{ fontSize: 11, color: "#777", marginLeft: "auto", whiteSpace: "nowrap" }}>
                      {byThreshold
                        ? "set by the maintenance threshold above"
                        : `${Math.round(w.cost * 100)}% of value · ${w.months} mo${w.needsVacant ? " · must be empty" : ""}`}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={P.row}>
              <span style={P.label}>Never spend below</span>
              {[1, 3, 5, 10].map((m) => (
                <button key={m} style={chipStyle(aw.cashFloor === m * 1_000_000)}
                  onClick={() => set({ autoWorks: { ...aw, cashFloor: m * 1_000_000 } })}>
                  {msek(m * 1_000_000)}
                </button>
              ))}
            </div>
            <div style={{ ...P.hint, color: nextJob ? "#2a6a1a" : undefined }}>
              {nextJob
                ? `Next up: ${workSpec(nextJob.work)?.name.toLowerCase()} on ${state.portfolio.find((p) => p.id === nextJob.propertyId)?.typeLabel} in ${state.portfolio.find((p) => p.id === nextJob.propertyId)?.districtName} — ${kr(nextJob.cost)}.`
                : !hasDirector
                  ? "Nothing will be ordered until the portfolio director is hired above."
                  : aw.allowed.length === 0
                    ? "Nothing ticked — the director will not renovate anything."
                    : "Nothing queued right now: either every ticked job is done, the cash floor blocks it, or the buildings that need one are still let."}
            </div>
          </>
        )}

        <div style={P.hint}>
          Rent-driven jobs raise what the building earns, and the value follows through the rent roll —
          slowly, as contracts are rewritten. Value-driven jobs raise the valuation straight away but barely
          touch the rent. Cost-driven jobs show up in neither, only in what is left at the bottom.
          Full renovation and extra floor take the building out of service, so the director only orders them
          on properties that already stand empty.
        </div>
      </div>
    </div>
  );
}
