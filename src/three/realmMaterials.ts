import {
  LinearFilter,
  LinearMipmapLinearFilter,
  DataTexture,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
} from "three";
export type GroundFinish = "asphalt" | "paving" | "gravel" | "grass";
const textures = new Map<GroundFinish, DataTexture>();
/** Small shared offline textures, mapped in world units so long roads do not stretch grain. */
export function realmMaterial(kind: GroundFinish, color: string) {
  let map = textures.get(kind);
  if (!map) {
    const data = new Uint8Array(128 * 128 * 4);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const n = ((x * 73 + y * 151 + x * y * 17) % 31) / 31;
        let v = kind === "grass" ? 210 + n * 35 : kind === "asphalt" ? 215 + n * 22 : 208 + n * 40;
        if (kind === "paving" && (x % 32 < 1 || y % 32 < 1)) v = 183;
        const i = (y * 128 + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    map = new DataTexture(data, 128, 128, RGBAFormat);
    map.wrapS = map.wrapT = RepeatWrapping;
    map.colorSpace = SRGBColorSpace;
    map.magFilter = LinearFilter;
    map.minFilter = LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    textures.set(kind, map);
  }
  const m = new MeshStandardMaterial({ color, map, roughness: kind === "asphalt" ? 0.94 : 0.88 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
      #ifdef USE_MAP
        vec4 realmPosition=vec4(position,1.0);
        #ifdef USE_INSTANCING
          realmPosition=instanceMatrix*realmPosition;
        #endif
        vMapUv=(modelMatrix*realmPosition).xz/4.0;
      #endif`,
    );
  };
  m.customProgramCacheKey = () => "realm-ground-v1";
  return m;
}
