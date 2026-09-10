import { PARCELS, parcelById } from "../engine/city";
import { unlockedDistrictsFor } from "../engine/story";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";

export function focusProperty(parcelId: string) {
  const ui = useUiStore.getState();
  ui.setOverlay("ingen");
  ui.select(parcelId);
  ui.requestFocus(parcelId, 125);
  ui.requestOpen("map");
}

/** These controls change the view only; lighting never advances the game clock. */
export function NeighborhoodControls() {
  const mode = useUiStore(s => s.lightMode);
  const setMode = useUiStore(s => s.setLightMode);
  const explore = () => {
    const s = useGameStore.getState().state;
    const unlocked = unlockedDistrictsFor(s);
    const choices = [...s.portfolio, ...s.listings].flatMap(p => {
      const parcel = p.parcelId ? parcelById(p.parcelId) : null;
      return parcel && (!unlocked || unlocked.has(parcel.district)) ? [parcel] : [];
    });
    const parcel = choices.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]
      ?? PARCELS.find(p => !p.expansion && (!unlocked || unlocked.has(p.district)));
    if (parcel) focusProperty(parcel.id);
  };
  return <div className="neighborhood-controls" aria-label="City view">
    <button type="button" onClick={explore} title="Visit a street and see its properties up close">Explore block</button>
    <label>
      <span className="neighborhood-light-label">Light</span>
      <select aria-label="City lighting" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
        <option value="morning">Morning</option><option value="day">Daylight</option><option value="evening">Evening</option>
      </select>
    </label>
  </div>;
}

export function ShowOnMap({ parcelId }: { parcelId?: string }) {
  if (!parcelId) return null;
  return <button type="button" className="show-on-map" onClick={e => { e.stopPropagation(); focusProperty(parcelId); }}>Show on map</button>;
}
