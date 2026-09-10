import type { Property } from "../engine/types";

const PHYSICAL_UPGRADES = new Set(["fasad", "renovering", "tillbygg", "energi"]);
export function visualSnapshot(p: Property, owned: boolean) {
  return { id: p.id, owned, condition: p.condition, tenants: p.tenants.length,
    upgrades: p.upgrades.filter(u => PHYSICAL_UPGRADES.has(u)),
    energy: "FEDCBA".indexOf(p.energyClass ?? "D"),
    development: p.devLevel ?? 0, building: p.status === "bygger" };
}
export type VisualSnapshot = ReturnType<typeof visualSnapshot>;
export type VisualProgress = "purchase" | "lease" | "renewal" | "completed";

/** Positive completed outcomes only. Starting/cancelling works is not a reward. */
export function visualProgress(before: VisualSnapshot, after: VisualSnapshot): VisualProgress | null {
  if (before.id !== after.id || !after.owned) return null;
  if (!before.owned) return "purchase";
  if (after.development > before.development || (before.building && !after.building && after.condition > before.condition)) return "completed";
  if (after.condition >= before.condition + 8 || after.energy > before.energy || after.upgrades.some(u => !before.upgrades.includes(u))) return "renewal";
  if (after.tenants > before.tenants) return "lease";
  return null;
}

export const PROGRESS_COLORS: Record<VisualProgress, string> = {
  purchase: "#89b8e0", lease: "#8fcdb3", renewal: "#ebcc8e", completed: "#eadcae",
};
