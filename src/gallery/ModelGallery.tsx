/* ============================================================
   MODELLBIBLIOTEK (?models) – varje husmodell i spelet uppställd
   på rad: distriktsfamiljerna × tillståndsvarianter, morfars hus,
   industrierna, signaturkvarteren och megaprojekten. Ett stabilt
   referensgalleri att granska och förbättra modellerna i, utan
   att behöva jaga dem på spelkartan.
   ============================================================ */

import { Html, MapControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ReactNode } from "react";
import type { Parcel } from "../engine/city";
import type { PropTypeKey } from "../engine/types";
import { DistrictBuilding, HeirloomHouse, districtFloors } from "../three/districtBuildings";
import { Hotel, SolarPark, WindFarm, Warehouse } from "../three/IndustryProps";
import { OfficeCluster, ResidentialBlock, CultureDistrict, ConstructionSite } from "../three/SignatureBlocks";
import { Arena, Campus, Hospital } from "../three/MegaProjects";
import { Helicopter, SportsCar } from "../three/OwnerLuxuries";
import {
  HarborTerminal,
  LmArena,
  LmKyrka,
  LmPariserhjul,
  LmSkorsten,
  LmStadshus,
  LmStadspark,
  LmVattentorn,
} from "../three/CityExtras";
import type { FacadeVariant } from "../three/textures";

/** Fabricerad tomtruta för uppställningen. */
function mkParcel(district: string, id: string, w = 17, d = 17): Parcel {
  return { id, district, x: 0, z: 0, w, d, blockId: `${district}-b0`, edges: { n: false, e: false, s: true, w: false } };
}

const VARIANTS: { v: FacadeVariant; label: string }[] = [
  { v: "normal", label: "normal" },
  { v: "tänt", label: "tänt (fullt uthyrt)" },
  { v: "släckt", label: "släckt (vakant)" },
  { v: "sliten", label: "sliten (skick < 40)" },
];

const FAMILIES: { district: string; label: string; type: PropTypeKey; w: number; d: number; seed: number }[] = [
  { district: "centrum", label: "Centrum (stenstad)", type: "kontor", w: 17, d: 17, seed: 6 },
  { district: "innerstad", label: "Innerstad (funkis)", type: "bostad", w: 17, d: 17, seed: 3 },
  { district: "innerstad", label: "Innerstad (tegel)", type: "butik", w: 17, d: 17, seed: 5 },
  { district: "förort", label: "Suburb (block)", type: "bostad", w: 22, d: 24, seed: 4 },
  { district: "kulle", label: "Villakullen", type: "bostad", w: 10, d: 12, seed: 2 },
  { district: "industri", label: "Industri (hall)", type: "industri", w: 27, d: 27, seed: 4 },
  { district: "hamnen", label: "Hamnen (magasin)", type: "industri", w: 17, d: 17, seed: 1 },
  { district: "finans", label: "Finans (glastorn)", type: "kontor", w: 19, d: 19, seed: 3 },
];

function Label({ text, y = -4 }: { text: string; y?: number }) {
  return (
    <Html position={[0, y, 14]} center zIndexRange={[10, 0]}>
      <div style={{
        pointerEvents: "none", whiteSpace: "nowrap", fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11, fontWeight: 700, color: "#e8e0cd", background: "rgba(20,26,32,0.85)",
        padding: "2px 8px", borderRadius: 4, border: "1px solid #c9a45c66",
      }}>{text}</div>
    </Html>
  );
}

function Slot({ x, z, label, children }: { x: number; z: number; label: string; children: ReactNode }) {
  return (
    <group position={[x, 0, z]}>
      <mesh receiveShadow position={[0, -0.06, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[34, 34]} />
        <meshStandardMaterial color="#b9bfae" />
      </mesh>
      {children}
      <Label text={label} />
    </group>
  );
}

const noop = {};

/** ?models&cam=x,y,z&tgt=x,y,z styr kameran – praktiskt för närbilder. */
function vec3Param(name: string, fallback: [number, number, number]): [number, number, number] {
  const raw = new URLSearchParams(window.location.search).get(name);
  const p = raw?.split(",").map(Number) ?? [];
  return p.length === 3 && p.every((n) => Number.isFinite(n)) ? [p[0], p[1], p[2]] : fallback;
}

export function ModelGallery() {
  const cam = vec3Param("cam", [340, 420, -180]);
  const tgt = vec3Param("tgt", [140, 0, 260]);
  const rows: ReactNode[] = [];
  let rz = 0;

  // Distriktsfamiljer × varianter
  FAMILIES.forEach((f, fi) => {
    const parcel = mkParcel(f.district, `${f.district}-g${fi}`, f.w, f.d);
    const floors = districtFloors(parcel, f.seed * 7 + 3);
    VARIANTS.forEach(({ v, label }, vi) => {
      rows.push(
        <Slot key={`${fi}-${vi}`} x={vi * 44} z={rz} label={`${f.label} · ${label}`}>
          <DistrictBuilding
            parcel={parcel} type={f.type} floors={Math.min(floors, f.district === "finans" ? 24 : 14)} color="#b8a88a"
            windows selected={false} handlers={noop} seed={f.seed * 13 + 5} variant={v}
            solar={vi === 0}
          />
        </Slot>,
      );
    });
    rz += 48;
  });

  // Silhuettvarianter (massing-passet): hörntorn i gatukors, miljon-
  // programmets platta tak, vinkelvillan och podiumtornet – tomter och
  // seeds valda så att just de dragen garanterat triggas.
  const cornerParcel: Parcel = {
    ...mkParcel("centrum", "centrum-corner"),
    edges: { n: false, e: true, s: true, w: false },
  };
  rows.push(
    <Slot key="sil1" x={0} z={rz} label="Centrum · hörntorn (gatukors)">
      <DistrictBuilding parcel={cornerParcel} type="kontor" floors={7} color="#b8a88a"
        windows selected={false} handlers={noop} seed={83} variant="normal" />
    </Slot>,
    <Slot key="sil2" x={44} z={rz} label="Suburb · miljonprogram (platta tak)">
      <DistrictBuilding parcel={mkParcel("förort", "förort-mp", 24, 24)} type="bostad" floors={3} color="#b8a88a"
        windows selected={false} handlers={noop} seed={12} variant="normal" />
    </Slot>,
    <Slot key="sil3" x={88} z={rz} label="Villa · vinkelflygel">
      <DistrictBuilding parcel={mkParcel("kulle", "kulle-L", 10, 12)} type="bostad" floors={2} color="#c9b892"
        windows selected={false} handlers={noop} seed={9} variant="normal" />
    </Slot>,
    <Slot key="sil4" x={132} z={rz} label="Finans · podium + teknikvåning">
      <DistrictBuilding parcel={mkParcel("finans", "finans-podium", 19, 19)} type="kontor" floors={22} color="#b8a88a"
        windows selected={false} handlers={noop} seed={6} variant="normal" />
    </Slot>,
    <Slot key="sil5" x={176} z={rz} label="Tegel bostad · balkonger + brandtrappa">
      <DistrictBuilding parcel={mkParcel("innerstad", "innerstad-balk", 17, 17)} type="bostad" floors={5} color="#b8a88a"
        windows selected={false} handlers={noop} seed={21} variant="normal" />
    </Slot>,
  );
  rz += 48;

  // Morfars hus
  rows.push(
    <Slot key="arv" x={0} z={rz} label="Morfars hus (arvet)">
      <HeirloomHouse parcel={mkParcel("kulle", "kulle-arv", 10, 12)} type="bostad" floors={2}
        color="#c9b892" windows selected={false} handlers={noop} seed={7} variant="sliten" condition={30} />
    </Slot>,
  );
  // Industrier
  rows.push(
    <Slot key="hotell" x={44} z={rz} label="Hotell (4★)"><Hotel pc={{ w: 17, d: 17 }} stars={4} /></Slot>,
    <Slot key="lager" x={88} z={rz} label="Logistikterminal"><Warehouse pc={{ w: 27, d: 27 }} /></Slot>,
  );
  rz += 48;
  rows.push(
    <group key="sol" position={[0, 0, rz]}><SolarPark pc={{ w: 64, d: 44 }} /><Label text="Solar park (energy mode)" y={-3} /></group>,
    <group key="vind" position={[90, 0, rz]}><WindFarm pc={{ w: 64, d: 44 }} mw={15} /><Label text="Wind park (energy mode)" y={-3} /></group>,
  );
  rz += 70;
  // Signaturkvarter
  const b = { x: 0, z: 0, w: 52, d: 36 };
  rows.push(
    <group key="sig1" position={[0, 0, rz]}><OfficeCluster b={b} floors={20} /><Label text="Signatur: Kontorskluster" y={-3} /></group>,
    <group key="sig2" position={[90, 0, rz]}><ResidentialBlock b={b} floors={8} /><Label text="Signatur: Bostadskvarter" y={-3} /></group>,
    <group key="sig3" position={[180, 0, rz]}><CultureDistrict b={b} floors={5} /><Label text="Signature: Cultural quarter" y={-3} /></group>,
    <group key="sig4" position={[270, 0, rz]}><ConstructionSite b={b} progress={0.55} floors={12} /><Label text="Signatur: under bygge" y={-3} /></group>,
  );
  rz += 100;
  // Megaprojekt
  rows.push(
    <group key="m1" position={[0, 0, rz]}><Arena /><Label text="Megaprojekt: Imperium Arena" y={-3} /></group>,
    <group key="m2" position={[170, 0, rz]}><Campus /><Label text="Megaprojekt: Universitetscampus" y={-3} /></group>,
    <group key="m3" position={[320, 0, rz]}><Hospital /><Label text="Megaprojekt: Sjukhuskvarteret" y={-3} /></group>,
  );
  rz += 130;
  // Stadens landmärken (dekor med fasta platser på kartan)
  rows.push(
    <group key="lm1" position={[0, 0, rz]}><LmStadshus x={0} z={0} /><Label text="Landmärke: Stadshuset" y={-3} /></group>,
    <group key="lm2" position={[70, 0, rz]}><LmKyrka x={0} z={0} /><Label text="Landmärke: Kyrkan" y={-3} /></group>,
    <group key="lm3" position={[150, 0, rz]}><LmVattentorn x={0} z={0} /><Label text="Landmärke: Vattentornet" y={-3} /></group>,
    <group key="lm4" position={[230, 0, rz]}><LmSkorsten x={0} z={0} /><Label text="Landmärke: Fabriksskorstenen" y={-3} /></group>,
    <group key="lm5" position={[330, 0, rz]}><LmStadspark x={0} z={0} /><Label text="Landmärke: Stadsparken" y={-3} /></group>,
    <group key="lm6" position={[460, 0, rz]}><LmArena x={0} z={0} /><Label text="Landmärke: Idrottsarenan" y={-3} /></group>,
    <group key="lm7" position={[600, 0, rz]}><LmPariserhjul x={0} z={0} /><Label text="Landmärke: Pariserhjulet" y={-3} /></group>,
    <group key="lm8" position={[807, 0, rz - 305]}><HarborTerminal /></group>,
    <group key="lm8b" position={[770, 0, rz]}><Label text="Landmärke: Hamnterminalen" y={-3} /></group>,
  );
  rz += 90;
  // Ägarlyx (positionerar sig själva i världskoordinater vid HK → offsetta hit)
  rows.push(
    <group key="lux1" position={[225, 0, rz - 244]}><SportsCar /></group>,
    <group key="lux1b" position={[0, 0, rz]}><Label text="Ägarlyx: Sportbilen (kör varv)" y={-2} /></group>,
    <group key="lux2" position={[275, 0, rz - 201]}><Helicopter /></group>,
    <group key="lux2b" position={[70, 0, rz]}><Label text="Ägarlyx: Helikoptern" y={-2} /></group>,
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#141a20" }}>
      <div style={{
        position: "absolute", top: 10, left: 14, zIndex: 10, color: "#e8e0cd",
        fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13,
      }}>
        <strong>MODELLBIBLIOTEK</strong> · dra för att panorera, scrolla för zoom · ?models
      </div>
      <Canvas shadows camera={{ position: cam, fov: 40, near: 1, far: 4000 }}>
        <ambientLight intensity={0.55} />
        <hemisphereLight args={["#bfd6ea", "#939781", 0.6]} />
        <directionalLight position={[120, 160, 80]} color="#ffe7c4" intensity={1.4} castShadow
          shadow-mapSize={[2048, 2048]} shadow-camera-left={-300} shadow-camera-right={300}
          shadow-camera-top={300} shadow-camera-bottom={-300} />
        <mesh receiveShadow position={[120, -0.2, 250]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[1400, 1400]} />
          <meshStandardMaterial color="#9aa08e" />
        </mesh>
        <MapControls makeDefault target={tgt} enableDamping dampingFactor={0.1} maxPolarAngle={Math.PI / 2.2} minDistance={20} maxDistance={1400} zoomToCursor />
        {rows}
      </Canvas>
    </div>
  );
}
