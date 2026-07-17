/* ============================================================
   Distriktsarkitektur – varje distrikt har sin egen byggnadsfamilj:

   Centrum      slutna stenstadskvarter, 5–12 vån, full tomtyta,
                gårdsflyglar, gesims, hörntorn i gatukors, vattentankar
   Finans       glastorn 20–50 vån med avsatser, krona och antenn,
                podium i gatuplan, teknikvåning, höjdhierarki mot mitten
   Innerstad    funkis (puts, balkongband) och tegel (sadeltak med
                takkupor och skorsten), 4–6 vån, butiksband mot gatan
   Förort       hela kvarter: 4–6 lamellhus kring en gård, entrétak,
                miljonprogramsvariant med platta tak
   Villakullen  villor med sadeltak, vinkelflyglar och farstukvistar
   Industri     hallar med monitortak, cisterner, skorstenar och rörgator
   Hamnen       magasin med valmade tak, hissbalkar och gods längs kajen

   Allt är procedurellt: parcelHash ger deterministisk variation
   så att inget kvarter ser klonat ut.
   ============================================================ */

import { useEffect, useMemo, type ReactNode } from "react";
import { Color, MeshStandardMaterial } from "three";
import { DISTRICT_ZONES, type Parcel } from "../engine/city";
import type { PropTypeKey } from "../engine/types";
import { FLOOR_HEIGHT, facadeBoxGeometry, type PointerHandlers } from "./BuildingShapes";
import {
  PALETTE_FUNKIS,
  PALETTE_TEGEL,
} from "./colors";
import { facadeTexture, glassTexture, type FacadeVariant } from "./textures";

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
      // Klampas till [0,1] – tomter utanför zonen (t.ex. modellbiblioteket)
      // ska inte kunna ge negativa våningsantal.
      const central = Math.max(0, Math.min(1, 1 - dist / maxDist));
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

/**
 * Fasadmaterial: ETT material per hus (fönstergriden bakas i stället in
 * i fasadboxens UV:er – se facadeBoxGeometry). Kaklet väljs efter
 * fastighetstyp och tillståndsvariant; texturerna är cachade och delas.
 */
function useFacade(
  color: string,
  windows: boolean,
  selected: boolean,
  glass = false,
  kind: PropTypeKey = "bostad",
  variant: FacadeVariant = "normal",
) {
  const mat = useMemo(() => {
    const m = new MeshStandardMaterial({
      color,
      roughness: glass ? 0.35 : 0.82,
      metalness: glass ? 0.25 : 0.02,
    });
    if (windows) m.map = glass ? glassTexture(4, 4) : facadeTexture(kind, variant); // repeat 1×1 – UV:erna styr
    return m;
  }, [color, windows, glass, kind, variant]);
  useEffect(() => {
    mat.emissive.set(selected ? "#ffffff" : "#000000");
    mat.emissiveIntensity = selected ? (glass ? 0.22 : 0.18) : 0;
  }, [selected, glass, mat]);
  useEffect(
    () => () => {
      // Texturen är cachad och delad – disposa bara materialet.
      mat.dispose();
    },
    [mat],
  );
  return mat;
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
  /** Fasadens tillstånd: vakant = släckt, fullt = tänt, dåligt skick = sliten. */
  variant?: FacadeVariant;
  /** Energiklass A/B: solpaneler på taket (familjer med platta tak). */
  solar?: boolean;
}

/** Solpanel på platt tak – svagt lutad, mörkblå glaspanel. */
function SolarPanel({ w, d, y, x = 0, z = 0 }: { w: number; d: number; y: number; x?: number; z?: number }) {
  return (
    <mesh castShadow position={[x, y, z]} rotation-z={0.07}>
      <boxGeometry args={[w, 0.14, d]} />
      <meshStandardMaterial color="#1c2f4a" metalness={0.55} roughness={0.28} />
    </mesh>
  );
}

/**
 * Entrédetaljer i gatuplan per fastighetstyp (steg 3 i fasadplanen):
 * butik = ljusskylt, kontor = glasentré + logotypplatta,
 * bostad = portik med trappa. Industri hanteras i IndustryHall (port+ramp).
 */
function EntranceDetail({
  type, w, d, sx, sz, color, seed,
}: { type: PropTypeKey; w: number; d: number; sx: number; sz: number; color: string; seed: number }) {
  const along = sx !== 0; // gatuväggen löper i z-led
  const px = sx * (w / 2 + 0.18);
  const pz = sz * (d / 2 + 0.18);
  if (type === "butik") {
    return (
      <mesh position={[px, 3.9, pz]}>
        <boxGeometry args={[along ? 0.32 : w * 0.52, 0.9, along ? d * 0.52 : 0.32]} />
        <meshStandardMaterial
          color={AWNING_COLORS[seed % AWNING_COLORS.length]}
          emissive="#ffd27a"
          emissiveIntensity={0.5}
        />
      </mesh>
    );
  }
  if (type === "kontor") {
    return (
      <group>
        <mesh position={[px, 1.7, pz]}>
          <boxGeometry args={[along ? 0.5 : 5, 3.4, along ? 5 : 0.5]} />
          <meshStandardMaterial color="#9fc0d4" metalness={0.4} roughness={0.25} />
        </mesh>
        <mesh position={[px, 4.6, pz]}>
          <boxGeometry args={[along ? 0.36 : 3.2, 0.9, along ? 3.2 : 0.36]} />
          <meshStandardMaterial color="#f0ece0" />
        </mesh>
      </group>
    );
  }
  if (type === "bostad") {
    return (
      <group>
        <mesh castShadow position={[px, 1.8, pz]}>
          <boxGeometry args={[along ? 0.6 : 3, 3.6, along ? 3 : 0.6]} />
          <meshStandardMaterial color={new Color(color).multiplyScalar(0.55).getStyle()} />
        </mesh>
        <mesh receiveShadow position={[px + sx * 0.9, 0.3, pz + sz * 0.9]}>
          <boxGeometry args={[along ? 1.4 : 3.4, 0.6, along ? 3.4 : 1.4]} />
          <meshStandardMaterial color="#b8b2a4" />
        </mesh>
      </group>
    );
  }
  return null;
}

/** Takdetaljer: skorstenar, ventilationshuvar och takfönster gör platta
 *  tak levande – seedat så varje hus får sin egen uppsättning. */
function RoofClutter({ w, d, y, seed }: { w: number; d: number; y: number; seed: number }) {
  const items: ReactNode[] = [];
  if (seed % 2 === 0)
    items.push(
      <mesh key="skorsten" castShadow position={[w * 0.28, y + 1.1, -d * 0.22]}>
        <boxGeometry args={[0.9, 2.2, 0.9]} />
        <meshStandardMaterial color="#8a5a43" roughness={0.9} />
      </mesh>,
    );
  items.push(
    <mesh key="vent" castShadow position={[-w * 0.24, y + 0.5, d * 0.18]}>
      <boxGeometry args={[1.5, 1.0, 1.2]} />
      <meshStandardMaterial color="#9aa0a4" metalness={0.3} roughness={0.6} />
    </mesh>,
  );
  if ((seed >> 2) % 3 === 0)
    items.push(
      <mesh key="hatt" castShadow position={[w * 0.05, y + 0.7, d * 0.3]}>
        <cylinderGeometry args={[0.35, 0.45, 1.4, 8]} />
        <meshStandardMaterial color="#b8bdc2" metalness={0.4} roughness={0.5} />
      </mesh>,
    );
  return <group>{items}</group>;
}

/** Slitage (variant "sliten"): igenbommade fönster, fuktränder från
 *  taket och en sprucken sockel – förfallet ska SYNAS, inte bara anas. */
function WornDetails({ w, d, h, sx, sz, seed }: {
  w: number; d: number; h: number; sx: number; sz: number; seed: number;
}) {
  const along = sx !== 0;
  const px = sx * (w / 2 + 0.1);
  const pz = sz * (d / 2 + 0.1);
  const boards = 2 + (seed % 2);
  return (
    <group>
      {/* Igenbommade fönster: plywood på gatufasaden */}
      {Array.from({ length: boards }, (_, i) => {
        const t = (i + 1) / (boards + 1) - 0.5;
        const fy = 2.6 + ((seed >> (i * 3)) % Math.max(1, Math.floor(h / 3 - 1))) * 3;
        return (
          <mesh key={i} position={[along ? px : t * w * 0.8, Math.min(fy, h - 1.6), along ? t * d * 0.8 : pz]}>
            <boxGeometry args={[along ? 0.14 : 1.7, 2.0, along ? 1.7 : 0.14]} />
            <meshStandardMaterial color="#7a6248" roughness={1} />
          </mesh>
        );
      })}
      {/* Fuktrand från taklinjen */}
      <mesh position={[along ? px : -w * 0.28, h * 0.72, along ? -d * 0.28 : pz]}>
        <boxGeometry args={[along ? 0.12 : 1.1, h * 0.5, along ? 1.1 : 0.12]} />
        <meshStandardMaterial color="#4e4a42" transparent opacity={0.55} roughness={1} />
      </mesh>
      {/* Sprucken sockel + skräp vid entrén */}
      <mesh position={[along ? px : w * 0.3, 0.5, along ? d * 0.3 : pz]}>
        <boxGeometry args={[along ? 0.16 : 2.6, 1.0, along ? 2.6 : 0.16]} />
        <meshStandardMaterial color="#5d594f" roughness={1} />
      </mesh>
      <mesh castShadow position={[px + sx * 1.6 + (along ? 0 : w * 0.34), 0.55, pz + sz * 1.6 + (along ? d * 0.34 : 0)]} rotation-y={0.5} rotation-z={0.12}>
        <boxGeometry args={[1.1, 1.1, 0.8]} />
        <meshStandardMaterial color="#3f5347" roughness={0.9} />
      </mesh>
    </group>
  );
}

/* ── Centrum: sluten stenstad ─────────────────────────────────────── */

function CentrumHouse({ parcel, type, floors, color, windows, selected, handlers, seed, variant, solar }: DistrictBuildingProps) {
  const h = floors * FLOOR_HEIGHT;
  const mat = useFacade(color, windows, selected, false, type, variant);
  const [sx, sz] = streetSide(parcel);
  // Gårdsflygel: om tomten har en insida (motsatt gatusida) dras
  // huvudvolymen mot gatan och en låg flygel fyller gårdssidan.
  const hasInside = (sz !== 0 && !(parcel.edges.n && parcel.edges.s)) || (sx !== 0 && !(parcel.edges.e && parcel.edges.w));
  const mainD = hasInside && sz !== 0 ? parcel.d * 0.68 : parcel.d;
  const mainW = hasInside && sx !== 0 ? parcel.w * 0.68 : parcel.w;
  const offX = hasInside && sx !== 0 ? (sx * (parcel.w - mainW)) / 2 : 0;
  const offZ = hasInside && sz !== 0 ? (sz * (parcel.d - mainD)) / 2 : 0;
  const wingH = FLOOR_HEIGHT * (1 + (seed % 2));
  // Hörntorn: tomter i gatukors (två angränsande gatusidor) får ett runt
  // torn med tälttak – stenstadens klassiska accent mot korsningen.
  const ex = parcel.edges.e ? 1 : parcel.edges.w ? -1 : 0;
  const ez = parcel.edges.s ? 1 : parcel.edges.n ? -1 : 0;
  const turret = ex !== 0 && ez !== 0 && seed % 3 !== 0;
  const trim = new Color(color).multiplyScalar(0.66).getStyle();
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(mainW, h, mainD)} position={[offX, h / 2, offZ]} dispose={null} />
      {/* Taklist (gesims) strax under taklinjen – bryter den raka lådprofilen.
          Småornament kastar ingen skugga: de skulle dubbla sina draw calls
          i skuggpasset utan synbar vinst. */}
      <mesh position={[offX, h - 0.55, offZ]}>
        <boxGeometry args={[mainW * 1.05, 0.55, mainD * 1.05]} />
        <meshStandardMaterial color={trim} />
      </mesh>
      {turret && (
        <group position={[offX + ex * (mainW / 2 - 0.5), 0, offZ + ez * (mainD / 2 - 0.5)]}>
          <mesh castShadow receiveShadow position={[0, (h + 1.6) / 2, 0]}>
            <cylinderGeometry args={[2.0, 2.0, h + 1.6, 10]} />
            <meshStandardMaterial color={new Color(color).multiplyScalar(0.92).getStyle()} roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0, h + 2.9, 0]}>
            <coneGeometry args={[2.35, 2.6, 10]} />
            <meshStandardMaterial color={(seed >> 1) % 2 ? "#4a6152" : ROOF_DARK} metalness={0.15} roughness={0.7} />
          </mesh>
        </group>
      )}
      {/* Takräcke/parapet + takplatta (annars gapar ett mörkt hål uppifrån) */}
      <mesh castShadow position={[offX, h + 0.35, offZ]}>
        <boxGeometry args={[mainW * 0.99, 0.7, mainD * 0.99]} />
        <meshStandardMaterial color={new Color(color).multiplyScalar(0.6).getStyle()} />
      </mesh>
      <mesh receiveShadow position={[offX, h + 0.72, offZ]}>
        <boxGeometry args={[mainW * 0.93, 0.08, mainD * 0.93]} />
        <meshStandardMaterial color={new Color(color).multiplyScalar(0.72).getStyle()} roughness={0.95} />
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
      {windows && (
        <group position={[offX, 0, offZ]}>
          <EntranceDetail type={type} w={mainW} d={mainD} sx={sx} sz={sz} color={color} seed={seed} />
        </group>
      )}
      {solar && <SolarPanel w={mainW * 0.44} d={mainD * 0.32} y={h + 0.85} x={offX - sx * mainW * 0.12} z={offZ - sz * mainD * 0.12} />}
      <group position={[offX, 0, offZ]}>
        <RoofClutter w={mainW} d={mainD} y={h + 0.7} seed={seed} />
        {/* Vattentank på tak – på var femte hus, ger takhorisonten rytm */}
        {seed % 5 === 2 && (
          <group position={[-mainW * 0.26, h + 0.75, -mainD * 0.24]}>
            <mesh position={[0, 0.35, 0]}>
              <boxGeometry args={[1.7, 0.7, 1.7]} />
              <meshStandardMaterial color="#6b6458" roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0, 1.75, 0]}>
              <cylinderGeometry args={[1.05, 1.15, 2.1, 9]} />
              <meshStandardMaterial color="#7d6a52" roughness={0.85} />
            </mesh>
            <mesh position={[0, 3.0, 0]}>
              <coneGeometry args={[1.15, 0.7, 9]} />
              <meshStandardMaterial color="#5d564c" roughness={0.9} />
            </mesh>
          </group>
        )}
        {variant === "sliten" && <WornDetails w={mainW} d={mainD} h={h} sx={sx} sz={sz} seed={seed} />}
      </group>
    </group>
  );
}

/* ── Finans: glastorn med höjdhierarki ────────────────────────────── */

function FinanceTower({ parcel, type, floors, color, windows, selected, handlers, seed, solar }: DistrictBuildingProps) {
  const mat = useFacade(color, windows, selected, true);
  const w = parcel.w * 0.72;
  const d = parcel.d * 0.72;
  const h = floors * FLOOR_HEIGHT;
  const landmark = floors >= 40;
  const style = seed % 3; // 0 = rak, 1 = avsatser, 2 = smalnande topp
  // Podium: vartannat torn står på en bredare bas i 2–3 våningar –
  // ger gaturummet en mänsklig skala under glaskroppen.
  const podium = seed % 2 === 0;
  const podiumH = FLOOR_HEIGHT * (2 + ((seed >> 2) % 2));
  return (
    <group {...handlers}>
      {podium && (
        <>
          <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(parcel.w * 0.92, podiumH, parcel.d * 0.92, true)} position={[0, podiumH / 2, 0]} dispose={null} />
          <mesh receiveShadow position={[0, podiumH + 0.12, 0]}>
            <boxGeometry args={[parcel.w * 0.94, 0.24, parcel.d * 0.94]} />
            <meshStandardMaterial color="#3d454c" roughness={0.6} metalness={0.2} />
          </mesh>
        </>
      )}
      {style === 1 ? (
        <>
          <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w, h * 0.6, d, true)} position={[0, h * 0.3, 0]} dispose={null} />
          <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w * 0.78, h * 0.25, d * 0.78, true)} position={[0, h * 0.6 + h * 0.125, 0]} dispose={null} />
          <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w * 0.55, h * 0.15, d * 0.55, true)} position={[0, h * 0.85 + h * 0.075, 0]} dispose={null} />
        </>
      ) : style === 2 ? (
        <>
          <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w, h * 0.85, d, true)} position={[0, h * 0.425, 0]} dispose={null} />
          <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w * 0.6, h * 0.15, d * 0.6, true)} position={[0, h * 0.85 + h * 0.075, 0]} rotation-y={Math.PI / 4} dispose={null} />
        </>
      ) : (
        <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w, h, d, true)} position={[0, h / 2, 0]} dispose={null} />
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
      {solar && <SolarPanel w={w * 0.32} d={d * 0.28} y={h + 0.2} x={-w * 0.24} z={d * 0.22} />}
      {/* Maskinrum på taket – raka torn utan krona får en teknikvåning */}
      {style === 0 && !landmark && (
        <mesh castShadow position={[-w * 0.12, h + 1.0, d * 0.08]}>
          <boxGeometry args={[w * 0.42, 2.0, d * 0.36]} />
          <meshStandardMaterial color="#3d454c" roughness={0.6} metalness={0.25} />
        </mesh>
      )}
      {style === 0 && !landmark && <RoofClutter w={w} d={d} y={h} seed={seed >> 1} />}
      {/* Kontorstorn får en glasentré i gatuplan */}
      {windows && type === "kontor" && (
        <EntranceDetail type="kontor" w={w} d={d} sx={streetSide(parcel)[0]} sz={streetSide(parcel)[1]} color={color} seed={seed} />
      )}
    </group>
  );
}

/* ── Innerstad: funkis och tegel med butiksband ───────────────────── */

function InnerstadHouse({ parcel, type, floors, color, windows, selected, handlers, seed, variant, solar }: DistrictBuildingProps) {
  const h = floors * FLOOR_HEIGHT;
  const tegel = seed % 5 < 2; // ~40 % tegel, resten funkis
  const facade = color;
  const mat = useFacade(facade, windows, selected, false, type, variant);
  const [sx, sz] = streetSide(parcel);
  const w = parcel.w * 0.96;
  const d = parcel.d * 0.96;
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w, h, d)} position={[0, h / 2, 0]} dispose={null} />
      {tegel ? (
        <>
          {/* Valmat sadeltak – klassiskt tegelhus */}
          <HipRoof w={w} d={d} y={h + 1.1} rise={2.4} color={ROOF_RED} />
          {/* Skorsten vid nocken */}
          <mesh castShadow position={[w * 0.2, h + 2.6, -d * 0.08]}>
            <boxGeometry args={[0.8, 1.7, 0.8]} />
            <meshStandardMaterial color="#7d5a48" roughness={0.9} />
          </mesh>
          {/* Takkupor mot gatan – bryter takfallet */}
          {Array.from({ length: 1 + ((seed >> 1) % 2) }, (_, i) => {
            const t = (i === 0 ? -1 : 1) * 0.2;
            const kx = sz !== 0 ? t * w : sx * w * 0.26;
            const kz = sz !== 0 ? sz * d * 0.26 : t * d;
            return (
              <group key={i} position={[kx, h + 1.1, kz]}>
                <mesh castShadow>
                  <boxGeometry args={[1.5, 1.5, 1.5]} />
                  <meshStandardMaterial color={facade} />
                </mesh>
                <mesh position={[0, 1.0, 0]} rotation-y={Math.PI / 4}>
                  <coneGeometry args={[1.15, 0.9, 4]} />
                  <meshStandardMaterial color={ROOF_RED} />
                </mesh>
              </group>
            );
          })}
        </>
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
      {windows && <EntranceDetail type={type} w={w} d={d} sx={sx} sz={sz} color={color} seed={seed} />}
      {/* Solpanel: platt funkistak (tegelhusens sadeltak lämnas ifred) */}
      {solar && !tegel && <SolarPanel w={w * 0.36} d={d * 0.3} y={h + 0.35} x={-w * 0.26} z={-d * 0.2} />}
      {!tegel && <RoofClutter w={w} d={d} y={h + 0.1} seed={seed >> 1} />}
      {variant === "sliten" && <WornDetails w={w} d={d} h={h} sx={sx} sz={sz} seed={seed} />}
    </group>
  );
}

/* ── Förort: helt kvarter med lamellhus kring gård ────────────────── */

function SuburbBlock({ parcel, type, floors, color, windows, selected, handlers, seed, variant }: DistrictBuildingProps) {
  const mat = useFacade(color, windows, selected, false, type, variant);
  const houses = 4 + (seed % 3); // 4–6 huskroppar
  const rows = 2;
  const perRow = Math.ceil(houses / rows);
  const hw = parcel.w / perRow - 4.5;
  const hd = 9;
  // Miljonprogram: vart fjärde kvarter har platta tak med sarg i stället
  // för sadeltak – två tydligt olika förortsepoker.
  const flatRoofs = seed % 4 === 0;
  return (
    <group {...handlers}>
      {Array.from({ length: houses }, (_, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const hFloors = Math.max(2, Math.min(4, floors + ((seed >> (i * 2)) % 2) - ((seed >> (i * 2 + 1)) % 2)));
        const hh = hFloors * FLOOR_HEIGHT;
        const x = -parcel.w / 2 + (col + 0.5) * (parcel.w / perRow);
        const z = row === 0 ? -parcel.d / 2 + hd / 2 + 2.5 : parcel.d / 2 - hd / 2 - 2.5;
        const yard = row === 0 ? 1 : -1; // mot gården
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(hw, hh, hd)} position={[0, hh / 2, 0]} dispose={null} />
            {flatRoofs ? (
              <mesh castShadow position={[0, hh + 0.3, 0]}>
                <boxGeometry args={[hw * 1.03, 0.6, hd * 1.03]} />
                <meshStandardMaterial color={ROOF_DARK} roughness={0.9} />
              </mesh>
            ) : (
              <HipRoof w={hw} d={hd} y={hh + 0.8} rise={1.8} color={(seed >> 3) % 2 ? ROOF_RED : ROOF_DARK} />
            )}
            {/* Entrétak mot gården (ingen skugga – ornament) */}
            <mesh position={[0, 2.5, yard * (hd / 2 + 0.55)]}>
              <boxGeometry args={[2.2, 0.18, 1.1]} />
              <meshStandardMaterial color="#e8e2d4" />
            </mesh>
            {variant === "sliten" && i === 0 && <WornDetails w={hw} d={hd} h={hh} sx={0} sz={row === 0 ? -1 : 1} seed={seed} />}
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

function Villa({ parcel, type, floors, color, windows, selected, handlers, seed, variant }: DistrictBuildingProps) {
  const h = Math.min(2, floors) * FLOOR_HEIGHT;
  const mat = useFacade(color, windows, selected, false, type, variant);
  const vw = parcel.w * 0.55;
  const vd = parcel.d * 0.55;
  const wing = seed % 3 === 0; // vinkelbyggd villa (L-form)
  const veranda = seed % 3 === 1; // farstukvist med tak
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(vw, h, vd)} position={[0, h / 2, 0]} dispose={null} />
      <mesh castShadow position={[0, h + 1.2, 0]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[vw * 0.8, 2.4, 4]} />
        <meshStandardMaterial color={seed % 3 ? ROOF_RED : ROOF_DARK} />
      </mesh>
      <mesh castShadow position={[vw * 0.24, h + 1.8, vd * 0.1]}>
        <boxGeometry args={[0.7, 1.5, 0.7]} />
        <meshStandardMaterial color="#6f5648" />
      </mesh>
      {/* Vinkelflygel i en våning – bryter kvadraten till en L-form */}
      {wing && (
        <group position={[-vw * 0.68, 0, vd * 0.3]}>
          <mesh castShadow receiveShadow position={[0, FLOOR_HEIGHT / 2, 0]}>
            <boxGeometry args={[vw * 0.6, FLOOR_HEIGHT, vd * 0.75]} />
            <meshStandardMaterial color={new Color(color).multiplyScalar(0.92).getStyle()} />
          </mesh>
          <mesh castShadow position={[0, FLOOR_HEIGHT + 0.55, 0]} rotation-y={Math.PI / 4}>
            <coneGeometry args={[vw * 0.44, 1.1, 4]} />
            <meshStandardMaterial color={seed % 3 ? ROOF_RED : ROOF_DARK} />
          </mesh>
        </group>
      )}
      {/* Farstukvist: trallgolv + tak på framsidan */}
      {veranda && (
        <group position={[0, 0, vd / 2 + 1.0]}>
          <mesh receiveShadow position={[0, 0.35, 0]}>
            <boxGeometry args={[3.0, 0.7, 1.9]} />
            <meshStandardMaterial color="#a8907a" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.75, 0]} rotation-x={0.18}>
            <boxGeometry args={[3.2, 0.16, 2.1]} />
            <meshStandardMaterial color={seed % 3 ? ROOF_RED : ROOF_DARK} />
          </mesh>
        </group>
      )}
      {/* Garage/förråd */}
      {seed % 2 === 0 && (
        <mesh castShadow receiveShadow position={[vw * 0.85, 1.2, -vd * 0.5]}>
          <boxGeometry args={[4, 2.4, 3.4]} />
          <meshStandardMaterial color={new Color(color).multiplyScalar(0.85).getStyle()} />
        </mesh>
      )}
      {variant === "sliten" && (
        <group>
          <mesh position={[0, 1.9, vd / 2 + 0.06]}>
            <boxGeometry args={[1.4, 1.6, 0.12]} />
            <meshStandardMaterial color="#7a6248" roughness={1} />
          </mesh>
          {/* Vildvuxen tomt */}
          {[[-vw * 0.8, vd * 0.7], [vw * 0.75, vd * 0.85], [-vw * 0.6, -vd * 0.9]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.35, z]}>
              <sphereGeometry args={[0.7 + (i % 2) * 0.3, 6, 5]} />
              <meshStandardMaterial color="#6b7a45" roughness={1} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/* ── Industri: hallar med monitortak ──────────────────────────────── */

function IndustryHall({ parcel, type, color, windows, selected, handlers, seed, variant, solar }: DistrictBuildingProps) {
  const hallH = 7 + (seed % 3) * 1.5;
  const mat = useFacade(color, windows, selected, false, type, variant);
  const w = parcel.w * 0.92;
  const d = parcel.d * 0.8;
  const monitors = 2 + (seed % 2);
  const [sx, sz] = streetSide(parcel);
  return (
    <group {...handlers}>
      {/* Betongsockel */}
      <mesh receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[w + 1, 1, d + 1]} />
        <meshStandardMaterial color="#9a988e" roughness={0.95} />
      </mesh>
      <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w, hallH, d)} position={[0, hallH / 2 + 1, 0]} dispose={null} />
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
      {/* Rörgata längs takkanten – hallar utan skorsten får processrör */}
      {seed % 2 === 1 && (
        <group position={[0, hallH + 1.4, d * 0.4]}>
          <mesh castShadow rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.28, 0.28, w * 0.6, 8]} />
            <meshStandardMaterial color="#8a929a" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[-w * 0.3, -0.9, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 1.8, 8]} />
            <meshStandardMaterial color="#8a929a" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      )}
      <mesh castShadow position={[-w * 0.34, 2.4, d * 0.52]}>
        <cylinderGeometry args={[1.6, 1.6, 4.4, 10]} />
        <meshStandardMaterial color="#aab2b8" metalness={0.35} roughness={0.5} />
      </mesh>
      {/* Lastport + betongramp mot gatan */}
      {windows && (
        <>
          <mesh position={[sx * (w / 2 + 0.08), 3.2, sz * (d / 2 + 0.08)]}>
            <boxGeometry args={[sx !== 0 ? 0.3 : 6.5, 4.4, sz !== 0 ? 0.3 : 6.5]} />
            <meshStandardMaterial color="#4c5258" roughness={0.7} metalness={0.25} />
          </mesh>
          <mesh receiveShadow position={[sx * (w / 2 + 2.2), 0.55, sz * (d / 2 + 2.2)]}>
            <boxGeometry args={[sx !== 0 ? 4 : 7.5, 1.1, sz !== 0 ? 7.5 : 4]} />
            <meshStandardMaterial color="#9a988e" roughness={0.95} />
          </mesh>
        </>
      )}
      {solar && <SolarPanel w={w * 0.4} d={d * 0.34} y={hallH + 1.35} x={-w * 0.24} z={d * 0.22} />}
      {variant === "sliten" && (
        <group>
          {[[-w * 0.3, 0], [w * 0.18, 1], [w * 0.42, 0]].map(([x], i) => (
            <mesh key={i} position={[x as number, hallH * 0.55 + 1, d / 2 + 0.05]}>
              <boxGeometry args={[0.9, hallH * 0.7, 0.1]} />
              <meshStandardMaterial color="#8a5a35" transparent opacity={0.5} roughness={1} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/* ── Hamnen: magasin ──────────────────────────────────────────────── */

function HarborShed({ parcel, type, floors, color, windows, selected, handlers, seed, variant }: DistrictBuildingProps) {
  const h = Math.max(2, floors) * FLOOR_HEIGHT * 0.9;
  const mat = useFacade(color, windows, selected, false, type, variant);
  const w = parcel.w * 0.9;
  const d = parcel.d * 0.78;
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w, h, d)} position={[0, h / 2, 0]} dispose={null} />
      {/* Valmat magasinstak */}
      <HipRoof w={w} d={d} y={h + 1.3} rise={2.8} color={seed % 2 ? ROOF_DARK : "#5d4a3a"} />
      {/* Lastport eller kontorsentré */}
      <mesh position={[0, 2, d / 2 + 0.06]}>
        <boxGeometry args={[w * 0.3, 4, 0.25]} />
        <meshStandardMaterial color={type === "kontor" ? "#8fa8b8" : "#4a4238"} />
      </mesh>
      {/* Hissbalk över porten – magasinens signum mot kajen */}
      <mesh castShadow position={[0, h - 0.3, d / 2 + 0.8]}>
        <boxGeometry args={[0.35, 0.35, 1.9]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.85} />
      </mesh>
      <mesh position={[0, h - 1.05, d / 2 + 1.5]}>
        <boxGeometry args={[0.22, 1.15, 0.22]} />
        <meshStandardMaterial color="#3d3a34" roughness={0.9} />
      </mesh>
      {/* Godslådor vid porten */}
      {seed % 2 === 0 && (
        <group position={[w * 0.3, 0, d / 2 + 1.6]}>
          <mesh castShadow position={[0, 0.55, 0]}>
            <boxGeometry args={[1.1, 1.1, 1.1]} />
            <meshStandardMaterial color="#8a7050" roughness={0.9} />
          </mesh>
          <mesh position={[0.95, 0.4, 0.35]} rotation-y={0.4}>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
            <meshStandardMaterial color="#96784f" roughness={0.9} />
          </mesh>
        </group>
      )}
      {variant === "sliten" && <WornDetails w={w} d={d} h={h} sx={0} sz={1} seed={seed} />}
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

/* ── Morfars hus (berättelseläget "Arvet efter morfar") ─────────────── */

/**
 * Unik modell för det ärvda huset: en villa byggd i omgångar (tillbyggt
 * 1971, 1978 och 1983 – bygglovet "under handläggning" sedan 1987).
 * Vid lågt skick ligger en presenning över taknocken och flaggstången
 * står sne; när huset rustats (skick ≥ 60) är presenningen borta,
 * stången rak och morfars vimpel hissad.
 */
export function HeirloomHouse({
  parcel, type, color, windows, selected, handlers, condition,
}: DistrictBuildingProps & { condition: number }) {
  const mat = useFacade(color, windows, selected, false, type, condition < 40 ? "sliten" : "normal");
  const w = parcel.w * 0.5;
  const d = parcel.d * 0.52;
  const h = FLOOR_HEIGHT * 2;
  const renovated = condition >= 60;
  const annexColor = new Color(color).multiplyScalar(0.88).getStyle();
  return (
    <group {...handlers}>
      {/* Huvudkropp (1962) */}
      <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w, h, d)} position={[0, h / 2, 0]} dispose={null} />
      {/* Sadeltak */}
      <mesh castShadow position={[0, h + 1.3, 0]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[w * 0.82, 2.6, 4]} />
        <meshStandardMaterial color={ROOF_DARK} />
      </mesh>
      {/* Skorsten */}
      <mesh castShadow position={[w * 0.22, h + 2.1, -d * 0.12]}>
        <boxGeometry args={[0.8, 1.8, 0.8]} />
        <meshStandardMaterial color="#6f5648" />
      </mesh>
      {/* Tillbyggnad 1971: envånings flygel åt öster */}
      <mesh castShadow receiveShadow position={[w * 0.78, FLOOR_HEIGHT / 2, d * 0.1]}>
        <boxGeometry args={[w * 0.62, FLOOR_HEIGHT, d * 0.7]} />
        <meshStandardMaterial color={annexColor} />
      </mesh>
      <mesh castShadow position={[w * 0.78, FLOOR_HEIGHT + 0.5, d * 0.1]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[w * 0.46, 1.1, 4]} />
        <meshStandardMaterial color={ROOF_RED} />
      </mesh>
      {/* Tillbyggnad 1978: låg förstukvist mot gatan */}
      <mesh castShadow receiveShadow position={[-w * 0.2, 1.3, d * 0.72]}>
        <boxGeometry args={[w * 0.5, 2.6, d * 0.5]} />
        <meshStandardMaterial color={annexColor} />
      </mesh>
      {/* Tillbyggnad 1983: snickarboden på baksidan */}
      <mesh castShadow receiveShadow position={[-w * 0.66, 1.1, -d * 0.62]}>
        <boxGeometry args={[3.4, 2.2, 2.6]} />
        <meshStandardMaterial color="#7d6a52" />
      </mesh>
      {/* Presenning över taknocken tills huset rustats */}
      {!renovated && (
        <group position={[-w * 0.16, h + 1.85, 0]} rotation-z={0.12}>
          <mesh castShadow rotation-y={Math.PI / 4}>
            <coneGeometry args={[w * 0.5, 1.4, 4]} />
            <meshStandardMaterial color="#3d6da8" roughness={0.6} />
          </mesh>
          {/* Brädan som håller presenningen */}
          <mesh position={[0, 0.75, 0]} rotation-z={0.5}>
            <boxGeometry args={[2.6, 0.16, 0.24]} />
            <meshStandardMaterial color="#8a7454" />
          </mesh>
        </group>
      )}
      {/* Flaggstången: sne tills renoveringen är klar, sedan rak med vimpel */}
      <group position={[w * 0.95, 0, d * 0.85]} rotation-z={renovated ? 0 : 0.16}>
        <mesh castShadow position={[0, 4.2, 0]}>
          <cylinderGeometry args={[0.09, 0.13, 8.4, 6]} />
          <meshStandardMaterial color="#e6e0d0" />
        </mesh>
        <mesh position={[0, 8.55, 0]}>
          <sphereGeometry args={[0.18, 8, 6]} />
          <meshStandardMaterial color="#c9a13b" metalness={0.6} roughness={0.3} />
        </mesh>
        {renovated && (
          <mesh position={[0.62, 7.9, 0]}>
            <planeGeometry args={[1.2, 0.55]} />
            <meshStandardMaterial color="#3a66b0" side={2} />
          </mesh>
        )}
      </group>
      {/* Morfars bänk på gaveln */}
      <mesh castShadow position={[-w * 0.78, 0.55, d * 0.3]}>
        <boxGeometry args={[1.8, 0.18, 0.6]} />
        <meshStandardMaterial color="#7d6a52" />
      </mesh>
    </group>
  );
}
