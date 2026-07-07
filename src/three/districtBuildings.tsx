/* ============================================================
   Distriktsarkitektur – varje distrikt har sin egen byggnadsfamilj:

   Centrum      slutna stenstadskvarter, 5–12 vån, full tomtyta,
                gårdsflyglar mot kvarterets insida
   Finans       glastorn 20–50 vån med avsatser, krona och antenn,
                höjdhierarki mot klustrets mitt
   Innerstad    funkis (puts, balkongband) och tegel (sadeltak),
                4–6 vån, butiksband i bottenplan mot gatan
   Förort       hela kvarter: 4–6 lamellhus kring en gård
   Villakullen  villor med sadeltak och skorsten
   Industri     hallar med monitortak, cisterner och skorstenar
   Hamnen       magasin med valmade tak längs kajen

   Allt är procedurellt: parcelHash ger deterministisk variation
   så att inget kvarter ser klonat ut.
   ============================================================ */

import { useEffect, useMemo } from "react";
import { Color, MeshStandardMaterial } from "three";
import { DISTRICT_ZONES, type Parcel } from "../engine/city";
import type { PropTypeKey } from "../engine/types";
import { FLOOR_HEIGHT, type PointerHandlers } from "./BuildingShapes";
import {
  PALETTE_FUNKIS,
  PALETTE_TEGEL,
} from "./colors";
import { glassTexture, windowTexture } from "./textures";

/** Antal våningar per distrikt – deterministiskt ur hash + läge. */
export function districtFloors(parcel: Parcel, hash: number, area?: number): number {
  const areaBoost = area ? Math.min(2, Math.floor(area / 2500)) : 0;
  switch (parcel.district) {
    case "centrum":
      return 5 + (hash % 6) + areaBoost; // 5–12
    case "finans": {
      // Höjdhierarki: högst i klustrets mitt, lägre mot kanterna.
      const zone = DISTRICT_ZONES.find((z) => z.district === "finans")!;
      const dist = Math.hypot(parcel.x - zone.x, parcel.z - zone.z);
      const maxDist = Math.hypot(zone.w / 2, zone.d / 2);
      const central = 1 - dist / maxDist;
      return Math.round(20 + central * 24 + (hash % 7)); // 20–50
    }
    case "innerstad":
      return 4 + (hash % 3); // 4–6
    case "hamnen":
      return 2 + (hash % 4); // 2–5
    case "industri":
      return 1 + (hash % 2); // hallar – höjden sätts av hallformen
    case "förort":
      return 2 + (hash % 3); // 2–4 per huskropp
    default:
      return 1 + (hash % 2); // kulle: villor
  }
}

/** Fasadmaterial med fönstergrid (delad textur, tintad av färgen). */
function useWindows(color: string, floors: number, w: number, windows: boolean, selected: boolean) {
  const mats = useMemo(() => {
    const side = new MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02 });
    if (windows) side.map = windowTexture(Math.max(2, Math.round(w / 5)), Math.max(1, floors));
    const top = new MeshStandardMaterial({ color: new Color(color).multiplyScalar(0.72), roughness: 0.95 });
    return [side, side, top, top, side, side];
  }, [color, floors, w, windows]);
  useEffect(() => {
    for (const m of mats) {
      m.emissive.set(selected ? "#ffffff" : "#000000");
      m.emissiveIntensity = selected ? 0.18 : 0;
    }
  }, [selected, mats]);
  useEffect(
    () => () => {
      mats[0].map?.dispose();
      mats[0].dispose();
      mats[2].dispose();
    },
    [mats],
  );
  return mats;
}

/** Curtain wall-material för finanstornen. */
function useGlass(color: string, floors: number, w: number, windows: boolean, selected: boolean) {
  const mats = useMemo(() => {
    const side = new MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25 });
    if (windows) side.map = glassTexture(Math.max(3, Math.round(w / 4)), Math.max(4, floors));
    const top = new MeshStandardMaterial({ color: new Color(color).multiplyScalar(0.55), roughness: 0.6, metalness: 0.3 });
    return [side, side, top, top, side, side];
  }, [color, floors, w, windows]);
  useEffect(() => {
    for (const m of mats) {
      m.emissive.set(selected ? "#ffffff" : "#000000");
      m.emissiveIntensity = selected ? 0.22 : 0;
    }
  }, [selected, mats]);
  useEffect(
    () => () => {
      mats[0].map?.dispose();
      mats[0].dispose();
      mats[2].dispose();
    },
    [mats],
  );
  return mats;
}

/** Riktning (x,z) mot gatan för butiksband m.m. – första sanna kanten. */
function streetSide(parcel: Parcel): [number, number] {
  if (parcel.edges.s) return [0, 1];
  if (parcel.edges.n) return [0, -1];
  if (parcel.edges.e) return [1, 0];
  if (parcel.edges.w) return [-1, 0];
  return [0, 1];
}

const AWNING_COLORS = ["#b6413a", "#3c6ca8", "#c9a13b", "#4d8b52", "#7a5c8f"];
const ROOF_RED = "#8a4a3a";
const ROOF_DARK = "#4a4540";

/**
 * Valmat tak över en rektangulär byggnad. Skalan ligger i en yttre grupp
 * så att den appliceras EFTER konens 45°-rotation – annars skjuvas taket
 * till en diamant.
 */
function HipRoof({ w, d, y, rise, color }: { w: number; d: number; y: number; rise: number; color: string }) {
  const base = Math.max(w, d);
  return (
    <group position={[0, y, 0]} scale={[(w * 1.06) / base, 1, (d * 1.06) / base]}>
      <mesh castShadow rotation-y={Math.PI / 4}>
        <coneGeometry args={[base * 0.72, rise, 4]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export interface DistrictBuildingProps {
  parcel: Parcel;
  type: PropTypeKey;
  floors: number;
  color: string;
  windows: boolean;
  selected: boolean;
  handlers: PointerHandlers;
  seed: number;
}

/* ── Centrum: sluten stenstad ─────────────────────────────────────── */

function CentrumHouse({ parcel, type, floors, color, windows, selected, handlers, seed }: DistrictBuildingProps) {
  const h = floors * FLOOR_HEIGHT;
  const mats = useWindows(color, floors, parcel.w, windows, selected);
  const [sx, sz] = streetSide(parcel);
  // Gårdsflygel: om tomten har en insida (motsatt gatusida) dras
  // huvudvolymen mot gatan och en låg flygel fyller gårdssidan.
  const hasInside = (sz !== 0 && !(parcel.edges.n && parcel.edges.s)) || (sx !== 0 && !(parcel.edges.e && parcel.edges.w));
  const mainD = hasInside && sz !== 0 ? parcel.d * 0.68 : parcel.d;
  const mainW = hasInside && sx !== 0 ? parcel.w * 0.68 : parcel.w;
  const offX = hasInside && sx !== 0 ? (sx * (parcel.w - mainW)) / 2 : 0;
  const offZ = hasInside && sz !== 0 ? (sz * (parcel.d - mainD)) / 2 : 0;
  const wingH = FLOOR_HEIGHT * (1 + (seed % 2));
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mats} position={[offX, h / 2, offZ]}>
        <boxGeometry args={[mainW, h, mainD]} />
      </mesh>
      {/* Takräcke/parapet */}
      <mesh castShadow position={[offX, h + 0.35, offZ]}>
        <boxGeometry args={[mainW * 0.99, 0.7, mainD * 0.99]} />
        <meshStandardMaterial color={new Color(color).multiplyScalar(0.6).getStyle()} />
      </mesh>
      {/* Gårdsflygel mot kvarterets insida */}
      {hasInside && (
        <mesh castShadow receiveShadow position={[-offX, wingH / 2, -offZ]}>
          <boxGeometry args={[sx !== 0 ? parcel.w - mainW : parcel.w * 0.86, wingH, sz !== 0 ? parcel.d - mainD : parcel.d * 0.86]} />
          <meshStandardMaterial color={new Color(color).multiplyScalar(0.88).getStyle()} />
        </mesh>
      )}
      {/* Bottenvåning i sten (sockel) mot gatan */}
      <mesh position={[offX + sx * (mainW / 2 + 0.06), 1.7, offZ + sz * (mainD / 2 + 0.06)]}>
        <boxGeometry args={[sx !== 0 ? 0.3 : mainW * 0.98, 3.4, sz !== 0 ? 0.3 : mainD * 0.98]} />
        <meshStandardMaterial color={new Color(color).multiplyScalar(0.62).getStyle()} />
      </mesh>
      {type === "butik" && (
        <mesh castShadow position={[offX + sx * (mainW / 2 + 0.8), 3.1, offZ + sz * (mainD / 2 + 0.8)]}>
          <boxGeometry args={[sx !== 0 ? 1.4 : mainW * 0.8, 0.22, sz !== 0 ? 1.4 : mainD * 0.8]} />
          <meshStandardMaterial color={AWNING_COLORS[seed % AWNING_COLORS.length]} />
        </mesh>
      )}
    </group>
  );
}

/* ── Finans: glastorn med höjdhierarki ────────────────────────────── */

function FinanceTower({ parcel, floors, color, windows, selected, handlers, seed }: DistrictBuildingProps) {
  const mats = useGlass(color, floors, parcel.w, windows, selected);
  const w = parcel.w * 0.72;
  const d = parcel.d * 0.72;
  const h = floors * FLOOR_HEIGHT;
  const landmark = floors >= 40;
  const style = seed % 3; // 0 = rak, 1 = avsatser, 2 = smalnande topp
  return (
    <group {...handlers}>
      {style === 1 ? (
        <>
          <mesh castShadow receiveShadow material={mats} position={[0, h * 0.3, 0]}>
            <boxGeometry args={[w, h * 0.6, d]} />
          </mesh>
          <mesh castShadow receiveShadow material={mats} position={[0, h * 0.6 + h * 0.125, 0]}>
            <boxGeometry args={[w * 0.78, h * 0.25, d * 0.78]} />
          </mesh>
          <mesh castShadow receiveShadow material={mats} position={[0, h * 0.85 + h * 0.075, 0]}>
            <boxGeometry args={[w * 0.55, h * 0.15, d * 0.55]} />
          </mesh>
        </>
      ) : style === 2 ? (
        <>
          <mesh castShadow receiveShadow material={mats} position={[0, h * 0.425, 0]}>
            <boxGeometry args={[w, h * 0.85, d]} />
          </mesh>
          <mesh castShadow receiveShadow material={mats} position={[0, h * 0.85 + h * 0.075, 0]} rotation-y={Math.PI / 4}>
            <boxGeometry args={[w * 0.6, h * 0.15, d * 0.6]} />
          </mesh>
        </>
      ) : (
        <mesh castShadow receiveShadow material={mats} position={[0, h / 2, 0]}>
          <boxGeometry args={[w, h, d]} />
        </mesh>
      )}
      {/* Krona på landmärkestorn – lyser svagt */}
      {landmark && (
        <mesh position={[0, h + 0.8, 0]}>
          <boxGeometry args={[w * 0.5, 1.6, d * 0.5]} />
          <meshStandardMaterial color="#e8d9a0" emissive="#e8c96a" emissiveIntensity={0.45} metalness={0.5} roughness={0.3} />
        </mesh>
      )}
      {/* Antenn/spira */}
      <mesh castShadow position={[w * (landmark ? 0 : 0.18), h + (landmark ? 5.5 : 2.6), 0]}>
        <cylinderGeometry args={[0.12, 0.2, landmark ? 9 : 4.5, 6]} />
        <meshStandardMaterial color="#7a8288" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

/* ── Innerstad: funkis och tegel med butiksband ───────────────────── */

function InnerstadHouse({ parcel, type, floors, color, windows, selected, handlers, seed }: DistrictBuildingProps) {
  const h = floors * FLOOR_HEIGHT;
  const tegel = seed % 5 < 2; // ~40 % tegel, resten funkis
  const facade = windows
    ? color
    : color; // spelobjekt behåller sin färg; ambient får palett via anroparen
  const mats = useWindows(facade, floors, parcel.w, windows, selected);
  const [sx, sz] = streetSide(parcel);
  const w = parcel.w * 0.96;
  const d = parcel.d * 0.96;
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mats} position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {tegel ? (
        // Valmat sadeltak – klassiskt tegelhus
        <HipRoof w={w} d={d} y={h + 1.1} rise={2.4} color={ROOF_RED} />
      ) : (
        <>
          {/* Funkis: indragen takvåning + balkongband */}
          <mesh castShadow position={[0, h + 0.9, 0]}>
            <boxGeometry args={[w * 0.55, 1.8, d * 0.55]} />
            <meshStandardMaterial color={new Color(facade).multiplyScalar(0.85).getStyle()} />
          </mesh>
          <mesh castShadow position={[sx * (w / 2 + 0.45) + (sx === 0 ? w * 0.22 : 0), h / 2 + 0.5, sz * (d / 2 + 0.45) + (sz === 0 ? d * 0.22 : 0)]}>
            <boxGeometry args={[sx !== 0 ? 0.9 : 2.6, h * 0.72, sz !== 0 ? 0.9 : 2.6]} />
            <meshStandardMaterial color="#f0ece2" />
          </mesh>
        </>
      )}
      {/* Butiksband i bottenplan mot gatan */}
      <mesh position={[sx * (w / 2 + 0.05), 1.5, sz * (d / 2 + 0.05)]}>
        <boxGeometry args={[sx !== 0 ? 0.28 : w * 0.94, 3, sz !== 0 ? 0.28 : d * 0.94]} />
        <meshStandardMaterial color="#3a4148" emissive="#c8b070" emissiveIntensity={0.1} />
      </mesh>
      {(type === "butik" || seed % 3 === 0) && (
        <mesh castShadow position={[sx * (w / 2 + 0.75), 3.05, sz * (d / 2 + 0.75)]}>
          <boxGeometry args={[sx !== 0 ? 1.3 : w * 0.7, 0.2, sz !== 0 ? 1.3 : d * 0.7]} />
          <meshStandardMaterial color={AWNING_COLORS[(seed >> 2) % AWNING_COLORS.length]} />
        </mesh>
      )}
    </group>
  );
}

/* ── Förort: helt kvarter med lamellhus kring gård ────────────────── */

function SuburbBlock({ parcel, floors, color, windows, selected, handlers, seed }: DistrictBuildingProps) {
  const mats = useWindows(color, Math.min(4, floors), 10, windows, selected);
  const houses = 4 + (seed % 3); // 4–6 huskroppar
  const rows = 2;
  const perRow = Math.ceil(houses / rows);
  const hw = parcel.w / perRow - 4.5;
  const hd = 9;
  return (
    <group {...handlers}>
      {Array.from({ length: houses }, (_, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const hFloors = Math.max(2, Math.min(4, floors + ((seed >> (i * 2)) % 2) - ((seed >> (i * 2 + 1)) % 2)));
        const hh = hFloors * FLOOR_HEIGHT;
        const x = -parcel.w / 2 + (col + 0.5) * (parcel.w / perRow);
        const z = row === 0 ? -parcel.d / 2 + hd / 2 + 2.5 : parcel.d / 2 - hd / 2 - 2.5;
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh castShadow receiveShadow material={mats} position={[0, hh / 2, 0]}>
              <boxGeometry args={[hw, hh, hd]} />
            </mesh>
            <HipRoof w={hw} d={hd} y={hh + 0.8} rise={1.8} color={(seed >> 3) % 2 ? ROOF_RED : ROOF_DARK} />
          </group>
        );
      })}
      {/* Gårdens grönska */}
      {[[-parcel.w * 0.18, 0], [parcel.w * 0.2, 2], [0, -3]].map(([x, z], i) => (
        <group key={`t${i}`} position={[x, 0, z]}>
          <mesh castShadow position={[0, 1, 0]}>
            <cylinderGeometry args={[0.3, 0.4, 2, 5]} />
            <meshStandardMaterial color="#7a5a3a" />
          </mesh>
          <mesh castShadow position={[0, 3, 0]}>
            <coneGeometry args={[2.1, 3.8, 7]} />
            <meshStandardMaterial color={i % 2 ? "#5e7f4e" : "#6f8f57"} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Villakullen ──────────────────────────────────────────────────── */

function Villa({ parcel, floors, color, windows, selected, handlers, seed }: DistrictBuildingProps) {
  const h = Math.min(2, floors) * FLOOR_HEIGHT;
  const mats = useWindows(color, Math.min(2, floors), 8, windows, selected);
  const vw = parcel.w * 0.55;
  const vd = parcel.d * 0.55;
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mats} position={[0, h / 2, 0]}>
        <boxGeometry args={[vw, h, vd]} />
      </mesh>
      <mesh castShadow position={[0, h + 1.2, 0]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[vw * 0.8, 2.4, 4]} />
        <meshStandardMaterial color={seed % 3 ? ROOF_RED : ROOF_DARK} />
      </mesh>
      <mesh castShadow position={[vw * 0.24, h + 1.8, vd * 0.1]}>
        <boxGeometry args={[0.7, 1.5, 0.7]} />
        <meshStandardMaterial color="#6f5648" />
      </mesh>
      {/* Garage/förråd */}
      {seed % 2 === 0 && (
        <mesh castShadow receiveShadow position={[vw * 0.85, 1.2, -vd * 0.5]}>
          <boxGeometry args={[4, 2.4, 3.4]} />
          <meshStandardMaterial color={new Color(color).multiplyScalar(0.85).getStyle()} />
        </mesh>
      )}
    </group>
  );
}

/* ── Industri: hallar med monitortak ──────────────────────────────── */

function IndustryHall({ parcel, color, windows, selected, handlers, seed }: DistrictBuildingProps) {
  const hallH = 7 + (seed % 3) * 1.5;
  const mats = useWindows(color, 2, parcel.w, windows, selected);
  const w = parcel.w * 0.92;
  const d = parcel.d * 0.8;
  const monitors = 2 + (seed % 2);
  return (
    <group {...handlers}>
      {/* Betongsockel */}
      <mesh receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[w + 1, 1, d + 1]} />
        <meshStandardMaterial color="#9a988e" roughness={0.95} />
      </mesh>
      <mesh castShadow receiveShadow material={mats} position={[0, hallH / 2 + 1, 0]}>
        <boxGeometry args={[w, hallH, d]} />
      </mesh>
      {/* Monitortak (sågtandsprofil) */}
      {Array.from({ length: monitors }, (_, i) => (
        <group key={i} position={[-w / 2 + ((i + 0.5) * w) / monitors, hallH + 2.1, 0]}>
          <HipRoof
            w={(w / monitors) * 0.86}
            d={d * 0.86}
            y={0}
            rise={2.4}
            color={new Color(color).multiplyScalar(0.7).getStyle()}
          />
        </group>
      ))}
      {/* Skorsten + cistern */}
      {seed % 2 === 0 && (
        <mesh castShadow position={[w * 0.36, hallH + 4, -d * 0.28]}>
          <cylinderGeometry args={[0.6, 0.8, 7, 8]} />
          <meshStandardMaterial color="#7d6659" />
        </mesh>
      )}
      <mesh castShadow position={[-w * 0.34, 2.4, d * 0.52]}>
        <cylinderGeometry args={[1.6, 1.6, 4.4, 10]} />
        <meshStandardMaterial color="#aab2b8" metalness={0.35} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ── Hamnen: magasin ──────────────────────────────────────────────── */

function HarborShed({ parcel, type, floors, color, windows, selected, handlers, seed }: DistrictBuildingProps) {
  const h = Math.max(2, floors) * FLOOR_HEIGHT * 0.9;
  const mats = useWindows(color, Math.max(2, floors), parcel.w, windows, selected);
  const w = parcel.w * 0.9;
  const d = parcel.d * 0.78;
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mats} position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {/* Valmat magasinstak */}
      <HipRoof w={w} d={d} y={h + 1.3} rise={2.8} color={seed % 2 ? ROOF_DARK : "#5d4a3a"} />
      {/* Lastport eller kontorsentré */}
      <mesh position={[0, 2, d / 2 + 0.06]}>
        <boxGeometry args={[w * 0.3, 4, 0.25]} />
        <meshStandardMaterial color={type === "kontor" ? "#8fa8b8" : "#4a4238"} />
      </mesh>
    </group>
  );
}

/** Väljer byggnadsfamilj utifrån distriktet. */
export function DistrictBuilding(props: DistrictBuildingProps) {
  switch (props.parcel.district) {
    case "centrum":
      return <CentrumHouse {...props} />;
    case "finans":
      return <FinanceTower {...props} />;
    case "innerstad":
      return <InnerstadHouse {...props} />;
    case "förort":
      return <SuburbBlock {...props} />;
    case "industri":
      return <IndustryHall {...props} />;
    case "hamnen":
      return <HarborShed {...props} />;
    default:
      return <Villa {...props} />;
  }
}

/** Ambient fasadfärg per distrikt (dekorativ bebyggelse). */
export function ambientColorFor(district: string, hash: number): string {
  const pick = (arr: string[]) => arr[hash % arr.length];
  switch (district) {
    case "centrum":
      return pick(["#d9cfc0", "#cfc0a8", "#c8b9a2", "#d6c6b0", "#b9a88f", "#e2d8c6"]);
    case "finans":
      return pick(["#8fb0c8", "#7fa3c0", "#6d94b5", "#9db8cc", "#5f88a8"]);
    case "innerstad":
      return hash % 5 < 2 ? pick(PALETTE_TEGEL) : pick(PALETTE_FUNKIS);
    case "förort":
      return pick(["#c9b8a0", "#b8a888", "#d0c0a8", "#a89878", "#c0ae90"]);
    case "industri":
      return pick(["#8a97a0", "#7a8a94", "#9aa8b0", "#708088", "#94a094"]);
    case "hamnen":
      return pick(["#96604a", "#7a5a48", "#8a6a55", "#6d7a82", "#856048"]);
    default:
      return pick(["#c8b090", "#b89878", "#d4c0a0", "#a08868", "#c0a888"]);
  }
}
