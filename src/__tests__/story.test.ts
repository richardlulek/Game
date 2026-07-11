/* Berättelseläget "Arvet efter morfar" – kampanjmotorn och kapitelflödet. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { equityOf } from "../engine/finance";
import { reducer } from "../engine/reducer";
import {
  CHAPTER_FRONTS,
  GOSTA_NAME,
  MEMORY_NOTES,
  STORY_BEATS,
  STORY_CINEMATICS,
  STORY_COMPANY_NAME,
  advanceStory,
  applyStoryFlag,
  beatById,
  districtLocked,
  heirloomOf,
  storyDecisionById,
  unlockedDistrictsFor,
} from "../engine/story";
import type { GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

afterEach(() => vi.restoreAllMocks());

/** Läser alla väntande brev (löser beslut med första alternativet) tills inget väntar. */
function readLetters(s: GameState, max = 10): GameState {
  let next = s;
  for (let i = 0; i < max && next.pendingDecision; i++) {
    next = reducer(next, { type: "RESOLVE_DECISION", optionIndex: 0 });
    next = advanceStory(next);
  }
  return next;
}

function storyStart(): GameState {
  return reducer(makeState(), { type: "RESET", mode: "story" });
}

describe("start av berättelseläget", () => {
  it("RESET mode:story ger morfars hus, fryspåsen och första brevet", () => {
    const s = storyStart();
    expect(s.cash).toBe(850_000);
    expect(s.scenarioId).toBe("arvet");
    expect(s.companyName).toBe(STORY_COMPANY_NAME);
    expect(s.story?.beat).toBe("prolog");
    expect(s.pendingDecision?.id).toBe("story:brev_ekelof");

    const house = heirloomOf(s);
    expect(house).toBeDefined();
    expect(house!.district).toBe("kulle");
    expect(house!.condition).toBe(25);
    expect(house!.capacity).toBe(3);
    expect(house!.parcelId).toBeTruthy();
    // Gösta bor på nedervåningen och betalar kompispris.
    expect(house!.tenants.map((t) => t.name)).toContain(GOSTA_NAME);
    expect(house!.tenants[0].rent).toBe(500);
  });

  it("morfars hus kan inte säljas under kampanjen (villkor 7b)", () => {
    let s = storyStart();
    s = readLetters(s);
    const house = heirloomOf(s)!;
    const afterSell = reducer(s, { type: "SELL", id: house.id });
    expect(heirloomOf(afterSell)).toBeDefined();
    expect(afterSell.log[0].t).toContain("Villkor 7b");
    const afterList = reducer(s, { type: "LIST_FOR_SALE", id: house.id, ask: 99_000_000 });
    expect(heirloomOf(afterList)!.forSale).toBeUndefined();
  });
});

describe("brevkedjor och flaggor", () => {
  it("prologens brev kedjar: Ekelöf → morfar → Rogge → flaggan prolog_läst", () => {
    let s = storyStart();
    expect(s.pendingDecision?.id).toBe("story:brev_ekelof");
    s = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
    expect(s.pendingDecision?.id).toBe("story:brev_morfar_1");
    s = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
    expect(s.pendingDecision?.id).toBe("story:rogge_lowball");
    s = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
    expect(s.story?.flags).toContain("prolog_läst");
    // Prologmålet klart → kapitel 1-brevet väntar efter advanceStory.
    s = advanceStory(s);
    expect(s.story?.beat).toBe("renoveringen");
    expect(s.pendingDecision?.id).toBe("story:brev_kap1");
  });

  it("applyStoryFlag gosta_ut vräker Gösta ur morfars hus", () => {
    let s = storyStart();
    s = readLetters(s);
    expect(heirloomOf(s)!.tenants.some((t) => t.name === GOSTA_NAME)).toBe(true);
    s = applyStoryFlag(s, "gosta_ut");
    expect(heirloomOf(s)!.tenants.some((t) => t.name === GOSTA_NAME)).toBe(false);
  });
});

describe("kampanjens kapitelflöde", () => {
  it("hela bågen: mål uppfylls → alla beats avancerar i ordning till done", () => {
    let s = storyStart();
    s = readLetters(s); // prolog läst → kapitel 1 aktivt

    // Kapitel 1: skick 60.
    expect(s.story?.beat).toBe("renoveringen");
    s = advanceStory({
      ...s,
      portfolio: s.portfolio.map((p) => (p.storyTag === "arvet" ? { ...p, condition: 65 } : p)),
    });
    s = readLetters(s); // Gösta-dilemmat + kapitel 2-brevet
    expect(s.story?.beat).toBe("hyresgasten");
    // Injecten gav skriptade ansökningar till huset.
    expect((heirloomOf(s)!.applications ?? []).length).toBeGreaterThanOrEqual(3);
    expect((heirloomOf(s)!.applications ?? []).some((a) => a.tenant.name.includes("Likbål"))).toBe(true);

    // Kapitel 2: 2 uthyrda lokaler.
    const extraTenant = { ...heirloomOf(s)!.tenants[0], id: 999_001, name: "Margit + 14 katter" };
    s = advanceStory({
      ...s,
      portfolio: s.portfolio.map((p) =>
        p.storyTag === "arvet" ? { ...p, tenants: [...p.tenants, extraTenant] } : p,
      ),
    });
    s = readLetters(s);
    expect(s.story?.beat).toBe("forhandlingen");

    // Kapitel 3: förhandla (RAISE_RENT accepteras med mockad slump).
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    const house = heirloomOf(s)!;
    s = reducer(s, { type: "RAISE_RENT", id: house.id, tenantId: house.tenants[1].id, increasePercent: 5 });
    vi.restoreAllMocks();
    expect(s.story?.flags).toContain("förhandlat");
    s = readLetters(advanceStory(s));
    expect(s.story?.beat).toBe("banken");
    // Injecten la ut ett prisvärt objekt på marknaden.
    expect(s.listings.length).toBeGreaterThan(0);

    // Kapitel 4: köp fastighet #2.
    s = advanceStory({
      ...s,
      portfolio: [...s.portfolio, makeProperty({ id: 555, owned: true, status: "klar" })],
    });
    s = readLetters(s);
    expect(s.story?.beat).toBe("konjunkturen");
    const rateAfterHike = s.interestRate;
    expect(rateAfterHike).toBeGreaterThan(4.0); // skriptad räntehöjning

    // Kapitel 5: överlev 6 månader (hoppa fram i tiden med kassa kvar).
    s = advanceStory({ ...s, year: s.year + 1, cash: 1_000_000 });
    s = readLetters(s);
    expect(s.story?.beat).toBe("bolaget");

    // Kapitel 6: bolagsnivå 2.
    s = advanceStory({ ...s, companyLevel: 2 });
    s = readLetters(s);
    expect(s.story?.beat).toBe("revanschen");
    // Rogge bjuder på grannhuset.
    expect(s.competingBid?.rivalName).toContain("Flyt");
    expect(s.listings.some((p) => p.storyTag === "revansch")).toBe(true);

    // Kapitel 7: vinn grannhuset.
    s = advanceStory({
      ...s,
      portfolio: [...s.portfolio, makeProperty({ id: 556, owned: true, status: "klar", storyTag: "revansch" })],
    });
    s = readLetters(s);
    expect(s.story?.beat).toBe("dynastin");

    // Kapitel 8: nivå 3 + 20 MSEK eget kapital → epilog + morfars klocka.
    s = advanceStory({ ...s, companyLevel: 3, cash: 25_000_000 });
    expect(equityOf(s)).toBeGreaterThanOrEqual(20_000_000);
    expect(s.pendingDecision?.id).toBe("story:brev_epilog");
    expect(s.story?.done).toBe(true);
    expect(s.ownerLuxuries).toContain("morfarsklocka");
    s = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
    expect(s.pendingDecision).toBeNull();
    // Kampanjen klar: advanceStory rör inte längre tillståndet.
    expect(advanceStory(s)).toBe(s);
  });

  it("Rogge flippar grannhuset om han vinner budkriget", () => {
    let s = storyStart();
    s = readLetters(s);
    // Spola fram till kapitel 7 genom att uppfylla allt i ett svep.
    s = { ...s, story: { ...s.story!, beat: "revanschen", flags: [...s.story!.flags] } };
    s = readLetters(advanceStory(s)); // inject + brev
    expect(s.listings.some((p) => p.storyTag === "revansch")).toBe(true);
    // Rogge "vinner": objektet försvinner ur listan utan att spelaren äger det.
    s = { ...s, listings: s.listings.filter((p) => p.storyTag !== "revansch"), competingBid: undefined };
    s = advanceStory(s);
    expect(s.listings.some((p) => p.storyTag === "revansch")).toBe(true); // återinlagt
    expect(s.log[0].t).toContain("flippar");
  });
});

describe("fryspåse-säkerhetsnätet", () => {
  it("triggar en gång under 150 000 kr från kapitel 2, aldrig igen", () => {
    let s = storyStart();
    s = readLetters(s);
    s = { ...s, story: { ...s.story!, beat: "hyresgasten", flags: [...s.story!.flags, "inject:hyresgasten"] } };
    s = advanceStory({ ...s, cash: 100_000 });
    expect(s.pendingDecision?.id).toBe("story:bailout_frys");
    expect(s.story?.bailoutUsed).toBe(true);
    s = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
    expect(s.cash).toBe(500_000);
    // Andra gången: inget nödbrev.
    s = advanceStory({ ...s, cash: 50_000 });
    expect(s.pendingDecision?.id).not.toBe("story:bailout_frys");
  });

  it("triggar INTE i kapitel 0–1 (spelaren ska våga använda startkassan)", () => {
    let s = storyStart();
    s = readLetters(s);
    expect(beatById(s.story!.beat)?.chapter).toBeLessThan(2);
    s = advanceStory({ ...s, cash: 50_000 });
    expect(s.pendingDecision?.id ?? "").not.toBe("story:bailout_frys");
  });
});

describe("integrationsdetaljer", () => {
  it("storyDecisionById hittar alla brev som beats refererar", () => {
    const s = storyStart();
    for (const b of STORY_BEATS) {
      if (b.letterId) expect(storyDecisionById(b.letterId, s), b.letterId).not.toBeNull();
    }
    expect(storyDecisionById("brev_epilog", s)).not.toBeNull();
    expect(storyDecisionById("bailout_frys", s)).not.toBeNull();
  });

  it("story-brev kan inte snoozas (skulle tappa brevkedjan)", () => {
    const s = storyStart();
    expect(s.pendingDecision?.id).toBe("story:brev_ekelof");
    const after = reducer(s, { type: "SNOOZE_DECISION" });
    expect(after.pendingDecision?.id).toBe("story:brev_ekelof");
    expect(after).toBe(s);
  });

  it("vanligt spel påverkas inte: advanceStory är no-op utan story", () => {
    const s = makeState();
    expect(advanceStory(s)).toBe(s);
    const s2 = reducer(makeState(), { type: "RESET" });
    expect(s2.story ?? null).toBeNull();
    expect(s2.cash).toBeGreaterThan(4_000_000); // vanliga startkapitalet
  });
});

describe("morfars minneslappar", () => {
  it("FOUND_NOTE sätter flagga, ger +1 reputation och är idempotent", () => {
    let s = storyStart();
    s = readLetters(s);
    const repBefore = s.reputation;
    s = reducer(s, { type: "FOUND_NOTE", id: "vattentornet" });
    expect(s.story?.flags).toContain("lapp:vattentornet");
    expect(s.reputation).toBe(repBefore + 1);
    expect(s.log[0].t).toContain("Vattentornet");
    // Samma lapp igen: ingenting händer.
    const again = reducer(s, { type: "FOUND_NOTE", id: "vattentornet" });
    expect(again).toBe(s);
    // Okänd lapp eller utanför story-läget: no-op.
    expect(reducer(s, { type: "FOUND_NOTE", id: "finnsinte" })).toBe(s);
    const vanlig = makeState();
    expect(reducer(vanlig, { type: "FOUND_NOTE", id: "vattentornet" })).toBe(vanlig);
  });

  it("alla sex lappar ger fotoalbums-bonusen (+3 extra)", () => {
    let s = storyStart();
    s = readLetters(s);
    const repBefore = s.reputation;
    for (const n of MEMORY_NOTES) s = reducer(s, { type: "FOUND_NOTE", id: n.id });
    // 6 × (+1) + bonus +3
    expect(s.reputation).toBe(Math.min(100, repBefore + MEMORY_NOTES.length + 3));
    expect(s.log[0].t).toContain("fotoalbumet");
  });

  it("lappdata: unika id och positioner inom kartan (eller null = morfars hus)", () => {
    const ids = new Set(MEMORY_NOTES.map((n) => n.id));
    expect(ids.size).toBe(MEMORY_NOTES.length);
    for (const n of MEMORY_NOTES) {
      if (n.x === null || n.z === null) {
        expect(n.x).toBeNull();
        expect(n.z).toBeNull();
      } else {
        expect(Math.abs(n.x)).toBeLessThanOrEqual(520);
        expect(Math.abs(n.z)).toBeLessThanOrEqual(520);
      }
    }
  });
});

describe("distriktsupplåsning", () => {
  it("prologen öppnar bara Villakullen; staden växer kapitel för kapitel", () => {
    let s = storyStart();
    expect([...unlockedDistrictsFor(s)!]).toEqual(["kulle"]);
    expect(districtLocked(s, "kulle")).toBe(false);
    expect(districtLocked(s, "finans")).toBe(true);

    s = { ...s, story: { ...s.story!, beat: "forhandlingen" } };
    expect([...unlockedDistrictsFor(s)!].sort()).toEqual(["förort", "kulle"]);

    s = { ...s, story: { ...s.story!, beat: "banken" } };
    expect(unlockedDistrictsFor(s)!.has("innerstad")).toBe(true);
    expect(districtLocked(s, "centrum")).toBe(true);

    // Sista kapitlet: alla sju distrikt öppna.
    s = { ...s, story: { ...s.story!, beat: "dynastin" } };
    expect([...unlockedDistrictsFor(s)!].sort()).toEqual(
      ["centrum", "finans", "förort", "hamnen", "industri", "innerstad", "kulle"],
    );
  });

  it("utan story eller efter epilogen är allt öppet (null)", () => {
    expect(unlockedDistrictsFor(makeState())).toBeNull();
    let s = storyStart();
    s = { ...s, story: { ...s.story!, done: true } };
    expect(unlockedDistrictsFor(s)).toBeNull();
    expect(districtLocked(s, "finans")).toBe(false);
  });

  it("seedStory begränsar utbudet till Villakullen (resten väntar i poolen)", () => {
    const s = storyStart();
    expect(s.listings.every((p) => p.district === "kulle")).toBe(true);
    expect(s.lots.every((l) => l.district === "kulle")).toBe(true);
  });

  it("köp i låst distrikt blockeras med 🔒-logg", () => {
    let s = storyStart();
    s = readLetters(s);
    const listing = makeProperty({
      id: 777, owned: false, district: "finans", districtName: "Finansdistriktet", askPrice: 20_000_000,
    });
    s = { ...s, listings: [...s.listings, listing], cash: 50_000_000 };

    const afterBuy = reducer(s, { type: "BUY", id: 777 });
    expect(afterBuy.portfolio.some((p) => p.id === 777)).toBe(false);
    expect(afterBuy.log[0].t).toContain("🔒 Området är låst");

    const afterBid = reducer(s, { type: "PLACE_BID", id: 777, amount: 19_000_000 });
    expect(afterBid.portfolio.some((p) => p.id === 777)).toBe(false);
    expect(afterBid.log[0].t).toContain("🔒 Området är låst");
  });

  it("köp i upplåst distrikt går igenom som vanligt", () => {
    let s = storyStart();
    s = readLetters(s);
    const listing = makeProperty({
      id: 778, owned: false, district: "kulle", districtName: "Villakullen", askPrice: 2_000_000,
    });
    s = { ...s, listings: [...s.listings, listing], cash: 10_000_000 };
    const after = reducer(s, { type: "BUY", id: 778 });
    expect(after.portfolio.some((p) => p.id === 778)).toBe(true);
  });
});

describe("berättelseregi (pauser före breven)", () => {
  it("varje regirad pekar på ett riktigt story-brev och har rimlig paus", () => {
    const s = storyStart();
    for (const [id, cine] of Object.entries(STORY_CINEMATICS)) {
      expect(id.startsWith("story:"), id).toBe(true);
      expect(storyDecisionById(id.slice("story:".length), s), id).not.toBeNull();
      expect(cine.holdMs).toBeGreaterThanOrEqual(1000);
      expect(cine.holdMs).toBeLessThanOrEqual(8000);
      expect(cine.zoom).toBeGreaterThan(18); // aldrig under MapControls minDistance
      expect(cine.hint.length).toBeGreaterThan(5);
    }
    // Prologens tre scener finns: morfars brev, Rogges besök (med bil), kapitel 1.
    expect(STORY_CINEMATICS["story:brev_morfar_1"]).toBeDefined();
    expect(STORY_CINEMATICS["story:rogge_lowball"]?.car).toBe(true);
    expect(STORY_CINEMATICS["story:brev_kap1"]).toBeDefined();
    // Alla fokus-taggar är kända.
    for (const cine of Object.values(STORY_CINEMATICS))
      expect(["arvet", "dödsbo", "revansch"]).toContain(cine.focusTag);
  });
});

describe("kapitel-förstasidor", () => {
  it("finns för exakt de fyra markanta kapitlen med komplett innehåll", () => {
    expect(Object.keys(CHAPTER_FRONTS).sort()).toEqual(
      ["banken", "hyresgasten", "renoveringen", "revanschen"],
    );
    for (const front of Object.values(CHAPTER_FRONTS)) {
      expect(front.headline.length).toBeGreaterThan(5);
      expect(front.sub.length).toBeGreaterThan(5);
      expect(front.body.length).toBeGreaterThan(20);
      expect(front.icon.length).toBeGreaterThan(0);
      expect(front.caption.length).toBeGreaterThan(0);
    }
    // Alla nycklar är riktiga beat-id:n.
    for (const key of Object.keys(CHAPTER_FRONTS)) expect(beatById(key)).toBeDefined();
  });
});
