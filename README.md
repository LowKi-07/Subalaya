# Subalaya

An interactive 3D walkthrough of a two-storey house, built with Three.js from the floor plan in `plan-reference.png`.

- **Ground floor:** kitchen, living hall, master bedroom with attached toilet, bedroom with toilet, a 3-car parking area and a dog-leg staircase.
- **First floor:** two flats (A and B), plus a lobby, a passage and a study.

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

- `main.js` builds the whole scene. Walls, doors and windows are `wall(...)` calls in the plan image's pixel coordinates, at 17.2 px per foot. The first-floor plan is offset 665 px to the right in the image.
- `index.html` holds the page and its controls.
- `vendor/` holds Three.js r170 (MIT, see `vendor/THREE-LICENSE`).

## Assumptions (not in the plan)

- Heights: 10 ft floor to floor, 7 ft doors, windows from 3 ft to 7 ft.
- Furniture styles, materials and colours are generic. No interior photos were available.
- The study's doorway, the parking columns and beams, and the gates are inferred.
- There is no stair up to the roof terrace.
