/* ============================================================
   UI-galleri – renderar varje panel isolerat med ett fabricerat
   tillstånd, utan 3D-canvas eller spelklocka. Aktiveras med
   ?gallery i URL:en. Gör visuell QA av hela UI:t deterministisk
   och skärmbildbar (sidan är statisk – ingen rAF-loop).
   ============================================================ */

import { Component, type ReactNode } from "react";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { propNOI } from "../engine/property";
import { C, FONTS, THEME } from "../styles/tokens";
import { galleryState } from "./galleryState";

import { MarketPanel } from "../components/MarketPanel";
import { PortfolioTable } from "../components/PortfolioTable";
import { PortfolioCard } from "../components/PortfolioCard";
import { PortfolioSummaryCard } from "../components/PortfolioSummaryCard";
import { ListingCard } from "../components/ListingCard";
import { FinancePanel } from "../components/FinancePanel";
import { CompanyPanel } from "../components/CompanyPanel";
import { GroupOverview } from "../components/GroupOverview";
import { StockExchange } from "../components/StockExchange";
import { TenantPanel } from "../components/TenantPanel";
import { PolicyPanel } from "../components/PolicyPanel";
import { IndustryMarket } from "../components/IndustryMarket";
import { StaffPanel } from "../components/StaffPanel";
import { ResearchPanel } from "../components/ResearchPanel";
import { DistrictPanel } from "../components/DistrictPanel";
import { KPIPanel } from "../components/KPIPanel";
import { LegacyPanel } from "../components/LegacyPanel";
import { BuildPanel } from "../components/BuildPanel";
import { AcquisitionPanel } from "../components/AcquisitionPanel";
import { ContractCalendar } from "../components/ContractCalendar";
import { MilestonesPanel } from "../components/MilestonesPanel";
import { NewsFeedPanel } from "../components/NewsFeedPanel";
import { FinancialStatements } from "../components/FinancialStatements";
import { ReceivershipModal } from "../components/ReceivershipModal";
import { GameOverModal } from "../components/GameOverModal";

const noop = () => {};

class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: String(e) }; }
  render() {
    if (this.state.err) return <div style={{ color: C.negative, fontSize: 12, padding: 12 }}>⚠ {this.state.err}</div>;
    return this.props.children;
  }
}

function Section({ id, title, width = 480, children }: { id: string; title: string; width?: number; children: ReactNode }) {
  return (
    <section id={id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: FONTS.heading, fontWeight: 700, color: C.brassBright, fontSize: 14, letterSpacing: 0.4, borderBottom: `1px solid ${C.brassDim}`, paddingBottom: 4 }}>
        {title}
      </div>
      <div style={{ width, maxWidth: "100%", background: C.felt, border: `1px solid ${C.brassDim}`, borderRadius: 8, padding: 14 }}>
        <Boundary>{children}</Boundary>
      </div>
    </section>
  );
}

export function Gallery() {
  const state = galleryState();
  const equity = equityOf(state);
  const ltv = ltvOf(state);
  const terms = loanTerms(state);

  return (
    <div style={{ minHeight: "100vh", background: THEME.feltBg, color: C.creamText, fontFamily: FONTS.body, padding: 24 }}>
      <h1 style={{ fontFamily: FONTS.display, color: C.brassBright, fontSize: 22, letterSpacing: 2, marginBottom: 4 }}>UI-GALLERI</h1>
      <div style={{ color: C.creamSoft, fontSize: 13, marginBottom: 24 }}>All panels with fabricated state – for visual QA (?gallery).</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "flex-start" }}>
        <Section id="g-market" title="Marknad">{<MarketPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-portfoliotable" title="Portfolio table (click a row → expand)" width={1040}>{<PortfolioTable state={state} dispatch={noop} />}</Section>
        <Section id="g-portfoliocard" title="Fastighetskort (uthyrt)" width={360}>{<PortfolioCard p={state.portfolio[0]} state={state} dispatch={noop} />}</Section>
        <Section id="g-portfoliocard-vac" title="Fastighetskort (vakant)" width={360}>{<PortfolioCard p={state.portfolio[1]} state={state} dispatch={noop} />}</Section>
        <Section id="g-portfoliocard-wide" title="Property card – wide layout (expanded in list)" width={960}>{<PortfolioCard p={state.portfolio[1]} state={state} dispatch={noop} wide />}</Section>
        <Section id="g-portfolio-cardsview" title="Card view (compact, scannable cards in a grid)" width={1040}>
          {<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, alignItems: "start" }}>
            {state.portfolio.map((p) => <PortfolioSummaryCard key={p.id} p={p} state={state} open={false} onToggle={noop} />)}
          </div>}
        </Section>
        <Section id="g-listing" title="Objektkort (Marknad)" width={360}>{<ListingCard p={state.listings[0]} state={state} dispatch={noop} />}</Section>
        <Section id="g-finance" title="Finans" width={640}>{<FinancePanel state={state} dispatch={noop} equity={equity} ltv={ltv} terms={terms} />}</Section>
        <Section id="g-company" title="Bolag">{<CompanyPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-group" title="Group overview" width={640}>{<GroupOverview state={state} dispatch={noop} />}</Section>
        <Section id="g-stocks" title="Stock exchange" width={860}>{<StockExchange state={state} dispatch={noop} />}</Section>
        <Section id="g-tenants" title="Uthyrning" width={640}>{<TenantPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-policy" title="Policy">{<PolicyPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-industry" title="Industrimarknad" width={640}>{<IndustryMarket state={state} dispatch={noop} />}</Section>
        <Section id="g-staff" title="Staff">{<StaffPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-research" title="Forskning">{<ResearchPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-district" title="Distrikt">{<DistrictPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-kpi" title="Nyckeltal (KPI)">{<KPIPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-legacy" title="Arv & slutspel">{<LegacyPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-build" title="Bygg">{<BuildPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-acquisition" title="Acquisition" width={640}>{<AcquisitionPanel state={state} dispatch={noop} />}</Section>
        <Section id="g-contracts" title="Kontraktskalender" width={640}>{<ContractCalendar state={state} />}</Section>
        <Section id="g-milestones" title="Milstolpar">{<MilestonesPanel state={state} />}</Section>
        <Section id="g-news" title="News feed" width={520}>{<NewsFeedPanel state={state} onBuyPr={() => {}} />}</Section>
        <Section id="g-statements" title="Bokslut" width={640}>{<FinancialStatements state={state} />}</Section>
        {/* Rekonstruktionsmenyn: transform-tricket gör att den fixed-positionerade
            overlayen fyller sektionen i stället för hela skärmen. */}
        <Section id="g-receivership" title="Rekonstruktion (kris)" width={720}>
          <div style={{ position: "relative", transform: "translate(0,0)", height: 720, overflow: "hidden", borderRadius: 8 }}>
            <ReceivershipModal
              state={{
                ...state,
                cash: -1_400_000,
                receivership: { shortfall: 1_400_000, enteredAbs: state.year * 12 + state.month },
                revolving: { limit: 2_000_000, used: 1_400_000 },
                stocks: state.stocks.map((st, i) =>
                  i === 0 ? { ...st, owned: 500 } : st,
                ),
              }}
              dispatch={noop}
            />
          </div>
        </Section>
        {/* Slutskärmen (insolvens-varianten) – samma transform-trick. */}
        <Section id="g-gameover" title="Slutskärm (game over)" width={620}>
          <div style={{ position: "relative", transform: "translate(0,0)", height: 700, overflow: "hidden", borderRadius: 8 }}>
            <GameOverModal
              state={{
                ...state,
                gameOver: true,
                debt: 42_000_000,
                gameOverReason: {
                  icon: "💥",
                  title: "Bankruptcy — insolvent",
                  text: "Debts of 42.0 MSEK exceeded everything the company owned: with cash at −2,500,000 kr, even a full fire-sale liquidation (≈18.5 MSEK net) could not lift the account above the −1,000,000 kr floor. The company was over-leveraged — with no equity cushion left, there was nothing for a receiver to restructure around. Next run: keep loan-to-value lower and hold a cash buffer before expanding.",
                },
              }}
              onNewGame={noop}
              onDismiss={noop}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
