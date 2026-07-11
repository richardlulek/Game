/* ============================================================
   Svårighetsgrader – presets av InitOptions för Friläge och
   scenarier. Berättelseläget "Arvet efter morfar" har sin egen
   balans (fryspåsen m.m.) och använder aldrig dessa.
   ============================================================ */

import type { DifficultyId, InitOptions } from "./types";

export interface DifficultyDef {
  id: Exclude<DifficultyId, "custom">;
  label: string;
  icon: string;
  desc: string;
  options: InitOptions;
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: "lätt",
    label: "Lätt",
    icon: "🌤️",
    desc: "8 MSEK i kassan, låg ränta och snälla rivaler.",
    options: { cash: 8_000_000, interestRate: 2.0, rivalStrength: 0.7, difficulty: "lätt" },
  },
  {
    id: "normal",
    label: "Normal",
    icon: "⚖️",
    desc: "5 MSEK, 2,5 % ränta – spelets grundbalans.",
    options: { cash: 5_000_000, interestRate: 2.5, rivalStrength: 1, difficulty: "normal" },
  },
  {
    id: "svår",
    label: "Svår",
    icon: "🌩️",
    desc: "3 MSEK, dyra pengar och hungriga rivaler.",
    options: { cash: 3_000_000, interestRate: 3.5, rivalStrength: 1.4, difficulty: "svår" },
  },
];

export const difficultyById = (id: DifficultyId): DifficultyDef =>
  DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1];
