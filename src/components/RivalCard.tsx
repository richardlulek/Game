/* Delad rivalkort-komponent – en och samma frontfigur (porträtt + namn +
   bolag + personlighet) på alla ytor: rivalhubben, kartan, börsinsynen och
   nyhetsflödet. Ren presentation, ingen store-åtkomst. */

import type { ReactNode } from "react";
import { personaFor } from "../engine/rivalPersonas";
import { C, FONTS } from "../styles/tokens";
import { RivalPortrait } from "./RivalPortrait";

interface RivalCardProps {
  /** Konkurrentens bolagsnamn (matchar persona.company / competitor.name). */
  company: string;
  /**
   * "row"    – porträtt + namn/bolag/tagline + valfritt innehåll (rivalhubben).
   * "inline" – litet porträtt + namn på en rad (byline i nyheter/toasts).
   */
  variant?: "row" | "inline";
  /** Visa signaturrepliken under taglinen (endast "row"). */
  showSignature?: boolean;
  /** Ärver textfärg i stället för mörk bläckfärg (för mörka ytor). */
  inherit?: boolean;
  size?: number;
  children?: ReactNode;
}

export function RivalCard({
  company,
  variant = "row",
  showSignature = false,
  inherit = false,
  size,
  children,
}: RivalCardProps) {
  const p = personaFor(company);
  const nameColor = inherit ? "inherit" : C.ink;
  const subColor = inherit ? "inherit" : C.inkSoft;

  if (variant === "inline") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <RivalPortrait company={company} size={size ?? 26} />
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 12.5, color: nameColor, whiteSpace: "nowrap" }}>
            {p?.person ?? company}
          </span>
          <span style={{ fontSize: 10.5, color: subColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {company}
          </span>
        </span>
      </span>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <RivalPortrait company={company} size={size ?? 46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 15, color: nameColor }}>
            {p?.person ?? company}
          </span>
          <span style={{ fontSize: 11.5, color: subColor, fontWeight: 600 }}>{company}</span>
        </div>
        {p?.tagline && (
          <div style={{ fontSize: 11.5, color: subColor, marginTop: 1, lineHeight: 1.35 }}>{p.tagline}</div>
        )}
        {showSignature && p?.signature && (
          <div style={{ fontSize: 11.5, color: C.burgundy, fontStyle: "italic", marginTop: 3 }}>
            “{p.signature}”
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
