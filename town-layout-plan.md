# Town Layout Test Page — `testtown.html`

## Context

Build a **standalone test page** (`/home/user/tracksim/testtown.html`) with a blank canvas containing just the proposed bottom-left town and 30 autonomous residents. This is an isolated sandbox to validate the layout, scale, and resident AI behaviour before integrating into `index.html`.

The page should reuse the visual style and 18px grid of the main sim, and reuse the existing person and car sprite ideas (5×9px person, 18×12px car) so what we test is what we eventually drop into `index.html`.

---

## Canvas

- Same dimensions as main sim: **1200×700px**, plain `#2e8b57` grass background
- No other content (no quarry, no station, no farm) — just the town

---

## Town Layout (unchanged from prior plan)

Footprint: **X:18–252, Y:430–700** (234×270px), 18px grid.

**Public area** (Y=430–466, above main street)
- Town square: `(18, 430)` size `72×36`
- Bakery: `(90, 430)` size `54×36`
- Bakery parking: `(144, 430)` size `54×36` (4 spots)

**Main street**: `(18, 466)` size `216×18`, runs E–W

**Three residential rows** (5 semi-detached pairs each = 30 homes):

| Row | Garden Y | House Y | Parking Y |
|-----|---------|---------|-----------|
| 1 | 484 | 502 | 520 |
| 2 | 538 | 556 | 574 |
| 3 | 592 | 610 | 628 (margin to 700) |

Each row: 5 buildings of 36×18px starting at X=18, with internal gaps for fences. Each building has 2 homes × 1 garden each × 1 parking spot each.

**Roads in/out**
- **North road**: 18px-wide corridor that drops down from `Y=0` and enters town at a central T-junction at approximately **X=126** (between buildings 2 and 3 of the rows, roughly middle of the town's 216px width). It meets the main E–W street at Y=466 forming a clear T-intersection.
- **East road**: 18px-tall corridor at Y=466, runs from X=252 to canvas right edge (X=1200) as a visual stub.
- The north road continues *south* of main street as a short central spine through the residential rows for additional access (cuts each row's garden strip at X=126), so cars can also reach the rear access lanes via a central junction. This gives the town a small cross-street feel rather than just one parallel main street.

**Garden/parking variance** (keeps "planned town" feel but breaks monotony)

Default: front garden (gate faces main street or access lane), car parks on rear access lane.

Per-building variants (assigned by index, not random — keeps it deterministic and feels designed):
- **~60% standard**: front garden, rear-lane parking
- **~30% front-pad parking**: front garden shrunk to make room for a small driveway/parking pad next to the gate; no rear parking for that home (rear lane still passes through for thru-traffic)
- **~10% corner / end-of-row**: side garden with side gate (only buildings at the row ends, where there's a side street/grass margin to access from)

Pattern (deterministic so layout is always the same): for each of 15 buildings, type = `["std","std","front","std","front", "std","front","std","std","front", "front","std","std","front","std"]` (rough mix). End-of-row buildings (#1, #5, #6, #10, #11, #15) eligible for the "side garden" variant — pick 1–2 of them to get side gates.

---

## Resident Data Model

```js
const homes = [];   // 30 entries, one per dwelling
// home = { id, doorX, doorY, gardenRect, parkingX, parkingY, color }

const people = [];  // 30 entries, one per home
// person = {
//   id, homeId,
//   x, y,                    // current pixel pos
//   state,                   // see state machine below
//   stateTimer,              // seconds left in current state
//   target: {x, y},          // current walk/drive destination
//   path: [{x,y}, ...],      // queued waypoints
//   car: { x, y, parked, heading },
//   skin: { headColor, bodyColor },  // small visual variation
//   legFrame, frameTimer,    // for walking animation
// }
```

Each home gets a unique person assigned at startup. Each person owns exactly one car parked at their home's parking spot. Skin colour varies (headColor & bodyColor) so people are visually distinct.

---

## Resident State Machine

```
        ┌────────────┐    rare roll       ┌──────────┐
        │  AT_HOME   │ ─────────────────► │ SLEEPING │ (8–20s, darkened)
        │            │ ◄───────────────── │          │
        └─────┬──────┘    on wake         └──────────┘
              │
              │ random tick rolls "go out"   ┌────────►
              ▼                              │
        ┌────────────┐                       │
        │ EXIT_HOUSE │ (walk to garden gate) │
        └─────┬──────┘                       │
              │                              │
              ▼                              │
   ┌──────────┴──────────┐                   │
   │ choose mode: walk?  │                   │
   │ or drive?           │                   │
   └──────┬───────┬──────┘                   │
          │ walk  │ drive                    │
          ▼       ▼                          │
   ┌──────────┐  ┌──────────┐                │
   │ WANDER   │  │ ENTER_CAR│                │
   └────┬─────┘  └────┬─────┘                │
        │             ▼                      │
        │       ┌──────────┐                 │
        │       │ DRIVE    │ (random loops)  │
        │       └────┬─────┘                 │
        │            ▼                       │
        │       ┌──────────┐                 │
        │       │ PARK_CAR │                 │
        │       └────┬─────┘                 │
        ▼            │                       │
   ┌──────────┐      │                       │
   │ INTERACT │ (rare, when near another)    │
   └────┬─────┘      │                       │
        │            │                       │
        └─────┬──────┘                       │
              ▼                              │
        ┌────────────┐                       │
        │ RETURN     │ (walk back to door)   │
        └─────┬──────┘                       │
              │                              │
              └──────────────────────────────┘
```

**State details**

- `AT_HOME` (default): person stationary inside their room next to their bed. Each tick rolls:
  - ~0.5%/frame chance to transition to `EXIT_HOUSE`
  - ~0.05%/frame chance to transition to `SLEEPING` (much rarer — sleep is occasional, not constant)
- `SLEEPING`: person stays in room next to/on bed, doesn't move. Lasts **8–20 seconds** (random per sleep). While in this state:
  - Person sprite tinted **~30% darker** (multiply each non-transparent pixel's RGB by 0.7) — this dims the head, shirt, and legs uniformly
  - Room interior fill drawn ~30% darker (e.g. `#a0856a` walls become `#705d4a`)
  - Bed is unchanged or slightly darker
  - On wake, transitions back to `AT_HOME`
- `EXIT_HOUSE`: walk from room → through correct gate (front/side per variant) → to main street.
- After exit: 70% chance walk-only, 30% chance drive (if car is parked at home).
- `WANDER`: pick a random waypoint on streets; walk there. After arriving, small chance to `RETURN`, else pick a new waypoint. While walking, if another person is within 12px and both roll a probability check (**5%**), enter `INTERACT`.
- `INTERACT`: stand still facing the other person for **4–7 seconds** (brief but readable). While interacting:
  - A small **white dot (2×2 px)** is drawn ~3 pixels above the person's head (so it sits clearly above the 9px sprite)
  - Both participants enter the state simultaneously and exit when their shared timer ends
  - After interaction ends, both resume `WANDER`
- `ENTER_CAR`: walk to own parked car, hide person sprite, mark car as moving.
- `DRIVE`: car follows main street + central spine + east stub. Pick 1–3 random street waypoints, then return.
- `PARK_CAR`: car returns to home parking spot, person sprite reappears.
- `RETURN`: walk from current location back through garden gate to home door.

---

## Movement & Pathfinding

Keep it **dead simple**:

- Walkable surfaces: main street (Y≈466), parking/access lanes (Y=520, 574), garden gates, own garden, own room
- Drivable surfaces: main street + east road stub + north road
- **Path = list of waypoints** built from the street grid. Movement is straight-line to next waypoint at constant speed (28 px/s for walking, 50 px/s for cars)
- No collision avoidance between people or cars (acceptable for v1; they pass through each other, this is a sim toy)
- Person can only enter/exit their own garden (others' gardens are visually impassable but not enforced beyond not pathing through)

Helper functions:
- `walkTo(person, waypoints)` — sets target queue
- `driveTo(person, waypoints)` — same for car
- `nearestStreetPoint(x, y)` — pick the closest street waypoint to a given location
- `randomStreetWaypoint()` — random walkable destination

---

## Drawing

Reuse main sim style: solid `fillRect` with 18px-aligned coordinates plus pixel sprites for person and car.

- **Grass**: `#2e8b57`
- **Road / parking lane**: `#3f3f3f` with `#e0e0e0` dashed centre lines
- **House walls**: `#a0856a` (warm), 2px outline `#5a4a36`
- **House roof / divider**: thin `#c4956a` strip at top
- **Bed inside room**: simple ~6×8px rectangle in one corner of each room — mattress `#d9c9a3` with a tiny pillow `#f4ecd8` (~2×3 px) at one end. No frame. Always visible from above so you can see where each resident sleeps.
- **Sleeping tint**: when a person is in `SLEEPING` state, multiply RGB of person sprite (head/shirt/legs) and their room's interior wall colour by **0.7** to darken. Bed stays normal. White interaction dot is not drawn during sleep.
- **Interaction dot**: 2×2 px solid white `#ffffff` drawn 3 px above the head of any person in `INTERACT` state.
- **Garden**: `#3ca067` (lighter than grass)
- **Garden fence**: `#8b6f47` 2px strips on perimeter; gate = 4px gap facing main street
- **Town square**: `#c9b38a` (tan)
- **Bakery**: `#e8c97a` walls, `#7a4a28` door
- **Person sprite**: 5×9px. Head stays pink `#f4c2a1`, **shirt colour drawn from palette** (replaces current red `R`). Legs/boots stay black.
- **Car sprite**: 18×12px. Windows stay green `#3a5a3a`, windshield stays cyan `#9ad6e8`, **body colour drawn from same palette** (replaces current green `G`/`B` body).

**Person/car colour palette** (single shared array, both shirts and cars draw from it; each person gets one shirt colour and one car colour, picked deterministically by `homeId` so they're stable across reloads):

```js
const PALETTE = [
  '#b25a3c',  // brick red
  '#c9a043',  // mustard
  '#6a8e5a',  // sage green
  '#3d7c8c',  // teal
  '#5a6a8e',  // slate blue
  '#8e3d4a',  // burgundy
  '#6a4d7a',  // plum
  '#d9c9a3',  // cream
  '#4a6e4a',  // forest
  '#a87a4a',  // tan / chestnut
];
```

These tones echo the existing earthy/muted sim palette (#7a7a8a station, #c9a87a track, #d4c3a8 quarry, #2e8b57 grass) so the town reads as part of the same world. **Each person picks ONE colour from the palette and uses it for BOTH their shirt and their car** — this makes residents instantly identifiable (you can spot which car belongs to which person just by colour matching). Pick by hash of `homeId` (e.g. `PALETTE[homeId % PALETTE.length]`) to keep assignments deterministic. With 30 people and 10 palette colours, each colour is shared by exactly 3 residents — distinct enough to tell apart in motion but not so unique that the palette feels overstuffed.

Draw order each frame:
1. Grass background
2. Roads (north stub, main street, access lanes, east stub)
3. Town square + bakery + bakery parking lines
4. Gardens + fences + gates
5. Houses (walls + bed + door gap)
6. Parked cars (those whose owner is `AT_HOME` or away on foot)
7. People (those visible — not hidden inside car or inside house unless rendered there)
8. Moving cars

---

## File Structure

`testtown.html` is a single self-contained file (mirrors `index.html` style):

```
<html>
  <head>
    <title>Test Town</title>
    <style> body{margin:0;background:#222} canvas{display:block;margin:auto} </style>
  </head>
  <body>
    <canvas id="c" width="1200" height="700"></canvas>
    <script>
      // === Constants (canvas, grid, town coords)
      // === Color palette
      // === Sprite definitions (person, car)
      // === Town layout: build homes[] from a coordinate spec
      // === Build people[] (1 per home)
      // === Helper: street waypoints, path utilities
      // === Update loop: per-person state machine tick
      // === Draw functions
      // === Main animate() with requestAnimationFrame
    </script>
  </body>
</html>
```

Estimated size: ~600–800 lines.

---

## Implementation Steps

1. **Scaffold** `testtown.html` with canvas, grass background, animation loop
2. **Town drawing**: north road (entering at central X=126 T-junction), main street, east stub, central spine, public area (town square + bakery + bakery parking), gardens, houses (no people yet) — verify layout looks right in browser
3. **Build `homes[]` array** programmatically (3 rows × 5 buildings × 2 halves) with per-building variant flag (std / front-pad / side-garden). Each home stores: doorXY, gardenRect, parkingXY, gateXY, variant.
4. **Apply colour palette**: each home assigns its person a shirt colour and car colour by hashing `homeId` into `PALETTE`.
5. **Add static people**: spawn one in each house, draw them stationary inside their room with their assigned shirt colour
6. **Build street waypoint graph**: nodes on main street + central spine + access lanes + parking spots. Use the central spine T-junction as a key routing node.
7. **Implement walk-only behaviour**: AT_HOME → EXIT (through correct gate per variant) → WANDER → RETURN. Tune timings.
8. **Add cars**: parked sprites at each home's parking spot (front-pad or rear-lane depending on variant), in their assigned body colour
9. **Implement drive behaviour**: ENTER_CAR → DRIVE (loop using main street + central spine + east stub) → PARK → exit car → RETURN
10. **Add INTERACT**: proximity check during WANDER, brief pause
11. **Polish**: tune probabilities and timings so the town feels lively but not chaotic

---

## Verification

- Open `testtown.html` in browser (or `file://` it)
- Watch for ~30s: roughly even distribution of people at home / wandering / driving
- Each person ends up back at their own house (track by colour or hover)
- No crashes; framerate stays smooth (60fps)
- Layout visually fits in bottom-left; no overlap with imaginary other sim elements
- Cars park back in their assigned spot

---

## Out of Scope (v1)

- Collision avoidance between people/cars
- Person/car physics (acceleration, smooth turning)
- Day/night cycle, schedules
- Bakery actually doing anything (it's just a building)
- Integration with `index.html` (that's a follow-up once layout & AI feel right)
