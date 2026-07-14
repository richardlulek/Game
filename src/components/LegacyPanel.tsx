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
  const freeBlocks = blocks.filter((b) => !(state.megaActive ?? []).some((m) => m.blockId === b));
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
          <div style={P.title}>🏛️ Dynastipoäng: {dyn.total}</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: GRADE_COLOR[dyn.grade] }}>Betyg {dyn.grade}</div>
        </div>
        <div style={{ fontSize: 12.5, color: "#5d6b7c", marginBottom: 8 }}>{dyn.gradeLabel}</div>
        <div style={P.row}><span>Utdelat till ägaren</span><strong>{dyn.utdelningar} p</strong></div>
        <div style={P.row}><span>Lyx & donationer</span><strong>{dyn.lyxOchDonationer} p</strong></div>
        <div style={P.row}><span>Megaprojekt</span><strong>{dyn.megaprojekt} p</strong></div>
        <div style={P.row}><span>Signaturkvarter</span><strong>{dyn.stadsdelar} p</strong></div>
        <div style={P.row}><span>ESG-bestånd</span><strong>{dyn.esg} p</strong></div>
        <div style={P.row}><span>Nöjda hyresgäster</span><strong>{dyn.nojdhet} p</strong></div>
        <div style={P.row}><span>Reglerade bostäder (allmännytta)</span><strong>{dyn.reglerat} p</strong></div>
        <div style={P.hint}>
          Pengar dör med bolaget — poängen mäter vad du lämnar efter dig. S-betyg vid 1000 p.
        </div>
      </div>

      {/* ── Ägarens privata förmögenhet ──────────────────────────── */}
      <div style={P.card}>
        <div style={P.title}>💼 Ägarens förmögenhet: {msek(wealth)}</div>
        <div style={{ fontSize: 12, color: "#5d6b7c", marginBottom: 10 }}>
          Betala utdelning från bolaget så blir pengarna dina privat — bolagets kassa
          kan inte röra dem. Använd dem till lyx och donationer nedan.
        </div>

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
            Betala utdelning{state.ipoActive ? " (lindrar uppköpstryck)" : ""}
          </button>
          <div style={{ fontSize: 11, color: "#8291a3", marginTop: 4 }}>
            Minst {kr(DIVIDEND_CASH_FLOOR)} behålls i bolagets kassa.
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
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#22a06b" }}>✓ I familjens ägo · +{l.dynasty} p</span>
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
                    Köp · +{l.dynasty} p{l.reputation ? ` · rep +${l.reputation}` : ""}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Stadsdelsprojekt ─────────────────────────────────────── */}
      <div style={P.card}>
        <div style={P.title}>🏙️ Stadsdelsprojekt</div>
        <div style={{ fontSize: 12, color: "#5d6b7c", marginBottom: 10 }}>
          Riv ett HELÄGT kvarter i stenstaden och bygg ett signaturkvarter — miljardbygge i
          flera år som permanent lyfter hela distriktet och skriver om stadens siluett.
          {!levelOk && ` Kräver bolagsnivå ${CITY_PROJECT_MIN_LEVEL}.`}
          {levelOk && cityBlocks.length === 0 && " Du har inget ledigt helägt kvarter (köp alla fastigheter i ett slutet kvarter i Centrum eller Innerstaden)."}
        </div>
        {(state.cityProjects ?? []).map((m) => {
          const prof = cityProfileById(m.profile)!;
          return (
            <div key={m.blockId} style={{ ...P.row, fontWeight: 700 }}>
              <span>{prof.icon} {prof.name} i {blockDistrictName(m.blockId)} — bygget pågår</span>
              <span>{m.monthsLeft} mån kvar</span>
            </div>
          );
        })}
        {(state.signatureBlocks ?? []).map((sb) => {
          const prof = cityProfileById(sb.profile)!;
          return (
            <div key={sb.blockId} style={{ ...P.row, color: "#b8860b", fontWeight: 700 }}>
              <span>🏆 {prof.icon} {prof.name} i {blockDistrictName(sb.blockId)}</span>
              <span>invigt</span>
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
                  {block ? msek(cost) : "—"} · {prof.months} mån · +{prof.dynasty} p
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "#8291a3", margin: "2px 0 6px" }}>
                {prof.desc} Distriktet lyfter permanent (+{Math.round(prof.devBoost * 100)} %), rykte +{prof.reputation}.
              </div>
              <button
                style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, border: "none",
                  cursor: canStart ? "pointer" : "default",
                  background: canStart ? BURGUNDY : "#dde4ec", color: canStart ? "#fff" : "#8291a3",
                }}
                disabled={!canStart}
                title={!levelOk ? `Kräver bolagsnivå ${CITY_PROJECT_MIN_LEVEL}` : !block ? "Kräver ett ledigt helägt kvarter i stenstaden" : state.cash < cost ? `Kassan räcker inte (${kr(cost)})` : ""}
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
        <div style={P.title}>🏗️ Megaprojekt</div>
        <div style={{ fontSize: 12, color: "#5d6b7c", marginBottom: 10 }}>
          Kräver ett helägt kvarter som byggplats och bolagets kassa. Prestige — inte avkastning.
          {blocks.length === 0 && " Du äger inget helt kvarter ännu (köp alla fastigheter i ett slutet kvarter)."}
        </div>
        {(state.megaActive ?? []).map((m) => {
          const proj = MEGA_PROJECTS.find((x) => x.id === m.projectId)!;
          return (
            <div key={m.projectId} style={{ ...P.row, fontWeight: 700 }}>
              <span>{proj.icon} {proj.name} — under uppförande</span>
              <span>{m.monthsLeft} mån kvar</span>
            </div>
          );
        })}
        {MEGA_PROJECTS.map((proj) => {
          const done = (state.megaCompleted ?? []).includes(proj.id);
          const active = (state.megaActive ?? []).some((m) => m.projectId === proj.id);
          if (active) return null;
          const canStart = !done && freeBlocks.length > 0 && state.cash >= proj.cost;
          return (
            <div key={proj.id} style={{ borderTop: "1px solid #e8edf3", padding: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                <span>{proj.icon} {proj.name}{done ? " — INVIGD" : ""}</span>
                <span style={{ color: "#5d6b7c" }}>{msek(proj.cost)} · {proj.months} mån · +{proj.dynasty} p</span>
              </div>
              <div style={{ fontSize: 11.5, color: "#8291a3", margin: "2px 0 6px" }}>{proj.desc}</div>
              {done ? (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#b8860b" }}>🏆 Ditt namn står över entrén.</span>
              ) : (
                <button
                  style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, border: "none",
                    cursor: canStart ? "pointer" : "default",
                    background: canStart ? BURGUNDY : "#dde4ec", color: canStart ? "#fff" : "#8291a3",
                  }}
                  disabled={!canStart}
                  title={freeBlocks.length === 0 ? "Kräver ett ledigt helägt kvarter" : state.cash < proj.cost ? `Kassan räcker inte (${kr(proj.cost)})` : ""}
                  onClick={() => dispatch({ type: "START_MEGA", projectId: proj.id, blockId: freeBlocks[0] })}
                >
                  Byggstarta{freeBlocks.length > 0 ? ` (kvarter ${freeBlocks[0]})` : ""}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
