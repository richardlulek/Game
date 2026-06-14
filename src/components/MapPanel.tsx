/* =============================================================
   MapPanel – stadskartan: portfölj, marknad och klusterstrategi
   ============================================================= */

import { useState } from "react";
import { DISTRICTS, PROP_TYPES } from "../engine/data";
import { loanTerms } from "../engine/finance";
import { kr, msek, pct } from "../engine/format";
import { propMarketValue, propNOI } from "../engine/property";
import type { District, GameAction, GameState, Lot, Property, PropTypeKey } from "../engine/types";
import { BURGUNDY } from "../styles/tokens";

// ── Kartgeometri (SVG viewBox 640 × 480) ──────────────────────
// Polygoner täcker hela ytan; bakgrunden agerar "hav".

const GEO = [
  {
    id: "förort",
    points: "10,10 200,10 180,200 200,320 90,340 10,420",
    cx: 72,
    cy: 215,
    fill: "#f0ede6",
    accent: "#c8a060",
  },
  {
    id: "centrum",
    points: "200,10 430,10 445,190 430,320 200,320 180,200",
    cx: 308,
    cy: 185,
    fill: "#f5e8d4",
    accent: "#a85030",
  },
  {
    id: "kulle",
    points: "430,10 630,10 630,190 445,190",
    cx: 534,
    cy: 100,
    fill: "#e8f0e2",
    accent: "#408040",
  },
  {
    id: "industri",
    points: "445,190 630,190 630,460 430,400 430,320",
    cx: 535,
    cy: 305,
    fill: "#e8e2d8",
    accent: "#706858",
  },
  {
    id: "hamnen",
    points: "90,340 200,320 430,320 430,400 70,440",
    cx: 255,
    cy: 362,
    fill: "#d8eaf4",
    accent: "#306898",
  },
] as const;

type DistrictId = (typeof GEO)[number]["id"];

// Gyllene vinkel-spiral för att sprida dots runt centroid
function dotPos(cx: number, cy: number, i: number): [number, number] {
  const a = (i * 137.508 * Math.PI) / 180;
  const r = 13 * Math.sqrt(i + 1);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

interface DistrictData {
  dist: District;
  owned: Property[];
  listings: Property[];
  lots: Lot[];
}

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

// ── Huvudkomponent ─────────────────────────────────────────────

export function MapPanel({ state, dispatch }: Props) {
  const [hovered, setHovered] = useState<DistrictId | null>(null);
  const [selected, setSelected] = useState<DistrictId | null>(null);
  const [buildType, setBuildType] = useState<PropTypeKey>("bostad");

  const terms = loanTerms(state);

  const byDistrict: Record<string, DistrictData> = Object.fromEntries(
    GEO.map((g) => [
      g.id,
      {
        dist: DISTRICTS.find((d) => d.id === g.id)!,
        owned: state.portfolio.filter((p) => p.district === g.id),
        listings: state.listings.filter((p) => p.district === g.id),
        lots: state.lots.filter((l) => l.district === g.id),
      },
    ]),
  );

  const topDist =
    GEO.map((g) => ({ g, n: byDistrict[g.id].owned.length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)[0] ?? null;

  const selGeo = selected ? GEO.find((g) => g.id === selected) ?? null : null;
  const selData = selected ? byDistrict[selected] : null;

  return (
    <div style={{ paddingTop: 4 }}>
      {/* Förklaring */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginBottom: 12,
          fontSize: 12,
          flexWrap: "wrap",
        }}
      >
        <LegendDot color={BURGUNDY} shape="circle" label="Din fastighet" />
        <LegendDot color="#cc8020" shape="circle" label="Under byggnation" />
        <LegendDot color="#3878a8" shape="circle" label="Till salu" />
        <LegendDot color="#408040" shape="square" label="Tomt" />
        <span style={{ color: "#aaa", marginLeft: "auto", fontSize: 11 }}>
          Klicka ett distrikt → detaljer & köp
        </span>
      </div>

      {/* SVG-karta */}
      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #d8d0c8",
          boxShadow: "0 2px 10px rgba(0,0,0,.08)",
          margin: "0 12px",
        }}
      >
        <svg
          viewBox="0 0 640 480"
          style={{ display: "block", width: "100%", background: "#c4d9ea" }}
          aria-label="Stadskartan"
        >
          <defs>
            <pattern
              id="water-hatch"
              x="0"
              y="0"
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="14" x2="14" y2="0" stroke="#a8c8de" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="640" height="480" fill="url(#water-hatch)" />

          {GEO.map((g) => {
            const dd = byDistrict[g.id];
            const isHov = hovered === g.id;
            const isSel = selected === g.id;
            const n = dd.owned.length;
            const isDom = n >= 3;
            const dotOriginY = isDom ? g.cy + 30 : g.cy + 12;

            return (
              <g
                key={g.id}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHovered(g.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(isSel ? null : g.id)}
              >
                {/* Distriktsyta */}
                <polygon
                  points={g.points}
                  fill={g.fill}
                  stroke={isSel ? BURGUNDY : isHov ? g.accent : "#bfb8b0"}
                  strokeWidth={isSel ? 2.5 : isHov ? 2 : 1}
                  style={{ transition: "stroke 0.12s, stroke-width 0.12s" }}
                />

                {/* Distriktsetikett */}
                <text
                  x={g.cx}
                  y={g.cy - 20}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill={isSel ? BURGUNDY : "#333"}
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {dd.dist.name}
                </text>

                {/* Ministatistik */}
                <text
                  x={g.cx}
                  y={g.cy - 6}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="#777"
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {Math.round(dd.dist.base / 1000)}k kr/m² · ×{dd.dist.growth.toFixed(2)}
                </text>

                {/* Dominans-märke (≥3 fastigheter) */}
                {isDom && (
                  <g style={{ pointerEvents: "none" }}>
                    <circle cx={g.cx} cy={g.cy + 8} r="15" fill={BURGUNDY} opacity="0.9" />
                    <text
                      x={g.cx}
                      y={g.cy + 13}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="800"
                      fill="#fff"
                      style={{ userSelect: "none" }}
                    >
                      {n}★
                    </text>
                  </g>
                )}

                {/* Ägda fastighets-dots */}
                {dd.owned.map((p, i) => {
                  const [dx, dy] = dotPos(g.cx, dotOriginY, i);
                  return (
                    <circle
                      key={p.id}
                      cx={dx}
                      cy={dy}
                      r="5.5"
                      fill={p.status === "bygger" ? "#cc8020" : BURGUNDY}
                      stroke="#fff"
                      strokeWidth="1.5"
                      opacity="0.92"
                      style={{ pointerEvents: "none" }}
                    />
                  );
                })}

                {/* Listings-dots */}
                {dd.listings.map((p, i) => (
                  <circle
                    key={`l${p.id}`}
                    cx={g.cx + 30 + i * 13}
                    cy={g.cy + 12}
                    r="4.5"
                    fill="#3878a8"
                    stroke="#fff"
                    strokeWidth="1.5"
                    opacity="0.88"
                    style={{ pointerEvents: "none" }}
                  />
                ))}

                {/* Tomt-kvadrater */}
                {dd.lots.map((lot, i) => (
                  <rect
                    key={`t${lot.id}`}
                    x={g.cx - 38 - i * 13}
                    y={g.cy + 8}
                    width="9"
                    height="9"
                    fill={lot.owned ? "#2a7a3c" : "#408040"}
                    stroke="#fff"
                    strokeWidth="1.5"
                    opacity="0.88"
                    style={{ pointerEvents: "none" }}
                  />
                ))}
              </g>
            );
          })}

          {/* Kompassros */}
          <g transform="translate(614, 456)">
            <circle cx="0" cy="0" r="17" fill="rgba(255,255,255,0.72)" />
            <text
              x="0"
              y="-4"
              textAnchor="middle"
              fontSize="9"
              fontWeight="800"
              fill="#555"
              style={{ userSelect: "none" }}
            >
              N
            </text>
            <line x1="0" y1="-13" x2="0" y2="-6" stroke="#555" strokeWidth="2" />
            <line x1="0" y1="4" x2="0" y2="12" stroke="#aaa" strokeWidth="1.5" />
            <line x1="-12" y1="0" x2="12" y2="0" stroke="#aaa" strokeWidth="1.5" />
          </g>
        </svg>
      </div>

      {/* Kluster-tips */}
      {state.portfolio.length === 0 ? (
        <div
          style={{
            margin: "12px 12px 0",
            padding: "10px 14px",
            background: "#f0f6ff",
            border: "1px solid #c0d4f0",
            borderRadius: 8,
            fontSize: 13,
            color: "#1a3a70",
          }}
        >
          <strong>Strategi:</strong> Klicka ett distrikt för att se vad som finns till salu.{" "}
          <strong>Centrum</strong> och <strong>Villakullen</strong> har högst prestige –{" "}
          <strong>Hamnen</strong> har starkast tillväxt (+25 %).
        </div>
      ) : topDist ? (
        <div
          style={{
            margin: "12px 12px 0",
            padding: "10px 14px",
            background: "#fff8f0",
            border: "1px solid #f0dcc0",
            borderRadius: 8,
            fontSize: 13,
            color: "#7a4800",
          }}
        >
          <strong>Kluster:</strong>{" "}
          {topDist.n < 3
            ? `Du har ${topDist.n} fastighet${topDist.n > 1 ? "er" : ""} i ${byDistrict[topDist.g.id].dist.name} – köp ${3 - topDist.n} till för att nå Dominans (3★).`
            : `Du dominerar ${byDistrict[topDist.g.id].dist.name} med ${topDist.n} fastigheter${topDist.n >= 5 ? " – fullständig dominans!" : " – expandera vidare!"}`}
        </div>
      ) : null}

      {/* Distrikt-detaljpanel */}
      {selected && selData && selGeo && (
        <DistrictDetail
          id={selected}
          data={selData}
          state={state}
          dispatch={dispatch}
          terms={terms}
          buildType={buildType}
          setBuildType={setBuildType}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── Förklaring ─────────────────────────────────────────────────

function LegendDot({
  color,
  shape,
  label,
}: {
  color: string;
  shape: "circle" | "square";
  label: string;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#666" }}>
      <svg width="10" height="10" style={{ flexShrink: 0 }}>
        {shape === "circle" ? (
          <circle cx="5" cy="5" r="4.5" fill={color} />
        ) : (
          <rect x="0.5" y="0.5" width="9" height="9" fill={color} />
        )}
      </svg>
      {label}
    </span>
  );
}

// ── Distrikt-detaljpanel ────────────────────────────────────────

const PROP_TYPE_KEYS: PropTypeKey[] = ["bostad", "kontor", "butik", "industri"];

interface DetailProps {
  id: string;
  data: DistrictData;
  state: GameState;
  dispatch: (a: GameAction) => void;
  terms: ReturnType<typeof loanTerms>;
  buildType: PropTypeKey;
  setBuildType: (t: PropTypeKey) => void;
  onClose: () => void;
}

function DistrictDetail({
  data,
  state,
  dispatch,
  terms,
  buildType,
  setBuildType,
  onClose,
}: DetailProps) {
  const { dist, owned, listings, lots } = data;
  const freeLots = lots.filter((l) => !l.owned);
  const ownedLots = lots.filter((l) => l.owned);

  const totalNOI = owned.reduce((a, p) => a + propNOI(p, state) / 12, 0);
  const totalVal = owned.reduce((a, p) => a + propMarketValue(p, state), 0);

  const clusterLabel =
    owned.length === 0
      ? null
      : owned.length < 2
        ? "Fodfäste"
        : owned.length < 3
          ? "Närvaro"
          : "Dominans";

  const hasMarket = listings.length + freeLots.length + ownedLots.length > 0;

  return (
    <div
      style={{
        margin: "16px 12px 0",
        background: "#fff",
        border: `2px solid ${BURGUNDY}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: BURGUNDY,
          color: "#fff",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            {dist.name}
            {clusterLabel && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  background: "rgba(255,255,255,0.25)",
                  padding: "2px 8px",
                  borderRadius: 10,
                }}
              >
                {clusterLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>
            {Math.round(dist.base / 1000)} kr/m² · Tillväxt ×{dist.growth} · Efterfrågan{" "}
            {pct(dist.demand)} · Prestige {dist.prestige.toFixed(1)}
          </div>
          {owned.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
              Portfölj: {msek(totalVal)} · NOI {kr(totalNOI)}/mån
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.2)",
            border: "none",
            color: "#fff",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          ✕
        </button>
      </div>

      {/* Två kolumner: portfölj | marknad */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* Vänster: ägda fastigheter */}
        <div style={{ padding: 16, borderRight: "1px solid #eee" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: BURGUNDY }}>
            Din portfölj ({owned.length})
          </div>
          {owned.length === 0 ? (
            <div style={{ color: "#aaa", fontSize: 13 }}>Inga fastigheter här än.</div>
          ) : (
            owned.map((p) => {
              const val = propMarketValue(p, state);
              const noi = propNOI(p, state) / 12;
              return (
                <div
                  key={p.id}
                  style={{ paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #f3f3f3" }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, color: "#222" }}>
                    {p.typeLabel} · {p.area} m²
                  </div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                    Värde: {msek(val)}
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 12 }}
                  >
                    <span style={{ color: noi >= 0 ? "#27660a" : "#c0392b" }}>
                      NOI: {kr(noi)}/mån
                    </span>
                    <span style={{ color: "#888" }}>
                      {p.status === "bygger"
                        ? `⏳ ${p.buildLeft} mån`
                        : p.tenants.length > 0
                          ? `✓ ${p.tenants.length}/${p.capacity} uthyrd`
                          : "⚠ Vakant"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Höger: marknad (listings + tomter + byggnation) */}
        <div style={{ padding: 16 }}>
          {/* Till salu */}
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#3878a8" }}>
            Till salu ({listings.length})
          </div>
          {listings.length === 0 ? (
            <div style={{ color: "#aaa", fontSize: 13, marginBottom: 12 }}>
              Inga objekt just nu.
            </div>
          ) : (
            listings.map((p) => {
              const down = p.askPrice * (1 - terms.maxLtv);
              const canBuy = state.cash >= down && !state.gameOver;
              return (
                <div
                  key={p.id}
                  style={{
                    paddingBottom: 10,
                    marginBottom: 10,
                    borderBottom: "1px solid #f3f3f3",
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#222" }}>
                    {p.typeLabel} · {p.area} m²
                  </div>
                  <div style={{ color: "#555", marginTop: 2 }}>
                    {msek(p.askPrice)} · HDP {msek(down)}
                  </div>
                  <button
                    onClick={() => dispatch({ type: "BUY", id: p.id })}
                    disabled={!canBuy}
                    style={{
                      marginTop: 5,
                      padding: "4px 12px",
                      borderRadius: 6,
                      border: "none",
                      background: canBuy ? BURGUNDY : "#ccc",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: canBuy ? "pointer" : "default",
                    }}
                  >
                    {canBuy ? "Köp" : "För lite kassa"}
                  </button>
                </div>
              );
            })
          )}

          {/* Lediga tomter */}
          {freeLots.length > 0 && (
            <>
              <div
                style={{ fontWeight: 700, fontSize: 13, marginTop: 6, marginBottom: 10, color: "#408040" }}
              >
                Tomter ({freeLots.length})
              </div>
              {freeLots.map((lot) => {
                const canBuy = state.cash >= lot.price && !state.gameOver;
                return (
                  <div
                    key={lot.id}
                    style={{
                      paddingBottom: 10,
                      marginBottom: 10,
                      borderBottom: "1px solid #f3f3f3",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "#222" }}>{lot.area} m² tomt</div>
                    <div style={{ color: "#555", marginTop: 2 }}>{msek(lot.price)}</div>
                    <button
                      onClick={() => dispatch({ type: "BUY_LOT", id: lot.id })}
                      disabled={!canBuy}
                      style={{
                        marginTop: 5,
                        padding: "4px 12px",
                        borderRadius: 6,
                        border: "none",
                        background: canBuy ? "#408040" : "#ccc",
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: canBuy ? "pointer" : "default",
                      }}
                    >
                      {canBuy ? "Köp tomt" : "För lite kassa"}
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* Bygg på ägd tomt */}
          {ownedLots.length > 0 && (
            <>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  marginTop: 6,
                  marginBottom: 10,
                  color: "#2a7a3c",
                }}
              >
                Bygg på din tomt
              </div>
              {ownedLots.map((lot) => {
                const t = PROP_TYPES[buildType];
                const cost = lot.area * t.buildCostM2;
                const down = cost * (1 - terms.maxLtv);
                const canBuild = state.cash >= down && !state.gameOver;
                return (
                  <div
                    key={lot.id}
                    style={{
                      paddingBottom: 10,
                      marginBottom: 10,
                      borderBottom: "1px solid #f3f3f3",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "#222" }}>Din tomt · {lot.area} m²</div>
                    <select
                      value={buildType}
                      onChange={(e) => setBuildType(e.target.value as PropTypeKey)}
                      style={{
                        marginTop: 6,
                        width: "100%",
                        padding: "5px 8px",
                        borderRadius: 6,
                        border: "1px solid #ddd",
                        fontSize: 12,
                      }}
                    >
                      {PROP_TYPE_KEYS.map((k) => {
                        const v = PROP_TYPES[k];
                        return (
                          <option key={k} value={k}>
                            {v.label} – {msek(lot.area * v.buildCostM2)} ({v.buildMonths} mån)
                          </option>
                        );
                      })}
                    </select>
                    <div style={{ color: "#666", marginTop: 4 }}>Handpenning: {msek(down)}</div>
                    <button
                      onClick={() => dispatch({ type: "BUILD", id: lot.id, propType: buildType })}
                      disabled={!canBuild}
                      style={{
                        marginTop: 5,
                        padding: "5px 0",
                        borderRadius: 6,
                        border: "none",
                        background: canBuild ? BURGUNDY : "#ccc",
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: canBuild ? "pointer" : "default",
                        width: "100%",
                      }}
                    >
                      {canBuild ? `Bygg ${t.label}` : "För lite kassa"}
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {!hasMarket && (
            <div style={{ color: "#aaa", fontSize: 13, marginTop: 8 }}>
              Inget på marknaden just nu.
              <br />
              Prova ↻ Nya objekt i marknadsfliken.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
