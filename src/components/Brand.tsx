/* ============================================================
   Varumärkes-marker för "The Landlord". Två återanvändbara
   vektor-loggor (skarpa i alla storlekar, ingen PNG):

     <Signet/>   – vapen-monogrammet "TL" (koncept 1). App-ikon.
     <Wordmark/> – serif-ordbild + guld-skyline + descriptor
                   (koncept 6). Butiks-header / titelskärm.

   Färgerna är props (primary/accent) så SAMMA konst tonas in på
   valfri yta – guld/gräddvit på burgundy i splashen, guld på den
   mörka titelskärmen osv. Defaulten är spelets guld-och-gräddvita
   identitet. Byt bara props, aldrig konsten. */

const GOLD = "#d6b25e";
const CREAM = "#f3ede0";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Inter', 'Segoe UI', system-ui, sans-serif";

interface MarkProps {
  /** Byggnader/bokstäver – huvudkonturen. Default gräddvit. */
  primary?: string;
  /** Guld-accenten (ram, skyline, descriptor). Default guld. */
  accent?: string;
  /** Extra style på <svg>. */
  style?: React.CSSProperties;
  className?: string;
}

/** Koncept 1 – vapen-monogram "TL" över en guld-skyline. Kvadratisk;
 *  sätt storlek via width/height i `style` eller `size`. */
export function Signet({
  primary = CREAM,
  accent = GOLD,
  size,
  style,
  className,
  title = "The Landlord",
}: MarkProps & { size?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
      style={style}
    >
      <rect x="26" y="26" width="188" height="188" rx="30" fill="none" stroke={accent} strokeWidth="5" />
      <rect x="40" y="40" width="160" height="160" rx="20" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5" />
      <g fill={accent}>
        <rect x="66" y="168" width="14" height="20" />
        <rect x="84" y="158" width="16" height="30" />
        <rect x="104" y="150" width="12" height="38" />
        <rect x="124" y="158" width="16" height="30" />
        <rect x="144" y="164" width="14" height="24" />
        <rect x="162" y="170" width="12" height="18" />
      </g>
      <text
        x="120"
        y="140"
        textAnchor="middle"
        fontFamily={SERIF}
        fontWeight={700}
        fontSize={120}
        fill={primary}
        letterSpacing={-6}
      >
        TL
      </text>
    </svg>
  );
}

/** Koncept 6 – horisontell ordbild: serif-titel, guld-skyline-linje och
 *  en spärrad descriptor. Skala via width i `style`. */
export function Wordmark({
  primary = CREAM,
  accent = GOLD,
  descriptor = "PROPERTY TYCOON",
  style,
  className,
}: MarkProps & { descriptor?: string | null }) {
  return (
    <svg
      viewBox="0 0 620 160"
      role="img"
      aria-label="The Landlord"
      className={className}
      style={style}
    >
      <text
        x="310"
        y="72"
        textAnchor="middle"
        fontFamily={SERIF}
        fontWeight={700}
        fontSize={58}
        fill={primary}
        letterSpacing={1}
      >
        THE LANDLORD
      </text>
      <g fill={accent}>
        <rect x="70" y="104" width="480" height="3" />
        <rect x="150" y="92" width="9" height="12" />
        <rect x="164" y="86" width="11" height="18" />
        <rect x="180" y="96" width="8" height="8" />
        <rect x="300" y="88" width="10" height="16" />
        <rect x="314" y="80" width="12" height="24" />
        <rect x="330" y="90" width="9" height="14" />
        <rect x="440" y="94" width="9" height="10" />
        <rect x="453" y="86" width="11" height="18" />
        <rect x="468" y="98" width="8" height="6" />
      </g>
      {descriptor && (
        <text
          x="310"
          y="132"
          textAnchor="middle"
          fontFamily={SANS}
          fontWeight={400}
          fontSize={15}
          fill={accent}
          letterSpacing={7}
        >
          {descriptor}
        </text>
      )}
    </svg>
  );
}
