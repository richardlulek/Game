import { useState } from "react";
import { DISTRICTS } from "../engine/data";
import { districtTier, nextDistrictTier } from "../engine/districtTiers";
import { kr, msek, pct } from "../engine/format";
import { propMarketValue } from "../engine/property";
import type { GameAction, GameState } from "../engine/types";
import { C, FONTS } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

function demandLabel(demand: number): string {
  if (demand >= 1.0) return "Hög";
  if (demand >= 0.85) return "Medel";
  return "Låg";
}

export function DistrictPanel({ state, dispatch }: Props) {
  const [investAmts, setInvestAmts] = useState<Record<string, number>>({});

  return (
    <div style={{ color: C.parchment, fontFamily: FONTS.body }}>
      <h2 style={{ fontFamily: FONTS.heading, color: C.brassBright, marginBottom: 20 }}>
        Distriktsöversikt
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {DISTRICTS.map((d) => {
          // Player's properties in this district
          const myProps = state.portfolio.filter((p) => p.district === d.id && p.status === "klar");
          const myCount = myProps.length;
          const myValue = myProps.reduce((a, p) => a + propMarketValue(p, state), 0);

          // Rival properties in this district
          const rivalCounts: Record<string, number> = {};
          for (const comp of state.competitors) {
            const cnt = (comp.portfolio ?? []).filter((p) => p.district === d.id).length;
            if (cnt > 0) rivalCounts[comp.name] = cnt;
          }

          // Listings in this district
          const listingCount = state.listings.filter((p) => p.district === d.id).length;

          // Total properties in district (player + rivals + listings)
          const rivalTotal = Object.values(rivalCounts).reduce((a, n) => a + n, 0);
          const totalInDistrict = myCount + rivalTotal + listingCount;

          // Market share
          const marketShare = totalInDistrict > 0 ? myCount / totalInDistrict : 0;

          // Top 2 rivals by count
          const topRivals = Object.entries(rivalCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2);

          // District development score
          const devScore = state.districtDev?.[d.id] ?? 1;

          // Is player leading in this district?
          const isLeading = myCount > 0 && myCount >= Math.max(1, rivalTotal > 0 ? Math.max(...Object.values(rivalCounts)) : 0);

          // Market share bar color
          const barColor = marketShare >= 0.40 ? C.positive : marketShare >= 0.20 ? C.gold : C.negative;

          return (
            <div key={d.id} style={{
              background: C.wood,
              border: `1px solid ${C.brass}`,
              borderRadius: 8,
              padding: "16px 18px",
              position: "relative",
            }}>
              {/* Ledande badge */}
              {isLeading && (
                <div style={{
                  position: "absolute",
                  top: 10,
                  right: 12,
                  background: C.gold,
                  color: C.ink,
                  fontSize: 10,
                  fontWeight: 800,
                  borderRadius: 4,
                  padding: "2px 8px",
                  fontFamily: FONTS.heading,
                  letterSpacing: 1,
                }}>
                  LEDANDE
                </div>
              )}

              {/* Header med distriktsöde */}
              {(() => {
                const tier = districtTier(state, d.id);
                const next = nextDistrictTier(tier);
                return (
                  <>
                    <div style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: 700, color: C.brassBright, marginBottom: 2 }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: 11.5, marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, color: tier.id === "exklusivt" ? C.gold : tier.id === "eftersatt" ? C.negativeBright : C.parchment }}>
                        {tier.icon} {tier.name}
                      </span>
                      {next && (
                        <span style={{ color: C.creamSoft }}>
                          {" "}· {Math.round(((devScore - tier.min) / (next.min - tier.min)) * 100)} % mot {next.name}
                        </span>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Key metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", fontSize: 12, marginBottom: 12 }}>
                <span style={{ color: C.creamSoft }}>Tillväxt:</span>
                <span style={{ fontWeight: 700, color: d.growth >= 1.1 ? C.positive : C.parchment }}>
                  {(d.growth * 100).toFixed(0)} %
                </span>

                <span style={{ color: C.creamSoft }}>Efterfrågan:</span>
                <span style={{ fontWeight: 700 }}>
                  {demandLabel(d.demand)}
                </span>

                <span style={{ color: C.creamSoft }}>Prestige:</span>
                <span style={{ fontWeight: 700 }}>{"★".repeat(Math.round(d.prestige * 2)).slice(0, 5)}</span>

                <span style={{ color: C.creamSoft }}>Områdesutveckling:</span>
                <span style={{ fontWeight: 700, color: devScore >= 1.1 ? C.positive : devScore >= 1.0 ? C.gold : C.negative }}>
                  {(devScore * 100).toFixed(1)} %
                </span>
              </div>

              {/* Player stats */}
              <div style={{ borderTop: `1px solid ${C.brass}44`, paddingTop: 10, marginTop: 4 }}>
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: C.creamSoft }}>Dina fastigheter: </span>
                  <strong style={{ color: C.parchment }}>{myCount} st</strong>
                  {myValue > 0 && (
                    <span style={{ color: C.creamSoft }}> · {msek(myValue)}</span>
                  )}
                </div>

                {/* Market share bar */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.creamSoft, marginBottom: 3 }}>
                    <span>Din marknadsandel</span>
                    <span style={{ fontWeight: 700, color: barColor }}>{pct(marketShare)}</span>
                  </div>
                  <div style={{ background: C.woodDark, borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.min(100, Math.round(marketShare * 100))}%`,
                      height: "100%",
                      background: barColor,
                      borderRadius: 4,
                      transition: "width 0.3s",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.creamSoft, marginTop: 2 }}>
                    {myCount} av {totalInDistrict} fastigheter i distriktet
                  </div>
                </div>

                {/* Top rivals */}
                {topRivals.length > 0 && (
                  <div style={{ fontSize: 11 }}>
                    <span style={{ color: C.creamSoft }}>Topp rivaler: </span>
                    {topRivals.map(([name, cnt], i) => (
                      <span key={name}>
                        {i > 0 && <span style={{ color: C.creamSoft }}>, </span>}
                        <span style={{ color: C.negativeBright, fontWeight: 600 }}>{name}</span>
                        <span style={{ color: C.creamSoft }}> ({cnt} st)</span>
                      </span>
                    ))}
                  </div>
                )}
                {topRivals.length === 0 && myCount > 0 && (
                  <div style={{ fontSize: 11, color: C.positive, fontStyle: "italic" }}>
                    Inga rivaler i detta distrikt
                  </div>
                )}
              </div>

              {/* Invest in district */}
              <div style={{ borderTop: `1px solid ${C.brass}44`, paddingTop: 10, marginTop: 8 }}>
                <div style={{ fontSize: 11, color: C.creamSoft, marginBottom: 6 }}>
                  Investera direkt i distriktet (höjer områdesutveckling)
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="range"
                    min={500000}
                    max={Math.min(state.cash, 10_000_000)}
                    step={500000}
                    value={investAmts[d.id] ?? 1_000_000}
                    onChange={(e) => setInvestAmts({ ...investAmts, [d.id]: +e.target.value })}
                    style={{ flex: 1, accentColor: C.brass }}
                  />
                  <span style={{ fontSize: 12, minWidth: 60 }}>{msek(investAmts[d.id] ?? 1_000_000)}</span>
                </div>
                <button
                  onClick={() => dispatch({ type: "INVEST_DISTRICT", districtId: d.id, amount: investAmts[d.id] ?? 1_000_000 })}
                  disabled={state.cash < 500_000 || state.gameOver}
                  style={{
                    marginTop: 6,
                    padding: "7px 14px",
                    fontSize: 12,
                    borderRadius: 4,
                    border: `1px solid ${C.brass}`,
                    background: state.cash >= 500_000 ? C.burgundy : "#666",
                    color: C.brassBright,
                    cursor: state.cash >= 500_000 ? "pointer" : "default",
                    fontWeight: 700,
                    width: "100%",
                  }}
                >
                  Investera i {d.name}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
