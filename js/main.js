/* ===========================================================
   main.js — 主控
   分层画布：paint 层永久留色，fx 层每帧重画。
   键盘 / 鼠标 / 触摸板 / 多点触控 / 滚轮 → 颜料 + 音符。
   画满自动洗画；Ctrl+Shift+X 立刻清屏。
   =========================================================== */

(function () {
  'use strict';

  var PALETTE = ['#ff6b6b', '#ffc93c', '#4ecdc4', '#48a9e6', '#a06cd5', '#ff8fab', '#5bb86a', '#ff9f45'];
  var DEMO = /(?:[?&])demo=1(?:&|$)/.test(location.search);
  var DEBUG = /(?:[?&])debug=1(?:&|$)/.test(location.search);

  /* 自动洗画的参数 */
  var WASH_AT = 0.55;      // 画布被颜料占到这么多就开始洗
  var LOAD_AT = 300;       // 兜底：累计涂鸦量到这个数也洗（不依赖覆盖率测量）
  var LOAD_FORCE = 560;    // 一直不停手时，到这个量强行洗
  var PAUSE_MS = 700;      // 画满后等手停一下再洗，别在他正画的时候擦
  var WASH_CLEAN = 0.04;   // 洗到这么干净就算洗完
  var WASH_TIME = 1.8;     // 洗画最长秒数
  var IDLE_MS = 12000;     // 多久没动静开始浮泡泡

  /* 键位对应音阶：数字行最高，最下一行最低 */
  var ROWS = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
  var ROW_OFFSET = [10, 6, 3, 0];

  var paint = document.getElementById('paint');
  var fx = document.getElementById('fx');
  var startEl = document.getElementById('start');
  var goBtn = document.getElementById('go');
  var pctx = paint.getContext('2d');
  var fctx = fx.getContext('2d');

  var st = {
    running: false,
    w: 0, h: 0, dpr: 1,
    scale: 1,
    washing: false,
    washT: 0,
    washProbe: 0,
    densityT: 0,
    paintLoad: 0,
    lastCover: 0,
    lastPaint: 0,
    hue: Math.random() * 360,
    lastColor: '',
    lastInput: performance.now(),
    lastWheel: 0,
    lastRepeat: 0,
    lastTrail: { x: -999, y: -999 },
    lastAmbient: 0,
    demoT: 0,
    demoSeeded: false
  };

  var pointers = new Map();
  var recentPos = [];

  /* ---------------- 小工具 ---------------- */

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function pickColor() {
    var c = st.lastColor;
    for (var i = 0; i < 6 && c === st.lastColor; i++) {
      c = PALETTE[(Math.random() * PALETTE.length) | 0];
    }
    st.lastColor = c;
    return c;
  }

  function hueColor() {
    st.hue = (st.hue + 1.7) % 360;
    return 'hsl(' + st.hue.toFixed(0) + ' 78% 60%)';
  }

  function randStep() { return (Math.random() * 15) | 0; }

  function stepForKey(e) {
    var k = (e.key || '').toLowerCase();
    for (var r = 0; r < ROWS.length; r++) {
      var i = ROWS[r].indexOf(k);
      if (i >= 0) return clamp(ROW_OFFSET[r] + (i % 5), 0, 14);
    }
    if (k === ' ' || k === 'enter') return 0;
    if (k === 'arrowup') return 12;
    if (k === 'arrowdown') return 2;
    if (k === 'arrowleft') return 5;
    if (k === 'arrowright') return 9;
    return randStep();
  }

  /* 挑一个离最近几团颜料尽量远的位置，避免堆在一起 */
  function pickPos(r) {
    var best = null, bestD = -1;
    for (var i = 0; i < 5; i++) {
      var x = r + Math.random() * Math.max(1, st.w - r * 2);
      var y = r + Math.random() * Math.max(1, st.h - r * 2);
      var d = Infinity;
      for (var j = 0; j < recentPos.length; j++) {
        d = Math.min(d, Math.hypot(recentPos[j].x - x, recentPos[j].y - y));
      }
      if (d > bestD) { bestD = d; best = { x: x, y: y }; }
    }
    recentPos.push(best);
    if (recentPos.length > 4) recentPos.shift();
    return best;
  }

  /* ---------------- 画布尺寸 ---------------- */

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, window.innerWidth);
    var h = Math.max(1, window.innerHeight);

    var keep = null;
    if (st.w && paint.width) {
      keep = document.createElement('canvas');
      keep.width = paint.width;
      keep.height = paint.height;
      keep.getContext('2d').drawImage(paint, 0, 0);
    }

    st.w = w; st.h = h; st.dpr = dpr;
    /* 小屏幕上把颜料块按比例缩小，免得一团就占满屏 */
    st.scale = clamp(Math.min(w, h) / 900, 0.6, 1.25);

    var list = [paint, fx];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    }

    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.lineJoin = 'round';
    pctx.lineCap = 'round';
    fctx.lineJoin = 'round';
    fctx.lineCap = 'round';

    if (keep) {
      pctx.save();
      pctx.globalAlpha = 1;
      pctx.drawImage(keep, 0, 0, keep.width, keep.height, 0, 0, w, h);
      pctx.restore();
    }
  }

  /* ---------------- 出效果 ---------------- */

  function spawnSplat(x, y, o) {
    o = o || {};
    var r = (o.r || 44) * st.scale;
    var color = o.color || pickColor();

    Blob.paintSplat(pctx, {
      x: x, y: y, r: r, color: color,
      drips: o.drips == null ? 3 : o.drips,
      satellites: o.satellites == null ? 6 : o.satellites,
      arms: r > 40 ? 3 : 2,
      wobble: o.wobble == null ? 0.21 : o.wobble,
      alpha: 0.95
    });

    FX.addNotes(x, y - r * 0.3, color, o.notes || 1);
    FX.addConfetti(x, y, color, o.confetti == null ? 6 : o.confetti);

    if (o.character) FX.addFace(x, y - r * 0.04, r * 0.52, color);

    st.paintLoad += 1 + r / 50;
    st.lastPaint = performance.now();
  }

  /* ---------------- 清屏 / 自动洗画 ---------------- */

  function resetWashState() {
    st.washing = false;
    st.washT = 0;
    st.washProbe = 0;
    st.densityT = 0;
    st.paintLoad = 0;
    st.lastCover = 0;
  }

  /* 立刻清成一张干净白纸 */
  function clearAll() {
    pctx.clearRect(0, 0, st.w, st.h);
    FX.clearFaces();
    resetWashState();
    FX.clearBurst(st.w, st.h);
  }

  /* 家长快捷键 Ctrl+Shift+X（或 Ctrl+Shift+Delete）走这里 */
  window.__toyClear = function () {
    if (!st.running) return;
    clearAll();
    Sound.init();
    Sound.splash();
    st.lastInput = performance.now();
  };

  /* 把画布缩到 160×100 数一下有多少像素"有颜料"：
     不管是砸键盘还是拿鼠标乱拖，画满了都会洗。 */
  var probe = document.createElement('canvas');
  probe.width = 160;
  probe.height = 100;
  var probeCtx = probe.getContext('2d', { willReadFrequently: true });

  function measureCoverage() {
    if (!probeCtx || !st.w) return 0;
    probeCtx.clearRect(0, 0, probe.width, probe.height);
    try {
      probeCtx.drawImage(paint, 0, 0, probe.width, probe.height);
    } catch (err) { return 0; }
    var d = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
    var hit = 0;
    for (var i = 3; i < d.length; i += 4) {
      if (d[i] > 24) hit++;
    }
    return hit / (probe.width * probe.height);
  }

  function beginWash() {
    if (st.washing) return;
    st.washing = true;
    st.washT = 0;
    st.washProbe = 0;
    st.densityT = 0;
  }

  /* ---------------- 启动 ---------------- */

  function start() {
    if (st.running) return;
    st.running = true;
    window.__toyRunning = true;
    st.lastInput = performance.now();

    startEl.classList.add('gone');
    setTimeout(function () {
      if (startEl.parentNode) startEl.style.display = 'none';
    }, 520);

    Sound.init();
    Guard.enterFullscreen();

    /* 初始化：一张干净的白纸，什么都不画 */
    pctx.clearRect(0, 0, st.w, st.h);
    FX.clearFaces();
    resetWashState();
  }

  window.__toyStart = start;

  /* ---------------- 键盘 ---------------- */

  function repeatPulse() {
    var now = performance.now();
    if (now - st.lastRepeat < 95) return;
    st.lastRepeat = now;
    var p = pickPos(20);
    Blob.paintSplat(pctx, { x: p.x, y: p.y, r: rnd(8, 16), color: pickColor(), drips: 1, satellites: 2, specks: 3 });
    FX.addRing(p.x, p.y, 14, pickColor());
    st.paintLoad += 0.4;
    st.lastPaint = performance.now();
    Sound.note(randStep(), { vol: 0.14, dur: 0.4, cutoff: 2400 });
  }

  function onKeyDown(e) {
    if (!st.running) { if (!e.repeat) start(); return; }
    st.lastInput = performance.now();

    if (e.repeat) { repeatPulse(); return; }

    var key = e.key;
    var big = key === ' ' || key === 'Enter' || key === 'NumpadEnter';
    var isArrow = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
    var step = stepForKey(e);
    var r = big ? rnd(72, 104) : rnd(28, 54);
    var pos = pickPos(r);

    if (isArrow) {
      var dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
      var dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      Blob.paintSwoosh(pctx, { x: pos.x, y: pos.y, r: r * st.scale, dx: dx, dy: dy, color: pickColor() });
      FX.addNotes(pos.x + dx * r * 2.4, pos.y + dy * r * 2.4, pickColor(), 2);
      FX.addConfetti(pos.x + dx * r * 2.4, pos.y + dy * r * 2.4, pickColor(), 10);
      Sound.note(step, { vol: 0.34, dur: 0.9, cutoff: 2400 });
      st.paintLoad += 4;
      st.lastPaint = performance.now();
      return;
    }

    spawnSplat(pos.x, pos.y, {
      r: r,
      character: Math.random() < 0.24,
      confetti: big ? 20 : 7,
      notes: big ? 2 : 1,
      drips: big ? 5 : 3
    });
    Sound.note(step, { vol: big ? 0.5 : 0.4, dur: big ? 1.6 : 1.05 });
  }

  window.addEventListener('keydown', onKeyDown, false);

  /* ---------------- 指针（鼠标 / 触屏 / 触摸板） ---------------- */

  function onPointerDown(e) {
    if (!st.running) { start(); return; }
    st.lastInput = performance.now();

    var x = e.clientX, y = e.clientY;
    var touch = e.pointerType === 'touch';
    var color = hueColor();

    pointers.set(e.pointerId, {
      x: x, y: y,
      color: color,
      width: touch ? 30 : 22,
      lastSound: 0
    });

    var r = touch ? rnd(56, 78) : rnd(42, 64);
    spawnSplat(x, y, {
      r: r,
      character: Math.random() < 0.3,
      confetti: 14,
      notes: 1,
      drips: 3
    });

    if (Math.random() < 0.45) Sound.chord(randStep());
    else Sound.note(randStep(), { vol: 0.4 });
    Sound.splash();
  }

  function onPointerMove(e) {
    if (!st.running) return;
    st.lastInput = performance.now();

    var p = pointers.get(e.pointerId);

    /* 没按下时的湿笔迹（鼠标 / 触摸板划过） */
    if (!p) {
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        var dx0 = e.clientX - st.lastTrail.x;
        var dy0 = e.clientY - st.lastTrail.y;
        if (dx0 * dx0 + dy0 * dy0 > 26) {
          FX.addTrail(e.clientX, e.clientY, 'hsl(' + ((st.hue + 170) % 360).toFixed(0) + ' 75% 62%)');
          st.lastTrail.x = e.clientX;
          st.lastTrail.y = e.clientY;
        }
      }
      return;
    }

    var dx = e.clientX - p.x;
    var dy = e.clientY - p.y;
    var dist = Math.hypot(dx, dy);
    if (dist < 1.1) return;

    p.width = Math.min(54, 16 + Math.sqrt(dist) * 6.5 + (e.pointerType === 'touch' ? 10 : 0)) * st.scale;

    var col = hueColor();

    pctx.save();
    pctx.strokeStyle = col;
    pctx.globalAlpha = 0.86;
    pctx.lineWidth = p.width;
    pctx.beginPath();
    pctx.moveTo(p.x, p.y);
    pctx.lineTo(e.clientX, e.clientY);
    pctx.stroke();
    pctx.restore();

    /* 甩出去的小点 */
    if (Math.random() < 0.3) {
      var a = Math.random() * Math.PI * 2;
      var d = rnd(10, p.width * 1.6);
      pctx.save();
      pctx.globalAlpha = 0.7;
      pctx.fillStyle = col;
      pctx.beginPath();
      pctx.arc(e.clientX + Math.cos(a) * d, e.clientY + Math.sin(a) * d, rnd(1.5, 5), 0, Math.PI * 2);
      pctx.fill();
      pctx.restore();
    }

    p.x = e.clientX;
    p.y = e.clientY;
    st.paintLoad += dist / 200;
    st.lastPaint = performance.now();

    var now = performance.now();
    if (now - p.lastSound > 105) {
      p.lastSound = now;
      Sound.note(randStep(), { vol: 0.15, dur: 0.6, cutoff: 2200 });
    }
  }

  function onPointerUp(e) {
    var p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (!st.running) return;
    /* 收笔时滴一小滴 */
    Blob.paintSplat(pctx, {
      x: e.clientX, y: e.clientY,
      r: rnd(10, 22), color: p.color,
      drips: 1, satellites: 3, specks: 4, alpha: 0.85
    });
  }

  window.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });

  /* ---------------- 滚轮 / 双指滑动 ---------------- */

  function onWheel(e) {
    e.preventDefault();
    if (!st.running) return;
    st.lastInput = performance.now();

    var now = performance.now();
    if (now - st.lastWheel < 85) return;
    st.lastWheel = now;

    var x = e.clientX || st.w / 2;
    var y = e.clientY || st.h / 2;
    var dir = (e.deltaY || 0) > 0 ? 1 : -1;

    for (var i = 0; i < 6; i++) {
      var px = x + rnd(-72, 72);
      var py = y + rnd(-34, 34) + i * dir * 15;
      var rr = rnd(5, 16);
      pctx.save();
      pctx.globalAlpha = 0.8;
      pctx.fillStyle = pickColor();
      pctx.beginPath();
      pctx.arc(px, py, rr, 0, Math.PI * 2);
      pctx.fill();
      /* 小尾巴 */
      pctx.globalAlpha = 0.5;
      pctx.fillRect(px - rr * 0.35, py - dir * rr * 2.6, rr * 0.7, rr * 2.6);
      pctx.restore();
    }

    FX.addRing(x, y, 26, pickColor());
    FX.addConfetti(x, y, pickColor(), 6);
    st.paintLoad += 1;
    st.lastPaint = performance.now();
    Sound.whoosh();
  }

  window.addEventListener('wheel', onWheel, { passive: false });

  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  /* ---------------- 主循环 ---------------- */

  var lastT = performance.now();

  function frame(now) {
    var dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;

    /* 洗画：擦到干净为止（不是擦固定时长），收尾再彻底清一次，不留底影 */
    if (st.washing) {
      pctx.save();
      pctx.globalCompositeOperation = 'destination-out';
      pctx.globalAlpha = 0.075;
      pctx.fillStyle = '#000000';
      pctx.fillRect(0, 0, st.w, st.h);
      pctx.restore();

      FX.fadeFaces(dt * 1.4);
      st.washT += dt;
      st.washProbe += dt;

      if (st.washProbe > 0.3) {
        st.washProbe = 0;
        if (st.washT > 0.5 && measureCoverage() < WASH_CLEAN) st.washT = 99;
      }

      if (st.washT > WASH_TIME) {
        pctx.clearRect(0, 0, st.w, st.h);
        FX.clearFaces();
        FX.clearBurst(st.w, st.h);
        resetWashState();
      }
    } else if (st.running && !DEMO) {
      /* 每 0.6 秒量一次画布占用；两条触发线 + 停手才洗 */
      st.densityT += dt;
      if (st.densityT > 0.6) {
        st.densityT = 0;
        st.lastCover = measureCoverage();
        var paused = now - st.lastPaint > PAUSE_MS;
        if (st.lastCover > 0.75) beginWash();                        // 实在太满了，立刻洗
        else if ((st.lastCover > WASH_AT || st.paintLoad > LOAD_AT) && paused) beginWash();
        else if (st.paintLoad > LOAD_FORCE) beginWash();             // 一直不停手，兜底硬洗
      }
    }

    /* 空闲太久：自己浮几个泡泡，别看起来死了 */
    if (st.running && now - st.lastInput > IDLE_MS && now - st.lastAmbient > 620) {
      st.lastAmbient = now;
      FX.addBubble(st.w, st.h);
    }

    if (DEMO) demo(now, dt);

    FX.update(dt);
    fctx.clearRect(0, 0, st.w, st.h);
    FX.render(fctx);

    /* ?debug=1：左上角显示实时数据，方便确认洗画逻辑在跑 */
    if (DEBUG) {
      var label = '覆盖 ' + Math.round(st.lastCover * 100) + '% / 阈值 ' + Math.round(WASH_AT * 100) + '%'
        + '　负荷 ' + Math.round(st.paintLoad) + ' / ' + LOAD_AT
        + (st.washing ? '　洗画中…' : '');
      fctx.save();
      fctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
      fctx.textAlign = 'left';
      fctx.textBaseline = 'middle';
      var tw = fctx.measureText(label).width;
      fctx.fillStyle = 'rgba(255,255,255,0.82)';
      fctx.beginPath();
      fctx.roundRect ? fctx.roundRect(10, 10, tw + 20, 26, 13) : fctx.rect(10, 10, tw + 20, 26);
      fctx.fill();
      fctx.fillStyle = 'rgba(59,47,42,0.78)';
      fctx.fillText(label, 20, 23);
      fctx.restore();
    }

    requestAnimationFrame(frame);
  }

  /* ---------------- demo 模式（自测截图用） ---------------- */

  function demo(now, dt) {
    if (!st.demoSeeded) {
      st.demoSeeded = true;
      var i;
      for (i = 0; i < 22; i++) {
        spawnSplat(rnd(0.06, 0.94) * st.w, rnd(0.08, 0.88) * st.h, {
          r: rnd(30, 78),
          character: Math.random() < 0.32,
          confetti: Math.random() < 0.4 ? 12 : 0,
          notes: 1
        });
      }
      /* 两道彩虹笔迹 */
      for (var s = 0; s < 2; s++) {
        var x0 = rnd(0.1, 0.3) * st.w;
        var y0 = rnd(0.3, 0.7) * st.h;
        for (var k = 0; k < 16; k++) {
          var x1 = x0 + Math.cos(k * 0.42 + s) * 34 + 20;
          var y1 = y0 + Math.sin(k * 0.42 + s) * 26;
          pctx.save();
          pctx.strokeStyle = hueColor();
          pctx.globalAlpha = 0.86;
          pctx.lineWidth = 26;
          pctx.beginPath();
          pctx.moveTo(x0, y0);
          pctx.lineTo(x1, y1);
          pctx.stroke();
          pctx.restore();
          x0 = x1; y0 = y1;
        }
      }
      return;
    }

    st.demoT += dt;
    if (st.demoT > 0.18) {
      st.demoT = 0;
      var pos = pickPos(40);
      spawnSplat(pos.x, pos.y, {
        r: rnd(28, 56),
        character: Math.random() < 0.3,
        confetti: 8,
        notes: 1
      });
    }
  }

  /* ---------------- 引导 ---------------- */

  goBtn.addEventListener('click', function (ev) {
    ev.preventDefault();
    start();
  });

  document.addEventListener('visibilitychange', function () {
    lastT = performance.now();
  });

  resize();
  requestAnimationFrame(frame);

  if (DEMO) {
    startEl.classList.add('gone');
    startEl.style.display = 'none';
    st.running = true;
  }
})();
