import { Html, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { Color, type Group } from "three";
import type { Parcel } from "../engine/city";
import { parcelHash } from "../engine/city";
import { PROP_TYPES } from "../engine/data";
import { msek } from "../engine/format";
import type { Lot, Property, PropTypeKey } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { CONSTRUCTION, RING_COLORS, RIVAL_COLORS, TREE_GREENS, TREE_TRUNK, TYPE_COLORS } from "./colors";
import { ConstructionShell, FLOOR_HEIGHT, GrowIn, type PointerHandlers } from "./BuildingShapes";
import { DistrictBuilding, ambientColorFor, districtFloors } from "./districtBuildings";

/** Vad som står på en tomtruta enligt speltillståndet. */
export type ParcelContent =
  | { kind: "owned"; prop: Property; tint?: string; blockOwned?: boolean }
  | { kind: "listing"; prop: Property }
  | { kind: "lotForSale"; lot: Lot }
  | { kind: "lotOwned"; lot: Lot }
  | { kind: "rival"; prop: Property; owner: string; ownerIndex: number };

const CRANE_COLOR = "#d98e2b";

/** Markfärg per distrikt: gårdssten i stan, gräs i ytterområdena. */
const PLOT_COLORS: Record<string, string> = {
  centrum: "#cfccc2",
  finans: "#c6c9cc",
  innerstad: "#ccc8bc",
  hamnen: "#b8b8ae",
  industri: "#a8a69a",
  förort: "#a9b892",
  kulle: "#adbb95",
};

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
    <group position={[9, 0, 9]}>
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

/** Träddunge på obebyggda rutor – gör tomrummen till små parker. */
function ParcelTrees({ hash, w, d }: { hash: number; w: number; d: number }) {
  const trees = 1 + (hash % 3);
  return (
    <>
      {Array.from({ length: trees }, (_, i) => {
        const h = (hash >> (i * 5 + 3)) & 0xff;
        return (
          <group
            key={i}
            position={[(((h % 13) - 6) / 13) * w * 0.7, 0, ((((h >> 3) % 13) - 6) / 13) * d * 0.7]}
            scale={0.85 + ((h >> 5) % 4) * 0.12}
          >
            <mesh castShadow position={[0, 1.1, 0]}>
              <cylinderGeometry args={[0.35, 0.5, 2.2, 6]} />
              <meshStandardMaterial color={TREE_TRUNK} />
            </mesh>
            <mesh castShadow position={[0, 3.5, 0]}>
              <coneGeometry args={[2.5, 4.6, 7]} />
              <meshStandardMaterial color={TREE_GREENS[(h >> 2) % TREE_GREENS.length]} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** Inhägnad expansionsmark: detaljplaneskylt och lantmätarpinnar. */
function LockedExpansion({ parcel }: { parcel: Parcel }) {
  return (
    <group position={[parcel.x, 0, parcel.z]}>
      <mesh receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[parcel.w, 0.1, parcel.d]} />
        <meshStandardMaterial color="#a7ae8b" />
      </mesh>
      {/* Lantmätarpinnar i hörnen */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} castShadow position={[sx * (parcel.w / 2 - 1.5), 0.9, sz * (parcel.d / 2 - 1.5)]}>
          <cylinderGeometry args={[0.12, 0.12, 1.8, 5]} />
          <meshStandardMaterial color="#c0392b" />
        </mesh>
      ))}
      {/* Detaljplaneskylt */}
      <group position={[0, 0, parcel.d / 2 - 3]}>
        <mesh castShadow position={[0, 1.6, 0]}>
          <cylinderGeometry args={[0.12, 0.15, 3.2, 6]} />
          <meshStandardMaterial color="#8a7a5a" />
        </mesh>
        <mesh castShadow position={[0, 3, 0]}>
          <boxGeometry args={[4.6, 2.2, 0.2]} />
          <meshStandardMaterial color="#e8dfc8" />
        </mesh>
      </group>
    </group>
  );
}

/** En tomtruta: markplatta, trottoar mot gatan, byggnad, ring, tooltip. */
export function ParcelNode({ parcel, content }: { parcel: Parcel; content?: ParcelContent }) {
  const selected = useUiStore((s) => s.selectedParcelId === parcel.id);
  const select = useUiStore((s) => s.select);
  const overlayActive = useUiStore((s) => s.overlay !== "ingen");
  const unlockedExpansion = useGameStore((s) =>
    parcel.expansion ? (s.state.unlockedBlocks ?? []).includes(parcel.blockId) : true,
  );
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && !!content);

  const hash = parcelHash(parcel.id);
  // Låst expansionsmark: inhägnat fält tills detaljplanen auktionerats ut.
  if (parcel.expansion && !unlockedExpansion) return <LockedExpansion parcel={parcel} />;
  // Täta distrikt fylls nästan helt av dekorativ bebyggelse.
  const ambientChance =
    parcel.district === "centrum" || parcel.district === "innerstad"
      ? 80
      : parcel.district === "finans" || parcel.district === "hamnen"
        ? 70
        : 58;
  const hasAmbient = !content && !parcel.expansion && hash % 100 < ambientChance;

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
  let building: { type: PropTypeKey; floors: number; color: string; windows: boolean } | null = null;
  let underConstruction = false;
  let constructionProgress = 1;
  if (content && "prop" in content) {
    const p = content.prop;
    underConstruction = p.status === "bygger";
    constructionProgress = underConstruction
      ? Math.max(0.08, 1 - p.buildLeft / PROP_TYPES[p.type].buildMonths)
      : 1;
    // Kartlager: egna hus färgas efter metrik, allt annat gråtonas.
    const baseColor =
      content.kind === "rival"
        ? RIVAL_COLORS[content.ownerIndex % RIVAL_COLORS.length]
        : facadeColor(TYPE_COLORS[p.type], p.condition);
    const color = overlayActive
      ? content.kind === "owned" && content.tint
        ? content.tint
        : "#a8adb0"
      : baseColor;
    building = {
      type: p.type,
      floors: districtFloors(parcel, hash, p.area),
      color,
      windows: !overlayActive,
    };
  } else if (hasAmbient) {
    building = {
      type: "bostad",
      floors: districtFloors(parcel, hash),
      color: overlayActive ? "#b0b4b0" : ambientColorFor(parcel.district, hash >> 2),
      windows: !overlayActive,
    };
  }
  const fullH = building ? building.floors * FLOOR_HEIGHT : 0;

  // Helägda kvarter markeras med guldring på varje ingående tomt.
  const ringColor = selected
    ? RING_COLORS.selected
    : content?.kind === "owned" && content.blockOwned
      ? "#e8c96a"
      : content
        ? RING_COLORS[content.kind]
        : null;
  const vacantOwned =
    content?.kind === "owned" &&
    content.prop.status === "klar" &&
    content.prop.tenants.length === 0;
  const isPark = !building && !content;
  const e = parcel.edges;

  return (
    <group position={[parcel.x, 0, parcel.z]}>
      {/* Markplatta (exakt tomtstorlek – grannar delar vägg i slutna kvarter) */}
      <mesh receiveShadow position={[0, 0.07, 0]} {...handlers}>
        <boxGeometry args={[parcel.w, 0.14, parcel.d]} />
        <meshStandardMaterial color={isPark ? "#a9bb94" : (PLOT_COLORS[parcel.district] ?? "#c8c5ba")} />
      </mesh>
      {/* Trottoar längs gatusidorna */}
      {e.n && (
        <mesh receiveShadow position={[0, 0.1, -parcel.d / 2 - 1.5]}>
          <boxGeometry args={[parcel.w + 3, 0.2, 3]} />
          <meshStandardMaterial color="#c3c0b4" />
        </mesh>
      )}
      {e.s && (
        <mesh receiveShadow position={[0, 0.1, parcel.d / 2 + 1.5]}>
          <boxGeometry args={[parcel.w + 3, 0.2, 3]} />
          <meshStandardMaterial color="#c3c0b4" />
        </mesh>
      )}
      {e.w && (
        <mesh receiveShadow position={[-parcel.w / 2 - 1.5, 0.1, 0]}>
          <boxGeometry args={[3, 0.2, parcel.d + 3]} />
          <meshStandardMaterial color="#c3c0b4" />
        </mesh>
      )}
      {e.e && (
        <mesh receiveShadow position={[parcel.w / 2 + 1.5, 0.1, 0]}>
          <boxGeometry args={[3, 0.2, parcel.d + 3]} />
          <meshStandardMaterial color="#c3c0b4" />
        </mesh>
      )}
      {ringColor && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.24, 0]}>
          <ringGeometry args={[Math.max(parcel.w, parcel.d) / 2 + 0.4, Math.max(parcel.w, parcel.d) / 2 + 2.2, 40]} />
          <meshBasicMaterial color={ringColor} />
        </mesh>
      )}
      <group position={[0, 0.14, 0]}>
        {building && underConstruction && (
          <ConstructionShell
            w={parcel.w * 0.9}
            d={parcel.d * 0.9}
            fullH={Math.min(fullH, 60)}
            targetScale={constructionProgress}
            color={CONSTRUCTION}
            handlers={handlers}
          />
        )}
        {building && !underConstruction && (
          <GrowIn handlers={{}}>
            <DistrictBuilding
              parcel={parcel}
              type={building.type}
              floors={building.floors}
              color={building.color}
              windows={building.windows}
              selected={selected}
              handlers={handlers}
              seed={hash >> 3}
            />
          </GrowIn>
        )}
        {isPark && <ParcelTrees hash={hash} w={parcel.w} d={parcel.d} />}
        {underConstruction && building && <Crane towerH={Math.min(fullH, 45) + 7} />}
        {vacantOwned && building && (
          <mesh position={[0, Math.min(fullH, 150) + 1.6, 0]}>
            <boxGeometry args={[1.7, 1.7, 1.7]} />
            <meshBasicMaterial color="#d23f2e" />
          </mesh>
        )}
      </group>
      {hovered && content && (
        <Html
          position={[0, (building ? Math.min(fullH, 62) * constructionProgress : 0) + 5.5, 0]}
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
