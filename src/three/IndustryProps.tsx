import {WorkplaceFacade} from "./WorkplaceFacade";
import { FacadeStructure } from "./FacadeStructure";
/* Industrierna på kartan – hotell, energiparker och logistikterminaler
   står på sina tomtrutor som allt annat och ger staden liv:
   · Hotell     torn efter stjärnnivå med entrémarkis och takskylt
   · Sol        panelrader i prydliga räta led
   · Vind       roterande turbiner (2–3 st efter MW)
   · Logistik   lågt lagerskepp med portar och containerstaplar
   Klick öppnar Industri-fönstret (ägda) eller industrimarknaden
   (till salu). Beacon: 🔵 ägd, 🏷️ till salu – som fastigheterna. */

import { Html, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { MeshStandardMaterial, type Group } from "three";
import { parcelById } from "../engine/city";
import { ENERGY_SITES } from "../engine/industryData";
import type { IndustryAsset } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { facadeBoxGeometry } from "./BuildingShapes";
import { iconTexture } from "./textures";
import { facadeEmissiveTexture, facadeTexture, windowEmissiveTexture, windowTexture } from "./textures";

const CREAM = "#e8e0cd";
const PANEL = "#2e4a6b";
const STEEL = "#c9ced4";

/** Fasadmaterial med fönsterrutnät (memoiserat per storlek). */
function useFacade(color: string, cols: number, floors: number) {
  return useMemo(() => {
    const m = new MeshStandardMaterial({ color, roughness: 0.7 });
    m.map = windowTexture(Math.max(2, cols), Math.max(2, floors));
    m.emissiveMap = windowEmissiveTexture(Math.max(2, cols), Math.max(2, floors));
    m.emissive.set("#ffffff");
    m.emissiveIntensity = 0.5;
    return m;
  }, [color, cols, floors]);
}

export function Hotel({ pc, stars }: { pc: { w: number; d: number }; stars: number }) {
  const floors = 3 + stars * 2;
  const h = floors * 3;
  const w = pc.w * 0.72, d = pc.d * 0.72;
  const facade = useFacade(CREAM, Math.round(w / 3), floors);
  return (
    <group>
      <FacadeStructure kind="masonry" volumes={[{ w, d, h }]} />
      <mesh castShadow receiveShadow material={facade} position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {/* Burgundytak + guldskylt */}
      <mesh castShadow position={[0, h + 0.4, 0]}>
        <boxGeometry args={[w + 0.6, 0.8, d + 0.6]} />
        <meshStandardMaterial color="#6e1a2a" roughness={0.8} />
      </mesh>
      <mesh position={[0, h + 1.6, 0]}>
        <boxGeometry args={[Math.min(6, w * 0.6), 1.4, 0.4]} />
        <meshStandardMaterial color="#c9a13b" emissive="#c9a13b" emissiveIntensity={0.35} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Entrémarkis med glasad entré och stjärnklass ovanför */}
      <mesh castShadow position={[0, 2.6, d / 2 + 1]}>
        <boxGeometry args={[4.4, 0.3, 2.2]} />
        <meshStandardMaterial color="#6e1a2a" />
      </mesh>
      {[[-1.8, 0], [1.8, 0]].map(([x], i) => (
        <mesh key={i} position={[x, 1.3, d / 2 + 1.8]}>
          <cylinderGeometry args={[0.1, 0.1, 2.6, 6]} />
          <meshStandardMaterial color="#c9a13b" metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.35, d / 2 + 0.08]}>
        <boxGeometry args={[3.6, 2.7, 0.25]} />
        <meshStandardMaterial color="#9fc0d4" metalness={0.4} roughness={0.25} emissive="#cfe0ec" emissiveIntensity={0.2} />
      </mesh>
      {Array.from({ length: stars }, (_, i) => (
        <mesh key={`s${i}`} position={[(i - (stars - 1) / 2) * 0.75, 3.7, d / 2 + 0.1]}>
          <boxGeometry args={[0.45, 0.45, 0.12]} />
          <meshStandardMaterial color="#c9a13b" emissive="#c9a13b" emissiveIntensity={0.3} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

export function SolarPark({ pc }: { pc: { w: number; d: number } }) {
  const rows = Math.max(3, Math.floor(pc.d / 6));
  const cols = Math.max(2, Math.floor(pc.w / 7));
  return (
    <group>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <group
            key={`${r}-${c}`}
            position={[-pc.w / 2 + (c + 0.5) * (pc.w / cols), 0.9, -pc.d / 2 + (r + 0.5) * (pc.d / rows)]}
            rotation-x={-0.5}
          >
            <mesh castShadow>
              <boxGeometry args={[pc.w / cols - 1.6, 0.15, 3.4]} />
              <meshStandardMaterial color={PANEL} roughness={0.35} metalness={0.4} />
            </mesh>
          </group>
        )),
      )}
      {/* Transformatorbod */}
      <mesh castShadow position={[pc.w / 2 - 2, 1, pc.d / 2 - 2]}>
        <boxGeometry args={[2.4, 2, 2]} />
        <meshStandardMaterial color="#9aa0a6" />
      </mesh>
      {/* Områdesstaket – halvtransparent grått läser som gunnebostängsel */}
      {([[0, -pc.d / 2, pc.w, 0.12], [0, pc.d / 2, pc.w, 0.12], [-pc.w / 2, 0, 0.12, pc.d], [pc.w / 2, 0, 0.12, pc.d]] as const).map(
        ([fx, fz, fw, fd], i) => (
          <mesh key={`f${i}`} position={[fx, 0.6, fz]}>
            <boxGeometry args={[fw, 1.2, fd]} />
            <meshStandardMaterial color="#9aa0a6" transparent opacity={0.45} metalness={0.3} roughness={0.6} />
          </mesh>
        ),
      )}
    </group>
  );
}

/** Ett vindkraftverk med roterande rotor. */
function Turbine({ x, z, h, phase }: { x: number; z: number; h: number; phase: number }) {
  const rotor = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (rotor.current) rotor.current.rotation.z = clock.elapsedTime * 1.4 + phase;
  });
  return (
    <group position={[x, 0, z]}>
      {/* Betongfundament */}
      <mesh receiveShadow position={[0, 0.15, 0]}>
        <cylinderGeometry args={[2.2, 2.6, 0.3, 10]} />
        <meshStandardMaterial color="#b9b4a8" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.35, 0.7, h, 8]} />
        <meshStandardMaterial color={STEEL} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, h, 1]}>
        <boxGeometry args={[1.4, 1.4, 2.6]} />
        <meshStandardMaterial color={STEEL} />
      </mesh>
      <group ref={rotor} position={[0, h, 2.2]}>
        {[0, 2.094, 4.189].map((a) => (
          <group key={a} rotation-z={a}>
            {/* Bladet utgår från navet – annars blir tre blad en sexarmad stjärna. */}
            <mesh castShadow position={[0, h * 0.31, 0]}>
              <boxGeometry args={[0.7, h * 0.62, 0.12]} />
              <meshStandardMaterial color="#f2f4f5" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

export function WindFarm({ pc, mw }: { pc: { w: number; d: number }; mw: number }) {
  const n = mw >= 10 ? 3 : 2;
  const h = Math.min(38, pc.w * 0.55);
  const spots: [number, number][] = n === 3
    ? [[-pc.w * 0.28, -pc.d * 0.22], [pc.w * 0.26, 0], [-pc.w * 0.1, pc.d * 0.28]]
    : [[-pc.w * 0.22, -pc.d * 0.15], [pc.w * 0.24, pc.d * 0.2]];
  return (
    <group>
      {spots.map(([x, z], i) => (
        <Turbine key={i} x={x} z={z} h={h} phase={i * 1.7} />
      ))}
    </group>
  );
}

export function Warehouse({ pc }: { pc: { w: number; d: number } }) {
  const w = pc.w * 0.82, d = pc.d * 0.62, h = 6;
  // Hallen bär industrifasadens profilplåt med högt fönsterband i stället
  // för att vara en naken grå låda; kontorsdelen på gaveln får kontorsglas.
  const hallMat = useMemo(() => new MeshStandardMaterial({color:"#b9bec4",roughness:.8,metalness:.12}), []);
  const officeMat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: CREAM, roughness: 0.74 });
    m.map = facadeTexture("kontor");
    m.emissiveMap = facadeEmissiveTexture("kontor");
    m.emissive.set("#ffffff");
    m.emissiveIntensity = 0.5;
    return m;
  }, []);
  return (
    <group>
      <group position={[0,0,-pc.d*.12]}><WorkplaceFacade w={w} d={d} h={h} color="#b9bec4" warehouse={false} sx={0} sz={1} entrance={false}/></group>
      <mesh castShadow receiveShadow material={hallMat} geometry={facadeBoxGeometry(w, h, d)} position={[0, h / 2, -pc.d * 0.12]} dispose={null} />
      {/* Företagsband i mörkblått längs takkanten */}
      <mesh position={[0, h - 0.45, -pc.d * 0.12]}>
        <boxGeometry args={[w + 0.12, 0.6, d + 0.12]} />
        <meshStandardMaterial color={PANEL} roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, h + 0.3, -pc.d * 0.12]}>
        <boxGeometry args={[w + 0.4, 0.6, d + 0.4]} />
        <meshStandardMaterial color="#7d838a" />
      </mesh>
      {/* Taklanterniner som släpper in dagsljus */}
      {[-d * 0.18, d * 0.18].map((sz) => (
        <mesh key={sz} position={[0, h + 0.68, -pc.d * 0.12 + sz]}>
          <boxGeometry args={[w * 0.7, 0.14, 1.1]} />
          <meshStandardMaterial color="#cfe0ec" roughness={0.35} emissive="#cfe0ec" emissiveIntensity={0.12} />
        </mesh>
      ))}
      {/* Kontorsdel på västra gaveln med fönster och entrédörr */}
      <mesh castShadow receiveShadow material={officeMat} geometry={facadeBoxGeometry(3.6, 5.4, d * 0.6)} position={[-w / 2 - 1.8, 2.7, -pc.d * 0.12]} dispose={null} />
      <mesh position={[-w / 2 - 1.8, 5.55, -pc.d * 0.12]}>
        <boxGeometry args={[3.9, 0.3, d * 0.6 + 0.3]} />
        <meshStandardMaterial color="#7d838a" />
      </mesh>
      <mesh position={[-w / 2 - 1.8, 1.0, -pc.d * 0.12 + d * 0.3 + 0.06]}>
        <boxGeometry args={[1.1, 2.0, 0.12]} />
        <meshStandardMaterial color="#4a4238" roughness={0.85} />
      </mesh>
      {/* Asfalterad lastgård framför portarna */}
      <mesh receiveShadow position={[0, 0.04, pc.d * 0.26]}>
        <boxGeometry args={[pc.w * 0.9, 0.08, pc.d * 0.42]} />
        <meshStandardMaterial color="#6b6f75" roughness={0.95} />
      </mesh>
      {/* Lastportar mot gården, under en genomgående portkanopi */}
      {Array.from({ length: Math.max(2, Math.floor(w / 5)) }, (_, i) => (
        <mesh key={i} position={[-w / 2 + (i + 0.5) * (w / Math.max(2, Math.floor(w / 5))), 1.8, -pc.d * 0.12 + d / 2 + 0.05]}>
          <boxGeometry args={[2.6, 3.6, 0.1]} />
          <meshStandardMaterial color="#5f6771" />
        </mesh>
      ))}
      <mesh castShadow position={[0, 4.15, -pc.d * 0.12 + d / 2 + 0.7]}>
        <boxGeometry args={[w * 0.94, 0.16, 1.5]} />
        <meshStandardMaterial color="#7d838a" />
      </mesh>
      {/* Takfläktar */}
      {[-w * 0.25, w * 0.2].map((vx) => (
        <mesh key={vx} castShadow position={[vx, h + 1.0, -pc.d * 0.12]}>
          <boxGeometry args={[1.6, 0.9, 1.3]} />
          <meshStandardMaterial color="#9aa0a4" metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {/* Containerstaplar på gården */}
      {([["#b34a3d", -0.28, 0], ["#3d6db3", -0.1, 0], ["#c99a3b", -0.19, 1]] as const).map(([col, kx, ky], i) => (
        <mesh key={i} castShadow position={[pc.w * (kx as number), 1.1 + (ky as number) * 2.2, pc.d * 0.34]}>
          <boxGeometry args={[5, 2.2, 2.2]} />
          <meshStandardMaterial color={col} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/** Fullskaligt energiläge utanför rutnätet (sol ~46×32 m, vind utspritt). */
const SITE_FOOTPRINT = { w: 64, d: 44 };

/** En industritillgång på sin plats: tomtruta (hotell/logistik) eller
 *  fast energiläge utanför rutnätet (sol-/vindparker). */
function IndustryNode({ asset, forSale, rivalOwner }: { asset: IndustryAsset; forSale: boolean; rivalOwner?: string }) {
  const requestOpen = useUiStore((s) => s.requestOpen);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const isEnergy = asset.sector === "energi";
  const site = isEnergy && asset.siteId ? ENERGY_SITES.find((s) => s.id === asset.siteId) : undefined;
  const parcel = !isEnergy && asset.parcelId ? parcelById(asset.parcelId) : undefined;
  const pos = site ?? parcel;
  if (!pos) return null;
  const pc: { w: number; d: number } = parcel ?? SITE_FOOTPRINT;
  const beaconY =
    asset.sector === "hotell" ? (3 + (asset.hotelMeta?.starRating ?? 2) * 2) * 3 + 6
    : isEnergy && asset.energyMeta?.subType === "vind" ? 48
    : isEnergy ? 16
    : 12;
  return (
    <group
      position={[pos.x, 0.14, pos.z]}
      onClick={(e) => {
        e.stopPropagation();
        requestOpen(rivalOwner ? "acquisition" : forSale ? "ind_marknad" : "industri");
      }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {asset.sector === "hotell" && <Hotel pc={pc} stars={asset.hotelMeta?.starRating ?? 2} />}
      {asset.sector === "energi" && (asset.energyMeta?.subType === "vind"
        ? <WindFarm pc={pc} mw={asset.energyMeta?.installedMW ?? 10} />
        : <SolarPark pc={pc} />)}
      {asset.sector === "logistik" && <Warehouse pc={pc} />}
      <sprite position={[0, beaconY, 0]} scale={forSale ? [7, 7, 1] : [4.6, 4.6, 1]} renderOrder={39}>
        <spriteMaterial map={iconTexture(rivalOwner ? "🔴" : forSale ? "🏷️" : "🔵", forSale ? "#ffce3a" : "rgba(255,252,244,0.95)")} transparent depthTest={false} />
      </sprite>
      {hovered && (
        <Html position={[0, beaconY - 3, 0]} center zIndexRange={[40, 0]}>
          <div style={{
            pointerEvents: "none", background: "rgba(26,26,26,0.92)", color: "#fff",
            padding: "6px 10px", borderRadius: 8, fontSize: 12,
            fontFamily: "'Inter', system-ui, sans-serif", whiteSpace: "nowrap", textAlign: "center",
          }}>
            <strong>{asset.name}</strong>
            <br />
            <span style={{ opacity: 0.8 }}>
              {rivalOwner
                ? `Owned by ${rivalOwner} – click to place a bid`
                : forSale
                  ? "Industry for sale – click for the market"
                  : "Your industry – click for overview"}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

/** Alla industrier på kartan: dina, till salu och rivalernas. */
export function IndustryProps() {
  const industryPortfolio = useGameStore((s) => s.state.industryPortfolio);
  const industryListings = useGameStore((s) => s.state.industryListings);
  const competitors = useGameStore((s) => s.state.competitors);
  return (
    <>
      {(industryPortfolio ?? []).map((a) => (
        <IndustryNode key={a.id} asset={a} forSale={false} />
      ))}
      {(industryListings ?? []).map((a) => (
        <IndustryNode key={a.id} asset={a} forSale />
      ))}
      {competitors.flatMap((c) =>
        (c.industries ?? []).map((a) => (
          <IndustryNode key={a.id} asset={a} forSale={false} rivalOwner={c.name} />
        )),
      )}
    </>
  );
}
