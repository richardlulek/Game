import { Html, useCursor } from "@react-three/drei";
import { useState } from "react";
import type { Parcel } from "../engine/city";
import { parcelHash } from "../engine/city";
import { PROP_TYPES } from "../engine/data";
import { msek } from "../engine/format";
import type { Lot, Property } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import { AMBIENT_COLORS, CONSTRUCTION, PAD, RING_COLORS, TYPE_COLORS } from "./colors";

/** Vad som står på en tomtruta enligt speltillståndet. */
export type ParcelContent =
  | { kind: "owned"; prop: Property }
  | { kind: "listing"; prop: Property }
  | { kind: "lotForSale"; lot: Lot }
  | { kind: "lotOwned"; lot: Lot };

const FLOOR_HEIGHT = 3;

function floorsFor(area: number): number {
  return Math.max(1, Math.min(12, Math.round(area / 450)));
}

function buildingHeight(p: Property): number {
  const full = floorsFor(p.area) * FLOOR_HEIGHT;
  if (p.status !== "bygger") return full;
  const total = PROP_TYPES[p.type].buildMonths;
  const progress = 1 - p.buildLeft / total;
  return Math.max(1.5, full * progress);
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

  let building: { h: number; w: number; d: number; color: string } | null = null;
  if (content && "prop" in content) {
    const p = content.prop;
    building = {
      h: buildingHeight(p),
      w: parcel.w - 4,
      d: parcel.d - 4,
      color: p.status === "bygger" ? CONSTRUCTION : TYPE_COLORS[p.type],
    };
  } else if (ambientBuilding) {
    building = {
      h: ambientFloors * FLOOR_HEIGHT,
      w: parcel.w - 6 - (hash % 5),
      d: parcel.d - 6 - ((hash >> 4) % 5),
      color: AMBIENT_COLORS[(hash >> 2) % AMBIENT_COLORS.length],
    };
  }

  const ringColor = selected ? RING_COLORS.selected : content ? RING_COLORS[content.kind] : null;

  const vacantOwned =
    content?.kind === "owned" && content.prop.status === "klar" && !content.prop.tenant;

  const interactive = !!content;
  const handlers = interactive
    ? {
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          select(parcel.id);
        },
        onPointerOver: (e: { stopPropagation: () => void }) => {
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
      {building && (
        <mesh castShadow receiveShadow position={[0, building.h / 2 + 0.04, 0]} {...handlers}>
          <boxGeometry args={[building.w, building.h, building.d]} />
          <meshStandardMaterial
            color={building.color}
            emissive={selected ? "#ffffff" : "#000000"}
            emissiveIntensity={selected ? 0.18 : 0}
          />
        </mesh>
      )}
      {vacantOwned && building && (
        <mesh position={[0, building.h + 1.2, 0]}>
          <boxGeometry args={[1.7, 1.7, 1.7]} />
          <meshBasicMaterial color="#d23f2e" />
        </mesh>
      )}
      {hovered && content && (
        <Html position={[0, (building?.h ?? 0) + 5, 0]} center zIndexRange={[40, 0]}>
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
