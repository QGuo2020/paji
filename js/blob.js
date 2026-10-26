/* ===========================================================
   blob.js — 颜料飞溅图形生成
   一团主色块 + 甩出的尖角 + 卫星点 + 细碎喷点 + 下垂流挂。
   目标是"啪"一下溅开的感觉，不是气球。
   =========================================================== */

window.Blob = (function () {
  'use strict';

  var TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* 用二次贝塞尔把一圈抖动的点连成圆润的闭合色块 */
  function blobPath(ctx, cx, cy, r, points, wobble, rot, squash) {
    rot = rot || 0;
    squash = squash || 1;

    var radii = [];
    var i;
    for (i = 0; i < points; i++) {
      radii.push(1 + rnd(-wobble, wobble));
    }
    /* 半径平滑一遍：把生硬棱角磨圆，但保留不规则感 */
    var src = radii.slice();
    for (i = 0; i < points; i++) {
      radii[i] = (src[(i - 1 + points) % points] + src[i] * 2 + src[(i + 1) % points]) / 4;
    }

    var ca = Math.cos(rot), sa = Math.sin(rot);
    var pts = [];
    for (i = 0; i < points; i++) {
      var a = (i / points) * TAU;
      var rr = r * radii[i];
      var lx = Math.cos(a) * rr;
      var ly = Math.sin(a) * rr * squash;
      pts.push([cx + lx * ca - ly * sa, cy + lx * sa + ly * ca]);
    }
    function mid(p, q) { return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }

    ctx.beginPath();
    var first = mid(pts[points - 1], pts[0]);
    ctx.moveTo(first[0], first[1]);
    for (i = 0; i < points; i++) {
      var p = pts[i];
      var m = mid(p, pts[(i + 1) % points]);
      ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    ctx.closePath();
  }

  /* 从边缘甩出去的一根尖刺（比起圆条更像溅出来的） */
  function spike(ctx, cx, cy, r, angle, len, wid) {
    var ca = Math.cos(angle), sa = Math.sin(angle);
    var px = -sa, py = ca;
    var bx = cx + ca * r * 0.82, by = cy + sa * r * 0.82;
    var mx = cx + ca * (r + len * 0.52), my = cy + sa * (r + len * 0.52);
    var tx = cx + ca * (r + len), ty = cy + sa * (r + len);

    ctx.beginPath();
    ctx.moveTo(bx + px * wid, by + py * wid);
    ctx.quadraticCurveTo(mx + px * wid * 0.62, my + py * wid * 0.62, tx, ty);
    ctx.quadraticCurveTo(mx - px * wid * 0.62, my - py * wid * 0.62, bx - px * wid, by - py * wid);
    ctx.closePath();
    ctx.fill();
  }

  /* 一条胶囊形的流挂 */
  function drip(ctx, x, y, len, w) {
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x - w, y + len);
    ctx.arc(x, y + len, w, Math.PI, 0, true);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
  }

  /* 主入口：往静态画布上盖一团颜料 */
  function paintSplat(ctx, o) {
    var x = o.x, y = o.y, r = o.r, color = o.color;
    var wobble = o.wobble == null ? 0.26 : o.wobble;
    var nDrips = o.drips == null ? 3 : o.drips;
    var nSats = o.satellites == null ? 7 : o.satellites;
    var nSpecks = o.specks == null ? 16 : o.specks;
    var nArms = o.arms == null ? 2 : o.arms;
    var alpha = o.alpha == null ? 0.96 : o.alpha;

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;

    var rot = rnd(-0.5, 0.5);
    var squash = rnd(0.8, 1.2);

    /* 主色块 */
    blobPath(ctx, x, y, r, o.points || 12, wobble, rot, squash);
    ctx.fill();

    /* 甩出去的尖瓣 */
    var i;
    var lobes = rnd(0, TAU);
    for (i = 0; i < nArms; i++) {
      spike(ctx, x, y, r, lobes + i * rnd(1.4, 2.6), r * rnd(0.22, 0.56), r * rnd(0.1, 0.19));
    }

    /* 卫星点 */
    var a, d, rr;
    for (i = 0; i < nSats; i++) {
      a = rnd(0, TAU);
      d = r * rnd(1.02, 1.6);
      rr = r * rnd(0.06, 0.17);
      ctx.globalAlpha = alpha * 0.95;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.94, rr, 0, TAU);
      ctx.fill();
    }

    /* 细碎喷点 */
    for (i = 0; i < nSpecks; i++) {
      a = rnd(0, TAU);
      d = r * rnd(1.04, 2.4);
      rr = r * rnd(0.008, 0.032);
      ctx.globalAlpha = alpha * 0.75;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, TAU);
      ctx.fill();
    }

    /* 流挂：从底部边缘往下垂 */
    ctx.globalAlpha = alpha * 0.92;
    for (i = 0; i < nDrips; i++) {
      var ox = rnd(-0.66, 0.66);
      var edge = Math.sqrt(Math.max(0, 1 - ox * ox)) * r * 0.84;
      drip(ctx, x + ox * r, y + edge, r * rnd(0.24, 1.1), r * rnd(0.03, 0.062));
    }

    ctx.restore();
  }

  /* 方向键用的长笔扫 */
  function paintSwoosh(ctx, o) {
    var x = o.x, y = o.y, r = o.r, dx = o.dx, dy = o.dy, color = o.color;
    var len = r * rnd(2.6, 3.6);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9;

    var steps = 5;
    for (var i = 0; i < steps; i++) {
      var t = i / (steps - 1);
      var w = r * (0.22 + 0.5 * (1 - t));
      var sx = x + dx * (len * 0.06 * t);
      var sy = y + dy * (len * 0.06 * t);
      var ex = x + dx * (len * (0.35 + 0.65 * t));
      var ey = y + dy * (len * (0.35 + 0.65 * t));
      ctx.globalAlpha = 0.86 - t * 0.35;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();

    /* 末端甩出去的点 */
    paintSplat(ctx, {
      x: x + dx * len, y: y + dy * len,
      r: r * 0.5, color: color,
      drips: 2, satellites: 5, specks: 8, arms: 2
    });
  }

  return { paintSplat: paintSplat, paintSwoosh: paintSwoosh };
})();
