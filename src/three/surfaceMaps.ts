import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, type Texture } from "three";
import { facadeTexture, glassTexture, type FacadeKind, type FacadeVariant } from "./textures";

const cache = new Map<string, { bumpMap: Texture; roughnessMap: Texture }>();

/** Derive relief from the SAME facade tile and UVs: window recesses stay aligned.
 * No fetched assets, per-building texture copies, or additional geometry. */
export function facadeSurfaceMaps(kind: FacadeKind, variant: FacadeVariant, glass = false) {
  const key = glass ? "glass" : `${kind}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const source = (glass ? glassTexture(4, 4) : facadeTexture(kind, variant)).image as HTMLCanvasElement;
  const pixels = source.getContext("2d")!.getImageData(0, 0, source.width, source.height).data;
  const relief = new Uint8Array(pixels.length), roughness = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = (pixels[i] * 0.21 + pixels[i + 1] * 0.72 + pixels[i + 2] * 0.07) / 255;
    const noise = ((i * 13 + (i >>> 8) * 7) % 19) / 19;
    const height = Math.round(glass ? brightness * 35 + 110 : brightness * 100 + 110 + noise * 10);
    const rough = Math.round(glass ? 125 + brightness * 60 : 155 + brightness * 90);
    relief.set([height, height, height, 255], i);
    roughness.set([rough, rough, rough, 255], i);
  }
  const texture = (data: Uint8Array) => {
    const t = new DataTexture(data, source.width, source.height, RGBAFormat);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.flipY = true; // matches the source CanvasTexture
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  const maps = { bumpMap: texture(relief), roughnessMap: texture(roughness) };
  cache.set(key, maps);
  return maps;
}
