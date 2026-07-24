import { useState } from "react";
import { makeTenant } from "../engine/generators";
import { kr } from "../engine/format";
import { propPotentialRent } from "../engine/property";
import { tenantScoreOf } from "../engine/tenantScore";
import type { GameAction, GameState, Property, Tenant } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import { BURGUNDY, C, FONTS } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

type SortKey = "rent" | "monthsLeft" | "quality" | "district" | "consecutive";
type InnerTab = "vakanser" | "kontrakt";

const ESG_COLOR: Record<string, string> = {
  A: "#1a7a1a", B: "#2d8a2d", C: "#8a7a10", D: "#8a5a10", E: "#8a3010", F: "#7a1010",
};

function genCandidates(p: Property, state: GameState): Tenant[] {
  const base = propPotentialRent(p, state) / p.capacity / 12;
  const pool = Array.from({ length: 15 }, () =>
    makeTenant(base, state.demandMod, p.condition),
  ).filter((t, i, arr) => !arr.slice(0, i).some((u) => u.name === t.name));
  return pool.slice(0, 4);
}

export function TenantPanel({ state, dispatch }: Props) {
  const [innerTab, setInnerTab] = useState<InnerTab>("vakanser");
  const [sort, setSort] = useState<SortKey>("monthsLeft");
  const [asc, setAsc] = useState(true);
  const [filter, setFilter] = useState("");
  const [searchingId, setSearchingId] = useState<number | null>(null);
  const [candidatesMap, setCandidatesMap] = useState<Record<number, Tenant[]>>({});

  const pendingRenewals = state.pendingRenewals ?? [];
  const gm = state.globalManager;
  const requestOpen = useUiStore((s) => s.requestOpen);

  // Vakanser
  const vacantProps = state.portfolio
    .filter((p) => p.status === "klar" && p.tenants.length < p.capacity)
    .sort((a, b) => (b.capacity - b.tenants.length) - (a.capacity - a.tenants.length));
  const totalVacant = vacantProps.reduce((a, p) => a + (p.capacity - p.tenants.length), 0);
  const lostRent = vacantProps.reduce(
    (a, p) => a + (p.capacity - p.tenants.length) * Math.round(propPotentialRent(p, state) / p.capacity / 12),
    0,
  );

  // Aktiva kontrakt
  const allTenants = state.portfolio
    .filter((p) => p.status === "klar")
    .flatMap((p) =>
      p.tenants.map((t) => ({ ...t, propLabel: p.typeLabel, districtName: p.districtName, propId: p.id })),
    )
    .filter(
      (t) =>
        !filter ||
        t.name.toLowerCase().includes(filter.toLowerCase()) ||
        t.districtName.toLowerCase().includes(filter.toLowerCase()),
    );

  const sorted = [...allTenants].sort((a, b) => {
    let diff = 0;
    if (sort === "rent") diff = a.rent - b.rent;
    if (sort === "monthsLeft") diff = a.monthsLeft - b.monthsLeft;
    if (sort === "quality") diff = a.quality - b.quality;
    if (sort === "district") diff = a.districtName.localeCompare(b.districtName);
    if (sort === "consecutive") diff = (a.consecutiveMonths ?? 0) - (b.consecutiveMonths ?? 0);
    return asc ? diff : -diff;
  });

  const totalRent = sorted.reduce((a, t) => a + t.rent, 0);

  const handleSort = (key: SortKey) => {
    if (sort === key) setAsc(!asc);
    else { setSort(key); setAsc(true); }
  };

  const searchFor = (propId: number) => {
    const p = state.portfolio.find((x) => x.id === propId);
    if (!p) return;
    setCandidatesMap((prev) => ({ ...prev, [propId]: genCandidates(p, state) }));
    setSearchingId(propId);
  };

  const hireTenant = (propId: number, tenant: Tenant) => {
    dispatch({ type: "LEASE_TENANT", id: propId, tenant });
    setSearchingId(null);
    setCandidatesMap((prev) => { const n = { ...prev }; delete n[propId]; return n; });
  };

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      onClick={() => handleSort(k)}
      style={{
        padding: "8px 10px", cursor: "pointer", textAlign: "left",
        background: sort === k ? C.woodDark : C.wood,
        color: sort === k ? C.brassBright : C.creamSoft,
        fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
        userSelect: "none", whiteSpace: "nowrap",
      }}
    >
      {label} {sort === k ? (asc ? "▲" : "▼") : ""}
    </th>
  );

  const score = tenantScoreOf(state);

  return (
    <div style={{ color: C.parchment, fontFamily: FONTS.body }}>

      {/* Tenant score — public reputation with your renters */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.woodDark, border: `1px solid ${C.brass}33`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONTS.heading, fontWeight: 900, fontSize: 22, color: "#fff",
          background: ESG_COLOR[score.letter] ?? C.brass,
        }}>
          {score.letter}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.creamSoft, textTransform: "uppercase", letterSpacing: 0.5 }}>Tenant score</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.gold }}>{score.score}/100 · {score.label}</div>
          <div style={{ fontSize: 11, color: C.creamSoft, marginTop: 2 }}>
            {score.tenants === 0
              ? "No tenants yet — your reputation with renters is unwritten."
              : `Avg. satisfaction ${score.breakdown.avgSatisfaction}${score.breakdown.loyaltyBonus > 0 ? ` · loyalty +${score.breakdown.loyaltyBonus}` : ""}${score.breakdown.complaintPenalty > 0 ? ` · complaints −${score.breakdown.complaintPenalty}` : ""}${score.breakdown.vacancyPenalty > 0 ? ` · vacancy −${score.breakdown.vacancyPenalty}` : ""}`}
          </div>
        </div>
      </div>

      {/* Pending renewals */}
      {pendingRenewals.length > 0 && (
        <div style={{ background: "#2a1a00", border: `2px solid ${C.gold}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: FONTS.heading, color: C.gold, fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
            ⏰ Contract renewals ({pendingRenewals.length}) — decide by next tick
          </div>
          {pendingRenewals.map((r) => (
            <div
              key={`${r.propertyId}-${r.tenantId}`}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.gold}33`, flexWrap: "wrap", gap: 6 }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.tenantName}</div>
                <div style={{ fontSize: 11, color: C.creamSoft }}>{r.districtName} · {kr(r.currentRent)}/mo</div>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {(
                  [
                    ["raise", "+10%", "#27660a"],
                    ["keep", "Keep", "#444"],
                    ["lower", "−10%", "#3d54d8"],
                    ["evict", "Evict", "#7a0a0a"],
                  ] as const
                ).map(([action, label, bg]) => (
                  <button
                    key={action}
                    style={{ padding: "3px 9px", borderRadius: 4, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: bg, color: "#fff" }}
                    onClick={() => dispatch({ type: "NEGOTIATE_RENEWAL", propertyId: r.propertyId, tenantId: r.tenantId, action })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inner tabs */}
      <div style={{ display: "flex", borderBottom: `2px solid ${C.brass}44`, marginBottom: 16 }}>
        {(
          [
            ["vakanser", `🏚 Vacancies (${totalVacant})`],
            ["kontrakt", `📋 Active contracts (${allTenants.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setInnerTab(id)}
            style={{
              padding: "8px 18px", background: "none", border: "none",
              borderBottom: innerTab === id ? `3px solid ${C.brass}` : "3px solid transparent",
              marginBottom: -2,
              color: innerTab === id ? C.brassBright : C.creamSoft,
              fontFamily: FONTS.heading, fontWeight: innerTab === id ? 700 : 500,
              fontSize: 14, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── VAKANSER TAB ── */}
      {innerTab === "vakanser" && (
        <div>
          {/* Summary + auto-manager */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200, background: C.woodDark, borderRadius: 6, padding: "10px 14px", border: `1px solid ${C.brass}33` }}>
              <div style={{ fontSize: 11, color: C.creamSoft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Total vacancies</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: totalVacant > 0 ? C.negative : C.positive }}>
                {totalVacant} units
              </div>
              {totalVacant > 0 && (
                <div style={{ fontSize: 12, color: C.creamSoft, marginTop: 2 }}>
                  Lost rent: <strong style={{ color: C.negative }}>{kr(lostRent)}/mo</strong>
                </div>
              )}
            </div>

            {/* Statusspegel: portföljdirektören anlitas och instrueras i Policy. */}
            <div style={{ flex: 2, minWidth: 260, background: C.woodDark, borderRadius: 6, padding: "10px 14px", border: `1px solid ${C.brass}33` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: C.creamSoft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
                    👔 Portfolio director
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: gm?.active ? C.positive : C.creamSoft }}>
                    {gm?.active ? "Active — fills vacancies and renews contracts" : "Inactive"}
                  </div>
                  <div style={{ fontSize: 11, color: C.creamSoft, marginTop: 2 }}>
                    {gm?.active
                      ? `Min. quality ${((gm.minTenantQuality ?? 0.8) * 100).toFixed(0)}% · rent target ${Math.round((gm.rentTargetPct ?? 1) * 100)}%`
                      : "Handles leasing and maintenance for the whole portfolio."}
                  </div>
                </div>
                <button
                  onClick={() => requestOpen("policy")}
                  style={{ padding: "7px 14px", background: BURGUNDY, color: C.brassBright, border: "none", borderRadius: 4, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Manage in Policy →
                </button>
              </div>
            </div>
          </div>

          {vacantProps.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: C.creamSoft, background: C.woodDark, borderRadius: 8 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700, color: C.brassBright }}>All units rented!</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>No vacancies right now. Keep an eye on upcoming contract expirations.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {vacantProps.map((p) => {
                const vacant = p.capacity - p.tenants.length;
                const potRent = Math.round(propPotentialRent(p, state) / p.capacity / 12);
                const searching = searchingId === p.id;
                const candidates = candidatesMap[p.id] ?? [];
                const autoFill = p.managed || gm?.active;

                return (
                  <div key={p.id} style={{ background: C.woodDark, border: `1px solid ${BURGUNDY}55`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.brassBright }}>{p.typeLabel}</div>
                        <div style={{ fontSize: 12, color: C.creamSoft }}>{p.districtName}</div>
                      </div>
                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        {p.energyClass && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 3, background: ESG_COLOR[p.energyClass] ?? "#555", color: "#fff" }}>
                            {p.energyClass}
                          </span>
                        )}
                        {autoFill && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.positive, background: C.positive + "22", padding: "1px 7px", borderRadius: 8 }}>
                            AUTO
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Capacity bar */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.creamSoft, marginBottom: 4 }}>
                        <span>{p.tenants.length}/{p.capacity} rented</span>
                        <span style={{ color: BURGUNDY, fontWeight: 700 }}>{vacant} vacant</span>
                      </div>
                      <div style={{ height: 6, background: C.wood, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(p.tenants.length / p.capacity) * 100}%`, background: C.positive, borderRadius: 3 }} />
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: C.creamSoft }}>
                      Potential: <strong style={{ color: C.gold }}>{kr(potRent)}/mo per unit</strong>
                    </div>

                    {/* Existing tenants (compact) */}
                    {p.tenants.length > 0 && (
                      <div style={{ fontSize: 11, color: C.creamSoft }}>
                        {p.tenants.map((t) => (
                          <span key={t.id} style={{ display: "inline-block", marginRight: 6, background: C.wood, padding: "1px 6px", borderRadius: 4 }}>
                            {t.name} · {kr(t.rent)}/mo
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Candidates */}
                    {searching && candidates.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.brassBright, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          Candidates
                        </div>
                        {candidates.map((c) => (
                          <div
                            key={c.id}
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: C.wood, borderRadius: 4, marginBottom: 4 }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: C.creamSoft }}>
                                {c.profileName ?? c.profile} · {c.termTotal} mo · {(c.quality * 100).toFixed(0)}% qual.
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 800, fontSize: 13, color: C.positive }}>{kr(c.rent)}/mo</div>
                              <button
                                onClick={() => hireTenant(p.id, c)}
                                style={{ marginTop: 3, padding: "3px 10px", background: BURGUNDY, color: C.brassBright, border: "none", borderRadius: 4, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                              >
                                Lease
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => searchFor(p.id)}
                          style={{ fontSize: 11, color: C.creamSoft, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: "2px 0" }}
                        >
                          New search
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        if (searching) setSearchingId(null);
                        else searchFor(p.id);
                      }}
                      style={{
                        padding: "8px 0", background: searching ? C.wood : BURGUNDY,
                        color: C.brassBright, border: `1px solid ${BURGUNDY}`,
                        borderRadius: 4, fontWeight: 700, fontSize: 13, cursor: "pointer",
                      }}
                    >
                      {searching ? "Hide candidates" : `Find tenants (${vacant} unit${vacant !== 1 ? "s" : ""})`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── AKTIVA KONTRAKT TAB ── */}
      {innerTab === "kontrakt" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 13, color: C.creamSoft }}>
              Total: <strong style={{ color: C.positive }}>{kr(totalRent)}/mo</strong>
              <span style={{ marginLeft: 12, fontSize: 12 }}>
                {allTenants.filter(t => t.monthsLeft <= 3).length > 0 && (
                  <span style={{ color: C.negative, fontWeight: 700 }}>
                    ⚠ {allTenants.filter(t => t.monthsLeft <= 3).length} contracts expire within 3 mo
                  </span>
                )}
              </span>
            </div>
            <input
              type="text"
              placeholder="Filter name or district…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                padding: "6px 12px", borderRadius: 4, border: `1px solid ${C.brass}55`,
                background: C.woodDark, color: C.parchment, fontFamily: FONTS.body, fontSize: 13, width: 220,
              }}
            />
          </div>

          {sorted.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: C.creamSoft }}>
              No tenants match the filter.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <Th label="Tenant" k="district" />
                    <Th label="District" k="district" />
                    <Th label="Rent/mo" k="rent" />
                    <Th label="Mo left" k="monthsLeft" />
                    <Th label="Loyalty" k="consecutive" />
                    <Th label="Quality" k="quality" />
                    <th style={{ padding: "8px 10px", background: C.wood, color: C.creamSoft, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t, i) => {
                    const moColor = t.monthsLeft <= 3 ? C.negative : t.monthsLeft <= 12 ? C.gold : C.positive;
                    return (
                      <tr key={t.id} style={{ background: i % 2 === 0 ? C.woodDark : C.wood }}>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 600 }}>
                            {t.notableId && <span title="Notable tenant" style={{ color: "#e0b34a", marginRight: 4 }}>★</span>}
                            {t.name}
                          </div>
                          <div style={{ fontSize: 11, color: C.creamSoft }}>{t.propLabel} · {t.profileName ?? t.profile}</div>
                        </td>
                        <td style={{ padding: "8px 10px", color: C.creamSoft }}>{t.districtName}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700, color: C.positive }}>{kr(t.rent)}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ color: moColor, fontWeight: 700 }}>{t.monthsLeft}</span>
                        </td>
                        <td style={{ padding: "8px 10px", color: C.creamSoft }}>
                          {(t.consecutiveMonths ?? 0) > 0 ? `${t.consecutiveMonths} mo` : "—"}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ color: t.quality >= 1.1 ? C.positive : t.quality >= 1.0 ? C.gold : C.negative }}>
                            {(t.quality * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {t.isAnchor && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.gold, background: C.gold + "22", border: `1px solid ${C.gold}55`, padding: "2px 6px", borderRadius: 8, marginRight: 4 }}>
                              ANCHOR
                            </span>
                          )}
                          {(t.consecutiveMonths ?? 0) >= 24 && !t.isAnchor && (
                            <span style={{ fontSize: 10, color: C.positive }}>Loyal</span>
                          )}
                          {t.monthsLeft <= 3 && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.negative, marginLeft: 2 }}>EXPIRING</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: C.woodDark }}>
                    <td colSpan={2} style={{ padding: "8px 10px", fontWeight: 700, color: C.brassBright }}>Total</td>
                    <td style={{ padding: "8px 10px", fontWeight: 800, color: C.positive }}>{kr(totalRent)}/mo</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
