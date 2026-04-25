// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: cta-trigger
// TYPE: mechanic
// PURPOSE: Open the store from a playable ad — handles Voodoo VSDK, MRAID,
//          and bare-iframe fallbacks. Use this from CTA buttons / end-screens.
// USAGE:
//   openStore("https://play.google.com/store/apps/details?id=com.example");
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openStore(url) {
  // 1. Voodoo VSDK (preferred for Voodoo network playables)
  try {
    if (window.Voodoo && window.Voodoo.playable && typeof window.Voodoo.playable.install === "function") {
      window.Voodoo.playable.install();
      return;
    }
  } catch (e) { /* fall through */ }

  // 2. MRAID (IAB standard, used by most ad networks)
  try {
    if (window.mraid && typeof window.mraid.open === "function") {
      window.mraid.open(url);
      return;
    }
  } catch (e) { /* fall through */ }

  // 3. Iframe-safe parent postMessage (lets a parent host catch it)
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "playable.cta", url }, "*");
    }
  } catch (e) { /* ignore */ }

  // 4. Bare fallback
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) { /* nothing else to do */ }
}
