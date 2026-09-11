import { Sky } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { BackSide, Color, DirectionalLight, Mesh, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry } from "three";
import { useUiStore } from "../store/uiStore";
import { GRAPHICS_PRESETS } from "../store/prefs";

export const LIGHT_MOODS = {
  morning: { sun: [-260, 155, 180], color: "#ffe1b3", intensity: 1.8, sky: "#719dbc", horizon: "#e9d8bf", ground: "#626b54", ambient: 0.24, exposure: 1.06 },
  day: { sun: [260, 230, 120], color: "#fff0d6", intensity: 2.1, sky: "#6696b6", horizon: "#dbe7e7", ground: "#69705a", ambient: 0.25, exposure: 1.03 },
  evening: { sun: [260, 65, -180], color: "#ffb575", intensity: 1.35, sky: "#455f87", horizon: "#cd9e93", ground: "#424a50", ambient: 0.16, exposure: 1.05 },
} as const;

/** Self-contained outdoor reflection environment; works offline in the desktop app. */
export function CityLighting() {
  const { gl, scene } = useThree();
  const mode = useUiStore(s => s.lightMode);
  const preset = useUiStore(s => GRAPHICS_PRESETS[s.graphics]);
  const light = useRef<DirectionalLight>(null);
  const mood = LIGHT_MOODS[mode];
  useEffect(() => {
    const envScene = new Scene();
    const geometry = new SphereGeometry(100, 24, 16);
    const material = new ShaderMaterial({
      side: BackSide,
      uniforms: { topColor: { value: new Color(mood.sky) }, horizonColor: { value: new Color(mood.horizon) }, groundColor: { value: new Color(mood.ground) } },
      vertexShader: "varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 groundColor; varying vec3 vDirection; void main(){float h=normalize(vDirection).y; vec3 c=h>0.0?mix(horizonColor,topColor,sqrt(h)):mix(horizonColor,groundColor,smoothstep(0.0,0.4,-h)); gl_FragColor=vec4(c,1.0);}",
    });
    envScene.add(new Mesh(geometry, material));
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(envScene, 0.08);
    const previous = scene.environment;
    scene.environment = target.texture;
    const exposure = gl.toneMappingExposure;
    gl.toneMappingExposure = mood.exposure;
    pmrem.dispose(); geometry.dispose(); material.dispose();
    return () => {
      scene.environment = previous;
      gl.toneMappingExposure = exposure;
      target.dispose();
    };
  }, [gl, scene, mood]);

  // Keep the shadow texels around the viewed neighborhood instead of spreading
  // a fixed 2048 map over the entire city. Snap the target to texels to avoid shimmer.
  useFrame(({ camera, controls }) => {
    const sun = light.current;
    const target = (controls as unknown as { target?: { x: number; y: number; z: number } })?.target;
    if (!sun || !target || !preset.shadows) return;
    const distance = Math.hypot(camera.position.x - target.x, camera.position.y - target.y, camera.position.z - target.z);
    const extent = Math.max(85, Math.min(620, distance * 0.7));
    const texel = 2 * extent / preset.shadowMap;
    const x = Math.round(target.x / texel) * texel, z = Math.round(target.z / texel) * texel;
    sun.position.set(x + mood.sun[0], mood.sun[1], z + mood.sun[2]);
    sun.target.position.set(x, 0, z);
    sun.target.updateMatrixWorld();
    const c = sun.shadow.camera;
    if (Math.abs(c.right - extent) > 0.5) {
      c.left = c.bottom = -extent; c.right = c.top = extent;
      c.updateProjectionMatrix();
    }
  });
  return <>
    <fog attach="fog" args={[mood.horizon, mode === "evening" ? 650 : 900, mode === "evening" ? 1750 : 2100]} />
    <Sky distance={4000} sunPosition={[...mood.sun]} turbidity={mode === "evening" ? 7 : 3.5} rayleigh={1.6} mieCoefficient={0.004} mieDirectionalG={0.78} />
    <ambientLight intensity={mood.ambient} />
    <hemisphereLight args={[mood.sky, mood.ground, 0.45]} />
    <directionalLight ref={light} key={preset.shadowMap} position={[...mood.sun]} color={mood.color} intensity={mood.intensity}
      castShadow={preset.shadows} shadow-mapSize={[preset.shadowMap || 1024, preset.shadowMap || 1024]}
      shadow-bias={-0.00015} shadow-normalBias={0.09} shadow-camera-near={1} shadow-camera-far={1800}
      shadow-camera-left={-540} shadow-camera-right={540} shadow-camera-top={540} shadow-camera-bottom={-540} />
  </>;
}
