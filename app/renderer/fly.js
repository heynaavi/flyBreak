// fly.js — draws a Drosophila on a 2D canvas: body, compound eyes, legs, halteres,
// translucent iridescent wings with motion blur, a rim light from the screen and a soft shadow.
// Pure rendering; the body state comes from app.js.
(function () {
  const TAU = Math.PI * 2;

  function wing(ctx, side, angle, alpha, len, fold) {
    // wing root at thorax top; the fly points along +x, side = -1 left / +1 right
    ctx.save();
    ctx.rotate(side * angle);
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, 0, -len, side * len * 0.35);
    g.addColorStop(0, 'rgba(235,240,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,210,235,0.32)');
    g.addColorStop(0.75, 'rgba(190,230,255,0.30)');
    g.addColorStop(1, 'rgba(235,240,255,0.10)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-len * 0.15, side * len * 0.55 * (fold ? 0.35 : 1), -len * 0.95, side * len * 0.45 * (fold ? 0.35 : 1), -len, side * len * 0.12 * (fold ? 0.35 : 1));
    ctx.bezierCurveTo(-len * 0.8, -side * len * 0.02, -len * 0.3, -side * len * 0.02, 0, 0);
    ctx.fill();
    // veins
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const k of [0.12, 0.28, 0.42]) { ctx.moveTo(0, 0); ctx.lineTo(-len * 0.96, side * len * k * (fold ? 0.35 : 1)); }
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

  // fly: {x, y, heading, alt (0..1), flying, wingPhase, legPhase, proboscis (0..1), scale}
  window.drawFly = function drawFly(ctx, f, t) {
    const s = (f.scale || 1) * (1 + 0.18 * f.alt);
    // shadow on the "screen glass" below the fly, farther and softer the higher it flies
    ctx.save();
    ctx.translate(f.x + 4 + 10 * f.alt, f.y + 8 + 18 * f.alt);
    ctx.rotate(f.heading);
    const sh = ctx.createRadialGradient(0, 0, 2, 0, 0, 16 * s);
    sh.addColorStop(0, `rgba(0,0,0,${0.35 - 0.2 * f.alt})`); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.scale(1.6, 0.8); ctx.beginPath(); ctx.arc(0, 0, 16 * s, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.heading);
    ctx.scale(s, s);

    // legs (thin, jointed). In flight they trail back; at rest they splay and twitch.
    ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    const tw = f.flying ? 0 : Math.sin(f.legPhase) * 0.12;
    for (const side of [-1, 1]) {
      if (f.flying) {
        leg(ctx, 2, side * 3, side, 2.3, 2.9, 5, 6);
        leg(ctx, -1, side * 3.5, side, 2.6, 3.0, 5, 6);
        leg(ctx, -4, side * 3.5, side, 2.8, 3.1, 5, 7);
      } else {
        leg(ctx, 3, side * 3, side, 0.9 + tw, 1.9, 6, 6);
        leg(ctx, -1, side * 3.5, side, 1.5 - tw, 2.2, 6, 6);
        leg(ctx, -4, side * 3.5, side, 2.2 + tw, 2.7, 6, 7);
      }
    }

    // abdomen: striped, glossy
    ctx.save(); ctx.translate(-9, 0);
    let g = ctx.createRadialGradient(-1, -3, 1, 0, 0, 10);
    g.addColorStop(0, '#c58a4e'); g.addColorStop(0.55, '#7d4d26'); g.addColorStop(1, '#2b170a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 5.2, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(25,12,5,0.75)';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-7.5 + i * 3.6, 0, 0.9, 5.6, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,240,220,0.35)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.ellipse(0, -0.6, 8.6, 4.1, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.restore();

    // thorax
    g = ctx.createRadialGradient(0.5, -2.5, 1, 0, 0, 7);
    g.addColorStop(0, '#a98358'); g.addColorStop(0.6, '#5f4327'); g.addColorStop(1, '#241408');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 6.2, 5, 0, 0, TAU); ctx.fill();
    // halteres (the tiny yellow gyroscopes behind the wings)
    ctx.fillStyle = '#e8c65a';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(-4, side * 5.5, 0.9, 0, TAU); ctx.fill(); }

    // head + compound eyes
    ctx.save(); ctx.translate(8, 0);
    g = ctx.createRadialGradient(0.5, -1.5, 0.5, 0, 0, 4.5);
    g.addColorStop(0, '#9c7a52'); g.addColorStop(1, '#3a2312');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 3.8, 4.2, 0, 0, TAU); ctx.fill();
    for (const side of [-1, 1]) {
      const e = ctx.createRadialGradient(1.2, side * 2.4 - 0.6, 0.3, 0.8, side * 2.6, 2.6);
      e.addColorStop(0, '#ff7a63'); e.addColorStop(0.35, '#c8322a'); e.addColorStop(1, '#4a0a08');
      ctx.fillStyle = e; ctx.beginPath(); ctx.ellipse(0.8, side * 2.6, 2.4, 2.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(1.6, side * 2.0, 0.55, 0, TAU); ctx.fill();
    }
    // antennae
    ctx.strokeStyle = '#3a2312'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(3.2, -1); ctx.lineTo(5.2, -2.2); ctx.moveTo(3.2, 1); ctx.lineTo(5.2, 2.2); ctx.stroke();
    // proboscis (MN9 fired: extend to the sugar)
    if (f.proboscis > 0.02) {
      const p = f.proboscis;
      ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(3, 0); ctx.quadraticCurveTo(5, 2 * p, 3 + 6 * p, 3.5 * p); ctx.stroke();
      ctx.fillStyle = '#7a5030'; ctx.beginPath(); ctx.ellipse(3 + 6 * p, 3.5 * p, 1.4 * p, 0.9 * p, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // wings, from the thorax top. Flight: 200 Hz beat rendered as three ghosted positions.
    ctx.save(); ctx.translate(-1.5, 0);
    if (f.flying) {
      for (const side of [-1, 1]) {
        const ph = f.wingPhase + (side > 0 ? 0 : 0.3);
        for (let k = 0; k < 3; k++) {
          const a = 0.55 + 0.75 * (0.5 + 0.5 * Math.sin(ph + k * 2.1));
          wing(ctx, side, a, 0.22, 15, false);
        }
      }
    } else {
      wing(ctx, -1, 0.18, 0.7, 14, true);
      wing(ctx, 1, 0.18, 0.7, 14, true);
    }
    ctx.restore();

    // rim light from the display
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.ellipse(0, -0.5, 5.2, 3.6, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();
  };

  // A sugar cube hanging from the notch lip. amount 0..1 melts it.
  window.drawSugar = function drawSugar(ctx, x, y, amount, t) {
    if (amount <= 0) return;
    const w = 11 * (0.55 + 0.45 * amount), h = 9 * (0.55 + 0.45 * amount);
    ctx.save(); ctx.translate(x, y);
    // glow
    const gl = ctx.createRadialGradient(0, h / 2, 2, 0, h / 2, 26);
    gl.addColorStop(0, 'rgba(255,245,220,0.35)'); gl.addColorStop(1, 'rgba(255,245,220,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, h / 2, 26, 0, TAU); ctx.fill();
    // cube faces
    ctx.fillStyle = '#f4efe6'; ctx.fillRect(-w / 2, 0, w, h);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2 + 3, -3); ctx.lineTo(w / 2 + 3, -3); ctx.lineTo(w / 2, 0); ctx.fill();
    ctx.fillStyle = '#d9d2c5'; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2 + 3, -3); ctx.lineTo(w / 2 + 3, h - 3); ctx.lineTo(w / 2, h); ctx.fill();
    // sparkle grains
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 5; i++) {
      const a = t * 0.8 + i * 1.3, r = 0.6 + 0.5 * Math.sin(t * 3 + i);
      ctx.beginPath(); ctx.arc(-w / 2 + 2 + (i * 2.1) % w, 1.5 + (i * 3.7) % (h - 2), r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };
})();
