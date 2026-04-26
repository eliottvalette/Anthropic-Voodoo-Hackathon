// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: haptics
// TYPE: mechanic
// PURPOSE: Thin wrapper around the HTML5 Vibration API. Most playable ad
//          sandboxes strip touchstart side effects, but real device browsers
//          (Android Chrome, Samsung Browser) honor navigator.vibrate. iOS
//          Safari ignores it — we degrade silently.
//
//          Provides named "intensities" so game code reads as gameplay
//          intent ("hit", "crit", "win") rather than millisecond integers.
// USAGE:
//   haptic("tap");        // 8ms — every UI/aim/touch
//   haptic("hit");        // 28ms — successful damage
//   haptic("crit");       // 60ms — big hit
//   haptic("win");        // [40,30,40,30,90] — celebration burst
//   haptic("lose");       // [80,40,80] — sober triple
//   haptic("ui");          // 6ms — tiny tap, store CTA
//   haptic([40, 30, 40]); // explicit pattern, ms
//
//   // First user interaction is required for some browsers to honor it:
//   canvas.addEventListener("pointerdown", () => haptic("tap"), { once: true });
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _HAPTIC_PATTERNS = {
  tap: 8,
  ui: 6,
  hit: 28,
  crit: 60,
  combo: [12, 18, 18],
  destroy: 90,
  win: [40, 30, 40, 30, 90],
  lose: [80, 40, 80],
};

let _hapticEnabled = true;

function haptic(kindOrPattern) {
  if (!_hapticEnabled) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const pattern = Array.isArray(kindOrPattern) || typeof kindOrPattern === "number"
    ? kindOrPattern
    : _HAPTIC_PATTERNS[kindOrPattern];
  if (pattern === undefined) return;
  try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}

function setHapticEnabled(on) {
  _hapticEnabled = !!on;
  if (!_hapticEnabled && navigator && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(0); } catch (e) { /* ignore */ }
  }
}
