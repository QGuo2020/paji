/* ===========================================================
   effects.js — 动态层
   漂浮音符、闪粉、扩散光环、湿笔迹、会眨眼的小脸、空闲泡泡。
   这一层每帧清空重画，不吃内存。
   =========================================================== */

window.FX = (function () {
  'use strict';

  var TAU = Math.PI * 2;
  var GLYPHS = ['\u266A', '\u266B', '\u2669', '\u266C', '\u2727'];  // ♪ ♫ ♩ ♬ ✧
  var INK = '59, 47, 42';

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function trim(arr, max) { if (arr.length > max) arr.splice(0, arr.length - max); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  var notes = [];
  var confetti = [];
  var rings = [];
  var trails = [];
  var faces = [];
  var bubbles = [];

  /* ---------------- 生成 ---------------- */

  function addNotes(x, y, color, n) {
    n = n || 1;
    for (var i = 0; i < n; i++) {
      notes.push({
        x: x + rnd(-16, 16),
        y: y + rnd(-12, 12),
        color: color,
        glyph: GLYPHS[(Math.random() * GLYPHS.length) | 0],
        size: rnd(24, 44),
        vx: rnd(-22, 22),
        vy: rnd(-68, -38),
        rot: rnd(-0.35, 0.35),
        vr: rnd(-0.9, 0.9),
        life: 0,
        ttl: rnd(1.5, 2.5)
      });
    }
    trim(notes, 80);
  }

  function addConfetti(x, y, color, n) {
    n = n || 8;
    for (var i = 0; i < n; i++) {
      var a = rnd(0, TAU);
      var sp = rnd(70, 320);
      confetti.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 70,
        size: rnd(3, 7.5),
        rot: rnd(0, TAU),
        vr: rnd(-9, 9),
        color: Math.random() < 0.35 ? '#ffffff' : color,
        round: Math.random() < 0.5,
        life: 0,
        ttl: rnd(0.65, 1.35)
      });
    }
    trim(confetti, 260);
  }

  function addRing(x, y, r, color) {
    rings.push({
      x: x, y: y,
      r0: r * 0.5, r1: r * rnd(1.5, 2.1),
      color: color,
      life: 0, ttl: rnd(0.35, 0.55)
    });
    trim(rings, 24);
  }

  function addTrail(x, y, color) {
    trails.push({
      x: x, y: y,
      r: rnd(6, 9),
      color: color || 'hsl(200 70% 60%)',
      life: 0, ttl: rnd(0.7, 1.0)
    });
    trim(trails, 160);
  }

  function addFace(x, y, size, color) {
    faces.push({
      x: x, y: y,
      size: size,
      color: color,
      t: rnd(0, 6),
      alpha: 1,
      blink: 0,
      nextBlink: rnd(1.2, 5),
      gaze: rnd(-0.25, 0.25),
      life: 0
    });
    trim(faces, 26);
  }

  function addBubble(w, h) {
    bubbles.push({
      x: rnd(0, w),
      y: h + rnd(10, 60),
      r: rnd(14, 54),
      vy: rnd(-42, -16),
      sway: rnd(-14, 14),
      color: ['#ff6b6b', '#ffc93c', '#4ecdc4', '#48a9e6', '#a06cd5', '#ff8fab', '#5bb86a', '#ff9f45'][(Math.random() * 8) | 0],
      life: 0,
      ttl: rnd(9, 16)
    });
    trim(bubbles, 26);
  }

  /* 洗掉/清屏时的一下：一闪而过的水光 + 几点飞溅，给个"换新纸"的确认 */
  function clearBurst(w, h) {
    rings.push({
      x: w * 0.5, y: h * 0.5,
      r0: Math.min(w, h) * 0.1,
      r1: Math.hypot(w, h) * 0.62,
      color: '#8fd8ff',
      life: 0, ttl: 0.5
    });
    trim(rings, 24);

    var cols = ['#ff6b6b', '#ffc93c', '#4ecdc4', '#48a9e6', '#a06cd5', '#ff8fab', '#5bb86a', '#ff9f45'];
    for (var i = 0; i < 18; i++) {
      var a = rnd(0, TAU);
      var sp = rnd(120, 420);
      confetti.push({
        x: w * 0.5, y: h * 0.5,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: rnd(3, 6),
        rot: rnd(0, TAU),
        vr: rnd(-9, 9),
        color: cols[(Math.random() * cols.length) | 0],
        round: true,
        life: 0, ttl: rnd(0.5, 0.9)
      });
    }
    trim(confetti, 260);
  }

  /* ---------------- 更新 ---------------- */

  function update(dt) {
    var i, o;

    for (i = notes.length - 1; i >= 0; i--) {
      o = notes[i];
      o.life += dt;
      o.vy *= 0.996;
      o.vx += Math.sin(o.life * 5.5) * 26 * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.rot += o.vr * dt;
      if (o.life >= o.ttl) notes.splice(i, 1);
    }

    for (i = confetti.length - 1; i >= 0; i--) {
      o = confetti[i];
      o.life += dt;
      o.vy += 980 * dt;
      o.vx *= 1 - Math.min(1, 1.6 * dt);
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.rot += o.vr * dt;
      if (o.life >= o.ttl) confetti.splice(i, 1);
    }

    for (i = rings.length - 1; i >= 0; i--) {
      o = rings[i];
      o.life += dt;
      if (o.life >= o.ttl) rings.splice(i, 1);
    }

    for (i = trails.length - 1; i >= 0; i--) {
      o = trails[i];
      o.life += dt;
      if (o.life >= o.ttl) trails.splice(i, 1);
    }

    for (i = bubbles.length - 1; i >= 0; i--) {
      o = bubbles[i];
      o.life += dt;
      o.y += o.vy * dt;
      o.x += Math.sin((o.life + o.sway) * 1.6) * 12 * dt;
      if (o.life >= o.ttl || o.y < -o.r * 2) bubbles.splice(i, 1);
    }

    for (i = faces.length - 1; i >= 0; i--) {
      o = faces[i];
      o.life += dt;
      o.t += dt;
      if (o.blink > 0) {
        o.blink -= dt;
      } else {
        o.nextBlink -= dt;
        if (o.nextBlink <= 0) {
          o.blink = 0.13;
          o.nextBlink = rnd(2.2, 6.2);
        }
      }
    }
  }

  /* 洗画布时让小脸一起淡出 */
  function fadeFaces(dt) {
    for (var i = faces.length - 1; i >= 0; i--) {
      faces[i].alpha -= dt * 0.62;
      if (faces[i].alpha <= 0.02) faces.splice(i, 1);
    }
  }

  function clearFaces() { faces.length = 0; }

  /* ---------------- 绘制 ---------------- */

  function drawFace(ctx, f) {
    var s = f.size;
    var bob = Math.sin(f.t * 1.9) * s * 0.045;
    var x = f.x;
    var y = f.y + bob;
    var eyeY = y - s * 0.22;
    var eyeX = s * 0.34;
    var open = f.blink > 0 ? 0.12 : 1;

    ctx.save();
    ctx.globalAlpha = f.alpha;

    /* 腮红 */
    ctx.fillStyle = 'rgba(255, 138, 168, 0.45)';
    ctx.beginPath();
    ctx.ellipse(x - s * 0.62, y + s * 0.18, s * 0.2, s * 0.13, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + s * 0.62, y + s * 0.18, s * 0.2, s * 0.13, 0, 0, TAU);
    ctx.fill();

    /* 眼白 */
    ctx.fillStyle = '#ffffff';
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      ctx.ellipse(x + side * eyeX, eyeY, s * 0.29, s * 0.31 * open, 0, 0, TAU);
      ctx.fill();
    });

    /* 瞳孔 */
    if (open > 0.3) {
      ctx.fillStyle = 'rgb(' + INK + ')';
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.arc(x + side * eyeX + f.gaze * s * 0.2, eyeY + s * 0.04, s * 0.135, 0, TAU);
        ctx.fill();
      });
      /* 高光 */
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.arc(x + side * eyeX + f.gaze * s * 0.2 - s * 0.05, eyeY - s * 0.03, s * 0.045, 0, TAU);
        ctx.fill();
      });
    }

    /* 笑 */
    ctx.strokeStyle = 'rgb(' + INK + ')';
    ctx.lineWidth = Math.max(2, s * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y + s * 0.3, s * 0.34, 0.28 * Math.PI, 0.72 * Math.PI, false);
    ctx.stroke();

    ctx.restore();
  }

  function render(ctx) {
    var i, o, k;

    /* 湿笔迹（淡淡的，会蒸发） */
    for (i = 0; i < trails.length; i++) {
      o = trails[i];
      k = 1 - o.life / o.ttl;
      ctx.globalAlpha = 0.18 * k;
      ctx.fillStyle = o.color;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * (0.5 + 0.5 * k), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* 扩散光环 */
    for (i = 0; i < rings.length; i++) {
      o = rings[i];
      k = o.life / o.ttl;
      ctx.globalAlpha = (1 - k) * (1 - k) * 0.34;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 2 + 6 * (1 - k);
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r0 + (o.r1 - o.r0) * easeOut(k), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* 空闲泡泡 */
    for (i = 0; i < bubbles.length; i++) {
      o = bubbles[i];
      k = o.life / o.ttl;
      ctx.globalAlpha = 0.28 * (1 - Math.max(0, k - 0.65) / 0.35);
      ctx.fillStyle = o.color;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* 闪粉 */
    for (i = 0; i < confetti.length; i++) {
      o = confetti[i];
      k = o.life / o.ttl;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot);
      ctx.fillStyle = o.color;
      if (o.round) {
        ctx.beginPath();
        ctx.arc(0, 0, o.size * 0.5, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillRect(-o.size * 0.5, -o.size * 0.35, o.size, o.size * 0.7);
      }
      ctx.restore();
    }

    /* 漂浮音符：白边 + 彩心，像贴纸 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < notes.length; i++) {
      o = notes[i];
      k = o.life / o.ttl;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot);
      ctx.font = '700 ' + o.size.toFixed(0) + 'px "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = o.size * 0.22;
      ctx.strokeText(o.glyph, 0, 0);
      ctx.fillStyle = o.color;
      ctx.fillText(o.glyph, 0, 0);
      ctx.restore();
    }

    /* 小脸 */
    for (i = 0; i < faces.length; i++) drawFace(ctx, faces[i]);

    ctx.globalAlpha = 1;
  }

  function count() {
    return notes.length + confetti.length + rings.length + faces.length + bubbles.length;
  }

  return {
    addNotes: addNotes,
    addConfetti: addConfetti,
    addRing: addRing,
    addTrail: addTrail,
    addFace: addFace,
    addBubble: addBubble,
    clearBurst: clearBurst,
    fadeFaces: fadeFaces,
    clearFaces: clearFaces,
    update: update,
    render: render,
    count: count
  };
})();
