import { kr } from "../engine/format";
import type { GameState } from "../engine/types";
import { C, FONTS } from "../styles/tokens";

interface Props {
  state: GameState;
}

const sectionHead: React.CSSProperties = {
  fontFamily: FONTS.heading,
  fontSize: 15,
  fontWeight: 700,
  color: C.brassBright,
  margin: "18px 0 10px",
  borderBottom: `1px solid ${C.brass}44`,
  paddingBottom: 6,
};

const chip = (color: string): React.CSSProperties => ({
  display: "inline-block",
  fontSize: 10,
  fontWeight: 700,
  color,
  background: color + "22",
  border: `1px solid ${color}55`,
  padding: "2px 7px",
  borderRadius: 8,
  marginLeft: 6,
});

export function ContractCalendar({ state }: Props) {
  const nowAbs = state.year * 12 + state.month;

  // Upcoming contract expirations ≤12 months
  const expiring = state.portfolio
    .flatMap((p) =>
      p.tenants.map((t) => ({
        propLabel: p.typeLabel,
        districtName: p.districtName,
        tenantName: t.name,
        monthsLeft: t.monthsLeft,
        rent: t.rent,
        isAnchor: t.isAnchor ?? false,
      })),
    )
    .filter((x) => x.monthsLeft <= 12)
    .sort((a, b) => a.monthsLeft - b.monthsLeft);

  // Ongoing constructions
  const constructions = state.portfolio
    .filter((p) => p.status === "bygger")
    .sort((a, b) => a.buildLeft - b.buildLeft);

  // Pending zone changes
  const zoneChanges = state.portfolio
    .filter((p) => p.pendingZoneChange != null)
    .map((p) => ({ ...p, pzc: p.pendingZoneChange! }));

  // Fixed rate expiry
  const fixedExpiry =
    state.rateMode === "fixed" && state.fixedUntilAbs != null
      ? { rate: state.fixedRate!, monthsLeft: state.fixedUntilAbs - nowAbs }
      : null;

  const urgentColor = (months: number) =>
    months <= 2 ? C.negative : months <= 6 ? C.gold : C.positive;

  return (
    <div style={{ color: C.parchment, fontFamily: FONTS.body }}>
      <h2 style={{ fontFamily: FONTS.heading, color: C.brassBright, marginBottom: 4 }}>
        Contract calendar
      </h2>
      <div style={{ fontSize: 12, color: C.creamSoft, marginBottom: 16 }}>
        Upcoming events over the next 12 months
      </div>

      {/* ── Fixed rate ── */}
      {fixedExpiry && (
        <div style={{
          background: C.wood,
          border: `1px solid ${C.brass}`,
          borderRadius: 6,
          padding: "10px 14px",
          marginBottom: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <span style={{ fontWeight: 700, color: C.brassBright }}>🔒 Fixed rate</span>
            <span style={{ fontSize: 12, color: C.creamSoft, marginLeft: 8 }}>
              {fixedExpiry.rate?.toFixed(2)}% locked
            </span>
          </div>
          <span style={chip(urgentColor(fixedExpiry.monthsLeft))}>
            {fixedExpiry.monthsLeft} mo left
          </span>
        </div>
      )}

      {/* ── Expiring contracts ── */}
      <div style={sectionHead}>Expiring leases ({expiring.length})</div>
      {expiring.length === 0 ? (
        <div style={{ fontSize: 13, color: C.creamSoft, marginBottom: 12 }}>
          No leases expire over the next 12 months.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {expiring.map((x, i) => (
            <div key={i} style={{
              background: C.wood,
              border: `1px solid ${C.brass}44`,
              borderRadius: 5,
              padding: "8px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div>
                <span style={{ fontWeight: 600, color: C.parchment }}>{x.tenantName}</span>
                {x.isAnchor && <span style={chip(C.gold)}>ANCHOR</span>}
                <div style={{ fontSize: 11, color: C.creamSoft, marginTop: 2 }}>
                  {x.propLabel} · {x.districtName} · {kr(x.rent)}/mo
                </div>
              </div>
              <span style={chip(urgentColor(x.monthsLeft))}>
                {x.monthsLeft} mo
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Constructions ── */}
      <div style={sectionHead}>Ongoing construction ({constructions.length})</div>
      {constructions.length === 0 ? (
        <div style={{ fontSize: 13, color: C.creamSoft, marginBottom: 12 }}>
          No ongoing construction.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {constructions.map((p) => (
            <div key={p.id} style={{
              background: C.wood,
              border: `1px solid ${C.brass}44`,
              borderRadius: 5,
              padding: "8px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div>
                <span style={{ fontWeight: 600, color: C.parchment }}>{p.typeLabel}</span>
                <div style={{ fontSize: 11, color: C.creamSoft, marginTop: 2 }}>
                  {p.districtName} · {p.area} m²
                </div>
              </div>
              <span style={chip(urgentColor(p.buildLeft))}>
                {p.buildLeft} mo left
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Zone changes ── */}
      {zoneChanges.length > 0 && (
        <>
          <div style={sectionHead}>Ongoing rezoning ({zoneChanges.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {zoneChanges.map((p) => (
              <div key={p.id} style={{
                background: C.wood,
                border: `1px solid ${C.brass}44`,
                borderRadius: 5,
                padding: "8px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div>
                  <span style={{ fontWeight: 600, color: C.parchment }}>{p.typeLabel}</span>
                  <span style={{ fontSize: 11, color: C.creamSoft, marginLeft: 6 }}>
                    → {p.pzc.targetType}
                  </span>
                  <div style={{ fontSize: 11, color: C.creamSoft, marginTop: 2 }}>{p.districtName}</div>
                </div>
                <span style={chip(urgentColor(p.pzc.monthsLeft))}>
                  {p.pzc.monthsLeft} mo left
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {expiring.length === 0 && constructions.length === 0 && zoneChanges.length === 0 && !fixedExpiry && (
        <div style={{
          marginTop: 20,
          padding: 20,
          border: `1px dashed ${C.brass}44`,
          borderRadius: 6,
          textAlign: "center",
          color: C.creamSoft,
          fontSize: 13,
        }}>
          No upcoming events to plan around.
        </div>
      )}
    </div>
  );
}
