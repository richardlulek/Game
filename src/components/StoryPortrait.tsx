/* Karaktärsporträtt för berättelselägets brev – handritade SVG:er i
   sepiatonat "gammalt fotografi"-utförande med mässingsoval, i samma
   lågmälda stil som resten av spelets UI. Ingen bilddata behövs. */

import type { PortraitId } from "../engine/types";
import { C } from "../styles/tokens";

/** Namnskylt under respektive porträtt. */
const PORTRAIT_NAMES: Record<PortraitId, string> = {
  morfar: "Grandpa Gordon",
  ekelof: "Atty. Oakley",
  rogge: "Rog Flint",
  gosta: "Gus",
  ulla: "Ruth, Oak Savings Bank",
};

const SEPIA_BG = "#e4d3b0";

/* Hudton och linjefärg hålls gemensamma så galleriet känns enhetligt. */
const SKIN = "#d9b28c";
const SKIN_SHADE = "#c69e78";
const INK = "#4a3b28";

function Frame({ uid, children }: { uid: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 80 96" width="100%" height="100%" style={{ display: "block" }}>
      {/* Mässingsoval med sepiabotten */}
      <ellipse cx={40} cy={44} rx={37} ry={42} fill={SEPIA_BG} stroke={C.brass} strokeWidth={2.5} />
      <defs>
        <radialGradient id={`vignette-${uid}`} cx="50%" cy="42%" r="65%">
          <stop offset="62%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(74,59,40,0.28)" />
        </radialGradient>
        <clipPath id={`oval-${uid}`}>
          <ellipse cx={40} cy={44} rx={35.6} ry={40.6} />
        </clipPath>
      </defs>
      <g clipPath={`url(#oval-${uid})`}>{children}</g>
      <ellipse cx={40} cy={44} rx={35.6} ry={40.6} fill={`url(#vignette-${uid})`} />
      <ellipse cx={40} cy={44} rx={37} ry={42} fill="none" stroke={C.brass} strokeWidth={2.5} />
    </svg>
  );
}

/** Morfar Gunnar: keps, kraftig grå mustasch och kofta. */
function Morfar() {
  return (
    <>
      {/* Kofta */}
      <path d="M12 96 Q14 66 40 64 Q66 66 68 96 Z" fill="#7a6248" />
      <path d="M34 66 L40 96 L46 66 Q40 70 34 66 Z" fill="#e8dfc8" />
      {/* Hals + ansikte */}
      <rect x={34} y={52} width={12} height={14} fill={SKIN_SHADE} />
      <ellipse cx={40} cy={42} rx={15} ry={17} fill={SKIN} />
      {/* Öron */}
      <ellipse cx={25} cy={44} rx={3} ry={4.5} fill={SKIN_SHADE} />
      <ellipse cx={55} cy={44} rx={3} ry={4.5} fill={SKIN_SHADE} />
      {/* Keps */}
      <path d="M24 33 Q26 18 40 18 Q54 18 56 33 Q40 28 24 33 Z" fill="#5d6a55" />
      <path d="M22 33 Q40 27 58 33 L60 36 Q40 31 20 36 Z" fill="#4c5745" />
      {/* Ögon + rynkor */}
      <circle cx={33.5} cy={41} r={1.7} fill={INK} />
      <circle cx={46.5} cy={41} r={1.7} fill={INK} />
      <path d="M29 37 Q33 35 37 37" stroke={INK} strokeWidth={1.1} fill="none" />
      <path d="M43 37 Q47 35 51 37" stroke={INK} strokeWidth={1.1} fill="none" />
      <path d="M28 46 Q30 47 32 46" stroke={SKIN_SHADE} strokeWidth={1} fill="none" />
      <path d="M48 46 Q50 47 52 46" stroke={SKIN_SHADE} strokeWidth={1} fill="none" />
      {/* Näsa + stor grå mustasch */}
      <path d="M40 42 Q42 47 40 49" stroke={SKIN_SHADE} strokeWidth={1.4} fill="none" />
      <path d="M28 52 Q40 46 52 52 Q46 57 40 54 Q34 57 28 52 Z" fill="#b8b2a4" />
      {/* Antytt leende under mustaschen */}
      <path d="M35 58 Q40 60 45 58" stroke={INK} strokeWidth={1.2} fill="none" />
    </>
  );
}

/** Advokat Ekelöf: stram mittbena, pincené och hög krage. */
function Ekelof() {
  return (
    <>
      {/* Kavaj + hög krage */}
      <path d="M14 96 Q16 68 40 66 Q64 68 66 96 Z" fill="#3c3a45" />
      <path d="M33 67 L40 96 L47 67 Q40 72 33 67 Z" fill="#efe9dc" />
      <path d="M37 70 L40 78 L43 70 Z" fill="#6e1a2a" />
      {/* Hals + smalt ansikte */}
      <rect x={35} y={52} width={10} height={15} fill={SKIN_SHADE} />
      <ellipse cx={40} cy={41} rx={13} ry={17} fill={SKIN} />
      {/* Stram mittbena */}
      <path d="M27 34 Q28 22 40 21 Q52 22 53 34 L53 30 Q40 24 40 34 Q40 24 27 30 Z" fill="#3a3230" />
      <path d="M27 34 Q27 26 40 23 Q53 26 53 34 Q52 27 40 26 Q28 27 27 34 Z" fill="#3a3230" />
      {/* Pincené på nästippen */}
      <circle cx={34} cy={42} r={4.4} fill="none" stroke={INK} strokeWidth={1.2} />
      <circle cx={46} cy={42} r={4.4} fill="none" stroke={INK} strokeWidth={1.2} />
      <path d="M38.4 42 L41.6 42" stroke={INK} strokeWidth={1.2} />
      <path d="M50.4 42 Q54 40 55 36" stroke={INK} strokeWidth={0.9} fill="none" />
      {/* Ögon bakom glasen */}
      <circle cx={34} cy={42} r={1.4} fill={INK} />
      <circle cx={46} cy={42} r={1.4} fill={INK} />
      {/* Smala ögonbryn + prydlig min */}
      <path d="M30 36.5 L38 36.5" stroke={INK} strokeWidth={1.1} />
      <path d="M42 36.5 L50 36.5" stroke={INK} strokeWidth={1.1} />
      <path d="M40 44 Q41 48 40 50" stroke={SKIN_SHADE} strokeWidth={1.2} fill="none" />
      <path d="M36 55 L44 55" stroke={INK} strokeWidth={1.3} />
    </>
  );
}

/** Rogge Flyt: bakåtslickat, solglasögon och för vit kavaj. */
function Rogge() {
  return (
    <>
      {/* Vit kavaj, uppknäppt skjorta + guldkedja */}
      <path d="M12 96 Q14 66 40 64 Q66 66 68 96 Z" fill="#f2f3f5" />
      <path d="M32 66 L40 96 L48 66 Q40 74 32 66 Z" fill="#cfa46e" />
      <path d="M35 70 Q40 78 45 70" stroke="#d4af37" strokeWidth={1.6} fill="none" />
      {/* Hals + bred haka */}
      <rect x={34} y={52} width={12} height={14} fill={SKIN_SHADE} />
      <path d="M26 40 Q26 24 40 24 Q54 24 54 40 Q54 56 40 58 Q26 56 26 40 Z" fill="#cf9e6f" />
      {/* Bakåtslickat hår med glans */}
      <path d="M25 36 Q25 19 40 19 Q55 19 55 36 Q54 24 40 23 Q26 24 25 36 Z" fill="#2e2620" />
      <path d="M30 22 Q40 19 50 22" stroke="#59493c" strokeWidth={1.4} fill="none" />
      {/* Solglasögon */}
      <rect x={28} y={37} width={10.5} height={7.5} rx={2.5} fill="#15181d" />
      <rect x={41.5} y={37} width={10.5} height={7.5} rx={2.5} fill="#15181d" />
      <path d="M38.5 40 L41.5 40" stroke="#15181d" strokeWidth={1.6} />
      <path d="M30 39 L34 39" stroke="#5a6672" strokeWidth={1} />
      {/* Näsa + brett säljarleende */}
      <path d="M40 44 Q42 48 40 50" stroke="#b9895c" strokeWidth={1.3} fill="none" />
      <path d="M32 53 Q40 59 48 53 Q44 56 40 56 Q36 56 32 53 Z" fill="#fffdf5" stroke="#8a5f3c" strokeWidth={0.8} />
    </>
  );
}

/** Gösta: stickad mössa, skäggstubb och termosfärgad halsduk. */
function Gosta() {
  return (
    <>
      {/* Ulltröja + halsduk i termosorange */}
      <path d="M13 96 Q15 68 40 66 Q65 68 67 96 Z" fill="#5d5a4e" />
      <path d="M28 64 Q40 60 52 64 L52 72 Q40 67 28 72 Z" fill="#c56a2b" />
      <rect x={44} y={68} width={7} height={16} rx={3} fill="#c56a2b" />
      {/* Hals + runt vänligt ansikte */}
      <rect x={34} y={52} width={12} height={13} fill={SKIN_SHADE} />
      <ellipse cx={40} cy={42} rx={15} ry={16} fill={SKIN} />
      {/* Skäggstubb */}
      <path d="M27 46 Q28 57 40 58 Q52 57 53 46 Q52 54 40 55 Q28 54 27 46 Z" fill="#9d8d76" opacity={0.75} />
      {/* Stickad mössa med kant */}
      <path d="M25 32 Q26 17 40 17 Q54 17 55 32 Z" fill="#7a4b3a" />
      <rect x={24} y={30} width={32} height={6} rx={3} fill="#8f5a45" />
      <circle cx={40} cy={15} r={3} fill="#8f5a45" />
      {/* Snälla trötta ögon */}
      <path d="M30 41 Q33.5 39 37 41" stroke={INK} strokeWidth={1.6} fill="none" />
      <path d="M43 41 Q46.5 39 50 41" stroke={INK} strokeWidth={1.6} fill="none" />
      <path d="M29 38 Q33 36.5 37 38" stroke={INK} strokeWidth={1} fill="none" />
      <path d="M43 38 Q47 36.5 51 38" stroke={INK} strokeWidth={1} fill="none" />
      {/* Stor näsa + lugnt leende */}
      <path d="M40 41 Q43 47 40 49" stroke={SKIN_SHADE} strokeWidth={1.5} fill="none" />
      <path d="M34 52 Q40 55 46 52" stroke={INK} strokeWidth={1.3} fill="none" />
    </>
  );
}

/** Ulla på Sparbanken Eken: knut, glasögonkedja och kavajbrosch. */
function Ulla() {
  return (
    <>
      {/* Dräktkavaj med brosch */}
      <path d="M13 96 Q15 68 40 66 Q65 68 67 96 Z" fill="#5a4a63" />
      <path d="M34 67 L40 96 L46 67 Q40 71 34 67 Z" fill="#efe6d4" />
      <circle cx={31} cy={74} r={2.4} fill={C.brass} />
      {/* Hals + ansikte */}
      <rect x={35} y={52} width={10} height={15} fill={SKIN_SHADE} />
      <ellipse cx={40} cy={41} rx={13.5} ry={16} fill={SKIN} />
      {/* Hårknut */}
      <path d="M26 38 Q26 22 40 21 Q54 22 54 38 Q53 27 40 26 Q27 27 26 38 Z" fill="#8c8478" />
      <circle cx={40} cy={17} r={5.5} fill="#8c8478" />
      {/* Glasögon med kedja */}
      <rect x={29} y={38.5} width={9.4} height={6.6} rx={3} fill="none" stroke={INK} strokeWidth={1.2} />
      <rect x={41.6} y={38.5} width={9.4} height={6.6} rx={3} fill="none" stroke={INK} strokeWidth={1.2} />
      <path d="M38.4 41.5 L41.6 41.5" stroke={INK} strokeWidth={1.2} />
      <path d="M29 42 Q24 47 25 54" stroke={C.brass} strokeWidth={0.9} fill="none" />
      <path d="M51 42 Q56 47 55 54" stroke={C.brass} strokeWidth={0.9} fill="none" />
      {/* Ögon + vänligt bestämd min */}
      <circle cx={33.7} cy={41.7} r={1.4} fill={INK} />
      <circle cx={46.3} cy={41.7} r={1.4} fill={INK} />
      <path d="M30 36 Q34 34.5 38 36" stroke={INK} strokeWidth={1} fill="none" />
      <path d="M42 36 Q46 34.5 50 36" stroke={INK} strokeWidth={1} fill="none" />
      <path d="M40 44 Q41 47 40 49" stroke={SKIN_SHADE} strokeWidth={1.2} fill="none" />
      <path d="M35 53.5 Q40 56 45 53.5" stroke={INK} strokeWidth={1.2} fill="none" />
      {/* Diskreta örhängen */}
      <circle cx={27} cy={45} r={1.2} fill={C.brass} />
      <circle cx={53} cy={45} r={1.2} fill={C.brass} />
    </>
  );
}

const FACES: Record<PortraitId, () => React.ReactNode> = {
  morfar: Morfar,
  ekelof: Ekelof,
  rogge: Rogge,
  gosta: Gosta,
  ulla: Ulla,
};

/** Porträtt i oval mässingsram med namnskylt under. */
export function StoryPortrait({ id, size = 72 }: { id: PortraitId; size?: number }) {
  const Face = FACES[id];
  if (!Face) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
      <div style={{ width: size, height: Math.round(size * (86 / 72)) }}>
        <Frame uid={id}>
          <Face />
        </Frame>
      </div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: "#8a7c5e",
          whiteSpace: "nowrap",
        }}
      >
        {PORTRAIT_NAMES[id]}
      </div>
    </div>
  );
}
