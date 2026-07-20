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
import type { GameState, IndustryAsset, IndustrySectorKey, SpinOff, Stock } from "./types";

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

/** Bolagsvärdet vid noteringen = tillgångarnas marknadsvärde. */
export function spinoffValuation(s: GameState, sector: IndustrySectorKey): number {
  return Math.round(spinnableAssets(s, sector).reduce((a, x) => a + industryAssetValue(x, s), 0));
}

export function spinoffFee(valuation: number): number {
  return Math.max(SPINOFF_FEE_MIN, Math.round(valuation * SPINOFF_FEE_PCT));
}

/** Avknoppningens substansvärde: taggade tillgångar + egen kassa. */
export function spinoffEquity(s: GameState, spin: SpinOff): number {
  const assets = (s.industryPortfolio ?? [])
    .filter((a) => a.spinOffId === spin.id)
    .reduce((a, x) => a + industryAssetValue(x, s), 0);
  return Math.round(assets + spin.cash);
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
