// app.js — the world around the notch: senses -> brain, brain -> body, the break ritual, the shimmer.
// Real: every jump / eat / turn decision comes from the MaleCNS wiring (via ../brain/server.py).
// Cartoon: the body, the saccadic flight autopilot, and how senses turn into spike rates.
(function () {
  const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const q = new URLSearchParams(location.search);
  const inElectron = !!window.notch;
  if (!inElectron) document.body.classList.add('browser');
  const W = 1000, H = 300;
  const BASE_SCALE = +(q.get('scale') || 1.5);
  const NOTCH = { x: +(q.get('notchX') || 407.5), w: +(q.get('notchW') || 185), h: +(q.get('notchH') || 32) };
  NOTCH.cx = NOTCH.x + NOTCH.w / 2;

  const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;
  canvas.width = W * DPR; canvas.height = H * DPR; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(DPR, DPR);

  // ------------------------------------------------------------------ world state
  const cursor = { x: -999, y: -999, vx: 0, vy: 0, t: 0 };
  const sugar = { x: NOTCH.cx, y: NOTCH.h + 2, amount: 0, shown: false };
  const fly = {
    x: NOTCH.cx + 60, y: NOTCH.h + 1, heading: -0.3, targetHeading: -0.3, speed: 0, alt: 0,
    flying: false, wingPhase: 0, legPhase: 0, proboscis: 0, scale: +(q.get('scale') || 1.5),
    mode: 'rest', cooldown: 0, saccadeIn: 0.3, burst: 0, restSpot: null,
  };
  const hz = { escape: 0, feed: 0, backward: 0, groom: 0, forward: 0, turnL: 0, turnR: 0 };
  const brain = { online: false, speed: 0, active: 0, simMs: 0, ws: null, lastMsg: 0 };
  const app = { phase: 'rest', timer: 0, fed: 0, msg: '', msgAlpha: 0, flash: 0, events: [] };
  const senses = { sugar: 0, looming: 0 };
  const particles = Array.from({ length: 46 }, (_, i) => ({
    a: (i / 46) * TAU, r: 30 + Math.random() * 40, s: 0.4 + Math.random() * 0.8, o: Math.random() * TAU, sz: 0.6 + Math.random() * 1.2,
  }));

  // ------------------------------------------------------------------ inputs
  if (inElectron) {
    window.notch.onCursor(p => setCursor(p.x, p.y));
    window.notch.onCommand(cmd => command(cmd));
  } else {
    addEventListener('mousemove', e => setCursor(e.clientX, e.clientY));
    addEventListener('keydown', e => ({ f: 'focus', b: 'break', r: 'rest', d: 'free' })[e.key] && command(({ f: 'focus', b: 'break', r: 'rest', d: 'free' })[e.key]));
  }
  function setCursor(x, y) {
    const now = performance.now() / 1000, dt = Math.max(0.004, now - cursor.t);
    cursor.vx = (x - cursor.x) / dt; cursor.vy = (y - cursor.y) / dt;
    cursor.x = x; cursor.y = y; cursor.t = now;
  }

  function say(text, ms = 2600) {
    app.msg = text; gsap.killTweensOf(app);
    gsap.fromTo(app, { msgAlpha: 0 }, { msgAlpha: 1, duration: 0.25 });
    gsap.to(app, { msgAlpha: 0, duration: 0.6, delay: ms / 1000 });
  }

  function command(cmd) {
    if (cmd === 'focus') { app.phase = 'focus'; app.timer = 25 * 60; land(); say('Focus. Your fly sleeps on the notch.'); }
    if (cmd === 'break') startBreak(60);
    if (cmd === 'free') startBreak(1e9);
    if (cmd === 'rest') { app.phase = 'rest'; hideSugar(); land(); say('Resting.'); }
    if (cmd === 'resetBrain') brain.ws?.send(JSON.stringify({ reset: true }));
  }

  function startBreak(secs) {
    app.phase = 'break'; app.timer = secs; app.fed = 0;
    showSugar();
    setTimeout(takeOff, 700);
    say(secs > 1e8 ? 'Free flight. Your cursor is the predator.' : 'FlyBreak: feed the fly. Your cursor is the predator.');
  }
  function showSugar() { sugar.shown = true; gsap.fromTo(sugar, { amount: 0, y: NOTCH.h - 14 }, { amount: 1, y: NOTCH.h + 2, duration: 0.8, ease: 'bounce.out' }); }
  function hideSugar() { gsap.to(sugar, { amount: 0, duration: 0.5, onComplete: () => (sugar.shown = false) }); }

  function land(spot) {
    fly.flying = false; fly.mode = 'rest'; fly.speed = 0; fly.alt = 0; fly.proboscis = 0;
    const p = spot || { x: NOTCH.x + NOTCH.w + 40 + Math.random() * 60, y: NOTCH.h - 2, h: -0.25 };
    gsap.to(fly, { x: p.x, y: p.y, heading: p.h, duration: 0.5, ease: 'power2.out' });
  }
  function takeOff() {
    if (fly.flying) return;
    fly.flying = true; fly.mode = 'fly'; fly.speed = 90; fly.saccadeIn = 0.15;
    gsap.to(fly, { alt: 0.6, duration: 0.5, ease: 'power2.out' });
    say('Take-off.');
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
  function sendSenses() {
    const msg = JSON.stringify({ senses: { sugar: Math.round(senses.sugar), looming: Math.round(senses.looming) } });
    if (msg !== lastSent && brain.ws?.readyState === 1) { brain.ws.send(msg); lastSent = msg; }
  }
  setInterval(sendSenses, 33);

  // ------------------------------------------------------------------ senses (world -> spike rates)
  let prevTheta = 0;
  function encodeSenses(dt) {
    // Looming: the cursor is a dark disc; its angular size on the fly's eye grows as it approaches.
    // LPLC2/LC4 respond to expansion, so the rate follows d(theta)/dt, plus a floor when it is on top of us.
    const dx = cursor.x - fly.x, dy = cursor.y - fly.y, d = Math.max(6, Math.hypot(dx, dy));
    const theta = 2 * Math.atan(16 / d);
    const dtheta = (theta - prevTheta) / dt; prevTheta = theta;
    let loom = 0;
    if (d < 320) loom = clamp(dtheta * 900, 0, 150) + (d < 45 ? 150 : d < 90 ? 60 : 0);
    senses.looming += (clamp(loom, 0, 150) - senses.looming) * Math.min(1, dt * 18);
    // Sugar: labellar taste neurons fire on contact.
    const hx = fly.x + Math.cos(fly.heading) * 10 * fly.scale, hy = fly.y + Math.sin(fly.heading) * 10 * fly.scale;
    const onSugar = sugar.shown && sugar.amount > 0.05 && Math.hypot(hx - sugar.x, hy - (sugar.y + 5)) < 13;
    senses.sugar = onSugar ? 150 : 0;
    return onSugar;
  }

  // ------------------------------------------------------------------ body (brain -> motion)
  function body(dt, onSugar) {
    fly.cooldown -= dt;
    const offline = !brain.online || performance.now() - brain.lastMsg > 1500;
    // with no brain server we fake the giant fiber from the looming rate so the demo still moves
    const escapeHz = offline ? (senses.looming > 120 ? 200 : 0) : hz.escape;
    const feedHz = offline ? (onSugar ? 60 : 0) : hz.feed;

    if (app.phase === 'break' || app.phase === 'free') {
      app.timer -= dt;
      if (app.timer <= 0) { app.phase = 'rest'; hideSugar(); land(); say(app.fed > 0 ? `Break done. Fly fed ${app.fed}×.` : 'Break done.'); }
    }
    if (app.phase === 'focus') { app.timer -= dt; if (app.timer <= 0) startBreak(60); }

    // ESCAPE: giant fiber fires -> saccade away from the threat with a speed burst
    if (escapeHz >= 60 && fly.cooldown <= 0) {
      const away = Math.atan2(fly.y - cursor.y, fly.x - cursor.x) + (Math.random() - 0.5) * 0.9;
      if (!fly.flying) { takeOff(); }
      fly.mode = 'jump'; fly.targetHeading = away; fly.heading = away; fly.burst = 0.22; fly.cooldown = 0.55; fly.proboscis = 0;
      app.flash = 1; event('LPLC2/LC4 → DNp01 giant fiber: ESCAPE', `${escapeHz.toFixed(0)} Hz`);
      gsap.to(fly, { alt: 0.9, duration: 0.15, yoyo: true, repeat: 1 });
    }
    // FEED: MN9 fires while the labellum touches sugar -> land, extend proboscis
    if (fly.mode !== 'jump' && onSugar && feedHz >= 25) {
      if (fly.mode !== 'feed') { fly.mode = 'feed'; fly.flying = false; fly.speed = 0; event('LB3 → MN9: proboscis extension, feeding', `${feedHz.toFixed(0)} Hz`); gsap.to(fly, { alt: 0, duration: 0.3 }); }
      fly.proboscis += (1 - fly.proboscis) * Math.min(1, dt * 6);
      sugar.amount -= dt * 0.08;
      if (sugar.amount <= 0.05) { app.fed++; sugar.amount = 0; say('Fed! The sugar is gone.'); setTimeout(() => { if (app.phase === 'break' || app.phase === 'free') showSugar(); fly.mode = 'fly'; fly.flying = true; }, 1500); }
    } else if (fly.mode === 'feed') {
      fly.mode = 'fly'; fly.flying = true; fly.proboscis = 0;
    }

    if (fly.mode === 'rest') {
      fly.legPhase += dt * 3; fly.wingPhase = 0;
      // asleep: gentle breathing
      fly.scale = BASE_SCALE + Math.sin(performance.now() / 900) * 0.02;
      return;
    }
    if (fly.mode === 'feed') { fly.legPhase += dt * 6; return; }

    // FLIGHT: real flies fly straight and turn in body saccades (~90° in ~70 ms).
    fly.wingPhase += dt * 200 * TAU * 0.05;   // rendered as ghosted blur, not literal 200 Hz
    fly.burst -= dt;
    fly.saccadeIn -= dt;
    if (fly.mode === 'jump' && fly.burst <= 0) fly.mode = 'fly';
    if (fly.saccadeIn <= 0 && fly.mode === 'fly') {
      fly.saccadeIn = 0.12 + Math.random() * 0.3;
      const toSugar = Math.atan2(sugar.y + 6 - fly.y, sugar.x - fly.x);
      const dSugar = Math.hypot(sugar.x - fly.x, sugar.y - fly.y);
      const wantSugar = sugar.shown && sugar.amount > 0.05 && Math.random() < (dSugar > 120 ? 0.55 : 0.8);
      const sacc = (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 1.0);
      let h = wantSugar ? toSugar + (Math.random() - 0.5) * 0.7 : fly.heading + sacc;
      // steering DNs bias the turn
      h += (hz.turnR - hz.turnL) * 0.01;
      fly.targetHeading = h;
    }
    // keep inside the window and off the black notch
    const m = 24;
    if (fly.x < m || fly.x > W - m || fly.y < 6 || fly.y > H - m) fly.targetHeading = Math.atan2(H * 0.45 - fly.y, NOTCH.cx - fly.x);
    const inNotch = fly.x > NOTCH.x - 6 && fly.x < NOTCH.x + NOTCH.w + 6 && fly.y < NOTCH.h + 4 && !(sugar.shown && Math.hypot(fly.x - sugar.x, fly.y - sugar.y) < 30);
    if (inNotch) fly.targetHeading = Math.atan2(1, fly.x < NOTCH.cx ? -1 : 1);

    // 70 ms saccade: fast slew to the target heading
    let dh = Math.atan2(Math.sin(fly.targetHeading - fly.heading), Math.cos(fly.targetHeading - fly.heading));
    fly.heading += clamp(dh, -1, 1) * Math.min(1, dt * 22);

    const cruise = 120 + hz.forward * 2 + (fly.mode === 'jump' ? 700 : 0);
    fly.speed += (cruise - fly.speed) * Math.min(1, dt * (fly.mode === 'jump' ? 30 : 5));
    fly.x += Math.cos(fly.heading) * fly.speed * dt;
    fly.y += Math.sin(fly.heading) * fly.speed * dt + Math.sin(performance.now() / 140) * 0.25;
    fly.x = clamp(fly.x, 4, W - 4); fly.y = clamp(fly.y, 2, H - 4);
    // approach to sugar: slow down and descend
    const dS = Math.hypot(sugar.x - fly.x, sugar.y - fly.y);
    if (sugar.shown && dS < 40) { fly.speed *= 0.93; fly.alt += (0.15 - fly.alt) * dt * 6; } else fly.alt += (0.6 + Math.sin(performance.now() / 700) * 0.15 - fly.alt) * dt * 2;
  }

  function event(text, detail) { app.events.unshift({ text, detail, t: performance.now() }); app.events.length = Math.min(app.events.length, 3); }

  // ------------------------------------------------------------------ drawing
  function drawNotchStandIn() {
    // outside Electron: draw a fake menu bar + notch so the layout reads the same
    ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, W, NOTCH.h);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.roundRect(NOTCH.x, -12, NOTCH.w, NOTCH.h + 12, 12); ctx.fill();
  }
  function drawShimmer(t) {
    // water-light around the notch, brightening with brain activity; a flash when the giant fiber fires
    const act = clamp(brain.active / 4000, 0, 1);
    const g = ctx.createRadialGradient(NOTCH.cx, NOTCH.h, NOTCH.w * 0.35, NOTCH.cx, NOTCH.h, NOTCH.w * 0.9);
    g.addColorStop(0, `rgba(120,190,255,${0.10 + 0.18 * act + 0.35 * app.flash})`);
    g.addColorStop(0.6, `rgba(160,120,255,${0.04 + 0.08 * act + 0.15 * app.flash})`);
    g.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      const a = p.a + t * 0.12 * p.s, r = p.r + Math.sin(t * p.s + p.o) * 6;
      const x = NOTCH.cx + Math.cos(a) * (r + NOTCH.w * 0.45), y = NOTCH.h - 6 + Math.abs(Math.sin(a)) * r * 0.55;
      if (y < NOTCH.h - 2 && x > NOTCH.x && x < NOTCH.x + NOTCH.w) continue;
      const al = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 * p.s + p.o)) + 0.4 * app.flash;
      ctx.fillStyle = `rgba(200,230,255,${al * (0.5 + act)})`;
      ctx.beginPath(); ctx.arc(x, y, p.sz, 0, TAU); ctx.fill();
    }
    ctx.restore();
    app.flash *= 0.9;
  }
  function drawHUD(t) {
    ctx.font = '500 11px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'top';
    // timer / phase, right of the notch on the menu bar row
    const label = app.phase === 'focus' ? `focus ${fmt(app.timer)}` : app.phase === 'break' ? `flybreak ${fmt(app.timer)}` : app.phase === 'free' ? 'free flight' : '';
    if (label) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(label, NOTCH.x + NOTCH.w + 12, 10); }
    // brain status, left of the notch
    ctx.textAlign = 'right';
    ctx.fillStyle = brain.online ? 'rgba(140,255,190,0.9)' : 'rgba(255,140,140,0.9)';
    ctx.fillText(brain.online ? `MaleCNS ${brain.active.toLocaleString()} active · ${brain.speed.toFixed(2)}×` : 'brain offline', NOTCH.x - 12, 10);
    ctx.textAlign = 'left';
    // event log under the notch
    let y = NOTCH.h + 28;
    for (const e of app.events) {
      const age = (performance.now() - e.t) / 1000, al = clamp(1 - age / 4, 0, 1);
      if (al <= 0) continue;
      ctx.fillStyle = `rgba(255,255,255,${al * 0.9})`; ctx.fillText(e.text, NOTCH.cx + NOTCH.w / 2 + 16, y);
      ctx.fillStyle = `rgba(255,200,120,${al * 0.9})`; ctx.fillText(e.detail, NOTCH.cx + NOTCH.w / 2 + 16 + ctx.measureText(e.text).width + 8, y);
      y += 15;
    }
    if (app.msgAlpha > 0.01) {
      ctx.font = '600 13px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,255,255,${app.msgAlpha})`; ctx.fillText(app.msg, NOTCH.cx, NOTCH.h + 10);
      ctx.textAlign = 'left';
    }
  }
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    if (!inElectron) drawNotchStandIn();
    const onSugar = encodeSenses(dt);
    body(dt, onSugar);
    drawShimmer(t);
    if (sugar.shown) drawSugar(ctx, sugar.x, sugar.y, sugar.amount, t);
    drawFly(ctx, fly, t);
    drawHUD(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  land({ x: NOTCH.x + NOTCH.w + 70, y: NOTCH.h - 2, h: -0.25 });
})();
