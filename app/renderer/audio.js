// audio.js — sound design for FlyBreak, synthesized with WebAudio (no assets).
// The brief: someone is taking a break, so this is a music box, not an insect. A warm sustained chord
// while the break is on, soft pentatonic bells for events, and a very quiet purr for the wings.
(function () {
  let ctx, master, purr, pad, lastBell = 0;
  const A = {};
  const PENTA = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0];   // C major pentatonic

  function ensure() {
    if (ctx) return true;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
    master = ctx.createGain(); master.gain.value = 0.8;
    // a touch of room so bells and whooshes don't sound dry
    const conv = ctx.createConvolver(); conv.buffer = impulse(1.6, 2.5);
    const wet = ctx.createGain(); wet.gain.value = 0.28; const dry = ctx.createGain(); dry.gain.value = 1;
    master.connect(dry).connect(ctx.destination); master.connect(conv).connect(wet).connect(ctx.destination);
    // ---- purr: a soft low hum (triangle + sine) through a low-pass, gentle tremolo, barely there
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 98;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 196; const o2g = ctx.createGain(); o2g.gain.value = 0.3;
    const trem = ctx.createOscillator(); trem.type = 'sine'; trem.frequency.value = 9; const tremG = ctx.createGain(); tremG.gain.value = 0.25;
    o1.connect(lp); o2.connect(o2g).connect(lp); lp.connect(g).connect(master); trem.connect(tremG).connect(g.gain);
    o1.start(); o2.start(); trem.start();
    purr = { g, lp, o1, o2, trem };
    // ---- pad: a warm A-major chord of sines with slow individual swells
    const pg = ctx.createGain(); pg.gain.value = 0;
    const plp = ctx.createBiquadFilter(); plp.type = 'lowpass'; plp.frequency.value = 1200;
    [110, 164.8, 220, 277.2, 329.6].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i < 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i % 2 ? 4 : -4);
      const og = ctx.createGain(); og.gain.value = i < 2 ? 0.5 : 0.35;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.017; const lg = ctx.createGain(); lg.gain.value = 0.15;
      lfo.connect(lg).connect(og.gain); o.connect(og).connect(plp); o.start(); lfo.start();
    });
    plp.connect(pg).connect(master);
    pad = { g: pg };
    return true;
  }
  function impulse(dur, decay) {
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }
  function noise(dur) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; return src;
  }
  // a music-box bell: sine + a faint octave, fast attack, long ring
  function bell(freq, vol = 0.06, t0 = 0, dur = 1.8) {
    const t = ctx.currentTime + t0;
    for (const [mult, v] of [[1, 1], [2, 0.25], [3, 0.08]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0005, t + dur / mult);
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  function swoosh(fromHz, toHz, dur, vol) {
    const t = ctx.currentTime, n = noise(dur), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 0.9; bp.frequency.setValueAtTime(fromHz, t); bp.frequency.exponentialRampToValueAtTime(toHz, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    n.connect(bp).connect(g).connect(master); n.start(t);
  }

  // continuous: call every frame with the fly state
  A.update = function (fly, phase, dt) {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const flying = (fly.flying || fly.mode === 'landing') && !fly.hiding && fly.mode !== 'feed' && fly.mode !== 'rest';
    const speed = fly.speed || 0;
    purr.g.gain.setTargetAtTime(flying ? Math.min(0.035, 0.018 + speed / 12000) : 0, t, flying ? 0.15 : 0.35);
    purr.o1.frequency.setTargetAtTime(92 + speed * 0.03, t, 0.2);
    purr.o2.frequency.setTargetAtTime((92 + speed * 0.03) * 2, t, 0.2);
    purr.trem.frequency.setTargetAtTime(7 + speed / 80, t, 0.3);
    const padOn = phase === 'break' || phase === 'free';
    pad.g.gain.setTargetAtTime(padOn ? 0.05 : 0, t, padOn ? 3.5 : 1.5);
    // an occasional stray bell while the break is on, like a music box winding down
    if (padOn && t - lastBell > 6 + Math.random() * 8) { lastBell = t; bell(PENTA[Math.floor(Math.random() * 5) + 2], 0.025, 0, 2.5); }
  };
  // giant fiber: a quick soft swoosh and a rising two-note flick
  A.escape = function () {
    if (!ensure()) return;
    swoosh(500, 2200, 0.35, 0.05);
    bell(PENTA[4], 0.03, 0, 0.6); bell(PENTA[6], 0.03, 0.07, 0.8);
  };
  // sugar cube lands: bell up the scale, one per cube
  A.chime = function (i = 0) {
    if (!ensure()) return;
    bell(PENTA[2 + i * 2], 0.07, 0, 2.2); bell(PENTA[2 + i * 2] * 2, 0.02, 0.02, 1.2);
  };
  // feeding: a tiny soft tick, well under the pad
  A.sip = function () {};   // perched = silent
  // emerging from / returning into the notch: an airy swoosh with a little scale run
  A.whoosh = function (up = true) {
    if (!ensure()) return;
    swoosh(up ? 250 : 1400, up ? 1400 : 250, 0.6, 0.04);
    const run = up ? [0, 2, 4, 6] : [6, 4, 2, 0];
    run.forEach((k, i) => bell(PENTA[k], 0.035, i * 0.09, 1.2));
  };
  // fed: a gentle three-note resolve
  A.reward = function () {
    if (!ensure()) return;
    bell(PENTA[3], 0.05, 0, 1.4); bell(PENTA[5], 0.05, 0.14, 1.4); bell(PENTA[8], 0.06, 0.28, 2.4);
  };
  window.FlyAudio = A;
})();
