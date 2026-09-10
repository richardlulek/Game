import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AmbientLight, Box3, Color, DirectionalLight, HemisphereLight, InstancedMesh, Mesh, MeshStandardMaterial, OrthographicCamera, Scene, Vector3, Vector4, WebGLRenderTarget, SRGBColorSpace } from "three";
import { nextThumbnail, publishThumbnail } from "./propertyThumbnails";
import { facadeEmissiveTexture, glassEmissiveTexture } from "./textures";

/** Render a requested property's existing geometry once, without a Canvas per card.
 * Clones share geometry/materials; only the temporary object hierarchy is discarded. */
export function ThumbnailRenderer() {
  const { gl, scene: city } = useThree();
  const resources = useMemo(() => {
    const target = new WebGLRenderTarget(384, 240);
    target.texture.colorSpace = SRGBColorSpace;
    const scene = new Scene();
    scene.background = new Color("#dce6e8");
    scene.add(new AmbientLight("#ffffff", 0.6), new HemisphereLight("#d0e8fa", "#98907b", 1));
    const sun = new DirectionalLight("#ffe7c4", 2.2);
    sun.position.set(40, 70, 50); scene.add(sun);
    return { target, scene, camera: new OrthographicCamera(), pixels: new Uint8Array(384 * 240 * 4), viewport: new Vector4(), scissor: new Vector4() };
  }, []);
  useEffect(() => () => resources.target.dispose(), [resources]);
  useFrame(() => {
    const job = nextThumbnail(performance.now());
    if (!job) return;
    const { target, scene, camera, pixels, viewport, scissor } = resources;
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
    const box = new Box3().setFromObject(copy);
    if (box.isEmpty()) { temporaryMaterials.forEach(m => m.dispose()); temporaryInstances.forEach(m => m.dispose()); return; }
    const center = box.getCenter(new Vector3()), size = box.getSize(new Vector3());
    const radius = Math.max(size.length() * 0.55, 4);
    camera.left = -radius * 1.6; camera.right = radius * 1.6;
    camera.top = radius; camera.bottom = -radius;
    camera.near = 0.1; camera.far = radius * 12;
    camera.position.copy(center).add(new Vector3(1.1, 0.85, 1.5).normalize().multiplyScalar(radius * 5));
    camera.lookAt(center); camera.updateProjectionMatrix();
    scene.environment = city.environment;
    scene.add(copy);
    const oldTarget = gl.getRenderTarget();
    const oldFace = gl.getActiveCubeFace(), oldLevel = gl.getActiveMipmapLevel();
    gl.getViewport(viewport); gl.getScissor(scissor);
    const scissorTest = gl.getScissorTest(), autoClear = gl.autoClear;
    const shadows = gl.shadowMap.autoUpdate, exposure = gl.toneMappingExposure;
    try {
      gl.shadowMap.autoUpdate = false; gl.autoClear = true; gl.toneMappingExposure = 1;
      gl.setRenderTarget(target); gl.setViewport(0, 0, 384, 240); gl.setScissorTest(false);
      gl.clear(); gl.render(scene, camera);
      gl.readRenderTargetPixels(target, 0, 0, 384, 240, pixels);
      const canvas = document.createElement("canvas");
      canvas.width = 384; canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const image = ctx.createImageData(384, 240);
        for (let y = 0; y < 240; y++) image.data.set(pixels.subarray((239 - y) * 1536, (240 - y) * 1536), y * 1536);
        ctx.putImageData(image, 0, 0);
        publishThumbnail(job.id, job.source.key, canvas.toDataURL("image/webp", 0.85));
      }
    } catch {
      // A lost GL context must not take down the game; cards keep the fallback.
    } finally {
      scene.remove(copy); scene.environment = null;
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
