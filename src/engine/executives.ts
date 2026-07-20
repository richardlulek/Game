/* ============================================================
   Namngivna chefer (Capitalism Lab-luckan "executives"):

   Varje anställd roll (progression.ts STAFF_ROLES) besätts av en
   namngiven person med en talang 0,85–1,30 som skalar rollens
   effekt OCH lönen. En stjärnrekrytering (talang ≥1,15) riskerar
   att bli uppvaktad av rivalerna – då måste spelaren välja mellan
   en permanent löneförhöjning eller att tappa personen (och en
   kompetensnivå).

   Ren logik, inga React-beroenden.
   ============================================================ */

import { pick, random01, rnd } from "./random";
import { STAFF_ROLES } from "./progression";
import type { Executive, GameState, PendingDecision } from "./types";

const EXEC_FIRST = [
  "Vera", "Gustav", "Ingrid", "Harald", "Elin", "Konrad", "Margit",
  "Sixten", "Dagny", "Albin", "Hedvig", "Rurik", "Signe", "Edvin",
];
const EXEC_LAST = [
  "Falkenberg", "Lindelöf", "Cronvall", "Ashworth", "Bergsten", "Whitlock",
  "Sylvan", "Norrby", "Kellerman", "Wachtmeister", "Hallgren", "Drakenskiöld",
];

/** Talang som stjärnbetyg 1–5 för UI:t (1,0 = ★★★, 1,3 = ★★★★★). */
export function talentStars(talent: number): number {
  return Math.max(1, Math.min(5, Math.round((talent - 0.75) * 10)));
}

/** Slumpar en ny chef till en roll. Talangen är permanent för personen. */
export function rollExecutive(s: GameState): Executive {
  return {
    name: `${pick(EXEC_FIRST)} ${pick(EXEC_LAST)}`,
    talent: +rnd(0.85, 1.3).toFixed(2),
    raises: 0,
    hiredAbs: s.year * 12 + s.month,
  };
}

/** Rollens effektmultiplikator: personens talang (1 = obemannad/normal). */
export function talentOf(s: GameState, role: string): number {
  return s.executives?.[role]?.talent ?? 1;
}

/** Lönemultiplikator: talang kostar, och varje matchad rekryteringsstrid
 *  har gett en permanent förhöjning om 25 %. */
export function execSalaryMult(exec: Executive | undefined): number {
  if (!exec) return 1;
  return exec.talent * (1 + 0.25 * exec.raises);
}

/** Chans per månad att en stjärnchef blir uppvaktad av en rival.
 *  (Balansrundan: golvet 1,15 gjorde striderna nästan obefintliga –
 *  3 på 20 år med fem chefer. 1,10 ger ungefär en om året.) */
const POACH_CHANCE = 0.015;
export const POACH_TALENT_FLOOR = 1.10;

/** Rekryteringsstrid: rival försöker värva en stjärnchef (talang ≥1,15).
 *  Returnerar ett beslut eller null. Anropas när inget beslut redan väntar. */
export function maybePoachingDecision(s: GameState): PendingDecision | null {
  const execs = s.executives ?? {};
  for (const roleId of Object.keys(execs)) {
    const exec = execs[roleId];
    const level = s.staff?.[roleId] ?? 0;
    if (!exec || level <= 0 || exec.talent < POACH_TALENT_FLOOR) continue;
    if (random01() >= POACH_CHANCE) continue;
    const role = STAFF_ROLES.find((r) => r.id === roleId);
    if (!role) continue;
    const rival = s.competitors.length > 0 ? pick(s.competitors).name : "A rival firm";
    const raiseCost = Math.round(role.baseSalary * level * 0.25);
    return {
      id: `exec_poach_${roleId}`,
      title: `${rival} is courting ${exec.name}`,
      text: `Your ${role.name} ${exec.name} (talent ${"★".repeat(talentStars(exec.talent))}) has received an offer from ${rival}. Match it with a permanent raise, or let ${exec.name} walk — and lose a level of expertise with the handover.`,
      options: [
        {
          label: "Match the offer",
          detail: `+${Math.round(25)}% salary permanently (≈ +$${Math.round(raiseCost / 1000)}k/mo)`,
          effect: {
            execRaise: roleId,
            log: `🤝 ${exec.name} stays as ${role.name} — with a permanently fatter paycheck.`,
            logKind: "info",
          },
        },
        {
          label: `Let ${exec.name} go`,
          detail: "Role drops one level · a new hire takes over",
          effect: {
            execPoached: roleId,
            log: `👋 ${exec.name} left for ${rival}. The ${role.name} department loses momentum during the handover.`,
            logKind: "warn",
          },
        },
      ],
    };
  }
  return null;
}
