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
  const selected = useUiStore(s => s.selectedParcelId);
  const inspection = useUiStore(s => s.inspection);
  const inspect = useUiStore(s => s.inspect);
  const knownProperty = useGameStore(s => [...s.state.portfolio, ...s.state.listings, ...s.state.competitors.flatMap(c => c.portfolio)].find(p => p.parcelId === selected));
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
    {selected && knownProperty && !knownProperty.signature && !knownProperty.storyTag && <div className="property-view-controls" role="group" aria-label="Property inspection">
      {!inspection ? <button type="button" onClick={() => inspect(selected, "building")}>Inspect property</button> : <>
        <button type="button" aria-label="Rotate property view left" onClick={() => inspect(selected, inspection.view, inspection.turn - 1)}>↶</button>
        <select aria-label="Property viewpoint" value={inspection.view} onChange={e => inspect(selected, e.target.value as typeof inspection.view)}>
          <option value="building">Building</option><option value="entrance">Entrance</option><option value="yard">Courtyard</option>
        </select>
        <button type="button" aria-label="Rotate property view right" onClick={() => inspect(selected, inspection.view, inspection.turn + 1)}>↷</button>
        <button type="button" onClick={() => useUiStore.getState().requestFocus(selected, 230)}>Overview</button>
      </>}
    </div>}
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
