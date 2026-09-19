// audio.js — synthesized sound design for FlyBreak (WebAudio, no assets).
// buzz: wing beat, pitch/volume follow airspeed  · burst: giant-fiber escape  · chime: sugar arrives
// sip: feeding  · pad: a quiet warm bed while the break is on  · whoosh: emerging from / returning to the notch
(function () {
  let ctx, master, buzz, pad;
  const A = {};

  function ensure() {
    if (ctx) return true;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    // ---- buzz: two sawtooths an octave apart through a low-pass, with a wing-beat tremolo
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 1.2;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 190;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 381; o2.detune.value = 8;
    const o2g = ctx.createGain(); o2g.gain.value = 0.35;
    const trem = ctx.createOscillator(); trem.type = 'sine'; trem.frequency.value = 28;
    const tremG = ctx.createGain(); tremG.gain.value = 0.35;
    const tremBias = ctx.createGain(); tremBias.gain.value = 1;
    o1.connect(lp); o2.connect(o2g).connect(lp); lp.connect(g).connect(master);
    trem.connect(tremG).connect(g.gain);
    o1.start(); o2.start(); trem.start();
    buzz = { g, lp, o1, o2, trem };
    // ---- pad: detuned triangles with a slow shimmer, very quiet
    const pg = ctx.createGain(); pg.gain.value = 0;
    const plp = ctx.createBiquadFilter(); plp.type = 'lowpass'; plp.frequency.value = 900;
    const p1 = ctx.createOscillator(); p1.type = 'triangle'; p1.frequency.value = 110;
    const p2 = ctx.createOscillator(); p2.type = 'triangle'; p2.frequency.value = 164.8; p2.detune.value = -6;
    const p3 = ctx.createOscillator(); p3.type = 'sine'; p3.frequency.value = 220; p3.detune.value = 5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lfoG = ctx.createGain(); lfoG.gain.value = 300;
    lfo.connect(lfoG).connect(plp.frequency);
    for (const o of [p1, p2, p3]) { o.connect(plp); o.start(); }
    plp.connect(pg).connect(master); lfo.start();
    pad = { g: pg };
    return true;
  }
  function noise(dur) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; return src;
  }
  function tone(freq, dur, type = 'sine', vol = 0.2, t0 = 0) {
    const t = ctx.currentTime + t0, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  // continuous: call every frame with the fly state
  A.update = function (fly, phase, dt) {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const flying = fly.flying || fly.mode === 'landing';
    const speed = fly.speed || 0;
    const target = flying ? Math.min(0.11, 0.045 + speed / 3500) : 0;
    buzz.g.gain.setTargetAtTime(target, t, flying ? 0.08 : 0.25);
    buzz.o1.frequency.setTargetAtTime(175 + speed * 0.06 + (fly.mode === 'jump' ? 60 : 0), t, 0.1);
    buzz.o2.frequency.setTargetAtTime((175 + speed * 0.06) * 2.02, t, 0.1);
    buzz.lp.frequency.setTargetAtTime(600 + speed * 1.2, t, 0.1);
    buzz.trem.frequency.setTargetAtTime(24 + speed / 40, t, 0.2);
    const padOn = phase === 'break' || phase === 'free';
    pad.g.gain.setTargetAtTime(padOn ? 0.035 : 0, t, padOn ? 2.5 : 1.2);
  };
  // giant fiber: a sharp whoosh + pitch snap
  A.escape = function () {
    if (!ensure()) return;
    const t = ctx.currentTime, n = noise(0.35), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.12); bp.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
    n.connect(bp).connect(g).connect(master); n.start(t);
    tone(520, 0.12, 'square', 0.03);
  };
  // sugar cube lands: a soft bell + tiny thud
  A.chime = function (i = 0) {
    if (!ensure()) return;
    const base = [880, 1108.7, 1318.5][i % 3];
    tone(base, 0.9, 'sine', 0.09); tone(base * 2, 0.5, 'sine', 0.03, 0.01); tone(base * 1.5, 1.2, 'triangle', 0.02, 0.02);
    const t = ctx.currentTime, n = noise(0.08), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 300; g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(lp).connect(g).connect(master); n.start(t);
  };
  // feeding: a small wet tick every so often
  A.sip = function () {
    if (!ensure()) return;
    const t = ctx.currentTime, n = noise(0.09), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(2400, t); bp.frequency.exponentialRampToValueAtTime(900, t + 0.08); bp.Q.value = 3;
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(bp).connect(g).connect(master); n.start(t);
  };
  // emerging from / returning into the notch
  A.whoosh = function (up = true) {
    if (!ensure()) return;
    const t = ctx.currentTime, n = noise(0.6), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(up ? 300 : 1800, t); bp.frequency.exponentialRampToValueAtTime(up ? 1800 : 300, t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.6);
    n.connect(bp).connect(g).connect(master); n.start(t);
    tone(up ? 330 : 440, 0.6, 'sine', 0.04); tone(up ? 495 : 330, 0.6, 'sine', 0.03, 0.12);
  };
  // fed: a little three-note reward
  A.reward = function () {
    if (!ensure()) return;
    tone(659.3, 0.35, 'sine', 0.07); tone(830.6, 0.35, 'sine', 0.07, 0.11); tone(1046.5, 0.7, 'sine', 0.08, 0.22);
  };
  window.FlyAudio = A;
})();
