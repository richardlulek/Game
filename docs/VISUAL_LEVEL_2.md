# Visual level 2 — district frontages and investment feedback

This is a separate incremental patch on top of the complete first graphics
package (including continuous traffic and city ambience). It is not a replacement
for that package and cannot be applied directly to the original main branch.

## What changes

| District | Ground-floor identity |
| --- | --- |
| Centrum | Limestone, brass-toned frames, burgundy canopy and heavier cornice |
| Innerstad | Muted masonry, green metalwork and slim entrance canopy |
| Finans | Silver frames, reflective glass and graphite blue entrances |
| Hamnen | Timber supports, oxblood trim, dark steel and quay bollards |
| Industri | Ribbed loading shutters, protective bumpers and yellow safety bands |
| Förort | Pale concrete, teal trim and two detailed courtyard entrances |
| Kulle | Cream woodwork, green porch canopy and flowers on maintained properties |

Detailed entrances replace the old simple entrance in the viewed block. Geometry
is attached to actual building dimensions, including tower podiums, recessed
villas, harbor sheds and suburb courtyards. Street furniture and scaffolding now
use corresponding frontages. Signature projects and the bespoke story house
retain their own models.

Shop bays have recessed backing, shelving and goods; residential/office bays use
simple lobby furniture and plants. One or both display bays become furnished
according to occupancy. Vacant properties have no new emissive lamps. Occupied
phased renovations keep interior activity; closed full refurbishments do not.
These are visual occupancy cues, not a literal plan or rendering of each lease.

Restored properties receive clean surrounds, threshold and entrance fittings.
Completed facade upgrades add pilasters and a secondary cornice. Ordering an
upgrade does not show it as completed. Local benches replace the earlier generic
cafe terraces so every shop is no longer depicted as a restaurant.

Purchase, leasing, renovation/energy improvements and completed development have
distinct short feedback colors. Small rising highlights appear only in the
viewed block. Initial load is quiet; starting or cancelling work does not award
an improvement effect. Reduce motion suppresses these effects and the local
animated visitors.

## Rendering and cards

- Up to eight instanced material groups per detailed entrance; no point lights,
  transmission or transparent interior panes. Narrow reflective strips suggest
  glass while keeping the display visible. Evening strengthens occupied lamps.
- Low quality keeps doors, frames and occupancy cues, removing shelves, shutter
  ribs, small fittings, flowers and benches. Ambient houses use their existing
  entrances; the suburb model details two entrances per viewed property.
- Market/portfolio thumbnails refresh when the viewed detail level, tenant name
  or lighting changes. Ordinary rent and lease-duration ticks retain the cache.
- Temporary thumbnail clones release their instance GPU buffers after capture;
  the live model's shared geometry and materials remain owned by the live scene.

No dependencies, game rules, road routing, audio settings or save schema change.

## Validation

TypeScript/Vite production build and 74 targeted tests passed. Tests cover the
previous graphics/traffic/audio slice plus frontage bounds across seven district
profiles, four property types, six widths, two condition levels and both detail
budgets; occupancy, physical work, placement and reward transitions are covered.

Browser screenshots, interactive visual review, Tauri device testing and FPS
measurements have not been performed. The existing large-bundle build warning
remains. Geometry tests do not establish visual quality or measured performance.

## In-game review before release

1. Open an existing save and explore a block. Compare each district at close zoom,
   particularly a finance podium, a harbor frontage and a suburb courtyard.
2. Lease a vacant shop. Compare empty, partly occupied and fully occupied bays.
   Switch between Daylight and Evening and inspect the entrance fittings.
3. Start and finish a facade upgrade and a phased renovation. Confirm scaffold
   removal, changed surrounds and a completion effect after a positive outcome.
4. Open the property's card while changing light, selection and graphics quality.
   Confirm the card updates and the map remains correctly rendered.
5. Switch Low/High and Reduce motion; check readability, nearby navigation and
   FPS on a lower-powered device. Inspect entrances against adjacent geometry
   before accepting the final layout and colors.
