import { useState } from "react";
import { kr } from "../engine/format";
import type { GameState } from "../engine/types";
import { BURGUNDY, C, FONTS } from "../styles/tokens";

interface Props {
  state: GameState;
}

type SortKey = "rent" | "monthsLeft" | "quality" | "district" | "consecutive";

export function TenantPanel({ state }: Props) {
  const [sort, setSort] = useState<SortKey>("monthsLeft");
  const [asc, setAsc] = useState(true);
  const [filter, setFilter] = useState("");

  const allTenants = state.portfolio
    .filter((p) => p.status === "klar")
    .flatMap((p) =>
      p.tenants.map((t) => ({
        ...t,
        propLabel: p.typeLabel,
        districtName: p.districtName,
        propId: p.id,
      })),
    )
    .filter((t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase()) || t.districtName.toLowerCase().includes(filter.toLowerCase()));

  const sorted = [...allTenants].sort((a, b) => {
    let diff = 0;
    if (sort === "rent")        diff = a.rent - b.rent;
    if (sort === "monthsLeft")  diff = a.monthsLeft - b.monthsLeft;
    if (sort === "quality")     diff = a.quality - b.quality;
    if (sort === "district")    diff = a.districtName.localeCompare(b.districtName);
    if (sort === "consecutive") diff = (a.consecutiveMonths ?? 0) - (b.consecutiveMonths ?? 0);
    return asc ? diff : -diff;
  });

  const totalRent = sorted.reduce((a, t) => a + t.rent, 0);

  const handleSort = (key: SortKey) => {
    if (sort === key) setAsc(!asc);
    else { setSort(key); setAsc(true); }
  };

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th onClick={() => handleSort(k)} style={{
      padding: "8px 10px", cursor: "pointer", textAlign: "left",
      background: sort === k ? C.woodDark : C.wood,
      color: sort === k ? C.brassBright : C.creamSoft,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
      userSelect: "none", whiteSpace: "nowrap",
    }}>
      {label} {sort === k ? (asc ? "▲" : "▼") : ""}
    </th>
  );

  const urgentColor = (m: number) => m <= 3 ? C.negative : m <= 12 ? C.gold : C.positive;

  return (
    <div style={{ color: C.parchment, fontFamily: FONTS.body }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ fontFamily: FONTS.heading, color: C.brassBright, margin: 0 }}>
          Hyresgästportfölj ({sorted.length} kontrakt)
        </h2>
        <div style={{ fontSize: 13, color: C.creamSoft }}>
          Totalt: <strong style={{ color: C.positive }}>{kr(totalRent)}/mån</strong>
        </div>
      </div>

      <input
        type="text"
        placeholder="Filtrera namn eller distrikt…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          width: "100%", padding: "8px 12px", marginBottom: 12, borderRadius: 4,
          border: `1px solid ${C.brass}55`, background: C.woodDark, color: C.parchment,
          fontFamily: FONTS.body, fontSize: 13, boxSizing: "border-box",
        }}
      />

      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: C.creamSoft }}>
          Inga hyresgäster matchar filtret.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <Th label="Hyresgäst" k="district" />
                <Th label="Distrikt" k="district" />
                <Th label="Hyra/mån" k="rent" />
                <Th label="Månader kvar" k="monthsLeft" />
                <Th label="Lojalitet (mån)" k="consecutive" />
                <Th label="Kvalitet" k="quality" />
                <th style={{ padding: "8px 10px", background: C.wood, color: C.creamSoft, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? C.woodDark : C.wood }}>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: C.creamSoft }}>{t.propLabel} · {t.profileName ?? t.profile}</div>
                  </td>
                  <td style={{ padding: "8px 10px", color: C.creamSoft }}>{t.districtName}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: C.positive }}>{kr(t.rent)}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ color: urgentColor(t.monthsLeft), fontWeight: 700 }}>{t.monthsLeft}</span>
                  </td>
                  <td style={{ padding: "8px 10px", color: C.creamSoft }}>
                    {(t.consecutiveMonths ?? 0) > 0 ? `${t.consecutiveMonths} mån` : "—"}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ color: t.quality >= 1.1 ? C.positive : t.quality >= 1.0 ? C.gold : C.negative }}>
                      {(t.quality * 100).toFixed(0)} %
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {t.isAnchor && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.gold, background: C.gold + "22", border: `1px solid ${C.gold}55`, padding: "2px 6px", borderRadius: 8, marginRight: 4 }}>
                        ANKARE
                      </span>
                    )}
                    {(t.consecutiveMonths ?? 0) >= 24 && !t.isAnchor && (
                      <span style={{ fontSize: 10, color: C.positive }}>Lojal</span>
                    )}
                    {t.monthsLeft <= 3 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.negative, marginLeft: 2 }}>SNART UT</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: C.woodDark }}>
                <td colSpan={2} style={{ padding: "8px 10px", fontWeight: 700, color: C.brassBright }}>Totalt</td>
                <td style={{ padding: "8px 10px", fontWeight: 800, color: C.positive }}>{kr(totalRent)}/mån</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
