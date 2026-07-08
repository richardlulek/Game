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
    background: "#faf8f2",
    border: "1px solid #e2ddcf",
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
      {ok ? `✓ ${need} verkställer policyn` : `🔒 Kräver ${need} — policyn ligger vilande tills du anställer`}
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

  // Portföljdirektörens instruktioner – speglas här och i Hyresgäster.
  const gmS: GlobalManagerSettings =
    state.globalManager ?? { active: false, minCondition: 40, minTenantQuality: 0.8, rentTargetPct: 1.0 };
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
        Policyn sätter standarder för hela portföljen — inställningar på enskilda fastigheter går
        alltid före. Verkställighet kräver rätt chef i organisationen.
      </div>

      {/* ── Uthyrningspolicy ─────────────────────────────────────── */}
      <div style={P.card}>
        <div style={P.cardTitle}>🏷️ Uthyrning</div>
        <Gate ok={hasDirector} need="portföljdirektör (Hyresgäster → Direktör)" />
        <div style={P.row}>
          <span style={P.label}>Standard utgångshyra</span>
          <input
            type="range" min={80} max={130} step={5}
            value={Math.round((pol.askRentPct ?? 1) * 100)}
            onChange={(e) => set({ askRentPct: +e.target.value / 100 })}
            style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
          />
          <span style={P.value}>{Math.round((pol.askRentPct ?? 1) * 100)} %</span>
        </div>
        <div style={P.row}>
          <span style={P.label}>Acceptera ansökningar automatiskt</span>
          <button style={toggleStyle(aa.enabled)} onClick={() => set({ autoAccept: { ...aa, enabled: !aa.enabled } })}>
            {aa.enabled ? "PÅ" : "AV"}
          </button>
        </div>
        {aa.enabled && (
          <>
            <div style={P.row}>
              <span style={P.label}>… med kvalitet minst</span>
              <input
                type="range" min={80} max={115} step={5}
                value={Math.round(aa.minQuality * 100)}
                onChange={(e) => set({ autoAccept: { ...aa, minQuality: +e.target.value / 100 } })}
                style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
              />
              <span style={P.value}>{aa.minQuality.toFixed(2)}</span>
            </div>
            <div style={P.row}>
              <span style={P.label}>… och kontraktspaket</span>
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
          <span style={P.label}>Avslå ansökningar under kvalitet</span>
          {[0, 0.9, 0.95, 1.0].map((q) => (
            <button key={q} style={chipStyle((pol.rejectBelowQuality ?? 0) === q)}
              onClick={() => set({ rejectBelowQuality: q })}>
              {q === 0 ? "Av" : q.toFixed(2)}
            </button>
          ))}
        </div>
        <div style={P.hint}>
          Utgångshyran gäller fastigheter utan egen inställning. Auto-accept tar bästa sökande så
          fort någon möter kravet — sätt högre krav för bättre mix, lägre för snabb uthyrning.
        </div>
      </div>

      {/* ── Ekonomipolicy ────────────────────────────────────────── */}
      <div style={P.card}>
        <div style={P.cardTitle}>💼 Ekonomi</div>
        <Gate ok={hasCfo} need="Finanschef/CFO (Anställda)" />
        <div style={P.row}>
          <span style={P.label}>Amortera automatiskt mot mål-LTV</span>
          <button style={toggleStyle(am.enabled)} onClick={() => set({ autoAmort: { ...am, enabled: !am.enabled } })}>
            {am.enabled ? "PÅ" : "AV"}
          </button>
        </div>
        {am.enabled && (
          <>
            <div style={P.row}>
              <span style={P.label}>Mål-LTV</span>
              <input
                type="range" min={30} max={80} step={5}
                value={Math.round(am.ltvTarget * 100)}
                onChange={(e) => set({ autoAmort: { ...am, ltvTarget: +e.target.value / 100 } })}
                style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
              />
              <span style={P.value}>{Math.round(am.ltvTarget * 100)} %</span>
            </div>
            <div style={P.row}>
              <span style={P.label}>Behåll kassabuffert</span>
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
        <div style={P.cardTitle}>🛡️ Skydd & energi</div>
        <Gate ok={hasOps} need="Förvaltningschef (Anställda)" />
        <div style={P.row}>
          <span style={P.label}>Försäkra automatiskt över värde</span>
          <button style={toggleStyle(ai.enabled)} onClick={() => set({ autoInsure: { ...ai, enabled: !ai.enabled } })}>
            {ai.enabled ? "PÅ" : "AV"}
          </button>
          {ai.enabled && [5, 10, 20].map((m) => (
            <button key={m} style={chipStyle(ai.minValue === m * 1_000_000)}
              onClick={() => set({ autoInsure: { ...ai, minValue: m * 1_000_000 } })}>
              {msek(m * 1_000_000)}
            </button>
          ))}
        </div>
        <div style={P.row}>
          <span style={P.label}>Energiuppgradera mot klass</span>
          <button style={toggleStyle(ae.enabled)} onClick={() => set({ autoEnergy: { ...ae, enabled: !ae.enabled } })}>
            {ae.enabled ? "PÅ" : "AV"}
          </button>
          {ae.enabled && (
            <>
              {(["B", "A"] as const).map((c) => (
                <button key={c} style={chipStyle(ae.targetClass === c)}
                  onClick={() => set({ autoEnergy: { ...ae, targetClass: c } })}>
                  Klass {c}
                </button>
              ))}
              {[3, 5, 10].map((m) => (
                <button key={m} style={chipStyle(ae.cashFloor === m * 1_000_000)}
                  onClick={() => set({ autoEnergy: { ...ae, cashFloor: m * 1_000_000 } })}>
                  buffert {m} M
                </button>
              ))}
            </>
          )}
        </div>
        <div style={P.hint}>
          En energiuppgradering görs per månad (billigast först) så länge kassan ligger över
          bufferten — vägen till grönt lån (ESG B+) utan mikroklick.
        </div>
      </div>

      {/* ── Förvaltning: portföljdirektörens instruktioner ───────── */}
      <div style={{ ...P.card, background: "#f2efe6" }}>
        <div style={P.cardTitle}>👔 Förvaltning & underhåll</div>
        <div style={P.row}>
          <span style={P.label}>Portföljdirektör</span>
          <button style={toggleStyle(hasDirector)} onClick={() => setGm({ active: !hasDirector })}>
            {hasDirector ? "ANLITAD" : "ANLITA"}
          </button>
          <span style={{ fontSize: 11.5, color: "#777" }}>
            {hasDirector
              ? `Arvode ${kr(gmFee)}/mån — sköter hela beståndet enligt instruktionerna nedan.`
              : `Arvode ${kr(gmFee)}/mån (15 000 kr + 1 500 kr per fastighet). Finns även under Hyresgäster.`}
          </span>
        </div>
        <div style={P.row}>
          <span style={P.label}>Underhållströskel</span>
          <input
            type="range" min={0} max={100} step={5}
            value={gmS.minCondition}
            onChange={(e) => setGm({ minCondition: +e.target.value })}
            style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
          />
          <span style={P.value}>
            {gmS.minCondition === 100 ? "100 (alltid)" : gmS.minCondition === 0 ? "0 (aldrig)" : gmS.minCondition}
          </span>
        </div>
        <div style={P.row}>
          <span style={P.label}>Hyresmål vid förlängning</span>
          <input
            type="range" min={80} max={130} step={5}
            value={Math.round(gmS.rentTargetPct * 100)}
            onChange={(e) => setGm({ rentTargetPct: +e.target.value / 100 })}
            style={{ flex: 1, accentColor: BURGUNDY, minWidth: 120 }}
          />
          <span style={P.value}>{Math.round(gmS.rentTargetPct * 100)} %</span>
        </div>
        <div style={P.row}>
          <span style={P.label}>Min. hyresgästkvalitet (autofyll)</span>
          {[0, 0.8, 0.9, 1.0].map((q) => (
            <button key={q} style={chipStyle(gmS.minTenantQuality === q)}
              onClick={() => setGm({ minTenantQuality: q })}>
              {q === 0 ? "Alla" : q.toFixed(2)}
            </button>
          ))}
        </div>
        <div style={P.hint}>
          Underhåll utförs när skicket faller under tröskeln — 100 håller alla hus i toppskick men
          kostar därefter. Fastigheter med egen förvaltare följer sina egna instruktioner i stället.
          {hasDirector ? "" : " Instruktionerna sparas och gäller så fort direktören anlitas."}
        </div>
      </div>
    </div>
  );
}
