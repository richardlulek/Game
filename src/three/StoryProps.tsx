/* Story-rekvisita på 3D-kartan (berättelseläget "Arvet efter morfar"):

   · RoggeCar – Rogge Flyts vita, privatleasade sedan som parkerar
     demonstrativt utanför morfars hus i prologen och utanför grann-
     huset under budkriget i Revanschen.
   · MemoryNotes – morfars gula minneslappar vid stadens landmärken.
     Klick öppnar lappen (kortet renderas i DOM-lagret via uiStore)
     och räknas som hittad (FOUND_NOTE i reducern).                 */

import { Html } from "@react-three/drei";
import { playDiscover } from "../audio/sound";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { parcelById } from "../engine/city";
import { MEMORY_NOTES, hasFlag, heirloomOf, noteFlag } from "../engine/story";
import { useGameStore } from "../store/gameStore";
import type { Cinematic } from "../store/uiStore";
import { useUiStore } from "../store/uiStore";

/* ── Rogges bil ────────────────────────────────────────────────────── */

/** Vit blank sedan med svarta rutor – "privatleasad, men säg inget".
 *  Med `arrive` satt glider den in längs gatan till parkeringen. */
function WhiteSedan({ x, z, ry = 0.4, arrive }: {
  x: number; z: number; ry?: number; arrive?: Cinematic | null;
}) {
  const WHITE = "#f2f3f5";
  const g = useRef<Group>(null);
  useFrame(() => {
    if (!g.current) return;
    if (!arrive) {
      g.current.position.set(x, 0, z);
      return;
    }
    // Ease-out från 38 enheter bort längs gatan; klar strax före pausslutet.
    const dur = Math.min(2800, Math.max(600, arrive.until - arrive.start - 800));
    const t = Math.min(1, (Date.now() - arrive.start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    g.current.position.set(x + (1 - e) * 38, 0, z);
  });
  return (
    <group ref={g} position={[x, 0, z]} rotation-y={ry}>
      {/* Underrede */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[5.6, 0.5, 2.1]} />
        <meshStandardMaterial color="#23262b" roughness={0.7} />
      </mesh>
      {/* Kaross */}
      <mesh castShadow position={[0, 0.95, 0]}>
        <boxGeometry args={[5.6, 0.8, 2.2]} />
        <meshStandardMaterial color={WHITE} metalness={0.5} roughness={0.15} />
      </mesh>
      {/* Kupé med tonade rutor */}
      <mesh castShadow position={[-0.2, 1.65, 0]}>
        <boxGeometry args={[3.0, 0.66, 1.95]} />
        <meshStandardMaterial color={WHITE} metalness={0.5} roughness={0.15} />
      </mesh>
      <mesh position={[-0.2, 1.68, 0]} scale={[0.98, 0.8, 1.02]}>
        <boxGeometry args={[3.0, 0.66, 1.95]} />
        <meshStandardMaterial color="#15181d" metalness={0.4} roughness={0.1} />
      </mesh>
      {/* Kromgrill + strålkastare */}
      <mesh position={[2.82, 0.98, 0]}>
        <boxGeometry args={[0.08, 0.4, 1.2]} />
        <meshStandardMaterial color="#c9ccd2" metalness={0.9} roughness={0.2} />
      </mesh>
      {([0.75, -0.75] as const).map((wz) => (
        <mesh key={wz} position={[2.82, 1.0, wz]}>
          <boxGeometry args={[0.1, 0.22, 0.4]} />
          <meshStandardMaterial color="#fff6d6" emissive="#ffe9a8" emissiveIntensity={0.4} />
        </mesh>
      ))}
      {/* Hjul */}
      {([[1.8, 1.05], [1.8, -1.05], [-1.8, 1.05], [-1.8, -1.05]] as const).map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.45, wz]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.46, 0.46, 0.34, 14]} />
          <meshStandardMaterial color="#101013" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** Rogges bil står där storyn behöver honom – och bara där. */
export function RoggeCar() {
  const story = useGameStore((s) => s.state.story);
  const state = useGameStore((s) => s.state);
  const cinematic = useUiStore((s) => s.cinematic);
  if (!story || story.done) return null;

  let parcelId: string | undefined;
  if (story.beat === "prolog" || story.beat === "renoveringen") {
    // Bilen dyker upp först när Rogge knackar på (regipausen före hans
    // lowball-bud) och hänger sedan kvar genom renoveringen – han hoppas
    // fortfarande att taket ska ge vika före plånboken.
    const roggeHere =
      state.pendingDecision?.id === "story:rogge_lowball" || hasFlag(state, "prolog_läst");
    if (roggeHere) parcelId = heirloomOf(state)?.parcelId;
  } else if (story.beat === "revanschen") {
    // Bilen står kvar utanför grannhuset tills spelaren vunnit budkriget.
    parcelId = state.listings.find((p) => p.storyTag === "revansch")?.parcelId;
  }
  const parcel = parcelId ? parcelById(parcelId) : undefined;
  if (!parcel) return null;

  // Parkera snett vid tomtens gathörn (utanför husets fotavtryck).
  const arrive = cinematic?.car ? cinematic : null;
  return (
    <WhiteSedan
      x={parcel.x + parcel.w / 2 + 3.5}
      z={parcel.z + parcel.d / 2 + 2.5}
      arrive={arrive}
    />
  );
}

/* ── Morfars minneslappar ──────────────────────────────────────────── */

function NoteMarker({
  id, x, z, found, onOpen,
}: { id: string; x: number; z: number; found: boolean; onOpen: (id: string) => void }) {
  return (
    <Html position={[x, 7, z]} center zIndexRange={[24, 0]}>
      <button
        onClick={() => onOpen(id)}
        title={found ? "Morfars lapp (läst)" : "En gul lapp fladdrar här…"}
        style={{
          background: found ? "#efe6c2" : "#ffe873",
          border: "1px solid #b89a3e",
          borderRadius: 3,
          width: 26,
          height: 26,
          fontSize: 14,
          lineHeight: 1,
          cursor: "pointer",
          transform: `rotate(${found ? -4 : 6}deg)`,
          boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
          opacity: found ? 0.55 : 1,
          padding: 0,
        }}
      >
        📌
      </button>
    </Html>
  );
}

/** Lapparna finns så länge story-läget finns – samlandet får avslutas i lugn. */
export function MemoryNotes() {
  const story = useGameStore((s) => s.state.story);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const setOpenNote = useUiStore((s) => s.setOpenNote);
  if (!story) return null;

  const heirloomParcel = (() => {
    const pid = heirloomOf(state)?.parcelId;
    return pid ? parcelById(pid) : undefined;
  })();

  const open = (id: string) => {
    playDiscover();
    dispatch({ type: "FOUND_NOTE", id });
    setOpenNote(id);
  };

  return (
    <>
      {MEMORY_NOTES.map((n) => {
        // Äppelträds-lappen bor vid morfars hus (dynamisk parcell).
        const x = n.x ?? (heirloomParcel ? heirloomParcel.x - heirloomParcel.w / 2 - 4 : null);
        const z = n.z ?? (heirloomParcel ? heirloomParcel.z - heirloomParcel.d / 2 - 3 : null);
        if (x === null || z === null) return null;
        return (
          <NoteMarker
            key={n.id}
            id={n.id}
            x={x}
            z={z}
            found={hasFlag(state, noteFlag(n.id))}
            onOpen={open}
          />
        );
      })}
    </>
  );
}
