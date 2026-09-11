import {ModelDetails} from "./ModelDetails";
import {residentialDetails} from "./residentialDetails";
import {financeDetails} from "./financeDetails";
import {architecturePalette,ARCHITECTURE} from "./architecturePalette";
import { WorkplaceFacade } from "./WorkplaceFacade";
import { UrbanFacade } from "./UrbanFacade";
import { centrumMassing } from "./centrumMassing";
import { financeMassing } from "./financeMassing";
import { VillaAnnex } from "./VillaAnnex";
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

import { useContext, useEffect, useMemo, type ReactNode } from "react";
import { Color, MeshStandardMaterial } from "three";
import { DISTRICT_ZONES, type Parcel } from "../engine/city";
import type { Property, PropTypeKey } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import { CentrumTurretDetails } from "./CentrumTurretDetails";
import { SuburbDetails, SuburbRoof } from "./SuburbDetails";
import { suburbFloors, suburbLayout } from "./suburbLayout";
import { FrontageContext, FrontageDetails } from "./FrontageDetails";
import { facadeSurfaceMaps } from "./surfaceMaps";
import { FLOOR_HEIGHT, facadeBoxGeometry, type PointerHandlers } from "./BuildingShapes";
import {
  facadeEmissiveTexture,
  facadeTexture,
  glassEmissiveTexture,
  glassTexture,
  type FacadeVariant,
} from "./textures";

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
/** Ytkaraktär per fastighetstyp: puts är matt, betong halvmatt,
 *  industriplåt blank och lätt metallisk. Glaset sätts separat. */
const FACADE_ROUGHNESS: Partial<Record<PropTypeKey, number>> = {
  bostad: 0.85, kontor: 0.74, butik: 0.7, industri: 0.55,
};
const FACADE_METALNESS: Partial<Record<PropTypeKey, number>> = {
  bostad: 0.02, kontor: 0.04, butik: 0.04, industri: 0.3,
};

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
      roughness: glass ? 0.3 : (FACADE_ROUGHNESS[kind] ?? 0.82),
      metalness: glass ? 0.32 : (FACADE_METALNESS[kind] ?? 0.02),
    });
    if (windows) {
      m.map = glass ? glassTexture(4, 4) : facadeTexture(kind, variant); // repeat 1×1 – UV:erna styr
      Object.assign(m, facadeSurfaceMaps(kind, variant, glass));
      m.bumpScale = glass ? 0.035 : kind === "industri" ? 0.1 : 0.16;
      m.envMapIntensity = glass ? 0.85 : 0.3;
      // Tända fönster glöder på riktigt: emissivkaklet är svart utom
      // de tända rutorna, så glöden tintas inte ner av fasadfärgen.
      m.emissiveMap = glass ? glassEmissiveTexture(4, 4) : facadeEmissiveTexture(kind, variant);
      m.emissive.set("#ffffff");
      m.emissiveIntensity = variant === "släckt" ? 0 : 0.55;
    }
    // Thumbnail clones restore this neutral material instead of capturing selection glow.
    m.userData.previewFacade = { emissiveIntensity: m.emissiveIntensity, kind, variant, glass, windows };
    return m;
  }, [color, windows, glass, kind, variant]);
  useEffect(() => {
    // Vald byggnad markeras med helfasadsglöd – emissivkaklet kopplas ur
    // så hela ytan lyser, inte bara de tända fönstren. Att byta emissiveMap
    // ändrar shaderns defines, därav needsUpdate.
    if (selected) {
      mat.emissiveMap = null;
      mat.emissive.set("#ffffff");
      mat.emissiveIntensity = glass ? 0.22 : 0.18;
    } else {
      mat.emissiveMap = mat.map ? (glass ? glassEmissiveTexture(4, 4) : facadeEmissiveTexture(kind, variant)) : null;
      mat.emissive.set("#ffffff");
      mat.emissiveIntensity = mat.map && variant !== "släckt" ? 0.55 : 0;
    }
    mat.needsUpdate = true;
  }, [selected, glass, kind, variant, mat]);
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
  /** Detailed entrances only for the viewed block, never signature/story models. */
  frontage?: Property;
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
  // Avstånds-LOD: osynlig från översikt – hoppas över där för färre draws.
  if (useUiStore((s) => s.lodFar)) return null;
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
  const detailed = useContext(FrontageContext);
  const far = useUiStore((s) => s.lodFar);
  if (far) return null;
  if (detailed) return <FrontageDetails w={w} d={d} sx={sx} sz={sz} />;
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
  // Avstånds-LOD: takskorstenar/ventiler är osynliga från översikt.
  if (useUiStore((s) => s.lodFar)) return null;
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


/** Brandtrappa i zigzag på gaveln – bakgatans siluett. Gruppen roteras
 *  så lokala +z pekar ut från väggen; två plan, ett trapplopp och en
 *  nedfällbar stege. Bara på slitna hus och vart femte hus (budget). */
function FireEscape({ w, d, h, sz, seed }: {
  w: number; d: number; h: number; sx: number; sz: number; seed: number;
}) {
  const onX = sz !== 0; // gatan i z-led → trappan på öst/västgaveln
  const side = seed % 2 ? 1 : -1;
  const yaw = onX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI;
  const pos: [number, number, number] = onX
    ? [side * (w / 2), 0, (((seed >> 2) % 2) ? -1 : 1) * d * 0.12]
    : [(((seed >> 2) % 2) ? -1 : 1) * w * 0.12, 0, side * (d / 2)];
  const y1 = h * 0.36;
  const y2 = h * 0.64;
  const run = 2.4;
  const len = Math.hypot(run, y2 - y1);
  const ang = Math.atan2(y2 - y1, run);
  const metal = { color: "#3a3f43", metalness: 0.45, roughness: 0.55 } as const;
  return (
    <group position={pos} rotation-y={yaw}>
      {[y1, y2].map((y, i) => (
        <mesh key={i} position={[i === 0 ? -1.2 : 1.2, y, 0.5]}>
          <boxGeometry args={[2.4, 0.14, 0.9]} />
          <meshStandardMaterial {...metal} />
        </mesh>
      ))}
      <mesh position={[0, (y1 + y2) / 2, 0.5]} rotation-z={ang}>
        <boxGeometry args={[len, 0.14, 0.7]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* Nedfällbar stege under nedersta planet */}
      <mesh position={[-1.2, y1 * 0.62, 0.7]}>
        <boxGeometry args={[0.7, y1 * 0.6, 0.08]} />
        <meshStandardMaterial {...metal} />
      </mesh>
    </group>
  );
}

function CentrumHouse({ parcel, type, floors, color, windows, selected, handlers, seed, variant, solar }: DistrictBuildingProps) {
  const detailed = useContext(FrontageContext);
  const h = floors * FLOOR_HEIGHT;
  const mat = useFacade(color, false, selected, false, type, variant);
  const { sx, sz, hasInside, mainD, mainW, offX, offZ, wingH, wingW, wingD, ex, ez, turret } = centrumMassing(parcel, seed);
  const trim = architecturePalette(color).frame;
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(mainW, h, mainD)} position={[offX, h / 2, offZ]} dispose={null} />
      {windows && <group position={[offX,0,offZ]}><UrbanFacade w={mainW} d={mainD} h={h} color={color} seed={seed} classical sx={sx} sz={sz} shop={type === "butik"} portal={!detailed} occupied={detailed ? detailed.property.status === "klar" && detailed.property.tenants.length > 0 : variant !== "släckt"}/></group>}
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
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <CentrumTurretDetails floors={floors} color={color} enabled={windows} />
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
        <group position={[-offX, 0, -offZ]}>
          <mesh castShadow receiveShadow position={[0, wingH / 2, 0]}
            geometry={facadeBoxGeometry(wingW, wingH, wingD)} material={mat} dispose={null} />
          {windows && <UrbanFacade w={wingW} d={wingD} h={wingH} color={color} seed={seed} classical sx={-sx} sz={-sz} entrance={false}/>}
          <mesh receiveShadow position={[0, wingH + 0.1, 0]}>
            <boxGeometry args={[wingW + 0.2, 0.2, wingD + 0.2]} />
            <meshStandardMaterial color={trim} roughness={0.9} />
          </mesh>
        </group>
      )}
      {type === "butik" && !detailed && (
        <mesh castShadow position={[offX + sx * (mainW / 2 + 0.8), 3.1, offZ + sz * (mainD / 2 + 0.8)]}>
          <boxGeometry args={[sx !== 0 ? 1.4 : mainW * 0.8, 0.22, sz !== 0 ? 1.4 : mainD * 0.8]} />
          <meshStandardMaterial color={AWNING_COLORS[seed % AWNING_COLORS.length]} />
        </mesh>
      )}
      {windows && (
        <group position={[offX, 0, offZ]}>
          {detailed && <EntranceDetail type={type} w={mainW} d={mainD} sx={sx} sz={sz} color={color} seed={seed} />}

          {(variant === "sliten" || seed % 5 === 1) && <FireEscape w={mainW} d={mainD} h={h} sx={sx} sz={sz} seed={seed} />}
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

function FinanceTower({ parcel, type, floors, color, windows, selected, handlers, seed, solar, variant }: DistrictBuildingProps) {
  const detailed = useContext(FrontageContext);
  const mat = useFacade(color, windows, selected, true, type, variant);
  const podiumMat=useFacade(color,false,selected,false,type,variant);
  const w = parcel.w * 0.72;
  const d = parcel.d * 0.72;
  const h = floors * FLOOR_HEIGHT;
  const towerVolumes=financeMassing(parcel,h,seed);
  const topVolume=towerVolumes[towerVolumes.length-1];
  const landmark = floors >= 40;
  const style = seed % 3; // 0 = rak, 1 = avsatser, 2 = smalnande topp
  // Podium: vartannat torn står på en bredare bas i 2–3 våningar –
  // ger gaturummet en mänsklig skala under glaskroppen.
  const podium = seed % 2 === 0;
  return (
    <group {...handlers}>
      {towerVolumes.map((v,i)=><group key={i} position={[0,v.y??0,0]} rotation-y={v.rotation??0}>
        <mesh castShadow receiveShadow material={podium&&i===0?podiumMat:mat} geometry={facadeBoxGeometry(v.w,v.h,v.d,!(podium&&i===0))} position={[0,v.h/2,0]} dispose={null}/>
        <mesh receiveShadow position={[0,v.h+.07,0]}><boxGeometry args={[v.w+.16,.14,v.d+.16]}/><meshStandardMaterial color="#59646a" roughness={.8}/></mesh>
      </group>)}
      {windows && <ModelDetails groups={financeDetails(towerVolumes,color,podium,...streetSide(parcel),!detailed)}/>}
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
      {solar && <group rotation-y={topVolume.rotation??0}><SolarPanel w={topVolume.w*.32} d={topVolume.d*.28} y={h+.2} x={-topVolume.w*.15} z={topVolume.d*.15}/></group>}
      {/* Maskinrum på taket – raka torn utan krona får en teknikvåning */}
      {style === 0 && !landmark && (
        <mesh castShadow position={[-w * 0.12, h + 1.0, d * 0.08]}>
          <boxGeometry args={[w * 0.42, 2.0, d * 0.36]} />
          <meshStandardMaterial color="#3d454c" roughness={0.6} metalness={0.25} />
        </mesh>
      )}
      {style === 0 && !landmark && <RoofClutter w={w} d={d} y={h} seed={seed >> 1} />}
      {/* Kontorstorn får en glasentré i gatuplan */}
      {windows && detailed && (
        <EntranceDetail type={type} w={podium ? parcel.w * 0.92 : w} d={podium ? parcel.d * 0.92 : d} sx={streetSide(parcel)[0]} sz={streetSide(parcel)[1]} color={color} seed={seed} />
      )}
    </group>
  );
}

/* ── Innerstad: funkis och tegel med butiksband ───────────────────── */

function InnerstadHouse({ parcel, type, floors, color, windows, selected, handlers, seed, variant, solar }: DistrictBuildingProps) {
  const detailed = useContext(FrontageContext);
  const h = floors * FLOOR_HEIGHT;
  const tegel = seed % 5 < 2; // ~40 % tegel, resten funkis
  const facade = color;
  const mat = useFacade(facade, false, selected, false, type, variant);
  const [sx, sz] = streetSide(parcel);
  const w = parcel.w * 0.96;
  const d = parcel.d * 0.96;
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w, h, d)} position={[0, h / 2, 0]} dispose={null} />
      {windows && <UrbanFacade w={w} d={d} h={h} color={color} seed={seed} classical={tegel} sx={sx} sz={sz} shop={type === "butik"} portal={!detailed} occupied={detailed ? detailed.property.status === "klar" && detailed.property.tenants.length > 0 : variant !== "släckt"}/>}
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
                {windows && <group rotation-y={sx ? sx * Math.PI / 2 : sz < 0 ? Math.PI : 0}>
                  <mesh position={[0, 0.1, 0.77]}><boxGeometry args={[1.13, 1.16, 0.1]} /><meshStandardMaterial color={architecturePalette(color).frame} /></mesh>
                  <mesh position={[0, 0.1, 0.84]}><boxGeometry args={[0.88, 0.92, 0.04]} /><meshStandardMaterial color={ARCHITECTURE.glass} roughness={0.3} /></mesh>
                  <mesh position={[0, 0.1, 0.88]}><boxGeometry args={[0.065, 0.92, 0.03]} /><meshStandardMaterial color={architecturePalette(color).frame} /></mesh>
                </group>}
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
          <mesh castShadow position={[0, h + 0.9, 0]} geometry={facadeBoxGeometry(w * 0.55, 1.8, d * 0.55)} material={mat} dispose={null} />
          {windows && <group position={[0,h,0]}><UrbanFacade w={w*.55} d={d*.55} h={1.8} color={color} seed={seed} classical={false} sx={sx} sz={sz} entrance={false}/></group>}
          <mesh position={[0, h + 1.86, 0]}>
            <boxGeometry args={[w * 0.55 + 0.25, 0.12, d * 0.55 + 0.25]} /><meshStandardMaterial color="#6f736b" roughness={0.85} />
          </mesh>

        </>
      )}
      {!detailed && (type === "butik" || seed % 3 === 0) && (
        <mesh castShadow position={[sx * (w / 2 + 0.75), 3.05, sz * (d / 2 + 0.75)]}>
          <boxGeometry args={[sx !== 0 ? 1.3 : w * 0.7, 0.2, sz !== 0 ? 1.3 : d * 0.7]} />
          <meshStandardMaterial color={AWNING_COLORS[(seed >> 2) % AWNING_COLORS.length]} />
        </mesh>
      )}
      {windows && detailed && <EntranceDetail type={type} w={w} d={d} sx={sx} sz={sz} color={color} seed={seed} />}
      {windows && (variant === "sliten" || seed % 5 === 1) && (
        <FireEscape w={w} d={d} h={h} sx={sx} sz={sz} seed={seed} />
      )}
      {/* Solpanel: platt funkistak (tegelhusens sadeltak lämnas ifred) */}
      {solar && !tegel && <SolarPanel w={w * 0.36} d={d * 0.3} y={h + 0.35} x={-w * 0.26} z={-d * 0.2} />}
      {!tegel && <RoofClutter w={w} d={d} y={h + 0.1} seed={seed >> 1} />}
      {variant === "sliten" && <WornDetails w={w} d={d} h={h} sx={sx} sz={sz} seed={seed} />}
    </group>
  );
}

/* ── Förort: helt kvarter med lamellhus kring gård ────────────────── */

function SuburbBlock({ parcel, type, floors, color, windows, selected, handlers, seed, variant }: DistrictBuildingProps) {
  const detailed = useContext(FrontageContext);
  const mat = useFacade(color, false, selected, false, type, variant);
  const layout = suburbLayout(parcel, seed);
  const houses = layout.houses.length, perRow = layout.columns;
  const hw = layout.houses[0].w, hd = layout.depth;
  // Miljonprogram: vart fjärde kvarter har platta tak med sarg i stället
  // för sadeltak – två tydligt olika förortsepoker.
  const flatRoofs = seed % 4 === 0;
  return (
    <group {...handlers}>
      {Array.from({ length: houses }, (_, i) => {
        const row = Math.floor(i / perRow);
        const hFloors = suburbFloors(floors, seed, row);
        const hh = hFloors * FLOOR_HEIGHT;
        const { x, z } = layout.houses[i];
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
              <SuburbRoof wallColor={color} w={hw} d={hd} y={hh} color={(seed >> 3) % 2 ? ROOF_RED : ROOF_DARK} />
            )}
            {/* Entrétak mot gården (ingen skugga – ornament) */}
            {type !== "bostad" && (detailed && (i === 0 || i === perRow) ? <FrontageDetails w={hw} d={hd} sx={0} sz={yard} /> : <mesh position={[0, 2.5, yard * (hd / 2 + 0.55)]}>
              <boxGeometry args={[2.2, 0.18, 1.1]} />
              <meshStandardMaterial color="#e8e2d4" />
            </mesh>)}
            {variant === "sliten" && i === 0 && <WornDetails w={hw} d={hd} h={hh} sx={0} sz={row === 0 ? -1 : 1} seed={seed} />}
          </group>
        );
      })}
      <SuburbDetails parcel={parcel} seed={seed} floors={floors} property={detailed?.property} variant={variant} enabled={windows} residential={type === "bostad"} />
      {/* Gårdens grönska */}
      {layout.trees.map(({ x, z }, i) => (
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
  const detailed = useContext(FrontageContext);
  const h = Math.min(2, floors) * FLOOR_HEIGHT;
  const mat = useFacade(color, false, selected, false, type, variant);
  const vw = parcel.w * 0.55;
  const vd = parcel.d * 0.55;
  const wing = seed % 3 === 0; // vinkelbyggd villa (L-form)
  const veranda = seed % 3 === 1; // farstukvist med tak
  return (
    <group {...handlers}>
      <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(vw, h, vd)} position={[0, h / 2, 0]} dispose={null} />
      {windows && <ModelDetails groups={residentialDetails(vw,vd,h,color,true,!detailed,veranda)}/>}
      <HipRoof w={vw} d={vd} y={h+1.2} rise={2.4} color={seed%3?ROOF_RED:ROOF_DARK}/>
      <mesh castShadow position={[vw * 0.24, h + 1.8, vd * 0.1]}>
        <boxGeometry args={[0.7, 1.5, 0.7]} />
        <meshStandardMaterial color="#6f5648" />
      </mesh>
      {/* Vinkelflygel i en våning – bryter kvadraten till en L-form */}
      {wing && (
        <group position={[-vw * 0.68, 0, vd * 0.3]}>
          <mesh castShadow receiveShadow position={[0, FLOOR_HEIGHT / 2, 0]} geometry={facadeBoxGeometry(vw * 0.6, FLOOR_HEIGHT, vd * 0.75)} material={mat} dispose={null} />
          {windows && <ModelDetails groups={residentialDetails(vw*.6,vd*.75,3,color,false)}/>}
          <HipRoof w={vw*.6} d={vd*.75} y={3.55} rise={1.1} color={seed%3?ROOF_RED:ROOF_DARK}/>
        </group>
      )}
      {detailed && windows && <FrontageDetails w={vw} d={vd} sx={0} sz={1} />}
      {/* Garage/förråd */}
      {seed % 2 === 0 && <VillaAnnex w={vw} d={vd} color={color} />}
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
  const detailed = useContext(FrontageContext);
  const hallH = 7 + (seed % 3) * 1.5;
  const mat = useFacade(color, false, selected, false, type, variant);
  const w = parcel.w * 0.92;
  const d = parcel.d * 0.8;
  const monitors = 2 + (seed % 2);
  const [sx, sz] = streetSide(parcel);
  return (
    <group {...handlers}>
      {windows && <group position={[0,1,0]}><WorkplaceFacade w={w} d={d} h={hallH} color={color} warehouse={false} sx={sx} sz={sz} entrance={!detailed}/></group>}
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
      {windows && detailed && <FrontageDetails w={w} d={d} sx={sx} sz={sz}/>}
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
  const detailed = useContext(FrontageContext);
  const h = Math.max(2, floors) * FLOOR_HEIGHT * 0.9;
  const mat = useFacade(color, false, selected, false, type, variant);
  const w = parcel.w * 0.9;
  const d = parcel.d * 0.78;
  return (
    <group {...handlers}>
      {windows && <WorkplaceFacade w={w} d={d} h={h} color={color} warehouse sx={0} sz={1} entrance={!detailed}/>}
      <mesh castShadow receiveShadow material={mat} geometry={facadeBoxGeometry(w, h, d)} position={[0, h / 2, 0]} dispose={null} />
      {/* Valmat magasinstak */}
      <HipRoof w={w} d={d} y={h + 1.3} rise={2.8} color={seed % 2 ? ROOF_DARK : "#5d4a3a"} />
      {windows && detailed && <FrontageDetails w={w} d={d} sx={0} sz={1}/>}
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
  const detail = useMemo(() => props.frontage ? { property: props.frontage, district: props.parcel.district, color: props.color } : null,
    [props.frontage, props.parcel.district, props.color]);
  let building: ReactNode;
  switch (props.parcel.district) {
    case "centrum": building = <CentrumHouse {...props} />; break;
    case "finans": building = <FinanceTower {...props} />; break;
    case "innerstad": building = <InnerstadHouse {...props} />; break;
    case "förort": building = <SuburbBlock {...props} />; break;
    case "industri": building = <IndustryHall {...props} />; break;
    case "hamnen": building = <HarborShed {...props} />; break;
    default: building = <Villa {...props} />;
  }
  return <FrontageContext.Provider value={detail}>{building}</FrontageContext.Provider>;
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
      {/* Tillbyggnad 1971: envånings flygel åt öster. Papptak med svag
          lutning – 70-talstypiskt, och pyramidtaket skar in i husväggen. */}
      <mesh castShadow receiveShadow position={[w * 0.78, FLOOR_HEIGHT / 2, d * 0.1]}>
        <boxGeometry args={[w * 0.62, FLOOR_HEIGHT, d * 0.7]} />
        <meshStandardMaterial color={annexColor} />
      </mesh>
      <mesh castShadow position={[w * 0.78, FLOOR_HEIGHT + 0.08, d * 0.1]} rotation-z={-0.04}>
        <boxGeometry args={[w * 0.68, 0.18, d * 0.76]} />
        <meshStandardMaterial color={ROOF_DARK} roughness={0.95} />
      </mesh>
      {/* Flygelns detaljer: två fönster med karm mot gatan och en
          takfotslist under papptaket */}
      {[w * 0.62, w * 0.94].map((wx) => (
        <group key={wx} position={[wx, 1.6, d * 0.45 + 0.05]}>
          <mesh>
            <boxGeometry args={[1.0, 1.1, 0.1]} />
            <meshStandardMaterial color="#4a4a44" />
          </mesh>
          <mesh position={[0, 0, 0.04]}>
            <boxGeometry args={[0.8, 0.9, 0.06]} />
            <meshStandardMaterial color="#8fa3ad" roughness={0.4} metalness={0.1} />
          </mesh>
        </group>
      ))}
      <mesh position={[w * 0.78, FLOOR_HEIGHT - 0.12, d * 0.1]}>
        <boxGeometry args={[w * 0.64, 0.16, d * 0.72]} />
        <meshStandardMaterial color={new Color(color).multiplyScalar(0.7).getStyle()} />
      </mesh>
      {/* Tillbyggnad 1978: låg förstukvist mot gatan (indragen från
          staketet) med pulpettak, ytterdörr, litet fönster och trappsteg */}
      <mesh castShadow receiveShadow position={[-w * 0.2, 1.3, d * 0.58]}>
        <boxGeometry args={[w * 0.5, 2.6, d * 0.38]} />
        <meshStandardMaterial color={annexColor} />
      </mesh>
      <mesh castShadow position={[-w * 0.2, 2.76, d * 0.58]} rotation-x={0.1}>
        <boxGeometry args={[w * 0.54, 0.14, d * 0.42]} />
        <meshStandardMaterial color={ROOF_DARK} roughness={0.95} />
      </mesh>
      <mesh position={[-w * 0.14, 0.95, d * 0.77 + 0.05]}>
        <boxGeometry args={[0.95, 1.9, 0.1]} />
        <meshStandardMaterial color="#5c4633" roughness={0.85} />
      </mesh>
      <group position={[-w * 0.36, 1.6, d * 0.77 + 0.05]}>
        <mesh>
          <boxGeometry args={[0.7, 0.8, 0.1]} />
          <meshStandardMaterial color="#4a4a44" />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <boxGeometry args={[0.54, 0.64, 0.06]} />
          <meshStandardMaterial color="#8fa3ad" roughness={0.4} metalness={0.1} />
        </mesh>
      </group>
      <mesh receiveShadow position={[-w * 0.14, 0.14, d * 0.77 + 0.35]}>
        <boxGeometry args={[1.1, 0.28, 0.55]} />
        <meshStandardMaterial color="#b8b2a4" roughness={0.95} />
      </mesh>
      {/* Tillbyggnad 1983: snickarboden på baksidan – med pulpettak,
          plankdörr och ett litet verkstadsfönster */}
      <mesh castShadow receiveShadow position={[-w * 0.66, 1.1, -d * 0.62]}>
        <boxGeometry args={[3.4, 2.2, 2.6]} />
        <meshStandardMaterial color="#7d6a52" />
      </mesh>
      <mesh castShadow position={[-w * 0.66, 2.28, -d * 0.62]} rotation-x={-0.09}>
        <boxGeometry args={[3.7, 0.13, 2.95]} />
        <meshStandardMaterial color={ROOF_DARK} roughness={0.95} />
      </mesh>
      <mesh position={[-w * 0.56, 0.85, -d * 0.62 + 1.35]}>
        <boxGeometry args={[0.85, 1.7, 0.08]} />
        <meshStandardMaterial color="#5c4633" roughness={0.9} />
      </mesh>
      <mesh position={[-w * 0.84, 1.45, -d * 0.62 + 1.35]}>
        <boxGeometry args={[0.6, 0.5, 0.08]} />
        <meshStandardMaterial color="#8fa3ad" roughness={0.4} />
      </mesh>
      {/* Presenning över taktoppen tills huset rustats. Samma 4-sidiga
          kon som taket, samma lutning, ett par decimeter utanför – duken
          ligger PARALLELLT över spetsen i stället för att taket sticker
          igenom. Tyngdslanorna ligger horisontellt längs dukens nederkant
          som man faktiskt surrar en presenning. */}
      {!renovated && (
        <group>
          <mesh castShadow position={[0, h + 2.0, 0]} rotation-y={Math.PI / 4}>
            <coneGeometry args={[2.3, 1.46, 4]} />
            <meshStandardMaterial color="#3d6da8" roughness={0.6} />
          </mesh>
          <mesh castShadow position={[0, h + 1.34, 1.56]}>
            <boxGeometry args={[2.2, 0.11, 0.22]} />
            <meshStandardMaterial color="#8a7454" />
          </mesh>
          <mesh castShadow position={[1.56, h + 1.34, 0]}>
            <boxGeometry args={[0.22, 0.11, 2.2]} />
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
      {/* Morfars bänk på gaveln – sits på två ben, inte svävande */}
      <mesh castShadow position={[-w * 0.78, 0.5, d * 0.3]}>
        <boxGeometry args={[1.8, 0.14, 0.6]} />
        <meshStandardMaterial color="#7d6a52" />
      </mesh>
      {[-0.65, 0.65].map((bx) => (
        <mesh key={bx} position={[-w * 0.78 + bx, 0.22, d * 0.3]}>
          <boxGeometry args={[0.14, 0.44, 0.5]} />
          <meshStandardMaterial color="#6a5a45" />
        </mesh>
      ))}
      {/* Vitt spjälstaket mot gatan med öppen grind framför grusgången –
          delade räcken så varken gång eller brevlåda skär genom spjälorna.
          Lite skevt tills huset rustats. */}
      <group rotation-z={renovated ? 0 : 0.02}>
        {([[-3.15, 2.9], [2.15, 4.9]] as const).map(([cx, cw]) =>
          [0.5, 0.85].map((ry) => (
            <mesh key={`${cx}-${ry}`} position={[cx, ry, d * 0.95]}>
              <boxGeometry args={[cw, 0.1, 0.07]} />
              <meshStandardMaterial color={renovated ? "#eae4d4" : "#c8bfa8"} roughness={0.85} />
            </mesh>
          )),
        )}
        {[-4.4, -3.0, 1.2, 2.7, 4.4].map((px) => (
          <mesh key={px} castShadow position={[px, 0.55, d * 0.95]}>
            <boxGeometry args={[0.12, 1.1, 0.12]} />
            <meshStandardMaterial color={renovated ? "#eae4d4" : "#c8bfa8"} roughness={0.85} />
          </mesh>
        ))}
        {/* Grindstolpar på var sida om öppningen */}
        {[-1.7, -0.3].map((px) => (
          <mesh key={px} castShadow position={[px, 0.65, d * 0.95]}>
            <boxGeometry args={[0.16, 1.3, 0.16]} />
            <meshStandardMaterial color={renovated ? "#eae4d4" : "#c8bfa8"} roughness={0.85} />
          </mesh>
        ))}
      </group>
      {/* Grusgång från grinden till förstukvisten – slutar VID staketlinjen */}
      <mesh receiveShadow position={[-w * 0.2, 0.05, d * 0.85]}>
        <boxGeometry args={[1.2, 0.08, d * 0.2]} />
        <meshStandardMaterial color="#b8ac94" roughness={0.95} />
      </mesh>
      {/* Brevlåda innanför staketet, till vänster om grinden */}
      <group position={[-2.3, 0, d * 0.88]}>
        <mesh castShadow position={[0, 0.55, 0]}>
          <boxGeometry args={[0.09, 1.1, 0.09]} />
          <meshStandardMaterial color="#6f5648" />
        </mesh>
        <mesh castShadow position={[0, 1.15, 0]}>
          <boxGeometry args={[0.52, 0.34, 0.3]} />
          <meshStandardMaterial color={renovated ? "#3a66b0" : "#5d594f"} roughness={0.6} />
        </mesh>
      </group>
      {/* Morfars äppelträd på baksidan */}
      <group position={[w * 0.85, 0, -d * 0.75]}>
        <mesh castShadow position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.22, 0.32, 2.4, 6]} />
          <meshStandardMaterial color="#7a5a3a" />
        </mesh>
        <mesh castShadow position={[0, 3.1, 0]}>
          <sphereGeometry args={[1.7, 8, 6]} />
          <meshStandardMaterial color="#5e7f4e" roughness={1} />
        </mesh>
        <mesh position={[0.9, 3.4, 0.6]}>
          <sphereGeometry args={[1.0, 7, 5]} />
          <meshStandardMaterial color="#6f8f57" roughness={1} />
        </mesh>
      </group>
      {/* Mormors rabatt längs förstukvisten – blommar när huset rustats */}
      {renovated && (
        <group position={[w * 0.24, 0, d * 0.72]}>
          <mesh position={[0, 0.16, 0]}>
            <boxGeometry args={[2.6, 0.32, 0.6]} />
            <meshStandardMaterial color="#5c4a38" roughness={1} />
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <boxGeometry args={[2.3, 0.22, 0.4]} />
            <meshStandardMaterial color="#b6413a" roughness={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}
