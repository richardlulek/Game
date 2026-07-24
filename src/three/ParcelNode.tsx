import { Html, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useRef, useState } from "react";
import { Color, Vector3, type Group, type Sprite, type SpriteMaterial } from "three";
import type { Parcel } from "../engine/city";
import { expansionByBlock, parcelHash } from "../engine/city";
import { PROP_TYPES } from "../engine/data";
import { msek } from "../engine/format";
import type { Lot, Property, PropTypeKey } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { CONSTRUCTION, PLOT_COLORS, PLOT_FALLBACK, RING_COLORS, RIVAL_COLORS, TYPE_COLORS } from "./colors";
import { ConstructionShell, FLOOR_HEIGHT, GrowIn, type PointerHandlers } from "./BuildingShapes";
import { DistrictBuilding, HeirloomHouse, districtFloors } from "./districtBuildings";
import { iconTexture, type FacadeVariant } from "./textures";

/** Vad som står på en tomtruta enligt speltillståndet. */
export type ParcelContent =
  | { kind: "owned"; prop: Property; tint?: string; blockOwned?: boolean; hasOffer?: boolean }
  | { kind: "listing"; prop: Property }
  | { kind: "lotForSale"; lot: Lot }
  | { kind: "lotOwned"; lot: Lot }
  | { kind: "rival"; prop: Property; owner: string; ownerIndex: number };

/** Max kamera→träffpunkt-avstånd för att visa hover-etiketten. Längre bort
    (utzoomat) blir etiketterna oläsbara och flimrar när pekaren glider över
    täta hus – då stängs de av. */
const HOVER_MAX_DIST = 480;

/** Markeringsringens radier. Tidigare var ringen bred (0.4 → 2.2, bredd 1.8);
 *  i tätbebyggda distrikt lade sig grannars ringar omlott till en rörig
 *  krokig grågloria kring husen. En smal lip (bredd 0.7) läser som en ren
 *  tomtmarkering utan att svälla ut över gatan. */
const ringArgs = (parcel: Parcel): [number, number, number] => {
  const r = Math.max(parcel.w, parcel.d) / 2;
  return [r + 0.4, r + 1.1, 48];
};

/** Alltid-synlig färgbeacon ovanför huset som visar ägarkategori (matchar
    kartlegenden): din, till salu, tomt, konkurrent. "Till salu" är en stor
    guldbricka med prislapp så köpobjekt syns tydligt (en liten gul prick var
    svår att upptäcka); övriga behåller sin lilla färgprick. */
const WHITE_BG = "rgba(255,252,244,0.95)";
function ownerBeacon(content: ParcelContent): { emoji: string; bg: string; scale: number } | null {
  switch (content.kind) {
    case "owned":
    case "lotOwned": return { emoji: "🔵", bg: WHITE_BG, scale: 4.6 };
    case "listing": return { emoji: "🏷️", bg: "#ffce3a", scale: 7.4 };
    case "lotForSale": return { emoji: "🟢", bg: WHITE_BG, scale: 5 };
    case "rival": return { emoji: "🔴", bg: WHITE_BG, scale: 4.6 };
    default: return null;
  }
}

/** Delad scratch-vektor för avståndsmätning (undviker alloc per frame). */
/** Kartikonerna har fast världsstorlek och blir enorma när kameran går ner
 *  på gatunivå (min-zoom 18). Hooken krymper och tonar ut spriten på nära
 *  håll så husdetaljerna syns i stället för en jätteikon.
 *
 *  Prestanda: en useFrame per markör × hundratals hus = tung per-bildruta-CPU.
 *  Toningen beror BARA på kameraavståndet, så vi hoppar över allt arbete när
 *  kameran (och boost) står stilla – vilket är det vanliga fallet under spel.
 *  Sprite-läget är statiskt, så världspositionen cachas efter första bildrutan
 *  i stället för att traversera matrishierarkin (getWorldPosition) varje frame. */
function useNearFade(baseScale: number, boost = 1) {
  const ref = useRef<Sprite>(null);
  const lastCam = useRef(new Vector3(Infinity, Infinity, Infinity));
  const lastBoost = useRef(-1);
  const worldPos = useRef<Vector3 | null>(null);
  useFrame(({ camera }) => {
    const sp = ref.current;
    if (!sp) return;
    // Kameran stilla och boost oförändrad → toningen är redan rätt, hoppa över.
    if (boost === lastBoost.current && camera.position.distanceToSquared(lastCam.current) < 0.02) return;
    lastCam.current.copy(camera.position);
    lastBoost.current = boost;
    if (!worldPos.current) worldPos.current = sp.getWorldPosition(new Vector3());
    const d = camera.position.distanceTo(worldPos.current);
    const NEAR = 130; // full storlek bortom detta
    const GONE = 26;  // helt borta närmare än detta
    const k = Math.max(0, Math.min(1, (d - GONE) / (NEAR - GONE)));
    const sc = baseScale * (0.35 + 0.65 * k) * boost;
    sp.scale.set(sc, sc, 1);
    (sp.material as SpriteMaterial).opacity = k;
    sp.visible = k > 0.02;
  });
  return ref;
}

/** Ägar-beaconen som sprite med närtoning. */
function BeaconSprite({ y, be }: { y: number; be: { emoji: string; bg: string; scale: number } }) {
  const ref = useNearFade(be.scale);
  return (
    <sprite ref={ref} position={[0, y, 0]} renderOrder={39}>
      <spriteMaterial map={iconTexture(be.emoji, be.bg)} transparent depthTest={false} />
    </sprite>
  );
}

/** Billboard-ikon ovanför huset: bud, vakans, till salu. Klick är en
 *  genväg – budinkorgen, hyresgästerna eller portföljen öppnas direkt. */
function StatusBadge({ emoji, y, order, onClick, title }: {
  emoji: string; y: number; order: number; onClick: () => void; title: string;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useNearFade(6, hovered ? 1.2 : 1);
  return (
    <sprite
      ref={ref}
      position={[0, y + order * 7, 0]}
      renderOrder={40 + order}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <spriteMaterial map={iconTexture(emoji)} transparent depthTest={false} />
      {hovered && (
        <Html center position={[0, 1.1, 0]} zIndexRange={[45, 0]}>
          <div style={TOOLTIP_STYLE}>{title}</div>
        </Html>
      )}
    </sprite>
  );
}

const CRANE_COLOR = "#d98e2b";

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
        sub: `${content.prop.districtName} · for sale`,
      };
    case "owned": {
      const p = content.prop;
      return {
        title: p.typeLabel,
        sub:
          p.status === "bygger"
            ? `Building – done in ${p.buildLeft} mo`
            : p.tenants.length === 0
              ? "Vacant – lease it!"
              : `${p.tenants.length}/${p.capacity} rented`,
      };
    }
    case "lotForSale":
      return {
        title: `Lot · ${msek(content.lot.price)}`,
        sub: `${content.lot.districtName} · ${content.lot.area} m²`,
      };
    case "lotOwned":
      return { title: "My lot", sub: `${content.lot.districtName} · ready to build` };
    case "rival":
      return { title: content.prop.typeLabel, sub: `Owned by ${content.owner}` };
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

/** Inhägnad expansionsmark. Två skepnader:
 *  · kommunal: lantmätarpinnar + detaljplaneskylt (auktioneras ut)
 *  · planområde: äng/åker med ett fåtal träd – privat råmark som
 *    spelaren kan köpa och driva egen detaljplan på.
 *  Klickbar: kartkortet visar köp-/planalternativen. */
function LockedExpansion({ parcel }: { parcel: Parcel }) {
  const select = useUiStore((s) => s.select);
  const selected = useUiStore((s) => s.selectedParcelId === parcel.id);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const isPlan = expansionByBlock(parcel.blockId)?.kind === "plan";
  const hash = parcelHash(parcel.id);

  const handlers: PointerHandlers = {
    onClick: (e) => {
      e.stopPropagation();
      select(parcel.id);
    },
    onPointerOver: (e) => {
      e.stopPropagation();
      setHovered(true);
    },
    onPointerOut: () => setHovered(false),
  };

  return (
    <group position={[parcel.x, 0, parcel.z]}>
      <mesh receiveShadow position={[0, 0.05, 0]} {...handlers}>
        <boxGeometry args={[parcel.w, 0.1, parcel.d]} />
        <meshStandardMaterial color={isPlan ? "#9db07a" : "#a7ae8b"} />
      </mesh>
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.24, 0]}>
          <ringGeometry args={ringArgs(parcel)} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
      {isPlan ? (
        // Råmark: några ängsträd och en gärdesgårdsstolpe.
        <>
          {[0, 1, 2].map((i) => {
            const h = (hash >> (i * 6 + 2)) & 0xff;
            const x = (((h % 11) - 5) / 11) * parcel.w * 0.62;
            const z = ((((h >> 4) % 11) - 5) / 11) * parcel.d * 0.62;
            const s = 0.7 + (h % 4) * 0.15;
            return (
              <group key={i} position={[x, 0, z]}>
                <mesh castShadow position={[0, 1.1 * s, 0]}>
                  <cylinderGeometry args={[0.3 * s, 0.45 * s, 2.2 * s, 5]} />
                  <meshStandardMaterial color="#7a5a3a" />
                </mesh>
                <mesh castShadow position={[0, 3.2 * s, 0]}>
                  <coneGeometry args={[2.2 * s, 4.2 * s, 6]} />
                  <meshStandardMaterial color="#6f8f57" />
                </mesh>
              </group>
            );
          })}
        </>
      ) : (
        <>
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
        </>
      )}
      {hovered && (
        <Html position={[0, 7, 0]} center zIndexRange={[40, 0]}>
          <div style={TOOLTIP_STYLE}>
            <strong>{isPlan ? "Raw land – plan area" : "Municipal land"}</strong>
            <br />
            <span style={{ opacity: 0.8 }}>
              {isPlan ? "Click to buy & zone" : "Released at plan auction"}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

/** En tomtruta: markplatta, trottoar mot gatan, byggnad, ring, tooltip. */
function ParcelNodeInner({ parcel, content }: { parcel: Parcel; content?: ParcelContent }) {
  const selected = useUiStore((s) => s.selectedParcelId === parcel.id);
  const select = useUiStore((s) => s.select);
  const requestOpen = useUiStore((s) => s.requestOpen);
  const overlayActive = useUiStore((s) => s.overlay !== "ingen");
  const lodFar = useUiStore((s) => s.lodFar);
  const unlockedExpansion = useGameStore((s) =>
    parcel.expansion ? (s.state.unlockedBlocks ?? []).includes(parcel.blockId) : true,
  );
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && !!content);

  const hash = parcelHash(parcel.id);
  // Låst expansionsmark: inhägnat fält tills detaljplanen auktionerats ut.
  if (parcel.expansion && !unlockedExpansion) return <LockedExpansion parcel={parcel} />;
  // Icke-interaktiva tomter (dekor, parker, mark) ritas billigt i
  // StaticCity – men ett valt privatägt hus får sin markeringsring här.
  if (!content) {
    if (!selected) return null;
    return (
      <group position={[parcel.x, 0, parcel.z]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.24, 0]}>
          <ringGeometry args={ringArgs(parcel)} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    );
  }

  const handlers: PointerHandlers = {
    onClick: (e) => {
      e.stopPropagation();
      select(parcel.id);
    },
    onPointerOver: (e) => {
      e.stopPropagation();
      // Visa inte namnetiketten på långt håll (flimrar och är oläsbar).
      if (typeof e.distance === "number" && e.distance > HOVER_MAX_DIST) return;
      setHovered(true);
    },
    onPointerOut: () => setHovered(false),
  };

  // Byggnadsdata
  let building: { type: PropTypeKey; floors: number; color: string; windows: boolean } | null = null;
  let underConstruction = false;
  let constructionProgress = 1;
  // Fasadens tillstånd speglar spelläget: vakant = släckt hus, fullt
  // uthyrt = tänt, lågt skick = smutsig/sliten fasad.
  let variant: FacadeVariant = "normal";
  let solar = false;
  // Signaturkvarter ritas av SignatureBlocks över HELA kvarteret –
  // standardhuset på mittentomten skulle krocka med arkitekturen.
  const isSignature = "prop" in content && !!content.prop.signature;
  if ("prop" in content && !isSignature) {
    const p = content.prop;
    underConstruction = p.status === "bygger";
    constructionProgress = underConstruction
      ? Math.max(0.08, 1 - p.buildLeft / PROP_TYPES[p.type].buildMonths)
      : 1;
    if (p.status === "klar") {
      if (p.condition < 40) variant = "sliten";
      else if (content.kind !== "rival" && p.capacity > 0 && p.tenants.length === 0) variant = "släckt";
      else if (content.kind === "owned" && p.tenants.length >= p.capacity) variant = "tänt";
      solar = content.kind === "owned" && (p.energyClass === "A" || p.energyClass === "B");
    }
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
      // Utbyggnadsprojekt (påbyggnad/nybyggnation) reser huset synligt högre.
      floors: districtFloors(parcel, hash, p.area) + (p.devLevel ?? 0) * 2,
      color,
      windows: !overlayActive,
    };
  }
  // Signaturkvarterets ikoner/etiketter svävar över tornen (ritas separat).
  const fullH = building ? building.floors * FLOOR_HEIGHT : isSignature ? 46 : 0;

  // Helägda kvarter markeras med guldring på varje ingående tomt.
  // Konkurrenttomter får ingen markring i vila – deras röda beacon räcker,
  // och de täta rivalklustren i city slapp därmed den krokiga gråglorian.
  const ringColor = selected
    ? RING_COLORS.selected
    : content.kind === "rival"
      ? null
      : content.kind === "owned" && content.blockOwned
        ? "#e8c96a"
        : RING_COLORS[content.kind];
  // Statusikoner ovanför husen (ägda, färdiga): 📨 inkommet bud,
  // 🔑 lediga platser, 🏷️ utannonserad till försäljning. Klick öppnar
  // rätt vy direkt (budinkorg / hyresgäster / portfölj).
  const badges: { emoji: string; title: string; action: () => void }[] = [];
  if (content.kind === "owned" && content.prop.status === "klar") {
    if (content.hasOffer)
      badges.push({ emoji: "📨", title: "Bid waiting – open the inbox", action: () => requestOpen("offers") });
    if (content.prop.tenants.length < content.prop.capacity)
      badges.push({
        emoji: "🔑",
        title: `${content.prop.capacity - content.prop.tenants.length} vacancies – open Tenants`,
        action: () => {
          select(parcel.id);
          requestOpen("tenants");
        },
      });
    if (content.prop.forSale)
      badges.push({
        emoji: "🏷️",
        title: "For sale – open Portfolio",
        action: () => {
          select(parcel.id);
          requestOpen("portfolio");
        },
      });
  }

  return (
    <group position={[parcel.x, 0, parcel.z]}>
      {/* Markplatta (exakt tomtstorlek – klickytan för tomten) */}
      <mesh receiveShadow position={[0, 0.07, 0]} {...handlers}>
        <boxGeometry args={[parcel.w, 0.14, parcel.d]} />
        <meshStandardMaterial color={PLOT_COLORS[parcel.district] ?? PLOT_FALLBACK} />
      </mesh>
      {ringColor && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.24, 0]}>
          <ringGeometry args={ringArgs(parcel)} />
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
            {"prop" in content && content.prop.storyTag === "arvet" ? (
              /* Morfars hus: unik modell med tillbyggnader, presenning och flaggstång. */
              <HeirloomHouse
                parcel={parcel}
                type={building.type}
                floors={building.floors}
                color={building.color}
                windows={building.windows}
                selected={selected}
                handlers={handlers}
                seed={hash >> 3}
                variant={variant}
                condition={content.prop.condition}
              />
            ) : (
              <DistrictBuilding
                parcel={parcel}
                type={building.type}
                floors={building.floors}
                color={building.color}
                windows={building.windows}
                selected={selected}
                handlers={handlers}
                seed={hash >> 3}
                variant={variant}
                solar={solar}
              />
            )}
          </GrowIn>
        )}
        {underConstruction && building && <Crane towerH={Math.min(fullH, 45) + 7} />}
        {/* Ägar-beacon: alltid synlig färgprick (ej ockluderad) så man ser
            din/till salu/tomt/konkurrent även i trånga områden. */}
        {(() => {
          const be = ownerBeacon(content);
          return be ? <BeaconSprite y={Math.min(fullH, 150) + 3.5} be={be} /> : null;
        })()}
        {/* LOD: statusmärkena är hanteringsdetaljer man agerar på inzoomad –
            i översikt är de klustrat brus och kostar draws, så de döljs. */}
        {!lodFar && badges.map((b, i) => (
          <StatusBadge key={b.emoji} emoji={b.emoji} title={b.title} y={Math.min(fullH, 150) + 11} order={i} onClick={b.action} />
        ))}
      </group>
      {hovered && (
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

/* Memoiserad: propsen (parcel, content) är referensstabila mellan dagsticks
   – advanceDay rör bara day/stocks, inte portfolio/listings/lots/competitors,
   så byParcel-cachen ger samma content-referens. Utan memo renderade varje
   tomt i staden om sig (5 store-subscriptions + hooks) vid varje dagstick;
   nu hoppas de över tills innehållet faktiskt ändras (köp, månadsskifte). */
export const ParcelNode = memo(ParcelNodeInner);
