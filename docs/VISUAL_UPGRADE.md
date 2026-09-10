# Neighborhood graphics pass

This is the first playable graphics slice, integrated into the existing city.
No economy, save schema, parcel placement or dependency changes are required.

## Try it

1. Start or continue a game and choose **Explore block** at the top right of the map.
2. Switch **Light** between Morning, Daylight and Evening. These are viewing presets, not a simulation clock.
3. Open Market or Portfolio. Property cards request cached snapshots of their existing 3D models. **Show on map** minimizes open windows and focuses the property.
4. In the viewed block, compare a vacant property with an occupied one. Let a shop to add an active sign, pavement tables and visitors. Physical works add scaffolding; completed works remove it. Repairs improve the facade and planters.
5. Zoom out or select Low graphics: the original facade and roof silhouettes remain, small details are culled, and a reduced moving population remains on the streets.
6. Watch cars follow continuous routes and turn through intersections. Try a newly generated city as well as the classic map.
7. Enable Sound and adjust **City ambience** in Settings. Zoom into different districts: the harbor, center and industrial area have different quiet synthesized backgrounds. Zooming out fades the city; hiding the tab or disabling sound silences this layer.

## Implementation

- Offline outdoor reflection environment, three lighting presets, camera-centered sun shadows and instanced contact footprints.
- Relief and roughness derived from the existing facade tiles; shared texture caches preserve window alignment and avoid external assets.
- Stable architectural palettes independent of ownership; the existing ownership markers remain.
- Detail LOD drops roof/entrance accessories instead of replacing buildings with untextured pillars. It is intentionally less aggressive than full geometry batching.
- Extra street furniture and visitors are limited to the currently viewed block and are derived from actual leases, condition and pending works. Renovations retain the existing house; new builds retain the structural shell.
- Purchase, lease and repair transitions receive a short local pulse. The pulse respects reduced-motion preferences.
- One shared offscreen render target services requested property thumbnails, one per frame. Geometry is reused, selection glow is removed, and GL render target/viewport/scissor/exposure settings are restored after capture, including failure paths. Unchanged financial updates keep cached images.
- Traffic routes come from actual main-road and local-street centerlines. Closed circuits, lane offsets and rounded corners remove the old end-of-segment teleportation. Three instanced meshes render cars at every quality level.
- Camera position blends district ambience; local occupancy and physical works affect activity. Procedural filtered-noise beds reuse the existing unlocked AudioContext and master output, have a separate saved volume, and release their nodes when the city unmounts. No sound files or dependencies are added.

## Validation and remaining review

Production TypeScript/Vite build passed. Sixty-two targeted tests passed, covering
appearance transitions, thumbnail invalidation, map geometry, seeded layouts,
leasing, lifecycle, phased renovation, continuous traffic routes on classic and
generated roads, ambient blending, mute behavior and audio-node disposal.

Browser interaction, screenshots, listening tests and device FPS measurements have not been run.
Before merging for release, play through the steps above on desktop and a lower
powered device, especially near/far zoom, selection during card loading, and a
renovation completing while the block is visible. Check the ambience level against
music/SFX and confirm muting and tab switching in the target browser/Tauri build.

This slice does not redesign the city road layout or replace all toolbar icons.
Traffic is decorative: it uses closed circuits, leaves dead ends empty, and does
not simulate collision avoidance or traffic lights. Ambience is an initial
camera-dependent synthesized bed, not recorded crowd/vehicle audio or individual
3D sound emitters; its timbre and balance still need a listening pass.
Signature projects retain their existing card illustrations. Uncaptured properties
also retain the existing illustration until a normal-map 3D source is available;
heatmap colors are never baked into a new thumbnail.
