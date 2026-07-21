/* Arv & Dynasti – slutspelets prestigemål: dynastipoäng med betyg,
   ägarens privata förmögenhet (byggd av utdelningar) med lyxköp och
   donationer, samt megaprojekt på helägda kvarter. */

import { useState } from "react";
import { fullyOwnedBlocks } from "../engine/blocks";
import {
  CITY_PROJECT_MIN_LEVEL,
  CITY_PROJECT_PROFILES,
  blockDistrictName,
  cityProfileById,
  cityProjectCost,
  eligibleCityBlocks,
} from "../engine/cityProjects";
import { kr, msek } from "../engine/format";
import { LUXURIES, MEGA_PROJECTS, dynastyScore } from "../engine/lateGame";
import type { GameAction, GameState } from "../engine/types";
import { BURGUNDY, C } from "../styles/tokens";

/** Minsta kassa som alltid behålls i bolaget vid utdelning. */
const DIVIDEND_CASH_FLOOR = 500_000;

const P: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, color: "#1a1a1a" },
  card: { background: "#f7f9fb", border: "1px solid #dde4ec", borderRadius: 10, padding: "14px 16px" },
  title: { fontWeight: 800, fontSize: 15, marginBottom: 8 },
  row: { display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", fontSize: 13 },
  hint: { fontSize: 11, color: "#8291a3", marginTop: 8 },
};

const GRADE_COLOR: Record<string, string> = { S: "#b8860b", A: "#22a06b", B: "#4757c8", C: "#c07f16", E: "#8291a3" };

export function LegacyPanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const dyn = dynastyScore(state);
  const wealth = state.ownerWealth ?? 0;
  const owned = new Set(state.ownerLuxuries ?? []);
  const blocks = fullyOwnedBlocks(state);
  const cityBlocks = eligibleCityBlocks(state, blocks);
  const levelOk = (state.companyLevel ?? 1) >= CITY_PROJECT_MIN_LEVEL;

  // Utdelning: flytta pengar från bolagets kassa till ägarens privata förmögenhet.
  const divCap = Math.max(0, state.cash - DIVIDEND_CASH_FLOOR);
  const [divAmt, setDivAmt] = useState(0);
  const div = Math.min(divAmt, divCap);

  return (
    <div style={P.wrap}>
      {/* ── Dynastipoäng ─────────────────────────────────────────── */}
      <div style={{ ...P.card, borderColor: GRADE_COLOR[dyn.grade] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={P.title}>🏛️ Dynasty points: {dyn.total}</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: GRADE_COLOR[dyn.grade] }}>Grade {dyn.grade}</div>
        </div>
        <div style={{ fontSize: 12.5, color: "#5d6b7c", marginBottom: 8 }}>{dyn.gradeLabel}</div>
        <div style={P.row}><span>Paid out to the owner</span><strong>{dyn.utdelningar} p</strong></div>
        <div style={P.row}><span>Luxury & donations</span><strong>{dyn.lyxOchDonationer} p</strong></div>
        <div style={P.row}><span>Megaprojects</span><strong>{dyn.megaprojekt} p</strong></div>
        <div style={P.row}><span>Signature blocks</span><strong>{dyn.stadsdelar} p</strong></div>
        <div style={P.row}><span>ESG portfolio</span><strong>{dyn.esg} p</strong></div>
        <div style={P.row}><span>City-building legacy</span><strong>{dyn.stadsbyggnad} p</strong></div>
        <div style={P.row}><span>Satisfied tenants</span><strong>{dyn.nojdhet} p</strong></div>
        <div style={P.row}><span>Regulated housing (public benefit)</span><strong>{dyn.reglerat} p</strong></div>
        <div style={P.hint}>
          Money dies with the company — the points measure what you leave behind. S-grade at 1000 pts.
        </div>
      </div>

      {/* ── Ägarens privata förmögenhet ──────────────────────────── */}
      <div style={P.card}>
        {(() => {
          const fbab = state.stocks.find((st) => st.id === "FBAB");
          const shareVal = Math.round((state.ownerShares ?? 0) * (fbab?.price ?? 0));
          return (
            <>
              <div style={P.title}>💼 Owner’s wealth: {msek(wealth + shareVal)}</div>
              {shareVal > 0 && (
                <div style={{ fontSize: 12, color: "#5d6b7c", marginBottom: 4 }}>
                  Cash wallet {msek(wealth)} · shares in the company {msek(shareVal)} (Company → Group)
                </div>
              )}
            </>
          );
        })()}
        <div style={{ fontSize: 12, color: "#5d6b7c", marginBottom: 10 }}>
          Pay a dividend from the company and the money becomes yours privately — the company’s cash
          can’t touch it. Use it for luxury and donations below, buy shares in your own company, or
          inject it back when the company needs capital.
        </div>
        {wealth >= 100_000 && (
          <button
            style={{
              width: "100%", marginBottom: 12, padding: "8px", borderRadius: 6,
              border: "1px solid #dde4ec", fontWeight: 700, fontSize: 12.5, cursor: "pointer",
              background: "#fbfdff", color: "#2c5530",
            }}
            onClick={() => dispatch({ type: "OWNER_INJECTION", amount: wealth })}
            title={state.ipoActive
              ? "Injects your private wealth as company capital via a directed share issue to you — strengthens your voting control"
              : "Injects your private wealth into the company's cash"}
          >
            💼 Owner injection: put {msek(wealth)} back into the company
            {state.ipoActive ? " (directed share issue)" : ""}
          </button>
        )}

        {/* Utdelningskontroll – flyttad hit från Finans så allt ägar-relaterat samlas. */}
        <div style={{
          border: "1px solid #dde4ec", borderRadius: 8, padding: "10px 12px",
          background: "#fbfdff", marginBottom: 12,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
            <span style={{ color: "#5d6b7c" }}>Totalt utdelat</span>
            <strong>{kr(state.dividendsPaid ?? 0)}</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="range" min={0} max={Math.max(0, divCap)} step={100_000}
              value={div}
              onChange={(e) => setDivAmt(+e.target.value)}
              disabled={divCap <= 0}
              style={{ flex: 1, accentColor: C.gold }}
            />
            <span style={{ minWidth: 92, textAlign: "right", fontWeight: 700 }}>{msek(div)}</span>
          </div>
          <button
            style={{
              width: "100%", marginTop: 8, padding: "8px", borderRadius: 6,
              border: "none", fontWeight: 700, fontSize: 12.5,
              cursor: div > 0 ? "pointer" : "default",
              background: div > 0 ? "#3d54d8" : "#dde4ec",
              color: div > 0 ? "#fff" : "#8291a3",
            }}
            disabled={div <= 0}
            onClick={() => { dispatch({ type: "PAY_DIVIDEND", amount: div }); setDivAmt(0); }}
          >
            Pay dividend{state.ipoActive ? " (eases takeover pressure)" : ""}
          </button>
          <div style={{ fontSize: 11, color: "#8291a3", marginTop: 4 }}>
            At least {kr(DIVIDEND_CASH_FLOOR)} is kept in the company’s cash.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 }}>
          {LUXURIES.map((l) => {
            const has = owned.has(l.id);
            // Morfars klocka kan inte köpas – den ärvs i berättelseläget.
            if (l.id === "morfarsklocka" && !has) return null;
            const affordable = wealth >= l.cost;
            return (
              <div key={l.id} style={{
                border: `1px solid ${has ? "#22a06b" : "#dde4ec"}`,
                background: has ? "#eef8f2" : "#fff",
                borderRadius: 8, padding: "9px 11px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                  <span>{l.icon} {l.name}</span>
                  <span style={{ color: "#5d6b7c" }}>{msek(l.cost)}</span>
                </div>
                <div style={{ fontSize: 11, color: "#8291a3", margin: "3px 0 6px" }}>{l.desc}</div>
                {has ? (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#22a06b" }}>✓ In the family’s possession · +{l.dynasty} pts</span>
                ) : (
                  <button
                    style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                      border: "none", cursor: affordable ? "pointer" : "default",
                      background: affordable ? BURGUNDY : "#dde4ec", color: affordable ? "#fff" : "#8291a3",
                    }}
                    disabled={!affordable}
                    onClick={() => dispatch({ type: "BUY_LUXURY", luxuryId: l.id })}
                  >
                    Buy · +{l.dynasty} pts{l.reputation ? ` · rep +${l.reputation}` : ""}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Stadsdelsprojekt ─────────────────────────────────────── */}
      <div style={P.card}>
        <div style={P.title}>🏙️ District projects</div>
        <div style={{ fontSize: 12, color: "#5d6b7c", marginBottom: 10 }}>
          Demolish a WHOLLY OWNED block in the stone city and build a signature block — a billion-krona build over
          several years that permanently lifts the whole district and rewrites the city’s skyline.
          {!levelOk && ` Requires company level ${CITY_PROJECT_MIN_LEVEL}.`}
          {levelOk && cityBlocks.length === 0 && " You have no free wholly owned block (buy all properties in a closed block in Downtown or Inner City)."}
        </div>
        {(state.cityProjects ?? []).map((m) => {
          const prof = cityProfileById(m.profile)!;
          return (
            <div key={m.blockId} style={{ ...P.row, fontWeight: 700 }}>
              <span>{prof.icon} {prof.name} in {blockDistrictName(m.blockId)} — under construction</span>
              <span>{m.monthsLeft} mo left</span>
            </div>
          );
        })}
        {(state.signatureBlocks ?? []).map((sb) => {
          const prof = cityProfileById(sb.profile)!;
          return (
            <div key={sb.blockId} style={{ ...P.row, color: "#b8860b", fontWeight: 700 }}>
              <span>🏆 {prof.icon} {prof.name} in {blockDistrictName(sb.blockId)}</span>
              <span>opened</span>
            </div>
          );
        })}
        {CITY_PROJECT_PROFILES.map((prof) => {
          const block = cityBlocks[0];
          const cost = block ? cityProjectCost(block, prof, state) : 0;
          const canStart = levelOk && !!block && state.cash >= cost;
          return (
            <div key={prof.id} style={{ borderTop: "1px solid #e8edf3", padding: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                <span>{prof.icon} {prof.name}</span>
                <span style={{ color: "#5d6b7c" }}>
                  {block ? msek(cost) : "—"} · {prof.months} mo · +{prof.dynasty} pts
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "#8291a3", margin: "2px 0 6px" }}>
                {prof.desc} The district lifts permanently (+{Math.round(prof.devBoost * 100)}%), reputation +{prof.reputation}.
              </div>
              <button
                style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, border: "none",
                  cursor: canStart ? "pointer" : "default",
                  background: canStart ? BURGUNDY : "#dde4ec", color: canStart ? "#fff" : "#8291a3",
                }}
                disabled={!canStart}
                title={!levelOk ? `Requires company level ${CITY_PROJECT_MIN_LEVEL}` : !block ? "Requires a free wholly owned block in the stone city" : state.cash < cost ? `Insufficient cash (${kr(cost)})` : ""}
                onClick={() => block && dispatch({ type: "START_CITY_PROJECT", blockId: block, profile: prof.id })}
              >
                Byggstarta{block ? ` (kvarter ${block}, ${blockDistrictName(block)})` : ""}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Megaprojekt ──────────────────────────────────────────── */}
      <div style={P.card}>
        <div style={P.title}>🏗️ Megaprojects</div>
        <div style={{ fontSize: 12, color: "#5d6b7c", marginBottom: 10 }}>
          Landmarks with fixed locations on the city’s outskirts. Requires company level 4, a good reputation (60+)
          and the company’s cash. Prestige — not returns.
        </div>
        {(state.megaActive ?? []).map((m) => {
          const proj = MEGA_PROJECTS.find((x) => x.id === m.projectId)!;
          return (
            <div key={m.projectId} style={{ ...P.row, fontWeight: 700 }}>
              <span>{proj.icon} {proj.name} — under construction</span>
              <span>{m.monthsLeft} mo left</span>
            </div>
          );
        })}
        {MEGA_PROJECTS.map((proj) => {
          const done = (state.megaCompleted ?? []).includes(proj.id);
          const active = (state.megaActive ?? []).some((m) => m.projectId === proj.id);
          if (active) return null;
          const canStart = !done && state.cash >= proj.cost && (state.companyLevel ?? 1) >= 4 && state.reputation >= 60;
          return (
            <div key={proj.id} style={{ borderTop: "1px solid #e8edf3", padding: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                <span>{proj.icon} {proj.name}{done ? " — OPENED" : ""}</span>
                <span style={{ color: "#5d6b7c" }}>{msek(proj.cost)} · {proj.months} mo · +{proj.dynasty} pts</span>
              </div>
              <div style={{ fontSize: 11.5, color: "#8291a3", margin: "2px 0 6px" }}>{proj.desc}</div>
              {done ? (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#b8860b" }}>🏆 Your name is over the entrance.</span>
              ) : (
                <button
                  style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, border: "none",
                    cursor: canStart ? "pointer" : "default",
                    background: canStart ? BURGUNDY : "#dde4ec", color: canStart ? "#fff" : "#8291a3",
                  }}
                  disabled={!canStart}
                  title={state.cash < proj.cost ? `Insufficient cash (${kr(proj.cost)})` : (state.companyLevel ?? 1) < 4 ? "Requires company level 4" : state.reputation < 60 ? "Requires reputation 60+" : ""}
                  onClick={() => dispatch({ type: "START_MEGA", projectId: proj.id })}
                >
                  Start construction
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
