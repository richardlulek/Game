/* ============================================================
   Avknoppningar (Capitalism Lab-luckan "spin-off IPOs"):

   En hel industrisektor (≥2 färdiga tillgångar) kan knoppas av
   till ett eget börsnoterat bolag. Tillgångarna ligger kvar i
   industryPortfolio (kartan och panelerna fungerar som förut)
   men taggas med spinOffId och tillhör därefter det noterade
   bolaget:

   · Spelaren väljer float (25/40/60 %) och får emissions-
     likviden minus rådgivararvodet i kassan.
   · Tillgångarnas driftnetto går till avknoppningens EGEN kassa
     – inte till spelarens (simulation.ts routar om NOI:t).
   · Varje kvartal delas 60 % av kassan ut; spelaren får sin
     pro rata-andel via sitt aktieinnehav.
   · Aktien prissätts fundamentalt (tillgångsvärde + kassa per
     aktie) precis som spelarens eget bolag och rivalerna –
     ingen slumpvandring. Innehavet handlas med vanliga
     marknadsordrar på börsen.

   Ren logik, inga React-beroenden.
   ============================================================ */

import { industryAssetValue } from "./industries";
import { propMarketValue, propNOI } from "./property";
import type { GameState, IndustryAsset, IndustrySectorKey, Property, SpinOff, Stock } from "./types";

/** Valbara floats vid avknoppningen. */
export const SPINOFF_FLOATS = [0.25, 0.4, 0.6];
/** Rådgivar- och noteringsarvode: andel av bolagsvärdet (minst 2 Msek). */
export const SPINOFF_FEE_PCT = 0.03;
export const SPINOFF_FEE_MIN = 2_000_000;
/** Minsta antal färdiga tillgångar i sektorn. */
export const SPINOFF_MIN_ASSETS = 2;
/** Kvartalsutdelning: andel av avknoppningens kassa som delas ut. */
export const SPINOFF_DIVIDEND_PAYOUT = 0.6;
/** Bolagsnivå som krävs (samma som bankförvärv – koncernstadiet). */
export const SPINOFF_MIN_LEVEL = 4;

const SECTOR_COMPANY: Record<IndustrySectorKey, { suffix: string; stockSector: Stock["sector"] }> = {
  hotell: { suffix: "Hotels Group", stockSector: "handel" },
  energi: { suffix: "Energy", stockSector: "industri" },
  logistik: { suffix: "Logistics", stockSector: "industri" },
};

export function spinoffCompanyName(s: GameState, sector: IndustrySectorKey): string {
  const base = (s.companyName ?? "Fastighets AB").replace(/\s*(AB|PLC|Inc|Ltd)\.?$/i, "").trim();
  return `${base} ${SECTOR_COMPANY[sector].suffix}`;
}

export function spinoffStockSector(sector: IndustrySectorKey): Stock["sector"] {
  return SECTOR_COMPANY[sector].stockSector;
}

/** Tillgångar som kan knoppas av i en sektor (färdiga, inte redan avknoppade). */
export function spinnableAssets(s: GameState, sector: IndustrySectorKey): IndustryAsset[] {
  return (s.industryPortfolio ?? []).filter(
    (a) => a.sector === sector && a.status === "klar" && !a.spinOffId,
  );
}

/** Avkastningskrav vid intjäningsvärdering av avknoppningar. */
export const SPINOFF_CAP_RATE = 0.10;

/** Bolagsvärdet vid noteringen: det HÖGSTA av tillgångarnas marknadsvärde
 *  och kapitaliserad intjäning (senaste månadens netto × 12 / 10 %).
 *  Balansrundan visade att ren substansvärdering underprisar lönsamma
 *  sektorer ~3× – floaten såldes för billigt och avknoppning blev alltid
 *  en förlustaffär. Börsen betalar för vinster, inte bara för tegel. */
export function spinoffValuation(s: GameState, sector: IndustrySectorKey): number {
  const assets = spinnableAssets(s, sector);
  const bookValue = assets.reduce((a, x) => a + industryAssetValue(x, s), 0);
  const annualNet = assets.reduce((a, x) => a + (x.monthlyRevenue ?? 0) - (x.monthlyOpex ?? 0), 0) * 12;
  return Math.round(Math.max(bookValue, annualNet / SPINOFF_CAP_RATE));
}

export function spinoffFee(valuation: number): number {
  return Math.max(SPINOFF_FEE_MIN, Math.round(valuation * SPINOFF_FEE_PCT));
}

/** Underhåll: avknoppningen sköter sina egna hus (kostnad per månad som
 *  andel av tillgångsvärdet, dras från bolagets kassa i simulationen). */
export const SPINOFF_UPKEEP_PCT = 0.0015;
/** Skicket som det egna underhållet håller tillgångarna vid. */
export const SPINOFF_UPKEEP_COND = 86;

/** Avknoppningens värde: max(tillgångar, kapitaliserad intjäning) + kassa –
 *  samma intjäningslogik som noteringsvärderingen så kursen inte rasar till
 *  tegelvärdet dagen efter börsdebuten. */
export function spinoffEquity(s: GameState, spin: SpinOff): number {
  const industryAssets = (s.industryPortfolio ?? [])
    .filter((a) => a.spinOffId === spin.id)
    .reduce((a, x) => a + industryAssetValue(x, s), 0);
  // Fastighets-avknoppningar bär hus i stället för industritillgångar.
  const propAssets = (s.portfolio ?? [])
    .filter((p) => p.spinOffId === spin.id)
    .reduce((a, p) => a + propMarketValue(p, s), 0);
  const assets = industryAssets + propAssets;
  const earningsValue = Math.max(0, spin.lastMonthNet) * 12 / SPINOFF_CAP_RATE;
  return Math.round(Math.max(assets, earningsValue) + spin.cash);
}

/* ── Fastighets-avknoppning: ett distrikts bestånd noteras som PropCo ── */

/** Minsta antal färdiga hus i distriktet för en fastighets-avknoppning. */
export const PROPERTY_SPINOFF_MIN = 3;

/** Egna, färdiga, ännu inte avknoppade hus i ett distrikt. */
export function propertySpinnable(s: GameState, district: string): Property[] {
  return s.portfolio.filter(
    (p) => p.district === district && p.status === "klar" && p.owned && !p.spinOffId,
  );
}

/** PropCo-namn: bolagsnamnet + distriktet + "Propco". */
export function propertySpinoffName(s: GameState, districtLabel: string): string {
  const base = (s.companyName ?? "Fastighets AB").replace(/\s*(AB|PLC|Inc|Ltd)\.?$/i, "").trim();
  return `${base} ${districtLabel} PropCo`;
}

/** Noteringsvärdet: max(husens marknadsvärde, kapitaliserad intjäning). Samma
 *  logik som sektorvärderingen så börsen betalar för hyror, inte bara tegel. */
export function propertySpinoffValuation(s: GameState, district: string): number {
  const props = propertySpinnable(s, district);
  const bookValue = props.reduce((a, p) => a + propMarketValue(p, s), 0);
  const annualNet = props.reduce((a, p) => a + propNOI(p, s), 0);
  return Math.round(Math.max(bookValue, annualNet / SPINOFF_CAP_RATE));
}

/** Substanskurs per aktie – samma fundamentala modell som FBAB/rivaler. */
export function spinoffSharePrice(s: GameState, spin: SpinOff, st: Stock): number {
  return Math.max(0.5, Math.round((spinoffEquity(s, spin) / st.sharesOutstanding) * 100) / 100);
}

/** Spelarens andel av avknoppningen (0–1). */
export function spinoffOwnedPct(s: GameState, spin: SpinOff): number {
  const st = s.stocks.find((x) => x.id === spin.stockId);
  return st ? st.owned / st.sharesOutstanding : 0;
}
