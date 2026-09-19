"""FlyBreak brain server: the MaleCNS v1.0 fly brain (166,700 neurons, 24.5M synapses) as a
leaky integrate-and-fire network, stepped live on the Mac GPU (MLX/Metal) and streamed
over a WebSocket to the notch app.

    uv run --project engine python server.py      # ws://127.0.0.1:8765

Protocol (JSON both ways):
  client -> server  {"senses": {"sugar": 150, "looming": 0}, "reset": false}
  server -> client  {"simMs": 1234.5, "hz": {"escape": 0, "feed": 66, "turnL": 3, ...},
                     "active": 2171, "speed": 0.7}
hz is spikes per neuron per second over the last step, for the action groups below.
Every decision (jump, eat, turn) comes from the real wiring; how senses become spike
rates (looming disc -> LPLC2/LC4 at N Hz) is hand-written, like in fly-terrarium.
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

import mlx.core as mx
import numpy as np
import pyarrow.parquet as pq

ENGINE = Path(__file__).parent / "engine"
sys.path.insert(0, str(ENGINE / "src"))
from lif import core  # noqa: E402
from lif.engine_fused import _state_kernel  # noqa: E402
from lif.engine_metal import propagate, silenced_row_end  # noqa: E402

PACK = ENGINE / "data" / "pack" / "male_cns_v1"
PORT = 8765
STEP_TICKS = 180          # 18 ms of brain time per step (dt = 0.1 ms)
CHUNK = 32

# MaleCNS cell types (same mapping fly-terrarium validated against the literature).
SENSES = {
    "sugar":   ["LB3a", "LB3b", "LB3c", "LB3d"],          # labellar sweet-taste neurons
    "bitter":  ["LB1a", "LB1b", "LB1c", "LB1d", "LB1e"],
    "looming": ["LPLC2", "LC4"],                          # looming detectors (cursor!)
    "wind":    ["JO-CL", "JO-CM", "JO-CA1", "JO-CA2", "JO-ED1", "JO-ED2_a", "JO-ED2_b",
                "JO-ED2_c", "JO-EV1", "JO-EV2", "JO-EV3", "JO-EV5", "JO-EV6"],
}
ACTIONS = {
    "escape":   ["DNp01"],                       # giant fiber -> jump
    "feed":     ["MN9"],                         # proboscis extension
    "backward": ["MDN"],                         # moonwalker
    "groom":    ["DNg62", "DNge078"],            # antennal grooming
    "forward":  ["DNp09", "DNg100", "DNg97"],
    "turnL":    ("DNa01", "DNa02", "L"),
    "turnR":    ("DNa01", "DNa02", "R"),
}


class LiveBrain:
    """engine_fused.run, unrolled into a persistent state that can be stepped forever."""

    def __init__(self, pack: core.Pack):
        self.pack = pack
        N = pack.n_neurons
        tbl = pq.read_table(pack.path / "names.parquet", columns=["type", "instance"])
        typ = np.array(tbl["type"].to_pylist(), dtype=object)
        inst = np.array(tbl["instance"].to_pylist(), dtype=object)

        def of(types, side=None):
            idx = np.where(np.isin(typ, list(types)))[0]
            if side:
                idx = np.array([i for i in idx if str(inst[i]).endswith("_" + side)], dtype=np.int64)
            return idx.astype(np.int32)

        self.senses = {k: of(v) for k, v in SENSES.items()}
        self.actions = {k: (of(v[:2], v[2]) if isinstance(v, tuple) else of(v)) for k, v in ACTIONS.items()}
        for k, v in {**self.senses, **self.actions}.items():
            print(f"  {k:9s} {len(v):4d} neurons")

        # every sensory neuron we might drive gets a stimulus slot (and no refractory period,
        # exactly like upstream's Poisson targets)
        self.targets = np.unique(np.concatenate(list(self.senses.values()))).astype(np.int32)
        K = self.targets.size
        slot = np.full(N, -1, dtype=np.int32)
        slot[self.targets] = np.arange(K, dtype=np.int32)
        self.target_slot = mx.array(slot)
        self.slot_of = {k: slot[v] for k, v in self.senses.items()}

        dummy = core.Stimulus(targets=self.targets, draws=mx.zeros((1, K), dtype=mx.bool_),
                              n_ticks=1, rate_hz=0.0, seed=0)
        st = core.initial_state(pack, dummy)
        self.v, self.g, self.rfc, self.counts, self.rl = st["v"], st["g"], st["rfc"], st["counts"], st["rfc_reload"]
        self.ring = [mx.zeros((N,), dtype=mx.uint8) for _ in range(core.DELAY_TICKS)]
        self.row_end = silenced_row_end(pack, None)
        cf = core.constants_f32()
        self.k = {f"c_{n}": mx.array([float(cf[n])], dtype=mx.float32)
                  for n in ("v0_term", "couple_g", "decay_v", "decay_g", "v_th", "w_syn", "w_ext", "v_0")}
        self.n_neurons = mx.array([N], dtype=mx.uint32)
        self.act_idx = {k: mx.array(v) for k, v in self.actions.items()}
        self.rng = np.random.default_rng(int(time.time()))
        self.t = 0
        self.last_counts = np.zeros(N, dtype=np.int32)
        self.rates = {k: 0.0 for k in SENSES}
        mx.eval(self.v, self.g, self.rfc, self.counts, *self.ring)

    def reset(self):
        N = self.pack.n_neurons
        self.v = mx.full((N,), core.V_0, dtype=mx.float32)
        self.g = mx.zeros((N,), dtype=mx.float32)
        self.rfc = mx.zeros((N,), dtype=mx.int32)
        self.ring = [mx.zeros((N,), dtype=mx.uint8) for _ in range(core.DELAY_TICKS)]
        mx.eval(self.v, self.g, self.rfc, *self.ring)

    def step(self, n_ticks: int = STEP_TICKS) -> dict:
        K = self.targets.size
        p = np.zeros(K)
        for name, hz in self.rates.items():
            if hz > 0:
                p[self.slot_of[name]] = min(1.0, hz * core.DT / 1000.0)
        draws = mx.array((self.rng.random((n_ticks, K)) < p).astype(np.uint8))
        k = self.k
        t0 = time.perf_counter()
        for i in range(n_ticks):
            s = self.t % core.DELAY_TICKS
            contrib = propagate(self.ring[s], self.pack, self.n_neurons, 1, row_end=self.row_end)
            self.v, self.g, self.rfc, self.counts, spike = _state_kernel(
                inputs=[self.v, self.g, self.rfc, self.counts, contrib, draws[i], self.target_slot,
                        self.rl, self.n_neurons, k["c_v0_term"], k["c_couple_g"], k["c_decay_v"],
                        k["c_decay_g"], k["c_v_th"], k["c_w_syn"], k["c_w_ext"], k["c_v_0"]],
                output_shapes=[(self.pack.n_neurons,)] * 5,
                output_dtypes=[mx.float32, mx.float32, mx.int32, mx.int32, mx.uint8],
                grid=(self.pack.n_neurons, 1, 1), threadgroup=(256, 1, 1))
            self.ring[s] = spike
            self.t += 1
            if (i + 1) % CHUNK == 0:
                mx.async_eval(self.v, self.g, self.rfc, self.counts, *self.ring)
        mx.eval(self.v, self.g, self.rfc, self.counts, *self.ring)
        wall = time.perf_counter() - t0
        counts = np.asarray(self.counts)
        delta = counts - self.last_counts
        self.last_counts = counts
        secs = n_ticks * core.DT / 1000.0
        hz = {k: float(delta[v].sum()) / max(1, len(v)) / secs for k, v in self.actions.items()}
        return {"simMs": self.t * core.DT, "hz": {k: round(x, 1) for k, x in hz.items()},
                "active": int((delta > 0).sum()), "speed": round(secs / wall, 2)}


async def main():
    import websockets

    print("loading MaleCNS v1.0 pack ...")
    pack = core.load_pack(PACK)
    print(f"{pack.n_neurons:,} neurons, {pack.n_edges:,} synapses")
    brain = LiveBrain(pack)
    clients: set = set()
    quiet_steps = 0

    async def handler(ws):
        clients.add(ws)
        try:
            async for msg in ws:
                req = json.loads(msg)
                for k, v in req.get("senses", {}).items():
                    if k in brain.rates:
                        brain.rates[k] = float(v)
                if req.get("reset"):
                    brain.reset()
        finally:
            clients.discard(ws)

    async def loop():
        nonlocal quiet_steps
        while True:
            out = await asyncio.to_thread(brain.step)
            # a circuit stuck firing on its own with nothing touching the fly: model limit, not biology
            quiet = all(v <= 0 for v in brain.rates.values())
            quiet_steps = quiet_steps + 1 if (quiet and out["active"] > 15000) else 0
            if quiet_steps > 150:
                brain.reset(); quiet_steps = 0; out["reset"] = True
            if clients:
                data = json.dumps(out)
                await asyncio.gather(*(c.send(data) for c in list(clients)), return_exceptions=True)
            await asyncio.sleep(0)

    async with websockets.serve(handler, "127.0.0.1", PORT):
        print(f"brain live on ws://127.0.0.1:{PORT}")
        await loop()


if __name__ == "__main__":
    asyncio.run(main())
