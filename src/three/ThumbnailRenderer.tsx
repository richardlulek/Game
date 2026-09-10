import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AmbientLight, Box3, CircleGeometry, Color, DirectionalLight, HemisphereLight, InstancedMesh, Mesh, MeshStandardMaterial, OrthographicCamera, Scene, ShaderMaterial, Vector3, Vector4, WebGLRenderTarget, SRGBColorSpace } from "three";
import { nextThumbnail, publishThumbnail } from "./propertyThumbnails";
import { facadeEmissiveTexture, glassEmissiveTexture } from "./textures";
import { frameBox, THUMB_H, THUMB_W } from "./thumbnailFraming";

/* The scene background matches the CSS background behind the image, which keeps
   `object-fit: contain` bars invisible whichever way they fall. */
const BACKDROP = "#dce6e8";
const W = THUMB_W, H = THUMB_H;

const CENTER = new Vector3();
const SIZE = new Vector3();

/** Render a requested property's existing geometry once, without a Canvas per card.
 * Clones share geometry/materials; only the temporary object hierarchy is discarded. */
export function ThumbnailRenderer() {
  const { gl, scene: city } = useThree();
  const resources = useMemo(() => {
    const target = new WebGLRenderTarget(W, H);
    target.texture.colorSpace = SRGBColorSpace;
    const scene = new Scene();
    scene.background = new Color(BACKDROP);
    scene.add(new AmbientLight("#ffffff", 0.6), new HemisphereLight("#d0e8fa", "#98907b", 1));
    const sun = new DirectionalLight("#ffe7c4", 2.2);
    sun.position.set(40, 70, 50); scene.add(sun);
    // A soft blob under the building instead of a ground plane: it settles the
    // model without drawing a horizon that would collide with the letterbox.
    const shadow = new Mesh(new CircleGeometry(1, 40), new ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "varying vec2 vUv; void main(){float a=(1.0-smoothstep(0.0,0.5,length(vUv-0.5)))*0.36;gl_FragColor=vec4(0.35,0.38,0.42,a);}",
    }));
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    return { target, scene, shadow, camera: new OrthographicCamera(), pixels: new Uint8Array(W * H * 4), viewport: new Vector4(), scissor: new Vector4() };
  }, []);
  useEffect(() => () => {
    resources.target.dispose();
    resources.shadow.geometry.dispose();
    (resources.shadow.material as ShaderMaterial).dispose();
  }, [resources]);
  useFrame(() => {
    const job = nextThumbnail(performance.now());
    if (!job) return;
    const { target, scene, shadow, camera, pixels, viewport, scissor } = resources;
    const copy = job.source.object.clone(true);
    const temporaryMaterials: MeshStandardMaterial[] = [];
    const temporaryInstances: InstancedMesh[] = [];
    copy.traverse(node => {
      if (node instanceof InstancedMesh) temporaryInstances.push(node);
      if (node.userData.thumbnailFullScale) node.scale.y = 1;
      if (node instanceof Mesh && node.material instanceof MeshStandardMaterial && node.material.userData.previewFacade) {
        const appearance = node.material.userData.previewFacade;
        const m = node.material.clone();
        m.emissiveIntensity = appearance.emissiveIntensity;
        m.emissiveMap = !appearance.windows ? null : appearance.glass ? glassEmissiveTexture(4, 4) : facadeEmissiveTexture(appearance.kind, appearance.variant);
        node.material = m; temporaryMaterials.push(m);
      }
    });
    copy.position.set(0, 0, 0); copy.updateMatrixWorld(true);
    // Precise: walk the vertices. The cheap path leans on per-geometry bounds and
    // undercounts instanced detail, which a tight frame would then crop.
    const box = new Box3().setFromObject(copy, true);
    if (box.isEmpty()) { temporaryMaterials.forEach(m => m.dispose()); temporaryInstances.forEach(m => m.dispose()); return; }
    const center = box.getCenter(CENTER), size = box.getSize(SIZE);
    const { footprint } = frameBox(camera, box, center, size);

    shadow.position.set(center.x, box.min.y + 0.05, center.z);
    shadow.scale.setScalar(footprint);
    shadow.visible = true;
    scene.environment = city.environment;
    scene.add(copy);
    const oldTarget = gl.getRenderTarget();
    const oldFace = gl.getActiveCubeFace(), oldLevel = gl.getActiveMipmapLevel();
    gl.getViewport(viewport); gl.getScissor(scissor);
    const scissorTest = gl.getScissorTest(), autoClear = gl.autoClear;
    const shadows = gl.shadowMap.autoUpdate, exposure = gl.toneMappingExposure;
    try {
      gl.shadowMap.autoUpdate = false; gl.autoClear = true; gl.toneMappingExposure = 1;
      // No setViewport here: it multiplies by the renderer's pixel ratio, which
      // on a 1.75x preset drew a 896x504 image into this 512x288 target and kept
      // only its corner. setRenderTarget already fits the viewport to the target.
      gl.setRenderTarget(target); gl.setScissorTest(false);
      gl.clear(); gl.render(scene, camera);
      gl.readRenderTargetPixels(target, 0, 0, W, H, pixels);
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const stride = W * 4;
        const image = ctx.createImageData(W, H);
        for (let y = 0; y < H; y++) image.data.set(pixels.subarray((H - 1 - y) * stride, (H - y) * stride), y * stride);
        ctx.putImageData(image, 0, 0);
        publishThumbnail(job.id, job.source.key, canvas.toDataURL("image/webp", 0.85));
      }
    } catch {
      // A lost GL context must not take down the game; cards keep the fallback.
    } finally {
      scene.remove(copy); scene.environment = null; shadow.visible = false;
      temporaryMaterials.forEach(m => m.dispose());
      // Cloned instance attributes own GPU buffers; geometry/materials remain
      // shared with the live model and must never be disposed here.
      temporaryInstances.forEach(m => m.dispose());
      gl.setRenderTarget(oldTarget, oldFace, oldLevel); gl.setViewport(viewport); gl.setScissor(scissor); gl.setScissorTest(scissorTest);
      gl.autoClear = autoClear; gl.shadowMap.autoUpdate = shadows; gl.toneMappingExposure = exposure;
    }
  });
  return null;
}
