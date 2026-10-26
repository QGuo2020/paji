/* ===========================================================
   guard.js — 输入守卫
   目标：小朋友乱按时，除了「画颜料 + 出声音」什么都不该发生。
   唯一保留的功能键：F11（切换全屏）。
   =========================================================== */

window.Guard = (function () {
  'use strict';

  /* 允许产生效果的键（其余一律拦掉） */
  var EFFECT_KEYS = {
    'Enter': 1, 'NumpadEnter': 1,
    'ArrowUp': 1, 'ArrowDown': 1, 'ArrowLeft': 1, 'ArrowRight': 1,
    'Spacebar': 1
  };

  var lastToggleAt = 0;

  /* ---------- 按键分类 ---------- */

  function hasModifier(e) {
    return !!(e.ctrlKey || e.altKey || e.metaKey);
  }

  function isEffectKey(e) {
    var k = e.key || '';
    if (hasModifier(e)) return false;           // Ctrl/Alt/Win 组合一律不算效果
    if (EFFECT_KEYS[k] === 1) return true;
    if (k === ' ' || k.length === 1) return true; // 字母、数字、标点、空格
    return false;                                // 其余：Shift/Ctrl/Tab/Esc/F1..F12/方向...
  }

  function classify(e) {
    var k = e.key || '';
    if (k === 'F11') return 'fullscreen';
    if (k === 'Process' || k === 'Dead' || k === 'Unidentified' || k === 'Compose') return 'blocked';
    if (k === 'F12') return 'blocked';
    return isEffectKey(e) ? 'effect' : 'blocked';
  }

  /* ---------- 全屏 ---------- */

  function requestFs() {
    var el = document.documentElement;
    try {
      var p;
      if (el.requestFullscreen) p = el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) p = el.webkitRequestFullscreen();
      if (p && p.catch) p.catch(function () {});
    } catch (err) { /* 没有用户手势等情况，忽略 */ }
  }

  function exitFs() {
    try {
      var p;
      if (document.exitFullscreen) p = document.exitFullscreen();
      else if (document.webkitExitFullscreen) p = document.webkitExitFullscreen();
      if (p && p.catch) p.catch(function () {});
    } catch (err) {}
  }

  function toggleFullscreen() {
    var now = performance.now();
    if (now - lastToggleAt < 520) return;   // 防止连按来回打架
    lastToggleAt = now;

    var was = isFullscreen();

    /* 等一小会儿再看状态：如果浏览器自己处理了 F11，就不要重复操作，
       否则会和浏览器原生的全屏切换互相抵消，看起来像"按了没反应"。 */
    setTimeout(function () {
      if (isFullscreen() !== was) return;
      if (was) exitFs();
      else requestFs();
    }, 240);
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  /* 全屏时尝试锁定键盘：能拿到 Esc / 大部分系统快捷键 */
  function syncFullscreen() {
    var on = isFullscreen();
    document.body.classList.toggle('is-fs', on);
    try {
      if (on && navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock();
      else if (!on && navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    } catch (err) {}
  }

  /* ---------- 家长快捷键：清屏 ---------- */

  /* Ctrl+Shift+X（主）或 Ctrl+Shift+Delete（好记的别名） */
  function isClearCombo(e) {
    var k = (e.key || '').toLowerCase();
    return !!(e.ctrlKey && e.shiftKey && (k === 'x' || k === 'delete' || k === 'backspace'));
  }

  /* ---------- 键盘 ---------- */

  function onKeyDown(e) {
    if (isClearCombo(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat && typeof window.__toyClear === 'function') window.__toyClear();
      return;
    }

    var cls = classify(e);

    if (cls === 'effect') {
      e.preventDefault();            // 无输入框页面：只用来阻止空格滚动等默认行为
      return;                        // 交给 main.js 出效果
    }

    e.preventDefault();
    e.stopImmediatePropagation();    // 阻断一切后续处理（包括 main.js）

    if (cls === 'fullscreen') {
      if (!e.repeat) toggleFullscreen();
      return;
    }
    /* 还没开始玩时，按到功能键也算"想开始" */
    if (!window.__toyRunning && typeof window.__toyStart === 'function') window.__toyStart();
  }

  function onKeyUp(e) {
    if (isClearCombo(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    var cls = classify(e);
    if (cls === 'effect') return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  /* ---------- 鼠标 / 触摸板 / 触屏 ---------- */

  function swallow(e) { e.preventDefault(); }

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('contextmenu', swallow, true);
  window.addEventListener('selectstart', function (e) {
    if (!/^(INPUT|TEXTAREA)$/.test(e.target && e.target.tagName || '')) e.preventDefault();
  }, true);
  window.addEventListener('dragstart', swallow, true);
  window.addEventListener('drop', swallow, true);
  window.addEventListener('auxclick', swallow, true);       // 中键自动滚动
  window.addEventListener('dblclick', swallow, true);       // 双击选中/缩放
  window.addEventListener('wheel', swallow, { capture: true, passive: false });
  window.addEventListener('touchmove', swallow, { capture: true, passive: false });
  window.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();  // 双指缩放
  }, { capture: true, passive: false });
  window.addEventListener('gesturestart', swallow);
  window.addEventListener('gesturechange', swallow);

  /* iOS Safari 的橡皮筋 */
  window.addEventListener('scroll', function () { window.scrollTo(0, 0); }, { passive: true });

  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);

  /* 防误关：关闭标签/刷新前提示一次 */
  window.addEventListener('beforeunload', function (e) {
    if (!window.__toyRunning) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  return {
    classify: classify,
    toggleFullscreen: toggleFullscreen,
    enterFullscreen: requestFs,
    isFullscreen: isFullscreen
  };
})();
