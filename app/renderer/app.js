// app.js — the world: senses -> brain, brain -> body, the break ritual, the light.
// Real: every jump / eat / turn decision comes from the MaleCNS wiring (via ../brain/server.py).
// Cartoon: the body, the saccadic flight autopilot, and how senses turn into spike rates.
(function () {
  const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const q = new URLSearchParams(location.search);
  const inElectron = !!window.notch;
  if (!inElectron) document.body.classList.add('browser');
  const W = +(q.get('w') || innerWidth), H = +(q.get('h') || innerHeight);
  const NOTCH = { x: +(q.get('notchX') || W / 2 - 92.5), w: +(q.get('notchW') || 185), h: +(q.get('notchH') || 32) };
  NOTCH.cx = NOTCH.x + NOTCH.w / 2;
  const BASE_SCALE = +(q.get('scale') || 2.6);

  const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;
  canvas.width = W * DPR; canvas.height = H * DPR; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(DPR, DPR);

  // ------------------------------------------------------------------ world state
  const cursor = { x: -999, y: -999, vx: 0, vy: 0, t: 0 };
  const sugar = { cubes: [], x: NOTCH.cx, y: NOTCH.h + 4, target: null };   // cubes: {x, y, amount}
  const fly = {
    x: NOTCH.cx, y: NOTCH.h - 22, heading: Math.PI / 2, targetHeading: Math.PI / 2, speed: 0, alt: 0, roll: 0,
    flying: false, wingPhase: 0, legPhase: 0, proboscis: 0, scale: BASE_SCALE, groom: 0,
    mode: 'rest', cooldown: 0, saccadeIn: 0.3, burst: 0, satiated: 0, noticed: false,
  };
  const hz = { escape: 0, feed: 0, backward: 0, groom: 0, forward: 0, turnL: 0, turnR: 0 };
  const brain = { online: false, speed: 0, active: 0, simMs: 0, ws: null, lastMsg: 0 };
  const app = { phase: 'rest', timer: 0, fed: 0, msg: '', msgAlpha: 0, flash: 0, events: [], dim: 0, pulse: 0, menuLift: 0 };
  const senses = { sugar: 0, looming: 0 };
  const dust = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.25, vy: -0.05 - Math.random() * 0.12, r: 0.6 + Math.random() * 1.4, s: 0.3 + Math.random() * 0.7, o: Math.random() * TAU }));
  const particles = Array.from({ length: 60 }, (_, i) => ({
    a: (i / 60) * TAU, r: 40 + Math.random() * 60, s: 0.4 + Math.random() * 0.8, o: Math.random() * TAU, sz: 0.7 + Math.random() * 1.4,
  }));

  // ------------------------------------------------------------------ inputs
  if (inElectron) {
    window.notch.onCursor(p => setCursor(p.x, p.y));
    window.notch.onCommand(cmd => command(cmd));
    window.notch.onMenu(open => gsap.to(app, { menuLift: open ? 0.75 : 0, duration: open ? 0.15 : 0.5 }));
  } else {
    addEventListener('mousemove', e => setCursor(e.clientX, e.clientY));
    const keys = { f: 'focus', b: 'break', r: 'rest', d: 'free' };
    addEventListener('keydown', e => keys[e.key] && command(keys[e.key]));
  }
  function setCursor(x, y) {
    const now = performance.now() / 1000, dt = Math.max(0.004, now - cursor.t);
    cursor.vx = (x - cursor.x) / dt; cursor.vy = (y - cursor.y) / dt;
    cursor.x = x; cursor.y = y; cursor.t = now;
  }

  function say(text, ms = 2800) {
    app.msg = text; gsap.killTweensOf(app, 'msgAlpha');
    gsap.fromTo(app, { msgAlpha: 0 }, { msgAlpha: 1, duration: 0.3 });
    gsap.to(app, { msgAlpha: 0, duration: 0.7, delay: ms / 1000 });
  }

  function command(cmd) {
    if (cmd === 'focus') { app.phase = 'focus'; app.timer = 25 * 60; clearSugar(); goHome(); gsap.to(app, { dim: 0, duration: 1 }); say('Focus. Your fly sleeps in the notch.'); }
    if (cmd === 'break') startBreak(60);
    if (cmd === 'free') startBreak(1e9);
    if (cmd === 'rest') { app.phase = 'rest'; clearSugar(); goHome(); gsap.to(app, { dim: 0, duration: 1 }); say('Resting.'); }
    if (cmd === 'resetBrain') brain.ws?.send(JSON.stringify({ reset: true }));
  }

  // The ritual: the fly lives inside the notch. The stage dims, the fly emerges from the notch and flies
  // off, the notch rim lights, the cubes arrive one by one, the fly notices and comes back for them.
  const HOME = () => ({ x: NOTCH.cx, y: NOTCH.h - 22, h: Math.PI / 2 });   // inside the cutout: invisible
  function startBreak(secs) {
    app.phase = secs > 1e8 ? 'free' : 'break'; app.timer = secs; app.fed = 0; fly.noticed = false; fly.hiding = false;
    gsap.killTweensOf(fly, 'x,y,z,heading,alt');
    gsap.to(app, { dim: 0.92, duration: 1.4, ease: 'power2.inOut' });
    say(secs > 1e8 ? 'Free flight. Your cursor is the predator.' : 'FlyBreak. Your cursor is the predator.');
    const tl = gsap.timeline({ delay: 0.9 });
    // emerge: slide out of the notch's mouth, wings already going, then peel away downward
    tl.call(() => {
      Object.assign(fly, HOME()); fly.heading = Math.PI / 2; fly.flying = true; fly.mode = 'emerging'; fly.speed = 60; fly.alt = 0.2; fly.z = 0;
      window.FlyAudio?.whoosh(true); app.flash = 0.6;
      gsap.to(fly, { y: NOTCH.h + 46, alt: 0.6, duration: 0.7, ease: 'power2.out' });
    });
    tl.call(() => { fly.mode = 'fly'; fly.targetHeading = Math.PI / 2 + (Math.random() - 0.5) * 1.4; fly.speed = 220; fly.saccadeIn = 0.5; fly.satiated = 4; }, [], 0.75);
    tl.to(app, { pulse: 1, duration: 0.5, ease: 'sine.out' }, 2.0).to(app, { pulse: 0.35, duration: 0.8 });
    for (let i = 0; i < 3; i++) tl.call(dropCube, [i], 2.6 + i * 0.6);
    tl.call(() => { fly.noticed = true; fly.satiated = 0; event('sugar in view', 'orienting'); }, [], 4.6);
  }
  // back into the notch: fly to the mouth, slip inside, go dark
  function goHome(then) {
    const h = HOME();
    gsap.killTweensOf(fly, 'x,y,z,heading,alt');
    fly.mode = 'homing'; fly.flying = true; fly.z = 0; fly.hiding = false;
    gsap.to(fly, { x: h.x, y: NOTCH.h + 40, heading: -Math.PI / 2, alt: 0.4, duration: 0.9, ease: 'power2.inOut',
      onComplete: () => { window.FlyAudio?.whoosh(false); gsap.to(fly, { y: h.y, alt: 0.1, duration: 0.55, ease: 'power2.in',
        onComplete: () => { land(h); fly.hiding = true; then && then(); } }); } });
  }
  function dropCube(i) {
    // cubes settle in the notch's mouth: their top faces overlap the cutout and get clipped by it
    const c = { x: NOTCH.cx + (i - 1) * 80, y: NOTCH.h - 30, amount: 0, land: NOTCH.h + 14 };
    sugar.cubes.push(c);
    gsap.to(c, { amount: 1, duration: 0.35 });
    gsap.to(c, { y: c.land, duration: 0.7, ease: 'bounce.out', onComplete: () => window.FlyAudio?.chime(i) });
    app.flash = Math.max(app.flash, 0.5);
  }
  function respawnCube() {
    if (app.phase !== 'break' && app.phase !== 'free') return;
    dropCube(sugar.cubes.length ? (sugar.cubes.length - 1) : 1);
  }
  function clearSugar() { for (const c of sugar.cubes) gsap.to(c, { amount: 0, duration: 0.5 }); setTimeout(() => (sugar.cubes.length = 0), 600); gsap.to(app, { pulse: 0, duration: 0.6 }); }
  function nearestCube() {
    let best = null, bd = 1e9;
    for (const c of sugar.cubes) { if (c.amount < 0.08) continue; const d = Math.hypot(c.x - fly.x, c.y - fly.y); if (d < bd) { bd = d; best = c; } }
    sugar.target = best; if (best) { sugar.x = best.x; sugar.y = best.y; }
    return best;
  }

  function land(spot) {
    fly.flying = false; fly.mode = 'rest'; fly.speed = 0; fly.alt = 0; fly.proboscis = 0; fly.roll = 0; fly.z = 0;
    const p = spot || HOME();
    gsap.to(fly, { x: p.x, y: p.y, heading: p.h, duration: 0.6, ease: 'power2.out' });
  }
  function takeOff() {
    if (fly.flying) return;
    fly.flying = true; fly.mode = 'fly'; fly.speed = 120; fly.saccadeIn = 0.1; fly.groom = 0; fly.z = 0;
    gsap.to(fly, { alt: 0.6, duration: 0.5, ease: 'power2.out' });
  }

  // ------------------------------------------------------------------ brain link
  function connect() {
    try { brain.ws = new WebSocket('ws://127.0.0.1:8765'); } catch { return setTimeout(connect, 1500); }
    brain.ws.onopen = () => { brain.online = true; say('Brain online: 166,700 neurons.'); };
    brain.ws.onclose = () => { brain.online = false; setTimeout(connect, 1500); };
    brain.ws.onerror = () => brain.ws.close();
    brain.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      brain.speed = m.speed; brain.active = m.active; brain.simMs = m.simMs; brain.lastMsg = performance.now();
      for (const k in hz) hz[k] += (m.hz[k] - hz[k]) * 0.5;
      if (m.reset) say('Brain reset (runaway loop).');
    };
  }
  connect();
  let lastSent = '';
  setInterval(() => {
    const msg = JSON.stringify({ senses: { sugar: Math.round(senses.sugar), looming: Math.round(senses.looming) } });
    if (msg !== lastSent && brain.ws?.readyState === 1) { brain.ws.send(msg); lastSent = msg; }
  }, 33);

  // ------------------------------------------------------------------ senses (world -> spike rates)
  function encodeSenses(dt) {
    // Looming: only the cursor's own motion counts (flies suppress looming from self-motion).
    // LPLC2/LC4 rate follows approach speed / distance (1/tau), with a floor when it is on top of the fly.
    const dx = cursor.x - fly.x, dy = cursor.y - fly.y, d = Math.max(6, Math.hypot(dx, dy));
    if (performance.now() / 1000 - cursor.t > 0.08) { cursor.vx *= 0.5; cursor.vy *= 0.5; }
    const approach = -(dx * cursor.vx + dy * cursor.vy) / d;
    let loom = 0;
    if (d < 420) loom = clamp((approach / d) * 30, 0, 150) + (d < 40 ? 150 : 0);
    senses.looming += (clamp(loom, 0, 150) - senses.looming) * Math.min(1, dt * 18);
    // Sugar: the labellar taste neurons fire on contact.
    const c = nearestCube();
    const hx = fly.x + Math.cos(fly.heading) * 10 * fly.scale, hy = fly.y + Math.sin(fly.heading) * 10 * fly.scale;
    const onSugar = !!c && fly.satiated <= 0 && (fly.mode === 'feed' || Math.hypot(hx - c.x, hy - (c.y + 32)) < 13 * fly.scale);
    senses.sugar = onSugar ? 150 : 0;
    return onSugar ? c : null;
  }

  // ------------------------------------------------------------------ body (brain -> motion)
  function body(dt, cube) {
    fly.cooldown -= dt; fly.satiated -= dt;
    const onSugar = !!cube;
    const offline = !brain.online || performance.now() - brain.lastMsg > 1500;
    const escapeHz = offline ? (senses.looming > 120 ? 200 : 0) : hz.escape;
    const feedHz = offline ? (onSugar ? 60 : 0) : hz.feed;

    if (app.phase === 'break') {
      app.timer -= dt;
      if (app.timer <= 0) { app.phase = 'rest'; clearSugar(); goHome(() => gsap.to(app, { dim: 0, duration: 1.5 })); say(app.fed > 0 ? `Break done. Fly fed ${app.fed}×.` : 'Break done.'); }
    }
    if (app.phase === 'focus') { app.timer -= dt; if (app.timer <= 0) startBreak(60); }

    // ESCAPE: giant fiber -> saccade away from the threat with a speed burst
    if (escapeHz >= 60 && fly.cooldown <= 0 && fly.mode !== 'rest' && fly.mode !== 'emerging' && fly.mode !== 'homing') {
      const away = Math.atan2(fly.y - cursor.y, fly.x - cursor.x) + (Math.random() - 0.5) * 0.9;
      if (!fly.flying) takeOff();
      gsap.killTweensOf(fly, 'x,y,z,heading'); fly.mode = 'jump'; fly.flying = true; fly.feeding = false; fly.z = 0; fly.targetHeading = away; fly.heading = away; fly.burst = 0.22; fly.cooldown = 0.55; fly.proboscis = 0;
      app.flash = 1; window.FlyAudio?.escape(); event('LPLC2/LC4 → DNp01 giant fiber: ESCAPE', `${escapeHz.toFixed(0)} Hz`);
      gsap.to(fly, { alt: 0.95, duration: 0.15, yoyo: true, repeat: 1 });
    }
    // FEED: MN9 fires while the labellum touches sugar -> glide down onto the cube (wings still beating),
    // touch down, fold, extend the proboscis. Real flies feed in bouts: hold still, then take a few steps.
    if (fly.mode !== 'jump' && fly.mode !== 'landing' && onSugar && feedHz >= 25) {
      if (fly.mode !== 'feed') {
        fly.mode = 'landing'; fly.speed = 0; fly.roll = 0; fly.feedCube = cube; fly.z = 78 + 50 * fly.alt;   // start the descent from flight height
        event('LB3 → MN9: proboscis extension, feeding', `${feedHz.toFixed(0)} Hz`);
        const top = 64 * 0.95 * (0.5 + 0.5 * cube.amount);
        if (window.FLY3D) gsap.to(fly, { alt: 0, x: cube.x, y: cube.y + 32, z: top, heading: Math.PI / 2 + (Math.random() - 0.5) * 0.6, duration: 0.75, ease: 'power2.inOut',
          onComplete: () => { fly.mode = 'feed'; fly.flying = false; fly.feeding = true; fly.hold = 1.6; fly.stepping = false; } });
        else gsap.to(fly, { alt: 0, x: cube.x + 3, y: cube.y + 22 + 9 * fly.scale, heading: -Math.PI / 2, duration: 0.5, ease: 'power2.out',
          onComplete: () => { fly.mode = 'feed'; fly.flying = false; fly.feeding = true; fly.hold = 1.6; } });
      }
    }
    if (fly.mode === 'feed') {
      const c = fly.feedCube;
      fly.hold -= dt;
      if (!fly.stepping && fly.hold <= 0) {
        // a few steps to a new spot on the cube top, proboscis retracted while walking
        fly.stepping = true;
        const top = 64 * (0.5 + 0.5 * c.amount), r = top * 0.28;
        gsap.to(fly, { x: c.x + (Math.random() - 0.5) * r, y: c.y + 32 + (Math.random() - 0.5) * r, heading: fly.heading + (Math.random() - 0.5) * 1.2, duration: 0.55, ease: 'sine.inOut',
          onComplete: () => { fly.stepping = false; fly.hold = 1.2 + Math.random() * 2.2; } });
      }
      const want = fly.stepping ? 0 : 1;
      fly.proboscis += (want - fly.proboscis) * Math.min(1, dt * 6);
      if (fly.proboscis > 0.5) { c.amount -= dt * 0.07; fly.sipIn = (fly.sipIn || 0) - dt; if (fly.sipIn <= 0) { fly.sipIn = 0.5 + Math.random() * 0.6; window.FlyAudio?.sip(); } }
      if (c.amount <= 0.08) {
        c.amount = 0; app.fed++; fly.satiated = 8; say(`Fed ${app.fed}×. Full for a moment.`); window.FlyAudio?.reward();
        fly.mode = 'fly'; fly.flying = true; fly.proboscis = 0; fly.z = 0; fly.feeding = false; fly.targetHeading = Math.PI / 2 + (Math.random() - 0.5); fly.speed = 200;
        gsap.to(fly, { alt: 0.7, duration: 0.4 });
        setTimeout(() => { sugar.cubes.splice(sugar.cubes.indexOf(c), 1); respawnCube(); }, 3000);
      }
    }
    if (fly.mode !== 'feed') fly.feeding = false;

    if (fly.mode === 'rest') {
      fly.legPhase += dt * 3; fly.wingPhase = 0; fly.roll = 0;
      fly.scale = BASE_SCALE + Math.sin(performance.now() / 900) * 0.03;
      if (fly.noticed && sugar.target) { // orient toward the sugar before take-off
        const h = Math.atan2(sugar.target.y - fly.y, sugar.target.x - fly.x);
        fly.heading += Math.atan2(Math.sin(h - fly.heading), Math.cos(h - fly.heading)) * Math.min(1, dt * 4);
      }
      return;
    }
    if (fly.mode === 'feed') return;
    if (fly.mode === 'landing' || fly.mode === 'emerging' || fly.mode === 'homing') { fly.wingPhase += dt * 200 * TAU * 0.05; return; }

    // FLIGHT: straight runs and body saccades (~90° in ~70 ms), banking into the turn.
    fly.wingPhase += dt * 200 * TAU * 0.05;
    fly.burst -= dt; fly.saccadeIn -= dt;
    if (fly.mode === 'jump' && fly.burst <= 0) fly.mode = 'fly';
    const target = sugar.target, dSugar = target ? Math.hypot(target.x - fly.x, target.y - fly.y) : 1e9;
    if (fly.saccadeIn <= 0 && fly.mode === 'fly') {
      fly.saccadeIn = 0.15 + Math.random() * 0.45;
      const wantSugar = !!target && fly.satiated <= 0 && Math.random() < (dSugar > 200 ? 0.6 : 0.85);
      const sacc = (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 1.1);
      let h = wantSugar ? Math.atan2(target.y + 6 - fly.y, target.x - fly.x) + (Math.random() - 0.5) * 0.6 : fly.heading + sacc;
      h += (hz.turnR - hz.turnL) * 0.01;
      fly.targetHeading = h;
    }
    // stay on screen, out of the menu bar unless heading to the sugar, and off the black notch
    const m = 40, wantsNotch = !!target && fly.satiated <= 0 && dSugar < 160;
    if (fly.x < m || fly.x > W - m || (fly.y < NOTCH.h + 6 && !wantsNotch) || fly.y > H - m) fly.targetHeading = Math.atan2(H * 0.4 - fly.y, W / 2 - fly.x) + (Math.random() - 0.5) * 0.8;
    const dh = Math.atan2(Math.sin(fly.targetHeading - fly.heading), Math.cos(fly.targetHeading - fly.heading));
    const turn = clamp(dh, -1, 1) * Math.min(1, dt * 22);
    fly.heading += turn;
    fly.roll += (clamp(turn / dt / 12, -1, 1) - fly.roll) * Math.min(1, dt * 10);

    const cruise = 190 + hz.forward * 2 + (fly.mode === 'jump' ? 900 : 0) + 40 * Math.sin(performance.now() / 1300);
    fly.speed += (cruise - fly.speed) * Math.min(1, dt * (fly.mode === 'jump' ? 30 : 4));
    fly.x += Math.cos(fly.heading) * fly.speed * dt;
    fly.y += Math.sin(fly.heading) * fly.speed * dt + Math.sin(performance.now() / 140) * 0.3;
    fly.x = clamp(fly.x, 4, W - 4); fly.y = clamp(fly.y, 2, H - 4);
    if (target && dSugar < 70 && fly.satiated <= 0) { fly.speed *= 0.9; fly.alt += (0.12 - fly.alt) * dt * 6; }
    else fly.alt += (0.6 + Math.sin(performance.now() / 700) * 0.2 - fly.alt) * dt * 2;
  }

  function drawFlyShadow(ctx, f) {
    const s = f.scale * (1 + 0.22 * f.alt);
    ctx.save(); ctx.translate(f.x + 6 + 26 * f.alt, f.y + 10 + 40 * f.alt); ctx.rotate(f.heading);
    const sh = ctx.createRadialGradient(0, 0, 2, 0, 0, 17 * s);
    sh.addColorStop(0, `rgba(0,0,0,${0.38 - 0.25 * f.alt})`); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.scale(1.7, 0.8); ctx.beginPath(); ctx.arc(0, 0, 17 * s, 0, TAU); ctx.fill(); ctx.restore();
  }
  function event(text, detail) { app.events.unshift({ text, detail, t: performance.now() }); app.events.length = Math.min(app.events.length, 3); }

  // ------------------------------------------------------------------ drawing
  function drawNotchStandIn() {
    ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, W, NOTCH.h);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.roundRect(NOTCH.x, -12, NOTCH.w, NOTCH.h + 12, 12); ctx.fill();
  }
  function drawLight(t) {
    // the break dims the desktop so the fly and the sugar carry the light
    const dim = app.dim * (1 - app.menuLift);
    if (dim > 0.005) {
      ctx.fillStyle = `rgba(4,6,12,${dim})`; ctx.fillRect(0, 0, W, H);
      // vignette: the edges fall off a little further, the middle stays a stage
      const v = ctx.createRadialGradient(W / 2, H * 0.35, H * 0.25, W / 2, H * 0.45, H * 0.95);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${0.55 * dim})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      // dust: slow motes drifting across the dark, a few catching the light
      for (const d of dust) {
        d.x += d.vx * (1 + 0.2 * Math.sin(t * d.s)); d.y += d.vy; if (d.x < -10) d.x = W + 10; if (d.x > W + 10) d.x = -10; if (d.y < -10) d.y = H + 10; if (d.y > H + 10) d.y = -10;
        const al = (0.10 + 0.14 * (0.5 + 0.5 * Math.sin(t * d.s * 2 + d.o))) * dim;
        ctx.fillStyle = `rgba(200,220,255,${al})`; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
      }
    }
    const act = clamp(brain.active / 4000, 0, 1);
    // the notch rim: a thin lit outline that "opens" for the sugar and flashes when the giant fiber fires
    const rim = clamp(0.5 * app.pulse + 0.6 * app.flash, 0, 1);
    if (rim > 0.02) {
      ctx.save(); ctx.shadowColor = 'rgba(160,210,255,0.9)'; ctx.shadowBlur = 10 + 10 * rim;
      ctx.strokeStyle = `rgba(200,230,255,${rim})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.roundRect(NOTCH.x - 2, -14, NOTCH.w + 4, NOTCH.h + 16, 14); ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      const a = p.a + t * 0.12 * p.s, r = (p.r + Math.sin(t * p.s + p.o) * 8) * (1 + 0.6 * app.pulse);
      const x = NOTCH.cx + Math.cos(a) * (r + NOTCH.w * 0.45), y = NOTCH.h - 6 + Math.abs(Math.sin(a)) * r * 0.6;
      if (y < NOTCH.h - 2 && x > NOTCH.x && x < NOTCH.x + NOTCH.w) continue;
      const al = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 * p.s + p.o)) + 0.4 * app.flash + 0.3 * app.pulse;
      ctx.fillStyle = `rgba(200,230,255,${al * (0.5 + act)})`;
      ctx.beginPath(); ctx.arc(x, y, p.sz, 0, TAU); ctx.fill();
    }
    ctx.restore();
    app.flash *= 0.9;
  }
  function drawAura() {
    if (fly.hiding) return;
    const s = fly.scale * (1 + 0.22 * fly.alt), k = 0.35 + 0.65 * app.dim;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // floor pool (the neon fly lights the glass under it); the shadow falls inside it
    const px = fly.x + 16 + 40 * fly.alt, py = fly.y + 26 + 60 * fly.alt, pr = 62 * s;
    const pool = ctx.createRadialGradient(px, py, 4, px, py, pr);
    pool.addColorStop(0, `rgba(40,120,255,${0.30 * k})`); pool.addColorStop(0.5, `rgba(60,90,255,${0.10 * k})`); pool.addColorStop(1, 'rgba(60,90,255,0)');
    ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
    // body halo: cyan core with a magenta fringe
    const hr = 26 * s;
    const halo = ctx.createRadialGradient(fly.x, fly.y, 2, fly.x, fly.y, hr);
    halo.addColorStop(0, `rgba(120,240,255,${0.55 * k})`); halo.addColorStop(0.45, `rgba(60,140,255,${0.28 * k})`); halo.addColorStop(0.8, `rgba(200,80,255,${0.10 * k})`); halo.addColorStop(1, 'rgba(200,80,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(fly.x, fly.y, hr, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawHUD() {
    ctx.font = '500 11px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'top';
    const label = app.phase === 'focus' ? `focus ${fmt(app.timer)}` : app.phase === 'break' ? `flybreak ${fmt(app.timer)}` : app.phase === 'free' ? 'free flight' : '';
    if (label) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(label, NOTCH.x + NOTCH.w + 14, 10); }
    ctx.textAlign = 'right';
    ctx.fillStyle = brain.online ? 'rgba(140,255,190,0.9)' : 'rgba(255,140,140,0.9)';
    ctx.fillText(brain.online ? `MaleCNS ${brain.active.toLocaleString()} active · ${brain.speed.toFixed(2)}×` : 'brain offline', NOTCH.x - 14, 10);
    ctx.textAlign = 'left';
    let y = NOTCH.h + 34;
    for (const e of app.events) {
      const age = (performance.now() - e.t) / 1000, al = clamp(1 - age / 4, 0, 1);
      if (al <= 0) continue;
      ctx.fillStyle = `rgba(255,255,255,${al * 0.9})`; ctx.fillText(e.text, NOTCH.x + NOTCH.w + 14, y);
      ctx.fillStyle = `rgba(255,200,120,${al * 0.9})`; ctx.fillText(e.detail, NOTCH.x + NOTCH.w + 14 + ctx.measureText(e.text).width + 8, y);
      y += 15;
    }
    if (app.msgAlpha > 0.01) {
      ctx.font = '600 14px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,255,255,${app.msgAlpha})`; ctx.fillText(app.msg, NOTCH.cx, NOTCH.h + 46);
      ctx.textAlign = 'left';
    }
  }
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    if (!inElectron) drawNotchStandIn();
    const cube = encodeSenses(dt);
    window.FlyAudio?.update(fly, app.phase, dt);
    body(dt, cube);
    drawLight(t);
    if (window.FLY3D) window.FLY3D.setCubes(sugar.cubes, 64); else for (const c of sugar.cubes) drawSugar(ctx, c.x, c.y, c.amount, t, 24);
    if (window.FLY3D) { drawAura(); window.FLY3D.render(fly, dt); } else drawFly(ctx, fly, t);
    drawHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.FB = { app, fly, sugar, brain, hz, senses, command };   // debug hook
})();
