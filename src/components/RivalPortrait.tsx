/* Procedurella rivalporträtt – frontfigurerna för konkurrentbolagen.
   Ritas ur personans look-data (hatt, monokel, mustasch, färger) i en
   mässingsoval som matchar berättelselägets porträtt. */

import { useId } from "react";
import { personaFor } from "../engine/rivalPersonas";

export function RivalPortrait({ company, size = 40 }: { company: string; size?: number }) {
  const uid = useId().replace(/[:]/g, "");
  const p = personaFor(company);
  if (!p) return null;
  const { hat, glasses, mustache, hair, skin, suit } = p.look;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0 }} aria-label={p.person}>
      <defs>
        <clipPath id={`c${uid}`}><circle cx="24" cy="24" r="21" /></clipPath>
      </defs>
      <circle cx="24" cy="24" r="22.5" fill="#1c242e" stroke="#c9a45c" strokeWidth="2" />
      <g clipPath={`url(#c${uid})`}>
        {/* Kavaj */}
        <path d="M8 48 Q24 34 40 48 Z" fill={suit} />
        <path d="M21 38 L24 44 L27 38 Z" fill="#f2ead8" />
        {/* Huvud */}
        <ellipse cx="24" cy="22" rx="9.5" ry="11" fill={skin} />
        {/* Hår */}
        {!hat && <path d="M14 20 Q14 10 24 10 Q34 10 34 20 L34 17 Q34 12 24 12 Q14 12 14 17 Z" fill={hair} />}
        {!hat && <path d="M14.5 21 Q13.5 13 24 11.5 Q34.5 13 33.5 21 Q33 14 24 13.5 Q15 14 14.5 21 Z" fill={hair} />}
        {/* Hatt */}
        {hat && (
          <g>
            <rect x="13" y="8" width="22" height="7" rx="2" fill="#2a2620" />
            <rect x="10" y="14" width="28" height="2.6" rx="1.3" fill="#2a2620" />
            <rect x="13" y="12" width="22" height="2.4" fill="#6e1a2a" />
          </g>
        )}
        {/* Ögon */}
        <circle cx="20.4" cy="21.5" r="1.15" fill="#2a2a2a" />
        <circle cx="27.6" cy="21.5" r="1.15" fill="#2a2a2a" />
        {/* Glasögon */}
        {glasses && (
          <g stroke="#4a4438" strokeWidth="1.1" fill="none">
            <circle cx="20.4" cy="21.5" r="3.1" />
            <circle cx="27.6" cy="21.5" r="3.1" />
            <line x1="23.5" y1="21.5" x2="24.5" y2="21.5" />
          </g>
        )}
        {/* Mustasch */}
        {mustache && <path d="M20 26.5 Q24 24.6 28 26.5 Q24 29 20 26.5 Z" fill={hair} />}
        {/* Mun */}
        {!mustache && <path d="M21 27.5 Q24 29.2 27 27.5" stroke="#9c6a4a" strokeWidth="1.1" fill="none" strokeLinecap="round" />}
      </g>
    </svg>
  );
}
