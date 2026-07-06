import { Html, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Color, MeshStandardMaterial, type Group, type Mesh } from "three";
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
  TREE_GREENS,
  TREE_TRUNK,
  TYPE_COLORS,
} from "./colors";
import { windowTexture } from "./textures";

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
 * Färdiga hus får procedurell fönstertextur på fasaderna och mörkare tak.
 */
function AnimatedBuilding({
  spec,
  selected,
  handlers,
  windows,
}: {
  spec: BuildingSpec;
  selected: boolean;
  handlers: PointerHandlers;
  windows: boolean;
}) {
  const ref = useRef<Mesh>(null);

  const { side, top } = useMemo(() => {
    const sideMat = new MeshStandardMaterial({ color: spec.color });
    if (windows) {
      const floors = Math.max(1, Math.round(spec.fullH / FLOOR_HEIGHT));
      const cols = Math.max(2, Math.round(spec.w / 5));
      sideMat.map = windowTexture(cols, floors);
    }
    const topMat = new MeshStandardMaterial({
      color: new Color(spec.color).multiplyScalar(0.72),
    });
    return { side: sideMat, top: topMat };
  }, [spec.color, spec.fullH, spec.w, windows]);

  useEffect(
    () => () => {
      side.map?.dispose();
      side.dispose();
      top.dispose();
    },
    [side, top],
  );

  useEffect(() => {
    for (const m of [side, top]) {
      m.emissive.set(selected ? "#ffffff" : "#000000");
      m.emissiveIntensity = selected ? 0.18 : 0;
    }
  }, [selected, side, top]);

  // Materialordning för boxGeometry: +x, −x, +y (tak), −y, +z, −z.
  const materials = useMemo(() => [side, side, top, top, side, side], [side, top]);

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
    <mesh ref={ref} material={materials} castShadow receiveShadow {...handlers}>
      <boxGeometry args={[spec.w, spec.fullH, spec.d]} />
    </mesh>
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

  const isPark = !building && !content;

  return (
    <group position={[parcel.x, 0, parcel.z]}>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.04, 0]} {...handlers}>
        <planeGeometry args={[parcel.w + 5, parcel.d + 5]} />
        <meshStandardMaterial color={isPark ? "#c3cdb4" : PAD} />
      </mesh>
      {ringColor && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.09, 0]}>
          <ringGeometry args={[parcel.w / 2 + 0.6, parcel.w / 2 + 2.4, 40]} />
          <meshBasicMaterial color={ringColor} />
        </mesh>
      )}
      {building && (
        <AnimatedBuilding
          spec={building}
          selected={selected}
          handlers={handlers}
          windows={!underConstruction}
        />
      )}
      {isPark && <ParcelTrees hash={hash} />}
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
