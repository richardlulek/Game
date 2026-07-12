/* ============================================================
   IndustryMarket – marknadsvy för att förvärva industritillgångar.
   Visar aktiva industrimarknadslistor med sektorfilter.
   ============================================================ */

import { useState } from "react";
import type { GameAction, GameState, IndustryAsset, IndustrySectorKey } from "../engine/types";
import { msek, kr } from "../engine/format";
import { C, FONTS, THEME, BURGUNDY } from "../styles/tokens";

const SECTOR_FILTERS: { id: IndustrySectorKey | "alla"; label: string }[] = [
  { id: "alla",     label: "Alla" },
  { id: "hotell",   label: "🏨 Hotell" },
  { id: "energi",   label: "⚡ Energi" },
  { id: "logistik", label: "📦 Logistik" },
];

const sectorColor: Record<IndustrySectorKey, string> = {
  hotell:   "#7b4a20",
  energi:   "#1a6b3a",
  logistik: "#1a3a7b",
};

const badge = (sector: IndustrySectorKey): React.CSSProperties => ({
  background: sectorColor[sector],
  color: "#e4eaf2",
  borderRadius: 3,
  padding: "1px 7px",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  display: "inline-block",
});

const filterBtn = (active: boolean): React.CSSProperties => ({
  padding: "5px 12px",
  borderRadius: 4,
  border: `1px solid ${active ? C.brass : C.brassDim + "88"}`,
  background: active ? C.wood : "transparent",
  color: active ? C.brassBright : C.inkSoft,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: FONTS.body,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const card: React.CSSProperties = {
  background: THEME.parchment,
  border: `1px solid ${C.brass}`,
  borderRadius: 6,
  padding: 16,
  color: C.ink,
  boxShadow: `${THEME.insetGold}, 0 4px 14px rgba(0,0,0,0.22)`,
};

const label: React.CSSProperties = {
  fontSize: 10,
  color: C.inkSoft,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 2,
};

const val: React.CSSProperties = {
  fontFamily: FONTS.heading,
  fontWeight: 700,
  fontSize: 14,
  color: C.ink,
};

const buyBtn: React.CSSProperties = {
  background: C.wood,
  color: C.creamText,
  border: `1px solid ${C.brass}`,
  borderRadius: 4,
  padding: "7px 16px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: FONTS.body,
  width: "100%",
  marginTop: 12,
};

const buyBtnDisabled: React.CSSProperties = {
  ...buyBtn,
  opacity: 0.45,
  cursor: "not-allowed",
};

function sectorKpi(asset: IndustryAsset): { label: string; value: string }[] {
  if (asset.sector === "hotell" && asset.hotelMeta) {
    const m = asset.hotelMeta;
    const stars = "★".repeat(m.starRating) + "☆".repeat(5 - m.starRating);
    return [
      { label: "Stjärnor",  value: stars },
      { label: "Rum",       value: `${m.totalRooms} st` },
      { label: "ADR bas",   value: kr(m.baseAdr) },
      { label: "Skick",     value: `${Math.round(asset.condition)} / 100` },
    ];
  }
  if (asset.sector === "energi" && asset.energyMeta) {
    const m = asset.energyMeta;
    const typeLabel = m.subType === "sol" ? "☀️ Sol" : "💨 Vind";
    const cf = m.subType === "sol" ? 0.13 : 0.28;
    const mwh = Math.round(m.installedMW * cf * 730);
    return [
      { label: "Typ",          value: typeLabel },
      { label: "Installerad",  value: `${m.installedMW} MW` },
      { label: "Est. MWh/mån", value: mwh.toLocaleString("sv-SE") },
      { label: "Skick",        value: `${Math.round(asset.condition)} / 100` },
    ];
  }
  if (asset.sector === "logistik" && asset.logisticsMeta) {
    const m = asset.logisticsMeta;
    return [
      { label: "Bryggor",      value: `${m.totalBays} st` },
      { label: "Automation",   value: ["Manuell", "Halvautomatisk", "Fullautomat", "AI-drivet"][m.automationLevel] },
      { label: "Kontrakt",     value: `${m.throughputContracts.length} aktiva` },
      { label: "Skick",        value: `${Math.round(asset.condition)} / 100` },
    ];
  }
  return [];
}

interface ListingCardProps {
  asset: IndustryAsset;
  state: GameState;
  dispatch: (a: GameAction) => void;
}

function ListingCard({ asset, state, dispatch }: ListingCardProps) {
  const canAfford  = state.cash >= asset.purchasePrice && !state.gameOver;
  const sectorName = { hotell: "Hotell", energi: "Förnybar energi", logistik: "Logistik" }[asset.sector];
  const sectorIcon = { hotell: "🏨", energi: "⚡", logistik: "📦" }[asset.sector];
  const kpis = sectorKpi(asset);
  const alreadyOwned = (state.industryPortfolio ?? []).some((a) => a.id === asset.id);

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={badge(asset.sector)}>{sectorIcon} {sectorName}</span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: FONTS.heading, fontWeight: 800, fontSize: 16, color: BURGUNDY }}>{msek(asset.purchasePrice)}</div>
        </div>
      </div>

      <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 15, color: C.ink, marginBottom: 2 }}>{asset.name}</div>
      <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 12 }}>{asset.districtName}</div>

      {/* Konditionsstapel */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.inkSoft, marginBottom: 2 }}>
          <span>SKICK</span>
          <span>{Math.round(asset.condition)} / 100</span>
        </div>
        <div style={{ height: 5, background: "#d5c9a8", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            width: `${asset.condition}%`,
            height: "100%",
            background: asset.condition > 70 ? C.positive : asset.condition > 40 ? "#c9a45c" : "#b83030",
            borderRadius: 3,
          }} />
        </div>
      </div>

      {/* KPI:er */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 }}>
        {kpis.map((k) => (
          <div key={k.label}>
            <div style={label}>{k.label}</div>
            <div style={val}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Köpknapp */}
      {alreadyOwned ? (
        <div style={{ ...buyBtnDisabled, textAlign: "center", opacity: 0.6 }}>✓ Redan ägd</div>
      ) : (
        <button
          style={canAfford ? buyBtn : buyBtnDisabled}
          disabled={!canAfford}
          onClick={() => dispatch({ type: "BUY_INDUSTRY", id: asset.id })}
        >
          {canAfford ? `Förvärva — ${msek(asset.purchasePrice)}` : "Ej råd"}
        </button>
      )}
    </div>
  );
}

// ── Ny tillgång från mall ──────────────────────────────────────────────────

function SectorInfo() {
  return (
    <div style={{
      background: "linear-gradient(165deg, #eef2f7, #d6dfeb)",
      border: `1px solid ${C.brass}`,
      borderRadius: 6,
      padding: "14px 16px",
      marginBottom: 18,
      fontSize: 12,
      color: C.inkSoft,
      lineHeight: 1.6,
    }}>
      <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 14, color: BURGUNDY, marginBottom: 8 }}>
        Tre nya sektorer — djup industriell expansion
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: "#7b4a20", marginBottom: 2 }}>🏨 Hotell</div>
          RevPAR-modell: ADR × beläggning. Uppgradera med spa, PMS och restaurang. Välj bokningskanaler strategiskt.
        </div>
        <div>
          <div style={{ fontWeight: 700, color: "#1a6b3a", marginBottom: 2 }}>⚡ Förnybar energi</div>
          Sol- och vindkraft. Teckna PPA-kontrakt för stabil intäkt eller ta spot-priset. Elcertifikat ger +85 kr/MWh.
        </div>
        <div>
          <div style={{ fontWeight: 700, color: "#1a3a7b", marginBottom: 2 }}>📦 Logistik</div>
          Genomflödeskontrakt med garanterad m³. Q4-topptillägg +28 %. Automatisera för lägre driftkostnader.
        </div>
      </div>
    </div>
  );
}

// ── Huvud-panel ───────────────────────────────────────────────────────────

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

export function IndustryMarket({ state, dispatch }: Props) {
  const [sector, setSector] = useState<IndustrySectorKey | "alla">("alla");

  const listings = state.industryListings ?? [];

  const filtered = sector === "alla"
    ? listings
    : listings.filter((a) => a.sector === sector);

  return (
    <div>
      <SectorInfo />

      {/* Kassa */}
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 13, color: C.inkSoft }}>Tillgänglig kassa:</span>
        <span style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 16, color: state.cash >= 0 ? C.positive : "#b83030" }}>
          {msek(state.cash)}
        </span>
      </div>

      {/* Sektorfilter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {SECTOR_FILTERS.map((f) => (
          <button key={f.id} style={filterBtn(sector === f.id)} onClick={() => setSector(f.id)}>
            {f.label}{" "}
            <span style={{ opacity: 0.7 }}>
              ({f.id === "alla" ? listings.length : listings.filter((a) => a.sector === f.id).length})
            </span>
          </button>
        ))}
      </div>

      {/* Listings */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center",
          color: C.inkSoft,
          padding: "40px 20px",
          fontSize: 13,
          fontFamily: FONTS.body,
        }}>
          Inga tillgångar till salu just nu. Marknaden uppdateras varje månad.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}>
          {filtered.map((a) => (
            <ListingCard key={a.id} asset={a} state={state} dispatch={dispatch} />
          ))}
        </div>
      )}
    </div>
  );
}
