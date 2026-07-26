/* Ägarkartan – vem äger vem på börsen, och hur mycket.

   Korsägandet byggs upp av rivalShareTrading i engine/stocks.ts: kapitalstarka
   rivaler tar positioner i varandra och i ditt bolag. Den här vyn gör nätet
   synligt: en stapel per bolag med ägarna färgade, och en vändbar riktning så
   du kan läsa både "vilka äger DEM" och "vad äger DE".                        */

import { useState } from "react";
import { msek } from "../engine/format";
import { holdingsOfOwner, ownershipMap, type OwnerStake } from "../engine/stocks";
import type { GameState } from "../engine/types";
import { C, FONTS } from "../styles/tokens";

/** Färg per ägartyp – samma kodning i stapeln och i listan. */
const KIND_COLOR: Record<OwnerStake["kind"], string> = {
  player: "#4757c8",   // du
  rival: "#c0392b",    // rival
  activist: "#c07f16", // aktivistfond
  market: "#8291a3",   // floaten
};
const KIND_LABEL: Record<OwnerStake["kind"], string> = {
  player: "You", rival: "Rival", activist: "Activist fund", market: "Free float",
};

/** Andel som procent med rimlig precision (små poster syns ändå). */
const pctText = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;

export function OwnershipPanel({ state }: { state: GameState }) {
  const [direction, setDirection] = useState<"owners" | "holdings">("owners");
  const companies = ownershipMap(state);

  // Alla som äger något någonstans – underlag för "vad äger de"-vyn.
  const owners = Array.from(
    new Set(companies.flatMap((c) => c.stakes.filter((s) => s.kind !== "market").map((s) => s.owner))),
  ).sort((a, b) => (a === "You" ? -1 : b === "You" ? 1 : a.localeCompare(b)));

  if (!companies.length) {
    return (
      <div style={{ ...card, color: C.creamSoft, fontSize: 13 }}>
        No listed companies yet. Ownership appears once rivals go public.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button style={chip(direction === "owners")} onClick={() => setDirection("owners")}>
          Who owns them
        </button>
        <button style={chip(direction === "holdings")} onClick={() => setDirection("holdings")}>
          What they own
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(Object.keys(KIND_LABEL) as OwnerStake["kind"][]).map((k) => (
            <span key={k} style={{ fontSize: 11, color: C.creamSoft, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: KIND_COLOR[k], display: "inline-block" }} />
              {KIND_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      {direction === "owners"
        ? companies.map((co) => (
            <div key={co.stockId} style={card}>
              <div style={headRow}>
                <span style={{ fontWeight: 800, color: co.isPlayer ? "#4757c8" : C.brassBright }}>
                  {co.isPlayer ? "🏠 " : ""}{co.name}
                </span>
                <span style={{ fontSize: 11.5, color: C.creamSoft }}>
                  {co.totalShares.toLocaleString("sv-SE")} shares · {msek(co.totalShares * co.price)}
                </span>
              </div>

              {/* Ägarstapel */}
              <div style={bar}>
                {co.stakes.map((s) => (
                  <div
                    key={s.owner}
                    title={`${s.owner}: ${pctText(s.share)} (${msek(s.value)})`}
                    style={{ width: `${s.share * 100}%`, background: KIND_COLOR[s.kind], height: "100%" }}
                  />
                ))}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <tbody>
                  {co.stakes.map((s) => (
                    <tr key={s.owner}>
                      <td style={{ padding: "3px 0", width: 14 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: KIND_COLOR[s.kind], display: "inline-block" }} />
                      </td>
                      <td style={{ padding: "3px 6px", color: s.kind === "player" ? "#4757c8" : C.creamText, fontWeight: s.kind === "player" ? 700 : 400 }}>
                        {s.owner}
                      </td>
                      <td style={{ padding: "3px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                        {pctText(s.share)}
                      </td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: C.creamSoft, fontVariantNumeric: "tabular-nums" }}>
                        {msek(s.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        : owners.map((owner) => {
            const held = holdingsOfOwner(state, owner);
            const total = held.reduce((a, h) => a + h.value, 0);
            return (
              <div key={owner} style={card}>
                <div style={headRow}>
                  <span style={{ fontWeight: 800, color: owner === "You" ? "#4757c8" : C.brassBright }}>{owner}</span>
                  <span style={{ fontSize: 11.5, color: C.creamSoft }}>
                    {held.length ? `${held.length} holding${held.length > 1 ? "s" : ""} · ${msek(total)}` : "no holdings"}
                  </span>
                </div>
                {held.length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <tbody>
                      {held.map((h) => (
                        <tr key={h.owner}>
                          <td style={{ padding: "3px 6px", color: C.creamText }}>{h.owner}</td>
                          <td style={{ padding: "3px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                            {pctText(h.share)}
                          </td>
                          <td style={{ padding: "3px 6px", textAlign: "right", color: C.creamSoft, fontVariantNumeric: "tabular-nums" }}>
                            {msek(h.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${C.brass}33`,
  borderRadius: 8,
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const headRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "baseline",
  gap: 10, flexWrap: "wrap", fontFamily: FONTS.heading, fontSize: 14,
};
const bar: React.CSSProperties = {
  display: "flex", height: 12, borderRadius: 3, overflow: "hidden",
  border: `1px solid ${C.brass}33`,
};
const chip = (on: boolean): React.CSSProperties => ({
  padding: "5px 12px", borderRadius: 14, fontSize: 12.5, fontWeight: 700,
  cursor: "pointer", fontFamily: FONTS.body,
  border: `1px solid ${on ? C.brass : C.brassDim}`,
  background: on ? C.burgundy : "transparent",
  color: on ? C.brassBright : C.creamSoft,
});
