/* ============================================================
   BuildingArt – procedurell SVG-illustration av en fastighet.
   Ren grafik, inga beroenden. Speglar:
     • typ      → byggnadens form (bostad/kontor/butik/industri)
     • skick    → smuts/slitage (grå overlay)
     • uthyrning→ tända fönster (occupancy)
     • bygger   → byggarbetsplats med kran
   ============================================================ */

import { seasonOf } from "../engine/season";
import type { Property, PropTypeKey } from "../engine/types";

interface Props {
  p: Property;
  month?: number;
  /** Fyll containern och beskär mot botten (för breda banners) i stället för
      att skala med bredden. Håller byggnaden synlig utan tom himmel. */
  cover?: boolean;
}

const SKY: Record<PropTypeKey, [string, string]> = {
  bostad:   ["#cfe8f5", "#eef8fc"],
  kontor:   ["#cadcef", "#eef5fb"],
  butik:    ["#fde6cf", "#f4f7fb"],
  industri: ["#e2e8ee", "#f3f7fa"],
};

const WALL: Record<PropTypeKey, { light: string; dark: string; roof: string }> = {
  bostad:   { light: "#e8cca3", dark: "#d3ac7b", roof: "#8a4b3a" },
  kontor:   { light: "#b0c1d2", dark: "#8da2b7", roof: "#62788c" },
  butik:    { light: "#ebcf9c", dark: "#d6b274", roof: "#b1532f" },
  industri: { light: "#c4baaa", dark: "#a89e8c", roof: "#7a7160" },
};

const LIT = "#ffd06b";
const DARK_GLASS: Record<PropTypeKey, string> = {
  bostad: "#46586a",
  kontor: "#3f5d7e",
  butik: "#4a5a68",
  industri: "#3e4a56",
};

const GY = 92; // marknivå

// Rutnät av fönster, tända först (occupancy)
function windowGrid(
  x: number, y: number, w: number, h: number,
  cols: number, rows: number, litCount: number, dark: string,
  gap = 3.5, rx = 1.2,
) {
  const ww = (w - gap * (cols + 1)) / cols;
  const wh = (h - gap * (rows + 1)) / rows;
  const out: JSX.Element[] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = idx < litCount;
      out.push(
        <rect
          key={idx}
          x={x + gap + c * (ww + gap)}
          y={y + gap + r * (wh + gap)}
          width={ww}
          height={wh}
          rx={rx}
          fill={lit ? LIT : dark}
          opacity={lit ? 0.95 : 0.82}
        />,
      );
      idx++;
    }
  }
  return out;
}

export function BuildingArt({ p, month, cover }: Props) {
  const gid = `sky-${p.id}`;
  const winter = month !== undefined && seasonOf(month) === "vinter";
  const sky = winter ? (["#c2d2e0", "#e6eef5"] as [string, string]) : SKY[p.type];
  const wall = WALL[p.type];
  const dark = DARK_GLASS[p.type];
  const occ = p.capacity > 0 ? p.tenants.length / p.capacity : 0;
  const grime = Math.max(0, (100 - p.condition) / 100); // 0 fint … 1 slitet
  const building = p.status === "bygger"
    ? <Construction wall={wall} />
    : <Finished type={p.type} wall={wall} dark={dark} occ={occ} grime={grime} id={p.id} winter={winter} />;

  return (
    <svg
      viewBox="0 0 160 100"
      style={cover
        ? { display: "block", width: "100%", height: "100%" }
        : { display: "block", width: "100%", height: "auto" }}
      preserveAspectRatio={cover ? "xMidYMax slice" : "xMidYMid meet"}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky[0]} />
          <stop offset="100%" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      {/* Himmel */}
      <rect width="160" height="100" fill={`url(#${gid})`} />
      {/* Sol/måne */}
      <circle cx="132" cy="22" r="11" fill="#fff" opacity={winter ? 0.4 : 0.55} />
      {building}
      {/* Mark */}
      <rect x="0" y={GY} width="160" height={100 - GY} fill={winter ? "#e9eef2" : "#c9c0b2"} />
      <rect x="0" y={GY} width="160" height="2.5" fill={winter ? "#d2dae0" : "#b3a896"} />
    </svg>
  );
}

// ── Färdig byggnad per typ ──────────────────────────────────────

function Finished({
  type, wall, dark, occ, grime, id, winter,
}: {
  type: PropTypeKey;
  wall: { light: string; dark: string; roof: string };
  dark: string;
  occ: number;
  grime: number;
  id: number;
  winter: boolean;
}) {
  const lit = (n: number) => Math.round(occ * n);
  const snow = (x: number, y: number, w: number, h = 3) =>
    winter ? <rect x={x} y={y} width={w} height={h} rx={1.5} fill="#fbfdff" opacity="0.95" /> : null;

  if (type === "bostad") {
    const cols = 4, rows = 3, total = cols * rows;
    return (
      <g>
        {/* Kropp */}
        <rect x="36" y="34" width="88" height={GY - 34} fill={wall.light} />
        <rect x="112" y="34" width="12" height={GY - 34} fill={wall.dark} opacity="0.55" />
        {/* Tak */}
        <rect x="32" y="28" width="96" height="8" rx="1.5" fill={wall.roof} />
        {snow(31, 26, 98)}
        {/* Slitage */}
        <Grime x={36} y={28} w={88} h={GY - 28} amount={grime} />
        {/* Fönster */}
        {windowGrid(44, 40, 72, 36, cols, rows, lit(total), dark)}
        {/* Dörr */}
        <rect x="74" y={GY - 14} width="12" height="14" rx="1.5" fill={wall.roof} />
      </g>
    );
  }

  if (type === "kontor") {
    const cols = 3, rows = 6, total = cols * rows;
    return (
      <g>
        <rect x="54" y="16" width="52" height={GY - 16} fill={wall.light} />
        <rect x="96" y="16" width="10" height={GY - 16} fill={wall.dark} opacity="0.5" />
        <rect x="52" y="12" width="56" height="6" rx="1.5" fill={wall.roof} />
        {snow(52, 10, 56, 2.5)}
        {/* Antenn */}
        <line x1="80" y1="12" x2="80" y2="3" stroke="#888" strokeWidth="1.4" />
        <circle cx="80" cy="3" r="1.6" fill="#c0392b" />
        <Grime x={54} y={16} w={52} h={GY - 16} amount={grime} />
        {windowGrid(60, 20, 40, 64, cols, rows, lit(total), dark, 3, 0.8)}
        {/* Entré */}
        <rect x="72" y={GY - 12} width="16" height="12" fill={dark} opacity="0.9" />
      </g>
    );
  }

  if (type === "butik") {
    // Tända: skyltfönster (3) först, sedan övre fönster (4)
    const total = 7;
    const l = lit(total);
    const storeLit = Math.min(3, l);
    const upperLit = Math.max(0, l - 3);
    return (
      <g>
        <rect x="28" y="46" width="104" height={GY - 46} fill={wall.light} />
        <rect x="24" y="40" width="112" height="7" rx="1.5" fill={wall.roof} />
        {snow(24, 38, 112)}
        {/* Skyltband */}
        <rect x="28" y="47" width="104" height="9" fill={wall.dark} opacity="0.6" />
        <Grime x={28} y={40} w={104} h={GY - 40} amount={grime} />
        {/* Övre fönster */}
        {windowGrid(34, 58, 92, 12, 4, 1, upperLit, dark)}
        {/* Markis (randig) */}
        <g>
          {Array.from({ length: 7 }).map((_, i) => (
            <rect key={i} x={32 + i * 14} y="71" width="7" height="6" fill={i % 2 ? "#c0392b" : "#f0e6d8"} />
          ))}
          <rect x="32" y="76.5" width="96" height="1.5" fill={wall.roof} />
        </g>
        {/* Skyltfönster */}
        {windowGrid(36, 79, 64, GY - 79 - 1, 3, 1, storeLit, dark, 3, 1)}
        {/* Dörr */}
        <rect x="106" y="79" width="18" height={GY - 79} fill={dark} opacity="0.9" />
      </g>
    );
  }

  // industri
  const total = 6;
  return (
    <g>
      <rect x="22" y="48" width="116" height={GY - 48} fill={wall.light} />
      {/* Sågtandstak */}
      {Array.from({ length: 4 }).map((_, i) => {
        const x = 22 + i * 29;
        return (
          <g key={i}>
            <polygon points={`${x},48 ${x + 14},38 ${x + 29},48`} fill={wall.dark} />
            <polygon points={`${x + 14},38 ${x + 29},48 ${x + 29},44 ${x + 14},34`} fill={dark} opacity="0.7" />
            {winter && <polygon points={`${x},48 ${x + 14},38 ${x + 16},40 ${x + 3},48`} fill="#fbfdff" opacity="0.9" />}
          </g>
        );
      })}
      <Grime x={22} y={38} w={116} h={GY - 38} amount={grime} />
      {/* Skorsten + rök */}
      <rect x="123" y="34" width="6" height="14" fill={wall.dark} />
      <Smoke x={126} />
      {/* Höga fönster */}
      {windowGrid(30, 52, 100, 12, 6, 1, Math.round(occ * total), dark)}
      {/* Portar */}
      <rect x="40" y={GY - 22} width="28" height="22" fill={wall.dark} />
      {Array.from({ length: 4 }).map((_, i) => (
        <line key={i} x1="40" y1={GY - 18 + i * 5} x2="68" y2={GY - 18 + i * 5} stroke={wall.roof} strokeWidth="1" opacity="0.5" />
      ))}
      <rect x="86" y={GY - 22} width="28" height="22" fill={wall.dark} />
    </g>
  );
}

// Animerad rök ur skorstenen (SMIL – inga beroenden).
function Smoke({ x }: { x: number }) {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x} cy="34" r="2" fill="#cfd4d9">
          <animate attributeName="cy" from="34" to="12" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
          <animate attributeName="r" from="1.5" to="4.5" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.5" to="0" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </g>
  );
}

// ── Byggarbetsplats ─────────────────────────────────────────────

function Construction({ wall }: { wall: { light: string; dark: string; roof: string } }) {
  return (
    <g>
      {/* Halvfärdig stomme */}
      <rect x="44" y="50" width="64" height={GY - 50} fill={wall.light} opacity="0.85" />
      {/* Pelarraster */}
      {Array.from({ length: 4 }).map((_, i) => (
        <line key={i} x1={44 + i * 21} y1="40" x2={44 + i * 21} y2={GY} stroke="#a89880" strokeWidth="2" />
      ))}
      {Array.from({ length: 3 }).map((_, i) => (
        <line key={`h${i}`} x1="44" y1={40 + i * 17} x2="108" y2={40 + i * 17} stroke="#a89880" strokeWidth="2" />
      ))}
      {/* Byggkran */}
      <line x1="118" y1={GY} x2="118" y2="20" stroke="#d99a20" strokeWidth="3" />
      <line x1="70" y1="24" x2="132" y2="24" stroke="#d99a20" strokeWidth="3" />
      <line x1="118" y1="20" x2="70" y2="24" stroke="#d99a20" strokeWidth="1.5" />
      <line x1="84" y1="24" x2="84" y2="40" stroke="#7a6a50" strokeWidth="1" />
      <rect x="80" y="40" width="8" height="6" fill="#c0392b" />
      {/* Skylt */}
      <rect x="50" y={GY - 12} width="14" height="12" fill="#d99a20" />
    </g>
  );
}

// ── Slitage-overlay ─────────────────────────────────────────────

function Grime({ x, y, w, h, amount }: { x: number; y: number; w: number; h: number; amount: number }) {
  if (amount < 0.05) return null;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill="#5b5347" opacity={amount * 0.4} />
      {amount > 0.55 && (
        <rect x={x} y={y + h * 0.55} width={w} height={h * 0.45} fill="#3e382e" opacity={(amount - 0.55) * 0.5} />
      )}
    </>
  );
}
