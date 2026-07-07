import { Html, MapControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { Color } from "three";
import { DISTRICT_ZONES, PARCELS } from "../engine/city";
import { DISTRICTS } from "../engine/data";
import { propMarketValue, propNOI } from "../engine/property";
import type { GameState, Property } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import type { OverlayMode } from "../store/uiStore";
import { useUiStore } from "../store/uiStore";
import { CameraRig } from "./CameraRig";
import { Birds, Clouds, Harbor, InnerStreets, Landmarks } from "./CityExtras";
import { DISTRICT_TINTS, GROUND, SKY, WATER } from "./colors";
import type { ParcelContent } from "./ParcelNode";
import { ParcelNode } from "./ParcelNode";
import { LocalTraffic, Roads } from "./Roads";

const LABEL_STYLE: React.CSSProperties = {
  pointerEvents: "none",
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 3,
  textTransform: "uppercase",
  color: "#4c5551",
  whiteSpace: "nowrap",
  textShadow: "0 1px 3px rgba(255,255,255,0.7)",
};

function DistrictPlates() {
  return (
    <>
      {DISTRICT_ZONES.map((z) => (
        <group key={z.district} position={[z.x, 0, z.z]}>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} receiveShadow>
            <planeGeometry args={[z.w + 16, z.d + 16]} />
            <meshStandardMaterial color={DISTRICT_TINTS[z.district] ?? "#bcbcb0"} />
          </mesh>
          <Html position={[0, 1, -(z.d / 2 + 16)]} center zIndexRange={[20, 0]}>
            <div style={LABEL_STYLE}>
              {DISTRICTS.find((d) => d.id === z.district)?.name ?? z.district}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}

/** Grön→röd tint efter vald metrik (1 = grönt, 0 = rött). */
function overlayTint(p: Property, state: GameState, mode: OverlayMode): string {
  let score = 1;
  if (mode === "vakans") score = p.capacity ? p.tenants.length / p.capacity : 1;
  else if (mode === "skick") score = p.condition / 100;
  else if (mode === "avkastning")
    score = (propNOI(p, state) / Math.max(1, propMarketValue(p, state))) / 0.07;
  score = Math.max(0, Math.min(1, score));
  return `#${new Color().setHSL(0.33 * score, 0.62, 0.42).getHexString()}`;
}

function CityParcels() {
  const state = useGameStore((s) => s.state);
  const overlay = useUiStore((s) => s.overlay);
  const { portfolio, listings, lots, competitors } = state;

  const byParcel = useMemo(() => {
    const m = new Map<string, ParcelContent>();
    for (const p of portfolio)
      if (p.parcelId)
        m.set(p.parcelId, {
          kind: "owned",
          prop: p,
          tint: overlay !== "ingen" ? overlayTint(p, state, overlay) : undefined,
        });
    for (const p of listings) if (p.parcelId) m.set(p.parcelId, { kind: "listing", prop: p });
    for (const l of lots)
      if (l.parcelId) m.set(l.parcelId, { kind: l.owned ? "lotOwned" : "lotForSale", lot: l });
    competitors.forEach((c, i) => {
      for (const p of c.portfolio)
        if (p.parcelId) m.set(p.parcelId, { kind: "rival", prop: p, owner: c.name, ownerIndex: i });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, listings, lots, competitors, overlay, state.marketMod, state.demandMod]);

  return (
    <>
      {PARCELS.map((pc) => (
        <ParcelNode key={pc.id} parcel={pc} content={byParcel.get(pc.id)} />
      ))}
    </>
  );
}

/** Hela 3D-stadsvyn. Ren renderare av GameState – ingen spellogik här. */
export function CityCanvas() {
  const select = useUiStore((s) => s.select);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [200, 250, 340], fov: 38, near: 1, far: 3000 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 750, 1800]} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={["#dfe9f0", "#8a917f", 0.45]} />
      <directionalLight
        position={[240, 320, 140]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-450}
        shadow-camera-right={450}
        shadow-camera-top={450}
        shadow-camera-bottom={-450}
        shadow-camera-far={1200}
      />
      <MapControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.25}
        minDistance={60}
        maxDistance={1000}
      />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[2600, 2600]} />
        <meshStandardMaterial color={GROUND} />
      </mesh>
      {/* Vatten söder om Hamnen. */}
      <mesh rotation-x={-Math.PI / 2} position={[10, -0.02, 350]}>
        <planeGeometry args={[620, 160]} />
        <meshStandardMaterial color={WATER} />
      </mesh>
      <Roads />
      <DistrictPlates />
      <InnerStreets />
      <CityParcels />
      <Harbor />
      <Landmarks />
      <Clouds />
      <Birds />
      <LocalTraffic />
      <CameraRig />
    </Canvas>
  );
}
