import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { DISTRICT_ZONES, parcelById } from "../engine/city";
import { activeAudioOutput } from "../audio/sound";
import { ambientMixAt } from "../audio/ambientMix";
import { createCitySoundscape, getCityAmbienceVolume, type CitySoundscape } from "../audio/cityAmbience";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { propertyAppearance } from "./propertyAppearance";

export function CityAmbience() {
  const sound = useRef<CitySoundscape | null>(null), elapsed = useRef(0);
  useEffect(() => {
    const quiet = () => {
      if (document.hidden || !activeAudioOutput() || getCityAmbienceVolume() === 0) sound.current?.silence();
    };
    document.addEventListener("visibilitychange", quiet);
    window.addEventListener("game-audio-settings", quiet);
    return () => {
      document.removeEventListener("visibilitychange", quiet);
      window.removeEventListener("game-audio-settings", quiet);
      sound.current?.dispose(); sound.current = null;
    };
  }, []);
  useFrame(({ camera, controls }, dt) => {
    elapsed.current += dt;
    if (elapsed.current < 0.25) return;
    elapsed.current = 0;
    const output = activeAudioOutput();
    if (!output || document.hidden || getCityAmbienceVolume() === 0) { sound.current?.silence(); return; }
    const target = (controls as unknown as { target?: { x: number; y: number; z: number } })?.target;
    if (!target) return;
    if (!sound.current) sound.current = createCitySoundscape(output.context, output.output);
    const state = useGameStore.getState().state;
    const block = useUiStore.getState().detailBlockId;
    const properties = block ? [...state.portfolio, ...state.listings, ...state.competitors.flatMap(c => c.portfolio)]
      .filter(p => p.parcelId && parcelById(p.parcelId)?.blockId === block) : [];
    const capacity = properties.reduce((n, p) => n + p.capacity, 0);
    const occupancy = capacity ? properties.reduce((n, p) => n + p.tenants.length, 0) / capacity : 0.35;
    const working = properties.some(p => p.status === "bygger" || propertyAppearance(parcelById(p.parcelId!)!, p).renovating);
    const distance = Math.hypot(camera.position.x - target.x, camera.position.y - target.y, camera.position.z - target.z);
    sound.current.update(ambientMixAt(DISTRICT_ZONES, target.x, target.z, distance, occupancy, working));
  });
  return null;
}
