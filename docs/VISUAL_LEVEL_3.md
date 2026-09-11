# Visual level 3 — grounds, access and courtyard life

Separate incremental patch on top of visual level 2. Apply the complete first
graphics package, level 2, then this patch. Earlier packages remain separate.

## Changes

- The viewed property's free ground gains paved access, slab joints and small
  planting beds. Colors, plant shape and flowers reflect condition and completed
  care. Industrial and harbor sites use gravel service islands instead of gardens.
- Paths route from the entrance toward an existing street edge. A deterministic
  orthogonal planner checks the full walkway width against modeled ground-level
  buildings, outbuildings, tree trunks and reserved entrance furniture. Beds must
  fit inside the parcel and remain clear of the paths and obstacles.
- Dense perimeter blocks receive no invented garden inside their building.
  If the selected entrance or gate cannot be connected safely, no path is added.
  This conservative planner considers street-edge midpoints, not every possible
  gate location. It does not alter the city road network.
- Suburban houses share one footprint definition with entrances and the planner.
  Their depth now leaves at least four world units between rows on supported
  parcels. Two courtyard trees replace the previous layout that could place a
  trunk inside a house. Parcel area and economic values are unchanged.
- Revised suburb architecture replaces four-to-six narrow bodies with two long
  apartment blocks on small parcels (up to four on larger parcels). Shared
  three-to-five-storey heights vary by at most one floor between rows. Gabled
  roofs have two sloping planes and closed gables; flat-roof variants remain.
- Interactive suburb houses now have individual window openings, coherent sill
  heights, sparse end-wall windows, vertical stairwells, residential doors,
  plinths, balcony slabs and parapets. Near detail adds mullions, downpipes and
  roof vents. Some occupied windows glow in Evening mode. Background houses
  share the revised footprint, floor count and roof type using merged geometry.
- Suburb window/detail geometry uses up to five instanced material groups per
  property. Low/far detail omits balconies, mullions, sills, downpipes and vents.
  The housing form is a stylized residential model, not a literal floor plan.
- A further facade pass adds plinths, roof edges, vertical divisions and floor
  bands to office towers, headquarters, hotels, campus/hospital buildings and
  completed signature blocks. The structure follows each actual tower tier,
  including rotated tops, instead of stretching ribs across empty setbacks.
- Industrial halls, warehouse buildings and converted cultural halls use wall
  bays and high daylight windows. Background buildings gain coarse versions of
  these features plus entrances on their existing frontage. Structural detail
  remains in Low/far views; it never falls back to a featureless block.
- The facade pass uses at most three instanced material groups per composition;
  background details remain part of the existing merged geometry. It adds no
  point lights and does not change building use or invent tenant businesses.
  Construction shells remain construction representations, and distant skyline
  scenery is not upgraded to the same level as the playable city.
- Occupied, maintained grounds get small emissive bollards in Evening mode.
  No point lights are added. During physical works, flowers and new yard lamps
  are suppressed. Existing scaffolding remains the main construction cue.
- Where a new path exists, local visitors walk between its gate and entrance,
  pause out of view at the door and return. Plots without a generated path retain
  the previous frontage walk. Reduce motion still hides local animated visitors.
- Low graphics retains the path and at most two beds; paving joints, flowers,
  service fittings and yard lamps are omitted. Other qualities have at most six
  beds and six instanced material groups per detailed property.

The new ground decoration is excluded from heatmaps, new-build shells, signature
projects and bespoke story properties. Cards continue to show building models;
the new ground decoration is not included in the card's thumbnail crop.
No new assets, dependencies, save fields, game rules or audio changes are required.

## Validation

Production TypeScript/Vite build and 93 targeted tests passed (19 new tests).
Coverage includes full-width routing around obstacles, blocked access, actual
street endpoints, footprint consistency, bed/path separation, seeded layouts,
walker positions and the previous graphics/simulation regression tests.
The added architecture tests check elongated proportions, footprint separation
and consistent floor counts. Rendering and appearance still require playtesting.
Facade tests additionally cover rotated setbacks, frontage direction, bounded
ornament counts and retaining meaningful structure in coarse detail.

The three patch files were applied in order to the original main version in an
isolated index. The resulting tree matches the tested source. Reversing level 3
alone restores the exact level-2 tree.

Browser screenshots, interactive playtesting, device FPS measurements and Tauri
testing have not been performed. The existing large-JavaScript-bundle warning
remains. Geometric tests cannot establish appearance or perceptual smoothness.
The planner uses ground-level reservations rather than exact 3D mesh collision;
review paths against facade ornaments, canopies and existing worn-house debris.

## Review in the game

1. Explore a villa property and a suburb block. Follow the path from a street
   edge to the entrance; inspect the new gap between suburban house rows.
2. Compare a worn property with one above 70 condition. Complete maintenance
   and a physical project, checking planting, paving and scaffold changes.
3. Lease a property and switch to Evening. Inspect local visitors and the small
   yard lamps, then compare vacant properties and active work sites.
4. Switch Low/High, Reduce motion and the heatmap. Check the parcel remains easy
   to select and the new details disappear in the appropriate views.
5. Repeat on a generated map and a lower-powered device before release.
6. Inspect a stepped finance tower, a plain hall, a warehouse, a signature block
   and background buildings. Check setbacks, roof edges and entrances in Low
   as well as High; verify that heatmaps retain their readability.
