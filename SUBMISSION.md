# FlyBreak — submission copy

**Project name:** FlyBreak

**One-liner:** A fruit fly with the real male fruit-fly brain lives in your MacBook notch. Your cursor is the predator. Feeding it is your break.

**Track:** Delight

**Short description (≈60 words):**
FlyBreak turns the MacBook notch into a home for a fruit fly whose decisions come from the real MaleCNS connectome (Google + Janelia, released 3 Sept 2026) — 166,700 neurons simulated live on the Mac GPU. Start a focus block; when it ends the screen dims to a stage, the fly emerges from the notch, sugar cubes drop in, and your cursor becomes the predator. Feeding it is your break.

**Long description:**
Every notch app treats the notch as screen space. FlyBreak treats it as a burrow. The fly inside is driven by the real wiring of a male fruit fly's nervous system: the MaleCNS v1.0 connectome, run as Shiu et al.'s leaky integrate-and-fire model on Apple silicon (MLX/Metal) at 0.4–1.8× real time. Nothing is trained.

When your cursor approaches, its looming is encoded onto the fly's LPLC2/LC4 looming detectors; the real giant fiber (DNp01) fires and the fly jumps — the textbook fly escape circuit. When its labellum touches a sugar cube, the sweet-taste neurons (LB3) drive the proboscis motor neuron (MN9) and it eats, in bouts, with a few steps between sips like a real fly. The HUD shows the actual neurons and firing rates as they happen.

The body is DeepMind/Janelia's micro-CT Drosophila model (flybody, Apache-2.0), rebuilt in Three.js with the wings hinged at their real joints, real shadows on the glass, a 92% dimmed stage with drifting dust, and a music-box sound design so the break feels like a pause, not an insect.

Honesty note: the decisions (jump, eat, turn) come from the connectome; the body animation, the flight autopilot, and how senses become spike rates are hand-written.

**How Fable 5.1 was used:** the whole build — research into the connectome/model landscape, the streaming wrapper around the MLX engine, the notch overlay, the 3D pipeline (MuJoCo export → decimation → Three.js), materials, sound design and this write-up — was done in a single Claude Code session with Fable 5.1 driving the work.

**Tech:** Electron (transparent, click-through overlay over the menu bar) · Three.js · GSAP · WebAudio · Python + MLX (Metal) brain server over WebSocket · MuJoCo (for the rest-pose export) · gltfpack.

**Credits:**
- Connectome: MaleCNS v1.0 — HHMI Janelia FlyEM + Google Research (CC BY 4.0), https://male-cns.janelia.org
- Neuron model: Shiu et al. 2024, *A Drosophila computational brain model reveals sensorimotor processing*, Nature.
- Engine: Kisame76/drosophila-brain-mlx (MIT). Cell-type mappings after jonathancomergit-ai/fly-terrarium.
- Body: flybody — Google DeepMind + HHMI Janelia (Apache-2.0), via mujoco_menagerie.
- Sugar texture generated with Magnific.

**Demo script (60 s):**
1. 🪰 menu → *FlyBreak now (60 s)*: stage dims, whoosh, the fly slides out of the notch and peels away.
2. The notch rim pulses; three sugar cubes drop in with bells.
3. Chase it with the cursor — the HUD prints `LPLC2/LC4 → DNp01 giant fiber: ESCAPE 300 Hz` and it jumps.
4. Let it land: it glides onto a cube, folds its wings, feeds in bouts, steps, feeds again — `LB3 → MN9`.
5. Break ends: it flies home into the notch and the lights come back.
