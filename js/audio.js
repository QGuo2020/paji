/* ===========================================================
   audio.js — 声音引擎
   全部锁在 C 大调五声音阶里，怎么乱按都不会难听；
   主链有压缩 + 限幅，砸键盘也不会炸耳朵。
   =========================================================== */

window.Sound = (function () {
  'use strict';

  var PENTA = [0, 2, 4, 7, 9];   // 五声音阶：宫商角徵羽
  var BASE_MIDI = 48;            // C3
  var MAX_STEP = 14;             // 三个八度
  var MASTER = 0.34;

  var ctx = null;
  var comp = null;
  var out = null;
  var verb = null;
  var wet = null;
  var muted = false;
  var voices = 0;
  var recent = [];               // 限速用

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function stepToMidi(step) {
    var s = Math.round(step);
    if (s < 0) s = 0;
    if (s > MAX_STEP) s = MAX_STEP;
    return BASE_MIDI + Math.floor(s / 5) * 12 + PENTA[s % 5];
  }

  function makeImpulse(sec, decay) {
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * sec));
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 22;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.28;

    out = ctx.createGain();
    out.gain.value = muted ? 0 : MASTER;

    comp.connect(out);
    out.connect(ctx.destination);

    try {
      verb = ctx.createConvolver();
      verb.buffer = makeImpulse(1.7, 3.4);
      wet = ctx.createGain();
      wet.gain.value = 0.16;
      verb.connect(wet);
      wet.connect(out);
    } catch (err) {
      verb = null;
    }

    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }

  /* 每秒最多 20 个新音 + 同时最多 26 个声部 */
  function allow() {
    if (!ctx || muted) return false;
    var t = ctx.currentTime;
    while (recent.length && t - recent[0] > 1) recent.shift();
    if (recent.length > 20) return false;
    if (voices > 26) return false;
    recent.push(t);
    return true;
  }

  function tone(freq, opt) {
    if (!ctx || muted) return;
    var o = opt || {};
    var t0 = ctx.currentTime + (o.delay || 0);
    var dur = o.dur || 1.15;
    var vol = o.vol == null ? 0.4 : o.vol;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0006, t0 + dur);

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(o.cutoff || 3600, t0);
    lp.Q.value = 0.9;

    var a = ctx.createOscillator();
    a.type = 'sine';
    a.frequency.setValueAtTime(freq, t0);

    var b = ctx.createOscillator();
    b.type = 'triangle';
    b.frequency.setValueAtTime(freq * 2.004, t0);

    var bg = ctx.createGain();
    bg.gain.value = 0.18;

    a.connect(lp);
    b.connect(bg);
    bg.connect(lp);
    lp.connect(g);
    g.connect(comp);
    if (verb) g.connect(verb);

    voices++;
    var stopAt = t0 + dur + 0.05;
    a.start(t0);
    b.start(t0);
    a.stop(stopAt);
    b.stop(stopAt);

    a.onended = function () {
      voices = Math.max(0, voices - 1);
      try { g.disconnect(); } catch (err) {}
    };
  }

  function noise(dur, type, f0, f1, vol) {
    if (!ctx || muted) return;
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * dur));
    var buf = ctx.createBuffer(1, len, rate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);

    var src = ctx.createBufferSource();
    src.buffer = buf;

    var bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.Q.value = 1.1;

    var t0 = ctx.currentTime;
    bq.frequency.setValueAtTime(f0, t0);
    bq.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t0 + dur);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0006, t0 + dur);

    src.connect(bq);
    bq.connect(g);
    g.connect(comp);
    if (verb) g.connect(verb);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(function () {});
    else ctx.resume().catch(function () {});
  });

  return {
    init: init,

    muted: function () { return muted; },

    setMuted: function (v) {
      muted = !!v;
      if (out) out.gain.value = muted ? 0 : MASTER;
    },

    /* 音阶第 step 级（0..14） */
    note: function (step, opt) {
      if (!allow()) return;
      tone(midiToFreq(stepToMidi(step)), opt || {});
    },

    /* 三音和弦，给鼠标点一下用 */
    chord: function (step, opt) {
      if (!ctx || muted) return;
      for (var i = 0; i < 3; i++) {
        if (!allow()) break;
        tone(midiToFreq(stepToMidi(step + i * 2)), {
          vol: 0.26,
          dur: 1.5,
          delay: i * 0.04,
          cutoff: 2600
        });
      }
    },

    /* 哗啦一声（颜料泼出去） */
    splash: function () {
      if (!allow()) return;
      noise(0.26, 'bandpass', 1100, 240, 0.14);
    },

    /* 滚轮/双指滑动的上扬气流 */
    whoosh: function () {
      if (!ctx || muted) return;
      noise(0.4, 'bandpass', 420, 2600, 0.12);
    },

    /* 被屏蔽的键：一点点很轻的"咚"，让小孩知道按到了 */
    knock: function () {
      if (!allow()) return;
      tone(midiToFreq(stepToMidi(0)), { vol: 0.12, dur: 0.22, cutoff: 900 });
    },

    stepToMidi: stepToMidi,
    midiToFreq: midiToFreq
  };
})();
