import { Html, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { Color, type Group } from "three";
import type { Parcel } from "../engine/city";
import { parcelHash } from "../engine/city";
import { PROP_TYPES } from "../engine/data";
import { msek } from "../engine/format";
import type { Lot, Property, PropTypeKey } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import {
  AMBIENT_COLORS,
  CONSTRUCTION,
  PAD,
  RING_COLORS,
  RIVAL_COLORS,
  TREE_GREENS,
  TREE_TRUNK,
  TYPE_COLORS,
} from "./colors";
import {
  ConstructionShell,
  FLOOR_HEIGHT,
  TypedBuilding,
  type PointerHandlers,
} from "./BuildingShapes";

/** Vad som står på en tomtruta enligt speltillståndet. */
export type ParcelContent =
  | { kind: "owned"; prop: Property }
  | { kind: "listing"; prop: Property }
  | { kind: "lotForSale"; lot: Lot }
  | { kind: "lotOwned"; lot: Lot }
  | { kind: "rival"; prop: Property; owner: string; ownerIndex: number };

const CRANE_COLOR = "#d98e2b";

function floorsFor(area: number): number {
  return Math.max(1, Math.min(12, Math.round(area / 450)));
}

/** Fasadfärg som mörknar/gråtonas när skicket sjunker. */
function facadeColor(base: string, condition: number): string {
  const c = new Color(base);
  c.lerp(new Color("#6f6a61"), ((100 - condition) / 100) * 0.55);
  return `#${c.getHexString()}`;
}

/** Distriktstypisk bebyggelse för dekorativa rutor. */
function ambientType(district: string, hash: number): PropTypeKey {
  const r = hash % 100;
  switch (district) {
    case "kulle":
      return "bostad"; // villakvarter
    case "centrum":
      return r < 50 ? "kontor" : r < 80 ? "butik" : "bostad";
    case "industri":
      return r < 75 ? "industri" : "kontor";
    case "hamnen":
      return r < 40 ? "industri" : r < 70 ? "kontor" : "butik";
    default:
      return r < 55 ? "bostad" : r < 80 ? "butik" : "industri"; // förort
  }
}

function ambientFloors(district: string, hash: number): number {
  switch (district) {
    case "kulle":
      return 1 + (hash % 2); // villor
    case "centrum":
      return 3 + (hash % 6);
    default:
      return 1 + (hash % 4);
  }
}

function tooltipFor(content: ParcelContent): { title: string; sub: string } {
  switch (content.kind) {
    case "listing":
      return {
        title: `${content.prop.typeLabel} · ${msek(content.prop.askPrice)}`,
        sub: `${content.prop.districtName} · till salu`,
      };
    case "owned": {
      const p = content.prop;
      return {
        title: p.typeLabel,
        sub:
          p.status === "bygger"
            ? `Bygger – klart om ${p.buildLeft} mån`
            : p.tenants.length === 0
              ? "Vakant – hyr ut!"
              : `${p.tenants.length}/${p.capacity} uthyrda`,
      };
    }
    case "lotForSale":
      return {
        title: `Tomt · ${msek(content.lot.price)}`,
        sub: `${content.lot.districtName} · ${content.lot.area} m²`,
      };
    case "lotOwned":
      return { title: "Min tomt", sub: `${content.lot.districtName} · redo att bebyggas` };
    case "rival":
      return { title: content.prop.typeLabel, sub: `Ägs av ${content.owner}` };
  }
}

const TOOLTIP_STYLE: React.CSSProperties = {
  pointerEvents: "none",
  background: "rgba(26,26,26,0.92)",
  color: "#fff",
  padding: "6px 10px",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "'Inter', system-ui, sans-serif",
  whiteSpace: "nowrap",
  textAlign: "center",
  transform: "translateY(-6px)",
};

/** Byggkran med långsamt roterande arm – står vid pågående byggen. */
function Crane({ towerH }: { towerH: number }) {
  const jib = useRef<Group>(null);
  useFrame((_, dt) => {
    if (jib.current) jib.current.rotation.y += dt * 0.25;
  });
  return (
    <group position={[11, 0, 11]}>
      <mesh castShadow position={[0, towerH / 2, 0]}>
        <boxGeometry args={[1, towerH, 1]} />
        <meshStandardMaterial color={CRANE_COLOR} />
      </mesh>
      <group ref={jib} position={[0, towerH, 0]}>
        <mesh castShadow position={[5.5, 0.4, 0]}>
          <boxGeometry args={[13, 0.8, 0.8]} />
          <meshStandardMaterial color={CRANE_COLOR} />
        </mesh>
        <mesh position={[10, -2.6, 0]}>
          <boxGeometry args={[0.15, 5.2, 0.15]} />
          <meshStandardMaterial color="#555555" />
        </mesh>
      </group>
    </group>
  );
}

/** Ett enkelt lågpolyträd. */
function Tree({ x, z, scale, green }: { x: number; z: number; scale: number; green: string }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh castShadow position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.35, 0.5, 2.2, 6]} />
        <meshStandardMaterial color={TREE_TRUNK} />
      </mesh>
      <mesh castShadow position={[0, 3.5, 0]}>
        <coneGeometry args={[2.5, 4.6, 7]} />
        <meshStandardMaterial color={green} />
      </mesh>
    </group>
  );
}

/** Träddunge på obebyggda rutor – gör tomrummen till små parker. */
function ParcelTrees({ hash }: { hash: number }) {
  const trees = 1 + (hash % 2);
  return (
    <>
      {Array.from({ length: trees }, (_, i) => {
        const h = (hash >> (i * 5 + 3)) & 0xff;
        return (
          <Tree
            key={i}
            x={((h % 13) - 6) * 0.9}
            z={(((h >> 3) % 13) - 6) * 0.9}
            scale={0.85 + ((h >> 5) % 4) * 0.12}
            green={TREE_GREENS[(h >> 2) % TREE_GREENS.length]}
          />
        );
      })}
    </>
  );
}

/** En tomtruta med trottoarkant, ev. byggnad, markeringsring och tooltip. */
export function ParcelNode({ parcel, content }: { parcel: Parcel; content?: ParcelContent }) {
  const selected = useUiStore((s) => s.selectedParcelId === parcel.id);
  const select = useUiStore((s) => s.select);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && !!content);

  const hash = parcelHash(parcel.id);
  const hasAmbient = !content && hash % 100 < 58;

  const handlers: PointerHandlers = content
    ? {
        onClick: (e) => {
          e.stopPropagation();
          select(parcel.id);
        },
        onPointerOver: (e) => {
          e.stopPropagation();
          setHovered(true);
        },
        onPointerOut: () => setHovered(false),
      }
    : {};

  // Byggnadsdata
  let building: {
    type: PropTypeKey;
    floors: number;
    color: string;
    windows: boolean;
  } | null = null;
  let underConstruction = false;
  let constructionProgress = 1;
  if (content && "prop" in content) {
    const p = content.prop;
    underConstruction = p.status === "bygger";
    constructionProgress = underConstruction
      ? Math.max(0.08, 1 - p.buildLeft / PROP_TYPES[p.type].buildMonths)
      : 1;
    building = {
      type: p.type,
      floors: floorsFor(p.area),
      color:
        content.kind === "rival"
          ? RIVAL_COLORS[content.ownerIndex % RIVAL_COLORS.length]
          : facadeColor(TYPE_COLORS[p.type], p.condition),
      windows: true,
    };
  } else if (hasAmbient) {
    building = {
      type: ambientType(parcel.district, hash),
      floors: ambientFloors(parcel.district, hash),
      color: AMBIENT_COLORS[(hash >> 2) % AMBIENT_COLORS.length],
      windows: true,
    };
  }
  const fullH = building ? building.floors * FLOOR_HEIGHT : 0;

  const ringColor = selected ? RING_COLORS.selected : content ? RING_COLORS[content.kind] : null;
  const vacantOwned =
    content?.kind === "owned" &&
    content.prop.status === "klar" &&
    content.prop.tenants.length === 0;
  const isPark = !building && !content;
  const bw = parcel.w - 4;
  const bd = parcel.d - 4;

  return (
    <group position={[parcel.x, 0, parcel.z]}>
      {/* Trottoarkant – upphöjd kvartersplatta */}
      <mesh receiveShadow castShadow position={[0, 0.11, 0]} {...handlers}>
        <boxGeometry args={[parcel.w + 5, 0.22, parcel.d + 5]} />
        <meshStandardMaterial color={isPark ? "#c3cdb4" : PAD} />
      </mesh>
      {ringColor && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.26, 0]}>
          <ringGeometry args={[parcel.w / 2 + 0.6, parcel.w / 2 + 2.4, 40]} />
          <meshBasicMaterial color={ringColor} />
        </mesh>
      )}
      <group position={[0, 0.22, 0]}>
        {building && underConstruction && (
          <ConstructionShell
            w={bw}
            d={bd}
            fullH={fullH}
            targetScale={constructionProgress}
            color={CONSTRUCTION}
            handlers={handlers}
          />
        )}
        {building && !underConstruction && (
          <TypedBuilding
            type={building.type}
            floors={building.floors}
            w={bw}
            d={bd}
            color={building.color}
            windows={building.windows}
            selected={selected}
            handlers={handlers}
            seed={hash >> 3}
          />
        )}
        {isPark && <ParcelTrees hash={hash} />}
        {underConstruction && building && <Crane towerH={fullH + 7} />}
        {vacantOwned && building && (
          <mesh position={[0, fullH + 1.6, 0]}>
            <boxGeometry args={[1.7, 1.7, 1.7]} />
            <meshBasicMaterial color="#d23f2e" />
          </mesh>
        )}
      </group>
      {hovered && content && (
        <Html
          position={[0, (building ? fullH * constructionProgress : 0) + 5.5, 0]}
          center
          zIndexRange={[40, 0]}
        >
          <div style={TOOLTIP_STYLE}>
            <strong>{tooltipFor(content).title}</strong>
            <br />
            <span style={{ opacity: 0.8 }}>{tooltipFor(content).sub}</span>
          </div>
        </Html>
      )}
    </group>
  );
}
