// Client-side hand-tutorial splicer. Mirrors lib/polishInjection.ts
// (server) but runs entirely in the browser, bypassing Next.js's
// ~10 MB Route Handler body cap which truncates large polished
// playables (the demo HTML is ~13 MB).
//
// Both paths produce IDENTICAL output for the same gestures + source.
// The server path is kept for smaller real-pipeline outputs and any
// non-browser caller; the client path is used by PolishPanel.

import type { Gesture } from './polishTypes'

const CLICK_RADIUS_FRAC = 0.12
const SWIPE_START_RADIUS_FRAC = 0.20
const SWIPE_MIN_LENGTH_FRAC = 0.40
const SWIPE_DIRECTION_DOT = 0.5
const FADE_MS = 360

let cachedRuntime: string | null = null
let cachedHandDataUrl: string | null = null

async function fetchRuntime(): Promise<string> {
  if (cachedRuntime) return cachedRuntime
  const res = await fetch('/prettifier/runtime.js', { cache: 'force-cache' })
  if (!res.ok) throw new Error(`Could not load /prettifier/runtime.js: ${res.status}`)
  cachedRuntime = await res.text()
  return cachedRuntime
}

async function fetchHandDataUrl(): Promise<string> {
  if (cachedHandDataUrl) return cachedHandDataUrl
  const res = await fetch('/prettifier/hand.png', { cache: 'force-cache' })
  if (!res.ok) throw new Error(`Could not load /prettifier/hand.png: ${res.status}`)
  const blob = await res.blob()
  // Read as base64 via FileReader so we never have to b64-encode bytes
  // manually (avoids the chunked btoa dance).
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('FileReader failed on hand.png'))
    reader.readAsDataURL(blob)
  })
  cachedHandDataUrl = dataUrl
  return cachedHandDataUrl
}

function projectGesture(g: Gesture) {
  const base = { id: g.id, name: g.name, mode: g.mode, delay: g.delay, duration: g.duration, repeat: g.repeat }
  if (g.mode === 'click') return { ...base, at: g.at, angle: g.angle ?? 20 }
  return { ...base, from: g.from, to: g.to }
}

function buildInjection(runtimeSource: string, gestures: Gesture[], handImgDataUrl: string): string {
  const safeGestures = gestures.map(projectGesture)
  return `
<!-- Tutorial hand runtime injected client-side by PolishPanel -->
<script>${runtimeSource}</script>
<style>
.editor-click-hand {
  position: absolute;
  left: var(--anchor-x); top: var(--anchor-y);
  width: 96px; height: 108px;
  background-image: var(--hand-img); background-size: contain; background-repeat: no-repeat;
  transform-origin: 12% 8%;
  pointer-events: none;
  z-index: 2147483000;
  will-change: transform, opacity;
  animation: editor-click-tap 1800ms cubic-bezier(.18,.9,.18,1) var(--delay, 0ms) var(--iter, infinite);
  filter: drop-shadow(0 8px 10px rgba(0,0,0,.4));
}
.editor-click-pulse {
  position: absolute;
  left: var(--pulse-x); top: var(--pulse-y);
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.96);
  box-shadow: 0 0 14px rgba(255,255,255,.7), 0 0 26px rgba(86,202,255,.45);
  pointer-events: none;
  z-index: 2147483000;
  transform: translate(-50%, -50%) scale(.4);
  opacity: 0;
  animation: editor-click-pulse 1800ms ease-out var(--delay, 0ms) var(--iter, infinite);
}
@keyframes editor-click-tap {
  0%, 13%   { opacity: 0; transform: rotate(var(--hand-angle, 20deg)) scale(.74); }
  28%       { opacity: 1; transform: rotate(var(--hand-angle, 20deg)) scale(1.05); }
  46%       { opacity: 1; transform: rotate(var(--hand-angle, 20deg)) scale(.9); }
  64%       { opacity: 1; transform: rotate(var(--hand-angle, 20deg)) scale(1.03); }
  86%, 100% { opacity: 0; transform: rotate(var(--hand-angle, 20deg)) scale(.8); }
}
@keyframes editor-click-pulse {
  0%, 33%   { opacity: 0; transform: translate(-50%, -50%) scale(.25); }
  43%       { opacity: 1; transform: translate(-50%, -50%) scale(.62); }
  78%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(4.2); }
}
</style>
<script>
(function () {
  var GESTURES = ${JSON.stringify(safeGestures, null, 2)};
  var HAND_IMG = ${JSON.stringify(handImgDataUrl)};
  var CLICK_RADIUS_FRAC = ${CLICK_RADIUS_FRAC};
  var SWIPE_START_RADIUS_FRAC = ${SWIPE_START_RADIUS_FRAC};
  var SWIPE_MIN_LENGTH_FRAC = ${SWIPE_MIN_LENGTH_FRAC};
  var SWIPE_DIRECTION_DOT = ${SWIPE_DIRECTION_DOT};
  var FADE_MS = ${FADE_MS};

  function pctToPx(p, rect) { return { x: p.x * rect.width / 100, y: p.y * rect.height / 100 }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function relPoint(ev, rect) { return { x: ev.clientX - rect.left, y: ev.clientY - rect.top }; }

  function renderClickHand(container, g) {
    var r = container.getBoundingClientRect();
    var p = pctToPx(g.at, r);
    var hand = document.createElement("div");
    hand.className = "editor-click-hand";
    hand.style.setProperty("--hand-img", "url(\\"" + HAND_IMG + "\\")");
    hand.style.setProperty("--anchor-x", (p.x - 96 * 0.12) + "px");
    hand.style.setProperty("--anchor-y", (p.y - 108 * 0.08) + "px");
    hand.style.setProperty("--delay", (g.delay || 0) + "ms");
    hand.style.setProperty("--iter", g.repeat ? "infinite" : "1");
    hand.style.setProperty("--hand-angle", (g.angle != null ? g.angle : 20) + "deg");
    container.appendChild(hand);
    var pulse = document.createElement("div");
    pulse.className = "editor-click-pulse";
    pulse.style.setProperty("--pulse-x", p.x + "px");
    pulse.style.setProperty("--pulse-y", p.y + "px");
    pulse.style.setProperty("--delay", (g.delay || 0) + "ms");
    pulse.style.setProperty("--iter", g.repeat ? "infinite" : "1");
    container.appendChild(pulse);
    return {
      remove: function () { hand.remove(); pulse.remove(); },
      fadeRemove: function () {
        [hand, pulse].forEach(function (el) {
          var current = parseFloat(getComputedStyle(el).opacity) || 1;
          el.style.animation = "none";
          el.style.opacity = current;
          el.offsetHeight;
          el.style.transition = "opacity " + FADE_MS + "ms ease, transform " + FADE_MS + "ms ease";
          el.style.opacity = "0";
          el.style.transform = (el.className.indexOf("pulse") >= 0 ? "translate(-50%,-50%) scale(2.6)" : "rotate(20deg) scale(1.18)");
        });
        setTimeout(function () { hand.remove(); pulse.remove(); }, FADE_MS + 60);
      }
    };
  }

  function bootHands() {
    var container = document.getElementById("GameDiv") || document.body;
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    var slots = [];
    function rect() { return container.getBoundingClientRect(); }

    function showSlot(slot) {
      if (slot.handle) { try { slot.handle.remove(); } catch (e) {} slot.handle = null; }
      if (slot.dismissed) return;
      var r = rect();
      if (r.width === 0 || r.height === 0) return;
      var g = slot.gesture;
      if (g.mode === "click") {
        try { slot.handle = renderClickHand(container, g); }
        catch (err) { console.error("[polish] click failed", g, err); }
        return;
      }
      var opts = {
        container: container, mode: g.mode,
        coordinateSize: { width: r.width, height: r.height }, fit: "stretch",
        delay: g.delay, duration: g.duration, repeat: g.repeat,
        from: pctToPx(g.from, r), to: pctToPx(g.to, r), handSrc: HAND_IMG
      };
      try { slot.handle = window.TutorialHand.show(opts); }
      catch (err) { console.error("[polish] swipe failed", g, err); }
    }

    function dismissSlot(slot) {
      if (slot.dismissed) return;
      slot.dismissed = true;
      var h = slot.handle; slot.handle = null;
      if (!h) return;
      try {
        if (typeof h.fadeRemove === "function") {
          h.fadeRemove();
        } else if (h.element) {
          var layer = h.element;
          layer.style.transition = "opacity " + FADE_MS + "ms ease";
          layer.style.opacity = "0";
          setTimeout(function () { try { h.remove(); } catch (e) {} }, FADE_MS + 60);
        } else {
          h.remove();
        }
      } catch (err) { console.error(err); }
    }

    function showAll() { slots.forEach(showSlot); }
    GESTURES.forEach(function (g) { slots.push({ gesture: g, handle: null, dismissed: false }); });
    showAll();

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(showAll, 120);
    });

    var pending = null;

    function tryMatchClick(ev) {
      var r = rect(); var p = relPoint(ev, r); var maxDim = Math.max(r.width, r.height);
      slots.forEach(function (slot) {
        if (slot.dismissed || slot.gesture.mode !== "click") return;
        var target = pctToPx(slot.gesture.at, r);
        if (dist(p, target) <= maxDim * CLICK_RADIUS_FRAC) dismissSlot(slot);
      });
    }
    function tryMatchSwipe(downP, upP, r) {
      var maxDim = Math.max(r.width, r.height);
      slots.forEach(function (slot) {
        if (slot.dismissed || slot.gesture.mode !== "swipe") return;
        var from = pctToPx(slot.gesture.from, r), to = pctToPx(slot.gesture.to, r);
        if (dist(downP, from) > maxDim * SWIPE_START_RADIUS_FRAC) return;
        var ex = to.x - from.x, ey = to.y - from.y;
        var ax = upP.x - downP.x, ay = upP.y - downP.y;
        var elen = Math.hypot(ex, ey), alen = Math.hypot(ax, ay);
        if (elen === 0 || alen < elen * SWIPE_MIN_LENGTH_FRAC) return;
        var dot = (ex * ax + ey * ay) / (elen * alen);
        if (dot >= SWIPE_DIRECTION_DOT) dismissSlot(slot);
      });
    }
    document.addEventListener("pointerdown", function (ev) {
      var r = rect(); var p = relPoint(ev, r);
      pending = { down: p, rect: r, time: Date.now() };
      tryMatchClick(ev);
    }, true);
    document.addEventListener("pointerup", function (ev) {
      if (!pending) return;
      var r = pending.rect; var up = relPoint(ev, r);
      tryMatchSwipe(pending.down, up, r);
      pending = null;
    }, true);
    document.addEventListener("pointercancel", function () { pending = null; }, true);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(bootHands, 50);
  } else {
    document.addEventListener("DOMContentLoaded", bootHands);
  }
}());
</script>
`
}

function splicePlayable(playableSource: string, injection: string): string {
  if (/<\/body>/i.test(playableSource)) {
    return playableSource.replace(/<\/body>/i, injection + '</body>')
  }
  return playableSource + injection
}

export async function polishPlayableClientSide(
  playableSource: string,
  gestures: Gesture[],
): Promise<string> {
  const [runtime, handDataUrl] = await Promise.all([fetchRuntime(), fetchHandDataUrl()])
  const injection = buildInjection(runtime, gestures, handDataUrl)
  return splicePlayable(playableSource, injection)
}
