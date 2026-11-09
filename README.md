# Subalaya

An interactive 3D walkthrough of a two-storey house, built with Three.js from the floor plan in `plan-reference.png`.

- **Ground floor:** kitchen, living hall, master bedroom with attached toilet, bedroom with toilet, a 3-car parking area and a dog-leg staircase.
- **First floor:** two flats (A and B), plus a lobby, a passage and a study.

**Live:** https://subalaya.vercel.app. Every push to `main` deploys there automatically.

## Run it

It's a static site with no build step. Serve the folder over HTTP, because ES modules don't load from `file://`:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. To deploy, import the repo into Vercel or Netlify as a static site, or turn on GitHub Pages.

## Controls

- **Desktop:** WASD or arrow keys to walk, drag to look, Shift to run.
- **Phone:** the joystick at the bottom left to walk, drag anywhere else to look.
- **Buttons:** Overview (exterior and per-floor cutaways), Rooms (jump to any room), Night, Map, and Plan (shows the reference drawing).

## Files

- `main.js` builds the house, the furniture and the lighting, and handles controls. Walls, doors and windows are `wall(...)` calls in the plan image's pixel coordinates, at 17.2 px per foot. The first-floor plan is offset 665 px to the right in the image.
- `cars.js` builds the procedural cars: an extruded body with wheel arches, clearcoat paint, alloys and lights.
- `houses.js` builds the neighbouring houses, trees and street lights.
- `sky.js` paints the day and night skies, which also serve as reflections.
- `index.html` holds the page and its controls.
- `vendor/` holds Three.js r170 and a few of its add-ons (MIT, see `vendor/THREE-LICENSE`).

Static meshes are merged by material at load time, which brings it to about 150 draw calls so it runs smoothly on phones. Ambient occlusion (GTAO) and anti-aliasing run as a post-processing pass. Add `?noao` to the URL to turn ambient occlusion off on slow devices, or `?lowq` for smaller shadow maps.

## Assumptions (not in the plan)

- Heights: 10 ft floor to floor, 7 ft doors, windows from 3 ft to 7 ft.
- Furniture styles, materials and colours are generic. No interior photos were available.
- The study's doorway, the parking columns and beams, and the gates are inferred.
- There is no stair up to the roof terrace.
