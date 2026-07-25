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

import { SIGNET_TL_PATH, WORDMARK_DESCRIPTOR_PATH, WORDMARK_TITLE_PATH } from "./brandPaths";

const GOLD = "#d6b25e";
const CREAM = "#f3ede0";

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
      <path d={SIGNET_TL_PATH} fill={primary} />
    </svg>
  );
}

/** Koncept 6 – horisontell ordbild: serif-titel, guld-skyline-linje och
 *  en spärrad descriptor. Texten är KONTURSATT (paths, se brandPaths.ts) så
 *  loggan ser identisk ut på alla maskiner. Skala via width i `style`. */
export function Wordmark({
  primary = CREAM,
  accent = GOLD,
  showDescriptor = true,
  style,
  className,
}: MarkProps & { showDescriptor?: boolean }) {
  return (
    <svg
      viewBox="0 0 620 160"
      role="img"
      aria-label="The Landlord"
      className={className}
      style={style}
    >
      <path d={WORDMARK_TITLE_PATH} fill={primary} />
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
      {showDescriptor && <path d={WORDMARK_DESCRIPTOR_PATH} fill={accent} />}
    </svg>
  );
}
