import type { GameState, GameAction, IndustryAsset, BookingChannel } from "../engine/types";
import { industryAssetValue, hotelMonthlyRevenue, hotelMonthlyOpex, energyMonthlyRevenue, energyMonthlyOpex, logisticsMonthlyRevenue, logisticsMonthlyOpex } from "../engine/industries";
import { INDUSTRY_UPGRADES, HOTEL_BOOKING_CHANNELS } from "../engine/industryData";
import { kr, msek } from "../engine/format";
import { C, BURGUNDY, FONTS, THEME } from "../styles/tokens";

const card: React.CSSProperties = {
  background: THEME.parchment,
  border: `1px solid ${C.brass}`,
  borderRadius: 6,
  padding: 16,
  color: C.ink,
  boxShadow: `${THEME.insetGold}, 0 4px 14px rgba(0,0,0,0.28)`,
};
const label: React.CSSProperties = { fontSize: 11, color: C.inkSoft, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 };
const value: React.CSSProperties = { fontFamily: FONTS.heading, fontSize: 15, fontWeight: 700, color: C.ink };
const sectorBadge = (sector: string) => {
  const colors: Record<string, string> = { hotell: "#7b4a20", energi: "#1a6b3a", logistik: "#1a3a7b" };
  return { background: colors[sector] ?? C.wood, color: "#e4eaf2", borderRadius: 3, padding: "1px 6px", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5 };
};

const btn: React.CSSProperties = {
  background: C.wood,
  color: C.creamText,
  border: `1px solid ${C.brass}`,
  borderRadius: 4,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: FONTS.body,
};
const btnRed: React.CSSProperties = { ...btn, background: "#6b1a1a", borderColor: "#c05050" };

function CondBar({ value }: { value: number }) {
  const color = value > 70 ? C.positive : value > 40 ? "#c9a45c" : "#b83030";
  return (
    <div style={{ height: 6, background: "#d5c9a8", borderRadius: 3, overflow: "hidden", marginTop: 4 }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return <span style={{ color: C.brass, fontSize: 13 }}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;
}

// ── Hotell-sektion ─────────────────────────────────────────────────────────

function HotelSection({ asset, state, dispatch }: { asset: IndustryAsset; state: GameState; dispatch: (a: GameAction) => void }) {
  const meta = asset.hotelMeta!;
  const rev = hotelMonthlyRevenue(asset, state);
  const opex = hotelMonthlyOpex(asset, state);
  const noi = rev - opex;
  const occ = rev > 0 ? Math.min(98, Math.round((rev / (meta.baseAdr * [1,1.2,1.5,1.9,2.6][meta.starRating-1] * meta.totalRooms * 30.5)) * 100)) : 0;

  const toggleChannel = (chId: string) => {
    const current = meta.bookingChannels;
    const next = current.includes(chId as BookingChannel) ? current.filter((c) => c !== chId) : [...current, chId as BookingChannel];
    if (next.length === 0) return; // minst en kanal alltid aktiv
    dispatch({ type: "SET_HOTEL_CHANNEL", assetId: asset.id, channels: next });
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Stars n={meta.starRating} />
        <span style={{ fontSize: 12, color: C.inkSoft }}>{meta.totalRooms} rum</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div><div style={label}>Intäkt/mån</div><div style={{ ...value, color: "#2f6b4a" }}>{kr(rev)}</div></div>
        <div><div style={label}>Opex/mån</div><div style={value}>{kr(opex)}</div></div>
        <div><div style={label}>NOI/mån</div><div style={{ ...value, color: noi >= 0 ? C.positive : "#b83030" }}>{kr(noi)}</div></div>
        <div><div style={label}>Beläggning</div><div style={{ ...value, color: occ >= 80 ? C.positive : occ >= 60 ? "#c9a45c" : "#b83030" }}>{occ} %</div></div>
        <div><div style={label}>ADR bas</div><div style={value}>{kr(meta.baseAdr)}</div></div>
        <div><div style={label}>Streak</div><div style={value}>{meta.highOccStreak ?? 0} mån</div></div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ ...label, marginBottom: 4 }}>Bokningskanaler</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {HOTEL_BOOKING_CHANNELS.map((ch) => {
            const active = meta.bookingChannels.includes(ch.id as typeof meta.bookingChannels[number]);
            return (
              <button key={ch.id} style={{ ...btn, background: active ? C.wood : "#d5c9a8", color: active ? C.creamText : C.inkSoft, fontSize: 11 }} onClick={() => toggleChannel(ch.id)}>
                {ch.name}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Energi-sektion ─────────────────────────────────────────────────────────

function EnergySection({ asset, state }: { asset: IndustryAsset; state: GameState }) {
  const meta = asset.energyMeta!;
  const rev = energyMonthlyRevenue(asset, state);
  const opex = energyMonthlyOpex(asset, state);
  const noi = rev - opex;
  const mwh = Math.round(meta.installedMW * (meta.subType === "sol" ? 0.13 : 0.28) * 730 * (1 - meta.degradationPct / 100));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{meta.subType === "sol" ? "☀️" : "💨"}</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{meta.installedMW} MW {meta.subType === "sol" ? "sol" : "vind"}</span>
        {meta.subsidyActive && <span style={{ ...sectorBadge("energi"), background: "#1a5a2a" }}>Elcertifikat</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div><div style={label}>Intäkt/mån</div><div style={{ ...value, color: "#2f6b4a" }}>{kr(rev)}</div></div>
        <div><div style={label}>Opex/mån</div><div style={value}>{kr(opex)}</div></div>
        <div><div style={label}>NOI/mån</div><div style={{ ...value, color: noi >= 0 ? C.positive : "#b83030" }}>{kr(noi)}</div></div>
        <div><div style={label}>MWh/mån</div><div style={value}>{mwh.toLocaleString("sv-SE")}</div></div>
        <div><div style={label}>Degradering</div><div style={{ ...value, color: meta.degradationPct > 10 ? "#b83030" : C.inkSoft }}>{meta.degradationPct.toFixed(1)} %</div></div>
        <div><div style={label}>PPA-avtal</div><div style={value}>{meta.ppaContracts.length} st</div></div>
      </div>
      {meta.ppaContracts.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...label, marginBottom: 4 }}>Aktiva PPA-kontrakt</div>
          {meta.ppaContracts.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.inkSoft, padding: "2px 0", borderBottom: `1px solid ${C.brassDim}33` }}>
              <span>{c.clientName}</span>
              <span>{c.mwh} MWh · {kr(c.pricePerMwh)}/MWh · {c.monthsLeft} mån</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Logistik-sektion ───────────────────────────────────────────────────────

function LogisticsSection({ asset, state }: { asset: IndustryAsset; state: GameState }) {
  const meta = asset.logisticsMeta!;
  const rev = logisticsMonthlyRevenue(asset, state);
  const opex = logisticsMonthlyOpex(asset, state);
  const noi = rev - opex;
  const autoLabel = ["Manuell", "Halvautomatisk", "Fullautomat", "AI-drivet"][meta.automationLevel];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>🏭</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{meta.totalBays} lossningsbryggor</span>
        <span style={{ ...sectorBadge("logistik"), background: "#1a3a6b" }}>Auto: {autoLabel}</span>
        {meta.peakSurchargeActive && <span style={{ ...sectorBadge("hotell"), background: "#8b4513" }}>Q4 PEAK</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div><div style={label}>Intäkt/mån</div><div style={{ ...value, color: "#2f6b4a" }}>{kr(rev)}</div></div>
        <div><div style={label}>Opex/mån</div><div style={value}>{kr(opex)}</div></div>
        <div><div style={label}>NOI/mån</div><div style={{ ...value, color: noi >= 0 ? C.positive : "#b83030" }}>{kr(noi)}</div></div>
        <div><div style={label}>Kontrakt</div><div style={value}>{meta.throughputContracts.length} st</div></div>
      </div>
      {meta.throughputContracts.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...label, marginBottom: 4 }}>Aktiva kontrakt</div>
          {meta.throughputContracts.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.inkSoft, padding: "2px 0", borderBottom: `1px solid ${C.brassDim}33` }}>
              <span>{c.clientName}</span>
              <span>{c.guaranteedM3.toLocaleString("sv-SE")} m³ · {kr(c.ratePerM3)}/m³ · {c.monthsLeft} mån</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Uppgraderingssektion ───────────────────────────────────────────────────

function UpgradesSection({ asset, state, dispatch }: { asset: IndustryAsset; state: GameState; dispatch: (a: GameAction) => void }) {
  const available = INDUSTRY_UPGRADES.filter((u) => u.sector === asset.sector);
  if (available.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ ...label, marginBottom: 6 }}>Uppgraderingar</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {available.map((upg) => {
          const installed = asset.upgrades.includes(upg.id);
          const cost = Math.round(industryAssetValue(asset, state) * upg.cost);
          return (
            <div key={upg.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: installed ? "#e0d4b855" : "transparent", borderRadius: 4, border: `1px solid ${installed ? C.brass : C.brassDim}44` }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: installed ? 700 : 400, color: installed ? BURGUNDY : C.ink }}>{installed ? "✓ " : ""}{upg.name}</div>
                <div style={{ fontSize: 10, color: C.inkSoft }}>{upg.desc}</div>
              </div>
              {!installed && (
                <button style={{ ...btn, fontSize: 11, whiteSpace: "nowrap" }} onClick={() => dispatch({ type: "UPGRADE_INDUSTRY", id: asset.id, upg: upg.id })}>
                  {msek(cost)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Huvud-kort ─────────────────────────────────────────────────────────────

export function IndustryCard({ asset, state, dispatch }: { asset: IndustryAsset; state: GameState; dispatch: (a: GameAction) => void }) {
  const marketValue = asset.status === "klar" ? industryAssetValue(asset, state) : Math.round(asset.purchasePrice * 0.5);
  const totalReturn = asset.purchasePrice > 0 ? ((marketValue - asset.purchasePrice) / asset.purchasePrice) * 100 : 0;

  const sectorName = { hotell: "Hotell", energi: "Förnybar energi", logistik: "Logistik" }[asset.sector];
  const sectorIcon = { hotell: "🏨", energi: "⚡", logistik: "📦" }[asset.sector];

  if (asset.status === "bygger") {
    return (
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <span style={sectorBadge(asset.sector)}>{sectorIcon} {sectorName}</span>
        </div>
        <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 15, color: BURGUNDY, marginBottom: 6 }}>{asset.name}</div>
        <div style={{ fontSize: 12, color: C.inkSoft }}>{asset.districtName}</div>
        <div style={{ marginTop: 12, padding: "10px", background: "#e4eaf244", borderRadius: 4, textAlign: "center", color: C.inkSoft }}>
          🏗️ Under byggnation — {asset.buildLeft} månader kvar
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={sectorBadge(asset.sector)}>{sectorIcon} {sectorName}</span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{msek(marketValue)}</div>
          <div style={{ fontSize: 10, color: totalReturn >= 0 ? C.positive : "#b83030" }}>
            {totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(1)} %
          </div>
        </div>
      </div>

      <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 15, color: BURGUNDY, marginBottom: 2 }}>{asset.name}</div>
      <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 10 }}>{asset.districtName}</div>

      {/* Skickindikator */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ ...label }}>Skick</span>
          <span style={{ fontSize: 11, color: asset.condition > 70 ? C.positive : asset.condition > 40 ? "#c9a45c" : "#b83030" }}>{Math.round(asset.condition)} / 100</span>
        </div>
        <CondBar value={asset.condition} />
      </div>

      {/* Sektorspecifik sektion */}
      {asset.sector === "hotell"   && <HotelSection    asset={asset} state={state} dispatch={dispatch} />}
      {asset.sector === "energi"   && <EnergySection   asset={asset} state={state} />}
      {asset.sector === "logistik" && <LogisticsSection asset={asset} state={state} />}

      {/* Uppgraderingar */}
      <UpgradesSection asset={asset} state={state} dispatch={dispatch} />

      {/* Åtgärder */}
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => dispatch({ type: "MAINTAIN_INDUSTRY", id: asset.id })}>
          🔧 Underhåll
        </button>
        <button style={{ ...btn, background: asset.insurance ? "#1a6b3a" : C.wood }} onClick={() => dispatch({ type: "BUY_INDUSTRY_INSURANCE", id: asset.id })}>
          {asset.insurance ? "🛡️ Försäkrad" : "🔓 Försäkra"}
        </button>
        <button style={btnRed} onClick={() => dispatch({ type: "SELL_INDUSTRY", id: asset.id })}>
          💰 Sälj
        </button>
      </div>
    </div>
  );
}
