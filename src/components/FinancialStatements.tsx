/* Bokslut – resultaträkning i löpande månadstakt och balansräkning.
   Siffrorna speglar exakt simulationens formler (engine/bokslut.ts),
   så det som står här är det som faktiskt dras/betalas varje månad. */

import { balansrakning, resultatrakning } from "../engine/bokslut";
import { kr, msek } from "../engine/format";
import type { GameState } from "../engine/types";

const P: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start", color: "#1a1a1a" },
  card: {
    flex: "1 1 340px",
    minWidth: 320,
    background: "#f7f9fb",
    border: "1px solid #dde4ec",
    borderRadius: 10,
    padding: "14px 16px",
  },
  title: { fontWeight: 800, fontSize: 15, marginBottom: 2 },
  sub: { fontSize: 11.5, color: "#888", marginBottom: 10 },
  section: { fontSize: 11, color: "#4757c8", fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", margin: "10px 0 3px" },
  row: { display: "flex", justifyContent: "space-between", gap: 12, padding: "2.5px 0", fontSize: 13 },
  sumRow: {
    display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0",
    fontSize: 13, fontWeight: 800, borderTop: "1px solid #ccd6e0", marginTop: 3,
  },
  hint: { fontSize: 11, color: "#888", marginTop: 10 },
};

function Row({ label, value, negative, hideIfZero }: { label: string; value: number; negative?: boolean; hideIfZero?: boolean }) {
  if (hideIfZero && value === 0) return null;
  const v = negative ? -value : value;
  return (
    <div style={P.row}>
      <span style={{ color: "#444" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: negative ? "#8a3a2a" : "#1a1a1a" }}>
        {negative && value > 0 ? "−" : ""}{kr(Math.abs(v))}
      </span>
    </div>
  );
}

function SumRow({ label, value, colored }: { label: string; value: number; colored?: boolean }) {
  return (
    <div style={P.sumRow}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: colored ? (value >= 0 ? "#27660a" : "#c0392b") : "#1a1a1a" }}>
        {value < 0 ? "−" : ""}{kr(Math.abs(value))}
      </span>
    </div>
  );
}

export function FinancialStatements({ state }: { state: GameState }) {
  const rr = resultatrakning(state);
  const br = balansrakning(state);

  return (
    <div style={P.wrap}>
      {/* ── Resultaträkning ──────────────────────────────────────── */}
      <div style={P.card}>
        <div style={P.title}>📈 Income statement</div>
        <div style={P.sub}>
          Current monthly run-rate · annualized ≈ {msek(rr.resultat * 12)} after tax
        </div>

        <div style={P.section}>Revenue</div>
        <Row label="Rental income" value={rr.hyresintakter} />
        <Row label="Industry net" value={rr.industrinetto} hideIfZero />
        <Row label="Share dividends" value={rr.utdelningar} hideIfZero />
        <Row label="Bank operations (est.)" value={rr.bankrorelse} hideIfZero />
        <Row label="Insurance operations (est.)" value={rr.forsakringsrorelse} hideIfZero />
        <Row label="Subsidiaries" value={rr.dotterbolagsvinst} hideIfZero />
        <Row label="Spin-off dividends (est./mo)" value={rr.avknoppningsutdelning} hideIfZero />
        <SumRow label="Total revenue" value={rr.summaIntakter} />

        <div style={P.section}>Costs</div>
        <Row label="Operating costs" value={rr.driftkostnader} negative />
        <Row label="Management & director" value={rr.forvaltning} negative hideIfZero />
        <Row label="Staff" value={rr.personal} negative hideIfZero />
        <Row label="Office & organization" value={rr.kontor} negative hideIfZero />
        <Row label="Insurance premiums" value={rr.forsakringar} negative hideIfZero />
        <SumRow label="Operating profit" value={rr.rorelseresultat} colored />

        <div style={P.section}>Net financials & tax</div>
        <Row label="Interest costs" value={rr.rantekostnad} negative />
        <SumRow label="Profit before tax" value={rr.resultatForeSkatt} colored />
        <Row label={`Tax (${Math.round(rr.skattesats * 100)}% after depreciation deduction ${kr(rr.avskrivningsavdrag)})`} value={rr.skatt} negative hideIfZero />
        <SumRow label="Result for the month" value={rr.resultat} colored />

        <div style={P.hint}>
          Amortization isn't included – it's not a cost but moves cash into equity.
          One-off items (maintenance, purchases, projects) show in the Log.
        </div>
      </div>

      {/* ── Balansräkning ────────────────────────────────────────── */}
      <div style={P.card}>
        <div style={P.title}>⚖️ Balance sheet</div>
        <div style={P.sub}>
          Equity ratio {Math.round(br.soliditet * 100)}% · total assets {msek(br.summaTillgangar)}
        </div>

        <div style={P.section}>Assets</div>
        <Row label="Cash" value={br.kassa} />
        <Row label="Properties (market value)" value={br.fastigheter} />
        <Row label="Land (plots)" value={br.mark} hideIfZero />
        <Row label="Industry assets" value={br.industri} hideIfZero />
        <Row label="Share portfolio" value={br.aktier} hideIfZero />
        <Row label="Subsidiaries" value={br.dotterbolag} hideIfZero />
        <Row label="Financial institutions" value={br.institut} hideIfZero />
        <SumRow label="Total assets" value={br.summaTillgangar} />

        <div style={P.section}>Liabilities</div>
        <Row label="Bank loans" value={br.banklan} negative />
        <Row label="Bonds" value={br.obligationer} negative hideIfZero />
        <Row label="Revolving credit" value={br.revolver} negative hideIfZero />
        <SumRow label="Total liabilities" value={br.summaSkulder} />

        <div style={P.section}>Equity</div>
        <SumRow label="Equity (assets − liabilities)" value={br.egetKapital} colored />

        <div style={P.hint}>
          Properties are valued at market value. Yield on cost per property is in
          Portfolio and Overview.
        </div>
      </div>
    </div>
  );
}
