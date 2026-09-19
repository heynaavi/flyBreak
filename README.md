# FlyBreak

A fruit fly lives in your MacBook notch. Its brain is the real one.

Every decision the fly makes — jump, eat, turn — comes from the **MaleCNS v1.0 connectome**
(HHMI Janelia + Google, released 3 Sept 2026): 166,700 neurons and 24.5 million synapses,
simulated live on the Mac GPU as a leaky integrate-and-fire network. Nothing is trained.

- **Your cursor is the predator.** Move it at the fly and its looming detectors (`LPLC2`, `LC4`)
  drive the giant fiber (`DNp01`) — the textbook fly escape circuit — and it jumps away.
- **A sugar cube hangs from the notch.** When the fly's labellum touches it, the sweet-taste neurons
  (`LB3a–d`) fire, the proboscis motor neuron (`MN9`) fires, and it eats.
- **Feeding the fly is your break.** Start a focus block from the menu-bar icon; the fly sleeps on the
  notch. When the timer ends, the sugar drops and the fly wakes: 60 seconds of FlyBreak.

Built solo in ~2 h at the Claude Community Hackathon (Delight track) with Claude Fable 5.1.

## Run

```bash
# brain (once): Python 3.13 + MLX, Apple silicon only
cd brain/engine && uv venv --python 3.13 && uv pip install -e '.[dev]' websockets
./tools/fetch_male_cns.sh && .venv/bin/python -m lif.compile_pack_malecns      # ~1.1 GB download

# app
cd ../../app && npm install && npm start      # spawns the brain server, opens the notch overlay
```

Menu-bar icon → *Fly, free (demo)* to start immediately. `app/fly-lab.html` shows the fly close up.

## What is real and what is cartoon

| Real (from the connectome) | Hand-written |
|---|---|
| All wiring, synapse counts, excitation/inhibition from predicted transmitters | The body, the wings, the light |
| Whether looming makes it jump and sugar makes it eat | How the cursor becomes spike rates on LPLC2/LC4 (approach speed ÷ distance) |
| Which descending neurons fire, and how hard (`hz` in the HUD) | Saccadic flight: straight runs and ~90° turns in ~70 ms, like real flies, but scripted |

Speed on an M1 Pro: 0.4–1.8× real time depending on how much of the brain is active.

## Architecture

```
app/  Electron overlay hugging the notch (transparent, click-through, above the menu bar)
      renderer/app.js   world, senses -> spike rates, brain -> body, break ritual, shimmer
      renderer/fly.js   the fly and the sugar cube, canvas 2D
brain/server.py         LiveBrain: the LIF engine unrolled into a persistent state, stepped 18 ms at a
                        time and streamed over a WebSocket ({senses} in, {hz per action group} out)
brain/engine/           vendored MLX/Metal LIF engine (MIT, Kisame76/drosophila-brain-mlx)
```

## Credits

- Connectome: MaleCNS v1.0, HHMI Janelia FlyEM + Google Research (CC BY 4.0). https://male-cns.janelia.org
- Neuron model: Shiu et al. 2024, *A Drosophila computational brain model reveals sensorimotor processing*, Nature.
- Engine: Kisame76/drosophila-brain-mlx (MIT). Cell-type mappings after jonathancomergit-ai/fly-terrarium.
- This is a toy for delight, not a scientific result.
