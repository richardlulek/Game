import type { CSSProperties } from "react";
import { parcelById } from "../engine/city";
import { DISTRICTS } from "../engine/data";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { ListingCard } from "./ListingCard";
import { LotCard } from "./LotCard";
import { PortfolioCard } from "./PortfolioCard";

const P: Record<string, CSSProperties> = {
  hint: {
    background: "#fff",
    border: "1px dashed #ccc",
    borderRadius: 10,
    padding: 16,
    fontSize: 13,
    color: "#777",
    lineHeight: 1.5,
  },
  head: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#999",
    margin: "0 0 8px",
  },
  ambient: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 10,
    padding: 16,
    fontSize: 13,
    color: "#666",
  },
};

/** Visar detaljkort för den tomtruta som är vald på kartan. */
export function SelectionPanel() {
  const selectedId = useUiStore((s) => s.selectedParcelId);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);

  if (!selectedId) {
    return (
      <div style={P.hint}>
        <strong>Klicka på kartan</strong> för att välja en byggnad eller tomt.
        <br />
        <span style={{ color: "#b58a2a" }}>⬤</span> Till salu ·{" "}
        <span style={{ color: "#800020" }}>⬤</span> Ägd ·{" "}
        <span style={{ color: "#4d8b52" }}>⬤</span> Tomt
      </div>
    );
  }

  const parcel = parcelById(selectedId);
  const districtName = parcel
    ? (DISTRICTS.find((d) => d.id === parcel.district)?.name ?? parcel.district)
    : "";

  const owned = state.portfolio.find((p) => p.parcelId === selectedId);
  const listing = state.listings.find((p) => p.parcelId === selectedId);
  const lot = state.lots.find((l) => l.parcelId === selectedId);

  return (
    <div>
      <h3 style={P.head}>Valt objekt · {districtName}</h3>
      {owned && <PortfolioCard p={owned} state={state} dispatch={dispatch} />}
      {listing && <ListingCard p={listing} state={state} dispatch={dispatch} />}
      {lot && <LotCard lot={lot} state={state} dispatch={dispatch} />}
      {!owned && !listing && !lot && (
        <div style={P.ambient}>Den här marken ägs av andra aktörer och är inte till salu.</div>
      )}
    </div>
  );
}
