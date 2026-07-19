/* Bolagshubben – all bolagsinformation samlad i ETT fönster med
   interna flikar: Bolaget, Milstolpar, Översikt, KPI och Koncern.
   Flikar låses upp med bolagsnivån (samma trappa som tidigare
   separata fönster). */

import { useState } from "react";
import { tierForLevel, unlockLevelFor, unlockedWindows } from "../engine/company";
import type { GameAction, GameState } from "../engine/types";
import { C, FONTS } from "../styles/tokens";
import { CompanyPanel } from "./CompanyPanel";
import { FinancialStatements } from "./FinancialStatements";
import { LegacyPanel } from "./LegacyPanel";
import { GroupOverview } from "./GroupOverview";
import { KPIPanel } from "./KPIPanel";
import { MilestonesPanel } from "./MilestonesPanel";
import { PortfolioTable } from "./PortfolioTable";

/** Flik-id:n matchar de gamla fönster-id:na så TIERS-upplåsningarna gäller. */
const HUB_TABS = [
  { id: "bolaget", label: "Bolaget", icon: "🏠" },
  { id: "bokslut", label: "Bokslut", icon: "📒" },
  { id: "arv", label: "Arv", icon: "👑" },
  { id: "milestones", label: "Milestones", icon: "🏅" },
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "kpi", label: "KPI", icon: "📐" },
  { id: "group", label: "Group", icon: "🏛️" },
] as const;

type HubTab = (typeof HUB_TABS)[number]["id"];

export function CompanyHub({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (a: GameAction) => void;
}) {
  const [tab, setTab] = useState<HubTab>("bolaget");
  const unlocked = unlockedWindows(state.companyLevel ?? 1);
  // Bokslut och Arv är alltid öppna – ekonomi och långsiktiga mål
  // ska synas från dag ett.
  const isOpen = (id: HubTab) => id === "bolaget" || id === "bokslut" || id === "arv" || unlocked.has(id);
  const active: HubTab = isOpen(tab) ? tab : "bolaget";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 2, borderBottom: `2px solid ${C.brass}44`, flexWrap: "wrap" }}>
        {HUB_TABS.map((t) => {
          const open = isOpen(t.id);
          const sel = active === t.id;
          if (!open) {
            const req = tierForLevel(unlockLevelFor(t.id));
            return (
              <button
                key={t.id}
                style={{
                  padding: "7px 14px", background: "none", border: "none",
                  borderBottom: "3px solid transparent", marginBottom: -2,
                  color: C.creamSoft, opacity: 0.4, fontFamily: FONTS.heading,
                  fontSize: 13.5, cursor: "default", whiteSpace: "nowrap",
                }}
                title={`🔒 ${t.label} – unlocks at level ${req.level}: ${req.name}`}
              >
                🔒 {t.label}
              </button>
            );
          }
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "7px 14px", background: "none", border: "none",
                borderBottom: sel ? `3px solid ${C.brass}` : "3px solid transparent",
                marginBottom: -2,
                color: sel ? C.brassBright : C.creamSoft,
                fontFamily: FONTS.heading, fontWeight: sel ? 700 : 500,
                fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {active === "bolaget" && <CompanyPanel state={state} dispatch={dispatch} />}
      {active === "bokslut" && <FinancialStatements state={state} />}
      {active === "arv" && <LegacyPanel state={state} dispatch={dispatch} />}
      {active === "milestones" && <MilestonesPanel state={state} />}
      {active === "overview" && <PortfolioTable state={state} dispatch={dispatch} />}
      {active === "kpi" && <KPIPanel state={state} dispatch={dispatch} />}
      {active === "group" && <GroupOverview state={state} dispatch={dispatch} />}
    </div>
  );
}
