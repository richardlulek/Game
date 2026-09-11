import type { Property } from "../engine/types";
import { workSpec, type WorkId } from "../engine/works";
import { PHASED_MONTHS_PER_UNIT } from "../engine/phased";

const physical = new Set(["underhåll", "energi", "fasad", "renovering", "tillbygg"]);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Only actual jobs produce a building site. No inferred dates are saved. */
export function buildingWorkState(p: Property) {
  let kind = "", progress = 0;
  if (p.phased) {
    kind = "etapprenovering";
    progress = clamp((p.phased.done + clamp(1 - p.phased.monthsLeft / PHASED_MONTHS_PER_UNIT)) / Math.max(1, p.phased.total));
  } else if (p.renovation) {
    kind = p.renovation.kind;
    const months = kind === "lokalanpassning" ? 3 : workSpec(kind as WorkId)?.months;
    // New-build progress is owned by ConstructionShell, not this detail layer.
    progress = months ? clamp(1 - p.buildLeft / months) : 0;
  } else {
    const jobs = (p.pendingWorks ?? []).map(w => ({ w, id: w.kind === "uppgradering" ? w.upgradeId ?? "" : w.kind }))
      .filter(j => physical.has(j.id));
    const job = jobs.find(j => j.id === "fasad") ?? jobs[0];
    if (job) {
      kind = job.id;
      progress = clamp(1 - job.w.monthsLeft / (workSpec(kind as WorkId)?.months ?? 1));
    }
  }
  const active = !!kind;
  return { active, kind, progress, stage: !active ? "idle" : progress < 0.25 ? "setup" : progress < 0.75 ? "work" : "finishing",
    scaffold: active && ["fasad", "totalrenovering", "påbyggnad", "tillbygg"].includes(kind),
    facadeProgress: kind === "fasad" ? progress : 0,
    // Interior phased work has an active entrance, not a fictional repainted facade.
    label: !active ? "" : kind === "etapprenovering" ? `STAGE ${Math.min(p.phased!.done + 1, p.phased!.total)}/${p.phased!.total}`
      : kind === "underhåll" ? "MAINTENANCE" : kind === "energi" ? "ENERGY RETROFIT"
      : progress >= 0.75 ? "FINISHING WORK" : "WORK IN PROGRESS" };
}
