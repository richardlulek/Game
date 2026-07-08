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
    background: "#faf8f2",
    border: "1px solid #e2ddcf",
    borderRadius: 10,
    padding: "14px 16px",
  },
  title: { fontWeight: 800, fontSize: 15, marginBottom: 2 },
  sub: { fontSize: 11.5, color: "#888", marginBottom: 10 },
  section: { fontSize: 11, color: "#8a6d1a", fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", margin: "10px 0 3px" },
  row: { display: "flex", justifyContent: "space-between", gap: 12, padding: "2.5px 0", fontSize: 13 },
  sumRow: {
    display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0",
    fontSize: 13, fontWeight: 800, borderTop: "1px solid #d8d2c0", marginTop: 3,
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
        <div style={P.title}>📈 Resultaträkning</div>
        <div style={P.sub}>
          Löpande månadstakt ur nuläget · årstakt ≈ {msek(rr.resultat * 12)} efter skatt
        </div>

        <div style={P.section}>Intäkter</div>
        <Row label="Hyresintäkter" value={rr.hyresintakter} />
        <Row label="Industrinetto" value={rr.industrinetto} hideIfZero />
        <Row label="Aktieutdelningar" value={rr.utdelningar} hideIfZero />
        <SumRow label="Summa intäkter" value={rr.summaIntakter} />

        <div style={P.section}>Kostnader</div>
        <Row label="Driftkostnader" value={rr.driftkostnader} negative />
        <Row label="Förvaltning & direktör" value={rr.forvaltning} negative hideIfZero />
        <Row label="Personal" value={rr.personal} negative hideIfZero />
        <Row label="Kontor & organisation" value={rr.kontor} negative hideIfZero />
        <Row label="Försäkringspremier" value={rr.forsakringar} negative hideIfZero />
        <SumRow label="Rörelseresultat" value={rr.rorelseresultat} colored />

        <div style={P.section}>Finansnetto & skatt</div>
        <Row label="Räntekostnader" value={rr.rantekostnad} negative />
        <SumRow label="Resultat före skatt" value={rr.resultatForeSkatt} colored />
        <Row label={`Skatt (${Math.round(rr.skattesats * 100)} % efter avskrivningsavdrag ${kr(rr.avskrivningsavdrag)})`} value={rr.skatt} negative hideIfZero />
        <SumRow label="Månadens resultat" value={rr.resultat} colored />

        <div style={P.hint}>
          Amortering ingår inte – den är ingen kostnad utan flyttar kassa till eget kapital.
          Engångsposter (underhåll, köp, projekt) syns i Logg.
        </div>
      </div>

      {/* ── Balansräkning ────────────────────────────────────────── */}
      <div style={P.card}>
        <div style={P.title}>⚖️ Balansräkning</div>
        <div style={P.sub}>
          Soliditet {Math.round(br.soliditet * 100)} % · balansomslutning {msek(br.summaTillgangar)}
        </div>

        <div style={P.section}>Tillgångar</div>
        <Row label="Kassa" value={br.kassa} />
        <Row label="Fastigheter (marknadsvärde)" value={br.fastigheter} />
        <Row label="Mark (tomter)" value={br.mark} hideIfZero />
        <Row label="Industritillgångar" value={br.industri} hideIfZero />
        <Row label="Aktieportfölj" value={br.aktier} hideIfZero />
        <Row label="Dotterbolag" value={br.dotterbolag} hideIfZero />
        <SumRow label="Summa tillgångar" value={br.summaTillgangar} />

        <div style={P.section}>Skulder</div>
        <Row label="Banklån" value={br.banklan} negative />
        <Row label="Obligationer" value={br.obligationer} negative hideIfZero />
        <Row label="Revolverkredit" value={br.revolver} negative hideIfZero />
        <SumRow label="Summa skulder" value={br.summaSkulder} />

        <div style={P.section}>Eget kapital</div>
        <SumRow label="Eget kapital (tillgångar − skulder)" value={br.egetKapital} colored />

        <div style={P.hint}>
          Fastigheter tas upp till marknadsvärde. Yield on cost per fastighet finns i
          Portfölj och Översikt.
        </div>
      </div>
    </div>
  );
}
