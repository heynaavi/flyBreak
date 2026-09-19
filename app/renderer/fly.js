// fly.js — draws a Drosophila melanogaster on a 2D canvas with a faked third dimension:
// banked turns, altitude scaling, a perspective shadow, rim light from the display, ommatidia,
// ocelli, bristles, halteres, jointed legs, iridescent wings with motion blur, and grooming.
// Pure rendering; the body state comes from app.js.
(function () {
  const TAU = Math.PI * 2;

  // Drosophila palette: tan-grey thorax, ochre abdomen with black bands (last segments black in males), red eyes.
  const C = {
    thoraxHi: '#c9b58f', thoraxMid: '#8a7454', thoraxLo: '#3a2e1e',
    abdHi: '#d1b27e', abdMid: '#9a7a4a', abdLo: '#3b2a17', band: 'rgba(18,14,10,0.92)',
    headHi: '#c4ad86', headLo: '#4a3a24', leg: '#3a2c1c',
  };

  // A Drosophila wing: a long clear oval (about 1.3x the abdomen), five longitudinal veins and two
  // crossveins, a faint grey-blue tint and a rim highlight. Drawn pointing back (-x) from the hinge.
  function wing(ctx, side, angle, alpha, len, fold) {
    ctx.save();
    ctx.rotate(side * angle);
    ctx.globalAlpha = alpha;
    const wdt = len * (fold ? 0.28 : 0.36);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-len * 0.1, side * wdt * 0.9, -len * 0.75, side * wdt * 1.05, -len, side * wdt * 0.45);
    ctx.bezierCurveTo(-len * 1.02, side * wdt * 0.1, -len * 0.7, -side * wdt * 0.25, 0, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, -len, side * wdt);
    g.addColorStop(0, 'rgba(225,232,240,0.34)');
    g.addColorStop(0.5, 'rgba(210,222,238,0.22)');
    g.addColorStop(1, 'rgba(235,240,248,0.16)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.35; ctx.stroke();
    // veins
    ctx.strokeStyle = 'rgba(70,60,50,0.55)'; ctx.lineWidth = 0.35;
    ctx.beginPath();
    for (const k of [0.02, 0.16, 0.32, 0.5, 0.72]) { ctx.moveTo(-len * 0.05, side * wdt * k * 0.3); ctx.quadraticCurveTo(-len * 0.5, side * wdt * k, -len * 0.98, side * wdt * (0.15 + k * 0.4)); }
    ctx.moveTo(-len * 0.35, side * wdt * 0.12); ctx.lineTo(-len * 0.38, side * wdt * 0.5);
    ctx.moveTo(-len * 0.62, side * wdt * 0.38); ctx.lineTo(-len * 0.66, side * wdt * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  function leg(ctx, x0, y0, side, a1, a2, l1, l2) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const x1 = x0 + Math.cos(a1) * l1, y1 = y0 + side * Math.sin(a1) * l1;
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + Math.cos(a2) * l2, y1 + side * Math.sin(a2) * l2);
    ctx.stroke();
  }

  // fly: {x, y, heading, roll (-1..1 bank), alt (0..1), flying, wingPhase, legPhase, proboscis, scale, groom (0..1)}
  window.drawFly = function drawFly(ctx, f, t) {
    const s = (f.scale || 1) * (1 + 0.22 * f.alt);
    const roll = f.roll || 0, groom = f.groom || 0;

    // shadow: farther, larger and softer with altitude
    ctx.save();
    ctx.translate(f.x + 6 + 26 * f.alt, f.y + 10 + 40 * f.alt);
    ctx.rotate(f.heading);
    const sh = ctx.createRadialGradient(0, 0, 2, 0, 0, 17 * s);
    sh.addColorStop(0, `rgba(0,0,0,${0.38 - 0.25 * f.alt})`); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.scale(1.7, 0.8); ctx.beginPath(); ctx.arc(0, 0, 17 * s, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.heading);
    ctx.scale(s, s * (1 - 0.35 * Math.abs(roll)));   // banking flattens the silhouette
    ctx.transform(1, 0, 0.25 * roll, 1, 0, 0);       // and shears it toward the turn

    // legs
    ctx.strokeStyle = C.leg; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    const tw = f.flying || f.feeding ? 0 : Math.sin(f.legPhase) * 0.12;
    for (const side of [-1, 1]) {
      if (f.feeding) {
        // gripping the cube: legs tucked close, knees up, tarsi planted forward
        leg(ctx, 3, side * 3, side, 0.75, 0.2, 5, 5);
        leg(ctx, -1, side * 3.5, side, 1.35, 0.6, 5, 5);
        leg(ctx, -4, side * 3.5, side, 2.0, 1.3, 5, 6);
      } else if (f.flying) {
        leg(ctx, 2, side * 3, side, 2.3, 2.9, 5, 6);
        leg(ctx, -1, side * 3.5, side, 2.6, 3.0, 5, 6);
        leg(ctx, -4, side * 3.5, side, 2.8, 3.1, 5, 7);
      } else {
        // grooming: front legs rub together in front of the head, sweep over the eyes
        const gr = groom * (0.5 + 0.5 * Math.sin(f.legPhase * 3.2 + side));
        leg(ctx, 3, side * 3, side, 0.9 + tw - gr * 1.2, 1.9 - gr * 2.3, 6, 6 + gr * 2);
        leg(ctx, -1, side * 3.5, side, 1.5 - tw, 2.2, 6, 6);
        leg(ctx, -4, side * 3.5, side, 2.2 + tw, 2.7, 6, 7);
      }
    }

    // abdomen: ochre with black bands, the tip black
    ctx.save(); ctx.translate(-9.5, 0);
    let g = ctx.createRadialGradient(-1, -3, 1, 0, 0, 10);
    g.addColorStop(0, C.abdHi); g.addColorStop(0.5, C.abdMid); g.addColorStop(1, C.abdLo);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 9.8, 5.4, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = C.band;
    for (let i = 0; i < 4; i++) { const w = 0.8 + i * 0.45; ctx.beginPath(); ctx.ellipse(1.5 - i * 3.3, 0, w, 6, 0, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(-8.2, 0, 3, 6, 0, 0, TAU); ctx.fill();
    // segment gloss
    ctx.fillStyle = 'rgba(255,245,225,0.18)'; ctx.beginPath(); ctx.ellipse(0, -2.6, 8.5, 1.6, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();

    // thorax
    g = ctx.createRadialGradient(0.5, -2.5, 1, 0, 0, 7.5);
    g.addColorStop(0, C.thoraxHi); g.addColorStop(0.55, C.thoraxMid); g.addColorStop(1, C.thoraxLo);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 6.4, 5.2, 0, 0, TAU); ctx.fill();
    // scutellum + halteres
    ctx.fillStyle = 'rgba(60,45,28,0.6)'; ctx.beginPath(); ctx.ellipse(-4.5, 0, 2.2, 2.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e6d28a';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(-4, side * 5.6, 0.9, 0, TAU); ctx.fill(); }

    // head + compound eyes
    ctx.save(); ctx.translate(8.4, 0);
    g = ctx.createRadialGradient(0.5, -1.5, 0.5, 0, 0, 5);
    g.addColorStop(0, C.headHi); g.addColorStop(1, C.headLo);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 4.6, 0, 0, TAU); ctx.fill();
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0.6, side * 2.7, 2.6, 2.0, side * 0.35, 0, TAU); ctx.clip();
      const e = ctx.createRadialGradient(1.3, side * 2.2, 0.3, 0.6, side * 2.7, 3.0);
      e.addColorStop(0, '#ff8f70'); e.addColorStop(0.4, '#c8322a'); e.addColorStop(1, '#3d0806');
      ctx.fillStyle = e; ctx.fillRect(-3, side * 2.7 - 3, 7, 6);
      ctx.fillStyle = 'rgba(40,0,0,0.35)';
      for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) {
        ctx.beginPath(); ctx.arc(0.6 + i * 0.75 + (j % 2) * 0.37, side * 2.7 + j * 0.65, 0.22, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(1.7, side * 2.0, 0.7, 0.45, side * 0.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#5a1a12';
    for (const [ox, oy] of [[-1.6, 0], [-0.9, -0.8], [-0.9, 0.8]]) { ctx.beginPath(); ctx.arc(ox, oy, 0.3, 0, TAU); ctx.fill(); }
    // antennae (aristae), twitching while grooming
    ctx.strokeStyle = C.headLo; ctx.lineWidth = 0.7;
    const at = groom * Math.sin(f.legPhase * 2.5) * 0.4;
    ctx.beginPath(); ctx.moveTo(3.2, -1); ctx.lineTo(5.2, -2.2 - at); ctx.moveTo(3.2, 1); ctx.lineTo(5.2, 2.2 + at); ctx.stroke();
    if (f.proboscis > 0.02) {
      const p = f.proboscis;
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(3, 0); ctx.quadraticCurveTo(5, 2 * p, 3 + 6 * p, 3.5 * p); ctx.stroke();
      ctx.fillStyle = '#8a6040'; ctx.beginPath(); ctx.ellipse(3 + 6 * p, 3.5 * p, 1.4 * p, 0.9 * p, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // wings
    ctx.save(); ctx.translate(-1.5, 0);
    if (f.flying) {
      // a 200 Hz stroke reads as two ghosts at the stroke extremes plus a faint fan between them
      for (const side of [-1, 1]) {
        const ph = f.wingPhase + (side > 0 ? 0 : 0.3);
        ctx.save(); ctx.globalAlpha = 0.07;
        ctx.fillStyle = 'rgba(220,230,245,1)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 21, Math.PI + side * 0.4, Math.PI + side * 1.35, side < 0); ctx.closePath(); ctx.fill();
        ctx.restore();
        wing(ctx, side, 0.4 + 0.08 * Math.sin(ph), 0.35, 21, false);
        wing(ctx, side, 1.35 + 0.08 * Math.sin(ph + 1), 0.35, 21, false);
      }
    } else {
      wing(ctx, -1, 0.08, 0.75, 25, true);
      wing(ctx, 1, 0.08, 0.75, 25, true);
    }
    ctx.restore();

    // bristles
    ctx.strokeStyle = 'rgba(30,18,8,0.8)'; ctx.lineWidth = 0.45;
    ctx.beginPath();
    for (const [bx, by, dx, dy] of [[-2, -4.6, -1.5, -1.6], [1, -4.8, -1.2, -1.8], [-2, 4.6, -1.5, 1.6], [1, 4.8, -1.2, 1.8], [-18.5, -1.2, -1.8, -0.8], [-18.5, 1.2, -1.8, 0.8]]) {
      ctx.moveTo(bx, by); ctx.lineTo(bx + dx, by + dy);
    }
    ctx.stroke();

    // rim light from the display
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.ellipse(0, -0.5, 5.4, 3.8, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();
  };

  // An isometric sugar cube. amount 0..1 melts it; size in px.
  window.drawSugar = function drawSugar(ctx, x, y, amount, t, size = 16) {
    if (amount <= 0) return;
    const k = 0.5 + 0.5 * amount, w = size * k, h = size * k, d = size * 0.45 * k;
    ctx.save(); ctx.translate(x, y);
    // a faint contact shadow under the cube, no halo
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(2, h + 2, w * 0.7, 3, 0, 0, TAU); ctx.fill();
    // front
    let g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fbf7ef'); g.addColorStop(1, '#e2d9c8');
    ctx.fillStyle = g; ctx.fillRect(-w / 2, 0, w, h);
    // top
    g = ctx.createLinearGradient(-w / 2, -d, w / 2, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#f0ebe0');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2 + d, -d); ctx.lineTo(w / 2 + d, -d); ctx.lineTo(w / 2, 0); ctx.fill();
    // side
    ctx.fillStyle = '#c9bfad'; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2 + d, -d); ctx.lineTo(w / 2 + d, h - d); ctx.lineTo(w / 2, h); ctx.fill();
    // crystalline grain + sparkles
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 9; i++) {
      const gx = -w / 2 + ((i * 7.3) % w), gy = ((i * 4.1) % h);
      const r = 0.5 + 0.6 * Math.max(0, Math.sin(t * 2.5 + i * 1.7));
      ctx.beginPath(); ctx.arc(gx, gy, r, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,100,80,0.25)'; ctx.lineWidth = 0.6; ctx.strokeRect(-w / 2, 0, w, h);
    ctx.restore();
  };
})();
