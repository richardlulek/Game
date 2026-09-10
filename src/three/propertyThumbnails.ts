import { useSyncExternalStore } from "react";
import type { Object3D } from "three";

export interface ThumbnailSource { object: Object3D; key: string; readyAt: number; }
export const thumbnailSources = new Map<string, ThumbnailSource>();
const images = new Map<string, { key: string; url: string }>();
const listeners = new Map<string, Set<() => void>>();
const requested = new Set<string>();
const pending = new Set<string>();

function emit(id: string) { listeners.get(id)?.forEach(fn => fn()); }

export function registerThumbnailSource(id: string, source: ThumbnailSource) {
  thumbnailSources.set(id, source);
  if (requested.has(id) && images.get(id)?.key !== source.key) pending.add(id);
  return () => {
    if (thumbnailSources.get(id) === source) thumbnailSources.delete(id);
  };
}

export function nextThumbnail(now: number) {
  for (const id of pending) {
    const source = thumbnailSources.get(id);
    if (source && source.readyAt <= now) { pending.delete(id); return { id, source }; }
  }
  return null;
}

export function publishThumbnail(id: string, key: string, url: string) {
  images.delete(id);
  images.set(id, { key, url });
  // Bounded CPU image cache; there is only one GPU render target.
  while (images.size > 120) {
    const oldest = [...images.keys()].find(k => !listeners.get(k)?.size);
    if (!oldest) break; // active cards retain their image until unmounted
    images.delete(oldest);
  }
  emit(id);
}

export function usePropertyThumbnail(id?: string) {
  return useSyncExternalStore(
    (listener) => {
      if (!id) return () => {};
      const group = listeners.get(id) ?? new Set();
      group.add(listener); listeners.set(id, group); requested.add(id);
      if (!images.has(id) || images.get(id)?.key !== thumbnailSources.get(id)?.key) pending.add(id);
      return () => {
        group.delete(listener);
        if (!group.size) { listeners.delete(id); requested.delete(id); pending.delete(id); }
      };
    },
    () => id ? images.get(id)?.url : undefined,
    () => undefined,
  );
}
