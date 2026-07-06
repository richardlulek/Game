import { Html, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef, useState } from "react";
import { Color, type Group, type Mesh } from "three";
import type { Parcel } from "../engine/city";
import { parcelHash } from "../engine/city";
import { PROP_TYPES } from "../engine/data";
import { msek } from "../engine/format";
import type { Lot, Property, RivalHolding } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import {
  AMBIENT_COLORS,
  CONSTRUCTION,
  PAD,
  RING_COLORS,
  RIVAL_COLORS,
  TYPE_COLORS,
} from "./colors";

/** Vad som står på en tomtruta enligt speltillståndet. */
export type ParcelContent =
  | { kind: "owned"; prop: Property }
  | { kind: "listing"; prop: Property }
  | { kind: "lotForSale"; lot: Lot }
  | { kind: "lotOwned"; lot: Lot }
  | { kind: "rival"; holding: RivalHolding; owner: string; ownerIndex: number };

const FLOOR_HEIGHT = 3;
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

function tooltipFor(content: ParcelContent): { title: string; sub: string } {
  switch (content.kind) {
    case "listing":
      return {
        title: `${content.prop.typeLabel} · ${msek(content.prop.askPrice)}`,
        sub: `${content.prop.districtName} · till salu`,
      };
    case "owned":
      return {
        title: content.prop.typeLabel,
        sub:
          content.prop.status === "bygger"
            ? `Bygger – klart om ${content.prop.buildLeft} mån`
            : content.prop.tenant
              ? `Uthyrd till ${content.prop.tenant.name}`
              : "Vakant – hyr ut!",
      };
    case "lotForSale":
      return {
        title: `Tomt · ${msek(content.lot.price)}`,
        sub: `${content.lot.districtName} · ${content.lot.area} m²`,
      };
    case "lotOwned":
      return { title: "Min tomt", sub: `${content.lot.districtName} · redo att bebyggas` };
    case "rival":
      return { title: content.holding.typeLabel, sub: `Ägs av ${content.owner}` };
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

interface BuildingSpec {
  w: number;
  d: number;
  fullH: number;
  /** Andel av full höjd (byggprogression), 1 för färdig byggnad. */
  targetScale: number;
  color: string;
}

interface PointerHandlers {
  onClick?: (e: { stopPropagation: () => void }) => void;
  onPointerOver?: (e: { stopPropagation: () => void }) => void;
  onPointerOut?: () => void;
}

/**
 * Byggnadskropp med mjukt animerad höjd. Skalan sätts aldrig som
 * React-prop – den ägs av useFrame så att månadsticks inte nollställer
 * animationen. Nya byggnader växer upp ur marken vid mount.
 */
function AnimatedBuilding({
  spec,
  selected,
  handlers,
}: {
  spec: BuildingSpec;
  selected: boolean;
  handlers: PointerHandlers;
}) {
  const ref = useRef<Mesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (m) {
      m.scale.y = 0.05;
      m.position.y = (spec.fullH * 0.05) / 2 + 0.04;
    }
  }, [spec.fullH]);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const next = m.scale.y + (spec.targetScale - m.scale.y) * Math.min(1, dt * 3);
    m.scale.y = next;
    m.position.y = (spec.fullH * next) / 2 + 0.04;
  });
  return (
    <mesh ref={ref} castShadow receiveShadow {...handlers}>
      <boxGeometry args={[spec.w, spec.fullH, spec.d]} />
      <meshStandardMaterial
        color={spec.color}
        emissive={selected ? "#ffffff" : "#000000"}
        emissiveIntensity={selected ? 0.18 : 0}
      />
    </mesh>
  );
}

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

/** En tomtruta med ev. byggnad, markeringsring och hover-tooltip. */
export function ParcelNode({ parcel, content }: { parcel: Parcel; content?: ParcelContent }) {
  const selected = useUiStore((s) => s.selectedParcelId === parcel.id);
  const select = useUiStore((s) => s.select);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && !!content);

  // Dekorativ bebyggelse på rutor som inte ingår i spelet.
  const hash = parcelHash(parcel.id);
  const ambientBuilding = !content && hash % 100 < 58;
  const ambientFloors =
    1 + (hash % 4) + (parcel.district === "centrum" ? 2 : 0) + ((hash >> 8) % 3);

  let building: BuildingSpec | null = null;
  let underConstruction = false;
  if (content && "prop" in content) {
    const p = content.prop;
    const fullH = floorsFor(p.area) * FLOOR_HEIGHT;
    underConstruction = p.status === "bygger";
    const progress = underConstruction
      ? Math.max(0.08, 1 - p.buildLeft / PROP_TYPES[p.type].buildMonths)
      : 1;
    building = {
      fullH,
      targetScale: progress,
      w: parcel.w - 4,
      d: parcel.d - 4,
      color: underConstruction ? CONSTRUCTION : facadeColor(TYPE_COLORS[p.type], p.condition),
    };
  } else if (content?.kind === "rival") {
    building = {
      fullH: floorsFor(content.holding.area) * FLOOR_HEIGHT,
      targetScale: 1,
      w: parcel.w - 4,
      d: parcel.d - 4,
      color: RIVAL_COLORS[content.ownerIndex % RIVAL_COLORS.length],
    };
  } else if (ambientBuilding) {
    building = {
      fullH: ambientFloors * FLOOR_HEIGHT,
      targetScale: 1,
      w: parcel.w - 6 - (hash % 5),
      d: parcel.d - 6 - ((hash >> 4) % 5),
      color: AMBIENT_COLORS[(hash >> 2) % AMBIENT_COLORS.length],
    };
  }

  const ringColor = selected ? RING_COLORS.selected : content ? RING_COLORS[content.kind] : null;

  const vacantOwned =
    content?.kind === "owned" && content.prop.status === "klar" && !content.prop.tenant;

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

  return (
    <group position={[parcel.x, 0, parcel.z]}>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.04, 0]} {...handlers}>
        <planeGeometry args={[parcel.w + 5, parcel.d + 5]} />
        <meshStandardMaterial color={PAD} />
      </mesh>
      {ringColor && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.09, 0]}>
          <ringGeometry args={[parcel.w / 2 + 0.6, parcel.w / 2 + 2.4, 40]} />
          <meshBasicMaterial color={ringColor} />
        </mesh>
      )}
      {building && <AnimatedBuilding spec={building} selected={selected} handlers={handlers} />}
      {underConstruction && building && <Crane towerH={building.fullH + 7} />}
      {vacantOwned && building && (
        <mesh position={[0, building.fullH + 1.2, 0]}>
          <boxGeometry args={[1.7, 1.7, 1.7]} />
          <meshBasicMaterial color="#d23f2e" />
        </mesh>
      )}
      {hovered && content && (
        <Html
          position={[0, (building ? building.fullH * building.targetScale : 0) + 5, 0]}
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
