/* =============================================================
   CityMap – en stiliserad STAD (uppifrån) där spelaren ser sina
   byggnader, objekt till salu och tomter, och kan köpa eller lägga
   bud direkt. Ersätter den abstrakta distriktskartan.

   Art-deco "Fastighetsmagnat 1925": filt, valnöt, mässing, pergament.
   Inga nya beroenden. Endast inline-stilar.
   ============================================================= */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { DISTRICTS, PROP_TYPES } from "../engine/data";
import { loanTerms } from "../engine/finance";
import { kr, msek, pct } from "../engine/format";
import { buildCostMult, buildMonthsDelta } from "../engine/progression";
import {
  propAnnualOpex,
  propMarketValue,
  propNOI,
  propPotentialRent,
} from "../engine/property";
import type {
  Competitor,
  GameAction,
  GameState,
  Lot,
  Property,
  PropTypeKey,
} from "../engine/types";
import { C, FONTS, THEME, BURGUNDY } from "../styles/tokens";
import { BuildingArt } from "./BuildingArt";

/* ── Kartgeometri ─────────────────────────────────────────────
   viewBox 1000 × 660. Varje distrikt får en rektangulär zon där
   byggnaderna läggs ut i ett prydligt rutnät. Hamnen ligger nederst
   mot vattnet. */

interface Zone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ZONES: Zone[] = [
  { id: "förort", x: 24, y: 96, w: 286, h: 372 }, // vänster
  { id: "centrum", x: 334, y: 96, w: 340, h: 372 }, // mitten
  { id: "kulle", x: 698, y: 96, w: 278, h: 176 }, // uppe höger
  { id: "industri", x: 698, y: 296, w: 278, h: 172 }, // höger
  { id: "hamnen", x: 24, y: 492, w: 952, h: 144 }, // nederst (vid vattnet)
];

/** Byggnadsfotavtryckets mått i kartans koordinatsystem. */
const SLOT_W = 34;
const SLOT_H = 30;
const SLOT_GAP_X = 18;
const SLOT_GAP_Y = 20;
const ZONE_PAD_X = 22;
const ZONE_PAD_TOP = 40; // plats för zonetiketten
const ZONE_PAD_BOTTOM = 14;

/** Färger för de tre konkurrenterna på kartan. */
const RIVAL_COLORS = ["#a855f7", "#f97316", "#06b6d4"];

/** En vald enhet på kartan (diskriminerad union). */
type SelKey =
  | { kind: "listing"; id: number }
  | { kind: "owned"; id: number }
  | { kind: "lot"; id: number }
  | { kind: "rival"; competitorName: string; id: number }
  | { kind: "offmarket"; id: number };

function sameSel(a: SelKey | null, b: SelKey): boolean {
  if (a === null) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "rival" && b.kind === "rival")
    return a.competitorName === b.competitorName && a.id === b.id;
  if (a.kind !== "rival" && b.kind !== "rival") return a.id === b.id;
  return false;
}

/** Ett utlagt fotavtryck: position + vad det representerar. */
interface Placed {
  key: SelKey;
  x: number; // övre vänstra hörnet
  y: number;
}

/** Beräkna slot-positioner i ett rutnät inom en zon. */
function layoutZone(zone: Zone, count: number): Array<{ x: number; y: number }> {
  const innerW = zone.w - ZONE_PAD_X * 2;
  const cols = Math.max(1, Math.floor((innerW + SLOT_GAP_X) / (SLOT_W + SLOT_GAP_X)));
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    out.push({
      x: zone.x + ZONE_PAD_X + c * (SLOT_W + SLOT_GAP_X),
      y: zone.y + ZONE_PAD_TOP + r * (SLOT_H + SLOT_GAP_Y),
    });
  }
  return out;
}

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

// ── Huvudkomponent ─────────────────────────────────────────────

export function CityMap({ state, dispatch }: Props) {
  const [hovered, setHovered] = useState<string | null>(null); // serialiserad SelKey
  const [selected, setSelected] = useState<SelKey | null>(null);

  // Lägg ut alla enheter per zon (ägda + till salu + tomter + rivals + off-market).
  const placedByZone = useMemo(() => {
    const map: Record<string, Placed[]> = {};
    for (const zone of ZONES) {
      const owned = state.portfolio.filter((p) => p.district === zone.id);
      const listings = state.listings.filter((p) => p.district === zone.id);
      const lots = state.lots.filter((l) => l.district === zone.id);
      const rivals: SelKey[] = [];
      for (const comp of state.competitors) {
        for (const p of (comp.portfolio ?? [])) {
          if (p.district === zone.id) rivals.push({ kind: "rival", competitorName: comp.name, id: p.id });
        }
      }
      const offmarket: SelKey[] = (state.worldPool ?? [])
        .filter((p) => p.district === zone.id)
        .map((p): SelKey => ({ kind: "offmarket", id: p.id }));
      const keys: SelKey[] = [
        ...owned.map((p): SelKey => ({ kind: "owned", id: p.id })),
        ...listings.map((p): SelKey => ({ kind: "listing", id: p.id })),
        ...lots.map((l): SelKey => ({ kind: "lot", id: l.id })),
        ...rivals,
        ...offmarket,
      ];
      const slots = layoutZone(zone, keys.length);
      map[zone.id] = keys.map((key, i) => ({ key, x: slots[i].x, y: slots[i].y }));
    }
    return map;
  }, [state.portfolio, state.listings, state.lots, state.competitors, state.worldPool]);

  // Slå upp valt objekt → konkret data till detaljpanelen.
  const selProperty =
    selected && selected.kind === "owned"
      ? state.portfolio.find((p) => p.id === selected.id) ?? null
      : selected && selected.kind === "listing"
        ? state.listings.find((p) => p.id === selected.id) ?? null
        : null;
  const selLot =
    selected && selected.kind === "lot"
      ? state.lots.find((l) => l.id === selected.id) ?? null
      : null;
  const selRival =
    selected && selected.kind === "rival"
      ? (() => {
          const comp = state.competitors.find((c) => c.name === selected.competitorName);
          const prop = comp?.portfolio.find((p) => p.id === selected.id) ?? null;
          return comp && prop ? { comp, prop } : null;
        })()
      : null;
  const selOffmarket =
    selected && selected.kind === "offmarket"
      ? (state.worldPool ?? []).find((p) => p.id === selected.id) ?? null
      : null;

  return (
    <div style={{ paddingTop: 4 }}>
      {/* Titelremsa */}
      <div style={titleStrip}>
        <span style={titleText}>STADEN</span>
        <span style={titleSub}>Klicka en byggnad för att köpa, lägga bud eller göra direkterbjudande till konkurrent</span>
      </div>

      {/* Förklaring (mässingschips på valnötsremsa) */}
      <Legend competitors={state.competitors} />

      {/* SVG-stadskartan */}
      <div style={mapFrame}>
        <svg
          viewBox="0 0 1000 660"
          style={{ display: "block", width: "100%", height: "auto", maxHeight: "62vh", background: C.felt }}
          aria-label="Stadskartan"
        >
          <defs>
            {/* Vatten – subtil blågrön schraffering */}
            <pattern id="city-water" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="#173f4a" />
              <line x1="0" y1="20" x2="20" y2="0" stroke="#235a66" strokeWidth="1.4" />
              <line x1="-5" y1="15" x2="15" y2="-5" stroke="#235a66" strokeWidth="1.4" opacity="0.6" />
            </pattern>
            {/* Skugga för byggnader */}
            <filter id="city-shadow" x="-30%" y="-30%" width="160%" height="170%">
              <feDropShadow dx="1.5" dy="2.5" stdDeviation="1.2" floodColor="#000000" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Filtbakgrund */}
          <rect width="1000" height="660" fill={C.feltDark} />
          <rect width="1000" height="660" fill={C.felt} opacity="0.55" />

          {/* Vatten längst ner (för hamnen) */}
          <rect x="0" y="618" width="1000" height="42" fill="url(#city-water)" />
          <rect x="0" y="614" width="1000" height="4" fill={C.brassDim} opacity="0.45" />

          {/* Gator: brett rutnät av pergamentfärgade vägar */}
          <Streets />

          {/* Distriktszoner */}
          {ZONES.map((zone) => (
            <ZoneArea key={zone.id} zone={zone} />
          ))}

          {/* Byggnader / objekt / tomter */}
          {ZONES.map((zone) =>
            (placedByZone[zone.id] ?? []).map((pl) => {
              const skey = serialize(pl.key);
              return (
                <Footprint
                  key={skey}
                  placed={pl}
                  state={state}
                  isHovered={hovered === skey}
                  isSelected={sameSel(selected, pl.key)}
                  onEnter={() => setHovered(skey)}
                  onLeave={() => setHovered((h) => (h === skey ? null : h))}
                  onClick={() => setSelected((s) => (sameSel(s, pl.key) ? null : pl.key))}
                />
              );
            }),
          )}
        </svg>
      </div>

      {/* Detaljpanel / hjälptext */}
      {selProperty && selected?.kind === "listing" ? (
        <ListingDetail p={selProperty} state={state} dispatch={dispatch} onClose={() => setSelected(null)} />
      ) : selProperty && selected?.kind === "owned" ? (
        <OwnedDetail p={selProperty} state={state} dispatch={dispatch} onClose={() => setSelected(null)} />
      ) : selLot ? (
        <LotDetail lot={selLot} state={state} dispatch={dispatch} onClose={() => setSelected(null)} />
      ) : selRival ? (
        <RivalDetail comp={selRival.comp} prop={selRival.prop} state={state} dispatch={dispatch} onClose={() => setSelected(null)} />
      ) : selOffmarket ? (
        <OffMarketDetail prop={selOffmarket} state={state} dispatch={dispatch} onClose={() => setSelected(null)} />
      ) : (
        <div style={hintBox}>
          Klicka en byggnad för detaljer, köp eller lägg bud. Genomskinliga byggnader är off-market — lägg ett bud direkt med premie.
        </div>
      )}
    </div>
  );
}

// ── Serialisering av SelKey (för hover-jämförelse / React-nycklar) ─

function serialize(k: SelKey): string {
  if (k.kind === "rival") return `rival:${k.competitorName}:${k.id}`;
  return `${k.kind}:${k.id}`; // listing/owned/lot/offmarket all unique by kind+id
}

// ── Gator ───────────────────────────────────────────────────────

function Streets() {
  const vert = [330, 690]; // mellan zonerna
  const horiz = [92, 290, 488]; // delar upp till kvarter
  const roadFill = "#c7b78d";
  const roadDash = C.parchment;
  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Horisontella gator */}
      {horiz.map((y) => (
        <g key={`h${y}`}>
          <rect x="0" y={y - 7} width="1000" height="14" fill={roadFill} opacity="0.5" />
          <line
            x1="0"
            y1={y}
            x2="1000"
            y2={y}
            stroke={roadDash}
            strokeWidth="1.5"
            strokeDasharray="14 12"
            opacity="0.7"
          />
        </g>
      ))}
      {/* Vertikala gator */}
      {vert.map((x) => (
        <g key={`v${x}`}>
          <rect x={x - 7} y="0" width="14" height="618" fill={roadFill} opacity="0.5" />
          <line
            x1={x}
            y1="0"
            x2={x}
            y2="618"
            stroke={roadDash}
            strokeWidth="1.5"
            strokeDasharray="14 12"
            opacity="0.7"
          />
        </g>
      ))}
    </g>
  );
}

// ── Distriktszon (yta + etikett + statistik) ────────────────────

function ZoneArea({ zone }: { zone: Zone }) {
  const dist = DISTRICTS.find((d) => d.id === zone.id)!;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        x={zone.x}
        y={zone.y}
        width={zone.w}
        height={zone.h}
        rx={10}
        fill={C.parchment}
        opacity={0.07}
        stroke={C.brass}
        strokeOpacity={0.32}
        strokeWidth={1}
      />
      <text
        x={zone.x + 18}
        y={zone.y + 27}
        fontFamily={FONTS.heading}
        fontSize={21}
        fontWeight={700}
        fill={C.brassBright}
        style={{ letterSpacing: 0.4 }}
      >
        {dist.name}
      </text>
      <text
        x={zone.x + 18}
        y={zone.y + 27}
        dy={16}
        fontFamily={FONTS.body}
        fontSize={11.5}
        fill={C.brass}
        opacity={0.85}
      >
        {Math.round(dist.base / 1000)}k kr/m² · ×{dist.growth.toFixed(2)}
      </text>
    </g>
  );
}

// ── Ett byggnadsfotavtryck (eller tomt) ─────────────────────────

interface FootprintProps {
  placed: Placed;
  state: GameState;
  isHovered: boolean;
  isSelected: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}

function Footprint({ placed, state, isHovered, isSelected, onEnter, onLeave, onClick }: FootprintProps) {
  const { key, x, y } = placed;
  const cx = x + SLOT_W / 2;
  const cy = y + SLOT_H / 2;
  const lift = isHovered || isSelected;

  // Bestäm färg & innehåll utifrån typ/status.
  let roof: string = C.brass;
  let isLot = false;
  let lotOwned = false;
  let isRival = false;
  let isOffmarket = false;
  let building: Property | undefined;
  let lot: Lot | undefined;

  if (key.kind === "owned") {
    building = state.portfolio.find((p) => p.id === key.id);
    roof = building?.status === "bygger" ? "#cc8020" : C.brass;
  } else if (key.kind === "listing") {
    building = state.listings.find((p) => p.id === key.id);
    roof = C.green;
  } else if (key.kind === "rival") {
    const compIdx = state.competitors.findIndex((c) => c.name === key.competitorName);
    roof = RIVAL_COLORS[compIdx % RIVAL_COLORS.length];
    building = state.competitors[compIdx]?.portfolio.find((p) => p.id === key.id);
    isRival = true;
  } else if (key.kind === "offmarket") {
    building = (state.worldPool ?? []).find((p) => p.id === key.id);
    roof = "#7a8a9a";
    isOffmarket = true;
  } else {
    lot = state.lots.find((l) => l.id === key.id);
    isLot = true;
    lotOwned = !!lot?.owned;
  }

  const stroke = isSelected ? C.brassBright : isHovered ? C.cream : C.woodDark;
  const strokeW = isSelected ? 2.2 : isHovered ? 1.6 : 1;

  return (
    <g
      style={{ cursor: "pointer", transition: "transform 0.1s ease", opacity: isOffmarket ? (lift ? 0.65 : 0.28) : 1 }}
      transform={lift ? `translate(${cx} ${cy}) scale(1.12) translate(${-cx} ${-cy})` : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {/* Klickyta (osynlig, lite större) */}
      <rect x={x - 3} y={y - 3} width={SLOT_W + 6} height={SLOT_H + 6} fill="transparent" />

      {isLot ? (
        // Tomt: streckad plot
        <>
          <rect
            x={x}
            y={y}
            width={SLOT_W}
            height={SLOT_H}
            rx={3}
            fill={lotOwned ? `${C.brass}22` : "#ffffff10"}
            stroke={lotOwned ? C.brass : C.creamSoft}
            strokeOpacity={lotOwned ? 0.9 : 0.45}
            strokeWidth={1.4}
            strokeDasharray="4 3"
          />
          <text
            x={cx}
            y={cy - 1}
            textAnchor="middle"
            fontFamily={FONTS.body}
            fontSize={7.5}
            fontWeight={700}
            fill={lotOwned ? C.brassBright : C.creamSoft}
          >
            TOMT
          </text>
          {!lotOwned && lot && (
            <text
              x={cx}
              y={cy + 8}
              textAnchor="middle"
              fontFamily={FONTS.body}
              fontSize={6.5}
              fill={C.creamSoft}
              opacity={0.85}
            >
              {msek(lot.price)}
            </text>
          )}
        </>
      ) : (
        // Byggnad: fotavtryck med tak + takdetalj + skugga
        <>
          <g filter="url(#city-shadow)">
            {/* Väggar / sockel */}
            <rect x={x} y={y} width={SLOT_W} height={SLOT_H} rx={3} fill={C.woodDark} opacity={0.9} />
            {/* Tak */}
            <rect x={x} y={y} width={SLOT_W} height={SLOT_H} rx={3} fill={roof} stroke={stroke} strokeWidth={strokeW} />
            {/* Takdetalj (inre rektangel) */}
            <rect
              x={x + 6}
              y={y + 5}
              width={SLOT_W - 12}
              height={SLOT_H - 10}
              rx={2}
              fill="#000000"
              opacity={0.16}
            />
          </g>

          {/* Bygger → liten kran + schraffering */}
          {building?.status === "bygger" && (
            <g style={{ pointerEvents: "none" }}>
              <line x1={x + 7} y1={y + SLOT_H - 4} x2={x + 7} y2={y + 4} stroke={C.woodDark} strokeWidth={1.6} />
              <line x1={x + 7} y1={y + 5} x2={x + SLOT_W - 6} y2={y + 5} stroke={C.woodDark} strokeWidth={1.6} />
              <line x1={x + SLOT_W - 6} y1={y + 5} x2={x + SLOT_W - 6} y2={y + 11} stroke={C.woodDark} strokeWidth={1} />
              <line x1={x + 2} y1={y + SLOT_H * 0.5} x2={x + SLOT_W - 2} y2={y + SLOT_H * 0.5} stroke={C.woodDark} strokeWidth={0.8} strokeDasharray="3 2" opacity={0.7} />
            </g>
          )}

          {/* Till salu → liten flagga med "TILL SALU" */}
          {key.kind === "listing" && (
            <g style={{ pointerEvents: "none" }}>
              <line x1={x + SLOT_W - 6} y1={y - 9} x2={x + SLOT_W - 6} y2={y + 4} stroke={C.brassBright} strokeWidth={1.2} />
              <polygon
                points={`${x + SLOT_W - 6},${y - 9} ${x + SLOT_W + 12},${y - 6} ${x + SLOT_W - 6},${y - 3}`}
                fill={BURGUNDY}
                stroke={C.brass}
                strokeWidth={0.6}
              />
            </g>
          )}
          {/* Rival → liten prick i övre vänster för att indikera ägaren */}
          {isRival && (
            <circle cx={x + 5} cy={y + 5} r={3.5} fill={roof} stroke="#00000033" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
          )}
          {/* Off-market → "?" text i mitten */}
          {isOffmarket && (
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fontFamily={FONTS.body}
              fontSize={11}
              fontWeight={700}
              fill="#ccd5dd"
              style={{ pointerEvents: "none" }}
            >
              ?
            </text>
          )}
        </>
      )}
    </g>
  );
}

// ── Förklaring (mässingschips) ──────────────────────────────────

function Legend({ competitors }: { competitors: import("../engine/types").Competitor[] }) {
  return (
    <div style={legendBar}>
      <LegendChip color={C.brass} label="Din fastighet" />
      <LegendChip color="#cc8020" label="Under byggnation" />
      <LegendChip color={C.green} label="Till salu" flag />
      <LegendChip color="transparent" label="Tomt" dashed />
      {competitors.map((c, i) => (
        <LegendChip key={c.name} color={RIVAL_COLORS[i % RIVAL_COLORS.length]} label={c.name.split(" ")[0]} />
      ))}
      <LegendChip color="#7a8a9a" label="Off-market" faded />
    </div>
  );
}

function LegendChip({
  color,
  label,
  dashed,
  flag,
  faded,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  flag?: boolean;
  faded?: boolean;
}) {
  return (
    <span style={{ ...legendChip, opacity: faded ? 0.55 : 1 }}>
      <span
        style={{
          width: 14,
          height: 12,
          borderRadius: 2,
          flexShrink: 0,
          background: dashed ? "transparent" : color,
          border: dashed ? `1.4px dashed ${C.brass}` : `1px solid ${C.woodDark}`,
          position: "relative",
        }}
      >
        {flag && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 6,
              height: 5,
              background: BURGUNDY,
              border: `0.5px solid ${C.brass}`,
            }}
          />
        )}
      </span>
      {label}
    </span>
  );
}

/* =============================================================
   DETALJPANELER
   ============================================================= */

// ── Listing (till salu): köp eller lägg bud ─────────────────────

function ListingDetail({
  p,
  state,
  dispatch,
  onClose,
}: {
  p: Property;
  state: GameState;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}) {
  const terms = loanTerms(state);
  const noi = propPotentialRent(p, state) - propAnnualOpex(p, state);
  const yld = p.askPrice > 0 ? noi / p.askPrice : 0;
  const down = p.askPrice * (1 - terms.maxLtv);
  const canBuy = state.cash >= down && !state.gameOver;

  const [bidMode, setBidMode] = useState(false);
  const minBid = Math.round(0.75 * p.askPrice);
  const [bid, setBid] = useState(p.askPrice);
  const bidStep = Math.max(1, Math.round(p.askPrice / 40));
  const bidDown = bid * (1 - terms.maxLtv);
  const canBid = state.cash >= bidDown && !state.gameOver;
  const accept = acceptanceLabel(bid / p.askPrice);

  return (
    <DetailShell title={p.typeLabel} sub={`${p.districtName} · ${p.area} m²`} onClose={onClose}>
      {/* Förhandsvisning */}
      <div style={previewBanner}>
        <BuildingArt p={p} month={state.month} />
        <div style={previewOverlay}>
          <span style={previewTag}>{p.typeLabel}</span>
          <span style={previewDistrict}>{p.districtName}</span>
        </div>
      </div>

      <Row label="Typ · distrikt" value={`${p.typeLabel} · ${p.districtName}`} />
      <Row label="Yta" value={`${p.area} m²`} />
      <Row label="Skick" value={`${Math.round(p.condition)} / 100`} />
      <GoldRule />
      <Row label="Potentiell NOI/år" value={kr(Math.round(noi))} strong />
      <Row label="Direktavkastning" value={pct(yld)} color={yld >= 0.05 ? C.positive : C.inkSoft} />
      <Row label="Utpris" value={msek(p.askPrice)} strong />
      <Row label="Handpenning" value={msek(down)} />

      {/* Köp-knapp (primär) */}
      <button
        style={{ ...primaryBtn, ...(canBuy ? {} : disabledBtn), marginTop: 12 }}
        disabled={!canBuy}
        onClick={() => dispatch({ type: "BUY", id: p.id })}
      >
        {canBuy ? `Köp för ${msek(p.askPrice)}` : "Otillräcklig handpenning"}
      </button>

      {/* Lägg bud (toggle → sekundär) */}
      <button style={{ ...secondaryBtn, marginTop: 8 }} onClick={() => setBidMode((b) => !b)}>
        {bidMode ? "Stäng budgivning" : "Lägg bud"}
      </button>

      {bidMode && (
        <div style={bidBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={bidLabel}>Ditt bud</span>
            <span style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 18, color: C.ink }}>
              {msek(bid)}
            </span>
          </div>
          <input
            type="range"
            min={minBid}
            max={p.askPrice}
            step={bidStep}
            value={bid}
            onChange={(e) => setBid(Number(e.target.value))}
            style={{ width: "100%", accentColor: BURGUNDY, marginTop: 6 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.inkSoft }}>
            <span>{msek(minBid)}</span>
            <span>{msek(p.askPrice)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 12, color: C.inkSoft }}>Sannolikhet</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: accept.color }}>{accept.label}</span>
          </div>
          <Row label="Handpenning för budet" value={msek(bidDown)} />
          <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2, fontStyle: "italic" }}>
            Ett bud kan avvisas.
          </div>
          <button
            style={{ ...primaryBtn, ...(canBid ? {} : disabledBtn), marginTop: 10 }}
            disabled={!canBid}
            onClick={() => dispatch({ type: "PLACE_BID", id: p.id, amount: bid })}
          >
            {canBid ? `Lägg bud ${msek(bid)}` : "Otillräcklig handpenning"}
          </button>
        </div>
      )}
    </DetailShell>
  );
}

/** Acceptansetikett utifrån bud/utpris-kvot (speglar reducern). */
function acceptanceLabel(ratio: number): { label: string; color: string } {
  if (ratio >= 0.97) return { label: "Mycket trolig", color: C.positive };
  if (ratio >= 0.92) return { label: "Trolig", color: C.positive };
  if (ratio >= 0.85) return { label: "Osäker", color: C.inkSoft };
  if (ratio >= 0.78) return { label: "Låg chans", color: C.negative };
  return { label: "Mycket låg", color: C.negative };
}

// ── Owned (ägd): översikt, ingen förvaltning här ────────────────

function OwnedDetail({
  p,
  state,
  dispatch,
  onClose,
}: {
  p: Property;
  state: GameState;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}) {
  const val = propMarketValue(p, state);
  const noiMonth = propNOI(p, state) / 12;
  const building = p.status === "bygger";
  const [newUse, setNewUse] = useState<PropTypeKey>(p.type);
  const changeCost = Math.round(val * 0.15);
  const vacant = p.tenants.length === 0;
  const canChange = !building && vacant && newUse !== p.type && state.cash >= changeCost && !state.gameOver;

  return (
    <DetailShell
      title={p.typeLabel}
      sub={`${p.districtName} · ${p.area} m²`}
      onClose={onClose}
      accent={building ? "#cc8020" : C.brass}
    >
      <div style={previewBanner}>
        <BuildingArt p={p} month={state.month} />
        <div style={previewOverlay}>
          <span style={previewTag}>{building ? "Bygger" : "Ägd"}</span>
          <span style={previewDistrict}>{p.districtName}</span>
        </div>
      </div>

      <Row label="Marknadsvärde" value={msek(val)} strong />
      <Row label="NOI/mån" value={kr(Math.round(noiMonth))} color={noiMonth >= 0 ? C.positive : C.negative} />
      <Row label="Uthyrt" value={`${p.tenants.length}/${p.capacity}`} />
      <Row
        label="Status"
        value={building ? `Klart om ${p.buildLeft} mån` : "Klar"}
        color={building ? "#b06010" : C.inkSoft}
      />

      {!building && (
        <>
          <GoldRule />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.brassDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Ändra användning
          </div>
          <select value={newUse} onChange={(e) => setNewUse(e.target.value as PropTypeKey)} style={selectStyle}>
            {PROP_TYPE_KEYS.map((k) => (
              <option key={k} value={k}>{PROP_TYPES[k].label}</option>
            ))}
          </select>
          <button
            style={canChange ? primaryBtn : disabledBtn}
            disabled={!canChange}
            onClick={() => dispatch({ type: "CHANGE_USE", id: p.id, propType: newUse })}
          >
            {newUse === p.type ? "Välj ny användning" : `Bygg om → ${PROP_TYPES[newUse].label} · ${msek(changeCost)}`}
          </button>
          {!vacant && (
            <div style={{ fontSize: 11, color: C.negative, marginTop: 4 }}>
              Fastigheten måste vara vakant för att byggas om.
            </div>
          )}

          <div style={{ height: 8 }} />
          <button style={secondaryBtn} onClick={() => dispatch({ type: "SELL", id: p.id })}>
            Sälj fastighet · {msek(val)}
          </button>
        </>
      )}

      <GoldRule />
      <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>
        Hyresgäster &amp; uppgraderingar hanteras i Portfölj-fliken.
      </div>
    </DetailShell>
  );
}

// ── Lot (tomt): köp eller bygg ──────────────────────────────────

const PROP_TYPE_KEYS: PropTypeKey[] = ["bostad", "kontor", "butik", "industri"];

function LotDetail({
  lot,
  state,
  dispatch,
  onClose,
}: {
  lot: Lot;
  state: GameState;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}) {
  const terms = loanTerms(state);
  const [buildType, setBuildType] = useState<PropTypeKey>("bostad");

  if (!lot.owned) {
    // Köp tomt
    const canBuy = state.cash >= lot.price && !state.gameOver;
    return (
      <DetailShell title="Ledig tomt" sub={`${lot.districtName} · ${lot.area} m²`} onClose={onClose}>
        <Row label="Distrikt" value={lot.districtName} />
        <Row label="Yta" value={`${lot.area} m²`} />
        <Row label="Pris" value={msek(lot.price)} strong />
        <button
          style={{ ...primaryBtn, ...(canBuy ? {} : disabledBtn), marginTop: 12 }}
          disabled={!canBuy}
          onClick={() => dispatch({ type: "BUY_LOT", id: lot.id })}
        >
          {canBuy ? `Köp tomt ${msek(lot.price)}` : "Otillräcklig kassa"}
        </button>
      </DetailShell>
    );
  }

  // Bygg på ägd tomt
  const def = PROP_TYPES[buildType];
  const cost = Math.round(lot.area * def.buildCostM2 * buildCostMult(state));
  const months = Math.max(4, def.buildMonths + buildMonthsDelta(state));
  const down = cost * (1 - terms.maxLtv);
  const canBuild = state.cash >= down && !state.gameOver;

  return (
    <DetailShell title="Din tomt" sub={`${lot.districtName} · ${lot.area} m²`} onClose={onClose}>
      <Row label="Distrikt" value={lot.districtName} />
      <Row label="Yta" value={`${lot.area} m²`} />
      <GoldRule />
      <label style={{ fontSize: 12, color: C.inkSoft, display: "block", marginBottom: 4 }}>
        Välj byggnadstyp
      </label>
      <select
        value={buildType}
        onChange={(e) => setBuildType(e.target.value as PropTypeKey)}
        style={selectStyle}
      >
        {PROP_TYPE_KEYS.map((k) => {
          const v = PROP_TYPES[k];
          return (
            <option key={k} value={k}>
              {v.label} — {msek(lot.area * v.buildCostM2)} · {v.buildMonths} mån
            </option>
          );
        })}
      </select>
      <Row label="Byggkostnad" value={msek(cost)} strong />
      <Row label="Byggtid" value={`${months} mån`} />
      <Row label="Handpenning" value={msek(down)} />
      <button
        style={{ ...primaryBtn, ...(canBuild ? {} : disabledBtn), marginTop: 12 }}
        disabled={!canBuild}
        onClick={() => dispatch({ type: "BUILD", id: lot.id, propType: buildType })}
      >
        {canBuild ? `Bygg ${def.label}` : "Otillräcklig kassa"}
      </button>
    </DetailShell>
  );
}

/* =============================================================
   GEMENSAMMA BYGGSTENAR (art-deco pergament-kort)
   ============================================================= */

function DetailShell({
  title,
  sub,
  onClose,
  accent = C.brass,
  children,
}: {
  title: string;
  sub: string;
  onClose: () => void;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={detailCard}>
      <div style={detailHeader}>
        <div>
          <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 19, color: BURGUNDY }}>
            {title}
          </div>
          <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>
            {sub}
          </div>
        </div>
        <button onClick={onClose} style={closeBtn} aria-label="Stäng">
          ✕
        </button>
      </div>
      <div style={{ height: 2, background: THEME.goldRule, marginBottom: 12 }} />
      <div style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 12 }}>{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  color,
}: {
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0" }}>
      <span style={{ fontSize: 12.5, color: C.inkSoft }}>{label}</span>
      <span
        style={{
          fontFamily: strong ? FONTS.heading : FONTS.body,
          fontSize: strong ? 15 : 13,
          fontWeight: strong ? 700 : 600,
          color: color ?? C.ink,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function GoldRule() {
  return <div style={{ height: 1, background: THEME.goldRule, margin: "8px 0" }} />;
}

// ── Off-market: direktbud med premie ────────────────────────────

function OffMarketDetail({
  prop,
  state,
  dispatch,
  onClose,
}: {
  prop: Property;
  state: GameState;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}) {
  const ref = prop.askPrice;
  const minOffer = Math.round(ref * 1.0);
  const maxOffer = Math.round(ref * 1.5);
  const [offer, setOffer] = useState(Math.round(ref * 1.12));
  const { maxLtv } = loanTerms(state);
  const down = offer * (1 - maxLtv);
  const canOffer = state.cash >= down && !state.gameOver;
  const ratio = offer / ref;
  const likelyText =
    ratio >= 1.10 ? { label: "Garanterat svar (+10 %)", color: C.positive } :
    ratio >= 1.05 ? { label: "50 % chans",              color: "#9a6a10" } :
                   { label: "Troligen avvisas",          color: C.negative };

  return (
    <DetailShell
      title={prop.typeLabel}
      sub={`${prop.districtName} · ${prop.area} m² · Off-market`}
      onClose={onClose}
      accent="#7a8a9a"
    >
      <div style={{ fontSize: 12, color: "#7a8a9a", fontWeight: 600, marginBottom: 8 }}>
        Denna fastighet är inte till salu — lägg ett direktbud med premie för att locka fram ett svar.
      </div>
      <Row label="Typ · distrikt" value={`${prop.typeLabel} · ${prop.districtName}`} />
      <Row label="Yta" value={`${prop.area} m²`} />
      <Row label="Skick" value={`${Math.round(prop.condition)} / 100`} />
      <GoldRule />
      <Row label="Uppskattat värde" value={msek(ref)} strong />
      <Row label="Min. premie (+10 %)" value={msek(Math.round(ref * 1.10))} />
      <Row label="Handpenning" value={msek(down)} />
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={bidLabel}>Ditt bud</span>
          <span style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 18, color: C.ink }}>
            {msek(offer)}
          </span>
        </div>
        <input
          type="range"
          min={minOffer}
          max={maxOffer}
          step={Math.max(1, Math.round(ref / 40))}
          value={offer}
          onChange={(e) => setOffer(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#7a8a9a", marginBottom: 4 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.inkSoft }}>
          <span>{msek(minOffer)}</span>
          <span>{msek(maxOffer)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 12, color: C.inkSoft }}>Acceptanschans</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: likelyText.color }}>{likelyText.label}</span>
        </div>
        <button
          style={{ ...primaryBtn, ...(canOffer ? {} : disabledBtn), marginTop: 10 }}
          disabled={!canOffer}
          onClick={() => dispatch({ type: "BID_OFFMARKET", propertyId: prop.id, amount: offer })}
        >
          {canOffer ? `Lägg off-market bud ${msek(offer)}` : "Otillräcklig handpenning"}
        </button>
      </div>
    </DetailShell>
  );
}

// ── Rival (konkurrentägd): direkterbjudande ──────────────────────

function RivalDetail({
  comp,
  prop,
  state,
  dispatch,
  onClose,
}: {
  comp: Competitor;
  prop: Property;
  state: GameState;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}) {
  const ref = prop.askPrice;
  const minOffer = Math.round(ref * 0.9);
  const maxOffer = Math.round(ref * 1.5);
  const [offer, setOffer] = useState(Math.round(ref * 1.15));
  const { maxLtv } = loanTerms(state);
  const down = offer * (1 - maxLtv);
  const canOffer = state.cash >= down && !state.gameOver;
  const ratio = offer / ref;
  const likelyText =
    ratio >= 1.25 ? { label: "Mycket trolig", color: C.positive } :
    ratio >= 1.1  ? { label: "Trolig (70 %)", color: C.positive } :
    { label: "Avvisas troligen", color: C.negative };

  const compIdx = state.competitors.findIndex((c) => c.name === comp.name);
  const rivalColor = RIVAL_COLORS[compIdx % RIVAL_COLORS.length];

  return (
    <DetailShell
      title={prop.typeLabel}
      sub={`${prop.districtName} · ${prop.area} m² · Ägs av ${comp.name}`}
      onClose={onClose}
      accent={rivalColor}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: rivalColor, display: "inline-block" }} />
        <span style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600 }}>{comp.name}</span>
        {comp.strategy && (
          <span style={{ fontSize: 11, background: rivalColor + "22", color: rivalColor, borderRadius: 4, padding: "1px 8px", fontWeight: 700 }}>
            {comp.strategy}
          </span>
        )}
      </div>
      <Row label="Typ · distrikt" value={`${prop.typeLabel} · ${prop.districtName}`} />
      <Row label="Yta" value={`${prop.area} m²`} />
      <Row label="Skick" value={`${Math.round(prop.condition)} / 100`} />
      <GoldRule />
      <Row label="Senaste pris" value={msek(ref)} strong />
      <Row label="Handpenning" value={msek(down)} />
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={bidLabel}>Ditt erbjudande</span>
          <span style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 18, color: C.ink }}>
            {msek(offer)}
          </span>
        </div>
        <input
          type="range"
          min={minOffer}
          max={maxOffer}
          step={Math.max(1, Math.round(ref / 40))}
          value={offer}
          onChange={(e) => setOffer(Number(e.target.value))}
          style={{ width: "100%", accentColor: rivalColor, marginBottom: 4 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.inkSoft }}>
          <span>{msek(minOffer)}</span>
          <span>{msek(maxOffer)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 12, color: C.inkSoft }}>Acceptanschans</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: likelyText.color }}>{likelyText.label}</span>
        </div>
        <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2, fontStyle: "italic" }}>
          Konkurrenten kräver minst 10 % premie över senaste pris.
        </div>
        <button
          style={{ ...primaryBtn, ...(canOffer ? {} : disabledBtn), marginTop: 10 }}
          disabled={!canOffer}
          onClick={() => dispatch({ type: "OFFER_TO_RIVAL", competitorName: comp.name, propertyId: prop.id, amount: offer })}
        >
          {canOffer ? `Lägg erbjudande ${msek(offer)}` : "Otillräcklig handpenning"}
        </button>
      </div>
    </DetailShell>
  );
}

/* =============================================================
   STILAR
   ============================================================= */

const titleStrip: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 10,
  padding: "8px 14px",
  background: THEME.woodBar,
  border: `1px solid ${C.brassDim}`,
  borderRadius: "8px 8px 0 0",
  boxShadow: THEME.insetGold,
};
const titleText: CSSProperties = {
  fontFamily: FONTS.display,
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 4,
  color: C.brassBright,
};
const titleSub: CSSProperties = {
  fontFamily: FONTS.body,
  fontSize: 12,
  color: C.creamSoft,
};

const legendBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 18,
  padding: "8px 14px",
  background: THEME.wood,
  borderLeft: `1px solid ${C.brassDim}`,
  borderRight: `1px solid ${C.brassDim}`,
  fontFamily: FONTS.body,
  fontSize: 12,
  color: C.creamText,
};
const legendChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const mapFrame: CSSProperties = {
  borderRadius: "0 0 8px 8px",
  overflow: "hidden",
  border: THEME.brassBorder,
  boxShadow: THEME.panelShadow,
};

const hintBox: CSSProperties = {
  marginTop: 14,
  padding: "12px 16px",
  background: THEME.parchment,
  border: THEME.brassBorder,
  borderRadius: 6,
  color: C.inkSoft,
  fontFamily: FONTS.body,
  fontSize: 13.5,
  boxShadow: THEME.insetGold,
};

const detailCard: CSSProperties = {
  marginTop: 14,
  padding: 18,
  background: THEME.parchment,
  border: THEME.brassBorder2,
  borderRadius: 8,
  color: C.ink,
  boxShadow: `${THEME.insetGold}, ${THEME.panelShadow}`,
};
const detailHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 8,
};
const closeBtn: CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.brassDim}`,
  color: C.inkSoft,
  borderRadius: 6,
  width: 30,
  height: 30,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
  flexShrink: 0,
};

const previewBanner: CSSProperties = {
  position: "relative",
  margin: "0 0 12px",
  borderRadius: 6,
  overflow: "hidden",
  border: `1px solid ${C.brassDim}`,
  maxHeight: 150,
};
const previewOverlay: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "6px 10px",
  background: "linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0))",
};
const previewTag: CSSProperties = {
  fontFamily: FONTS.body,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: C.brassBright,
  background: "rgba(0,0,0,0.35)",
  border: `1px solid ${C.brassDim}`,
  borderRadius: 4,
  padding: "1px 7px",
};
const previewDistrict: CSSProperties = {
  fontFamily: FONTS.heading,
  fontSize: 13,
  fontWeight: 700,
  color: C.creamText,
  textShadow: "0 1px 2px rgba(0,0,0,0.6)",
};

const primaryBtn: CSSProperties = {
  width: "100%",
  padding: "10px 0",
  borderRadius: 6,
  border: THEME.brassBorder,
  background: BURGUNDY,
  color: C.brassBright,
  fontFamily: FONTS.body,
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: 0.4,
  cursor: "pointer",
};
const secondaryBtn: CSSProperties = {
  width: "100%",
  padding: "9px 0",
  borderRadius: 6,
  border: `1px solid ${C.brassDim}`,
  background: "transparent",
  color: C.ink,
  fontFamily: FONTS.body,
  fontWeight: 600,
  fontSize: 13.5,
  cursor: "pointer",
};
const disabledBtn: CSSProperties = {
  background: C.parchmentDark,
  color: C.inkSoft,
  borderColor: C.brassDim,
  cursor: "default",
  opacity: 0.75,
};

const bidBox: CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  background: "#efe6d099",
  border: `1px solid ${C.brassDim}`,
  borderRadius: 6,
};
const bidLabel: CSSProperties = {
  fontFamily: FONTS.body,
  fontSize: 12.5,
  color: C.inkSoft,
};

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: `1px solid ${C.brassDim}`,
  background: C.cream,
  color: C.ink,
  fontFamily: FONTS.body,
  fontSize: 13,
  marginBottom: 8,
};
