// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: turn-queue
// TYPE: mechanic
// PURPOSE: Round-robin turn manager for PvP / multi-actor games.
//          Handles current actor, advance, peek-next, and end-of-round detection.
// USAGE:
//   const tq = createTurnQueue([
//     { side: "player", slot: 0 }, { side: "enemy", slot: 0 },
//     { side: "player", slot: 1 }, { side: "enemy", slot: 1 },
//     { side: "player", slot: 2 }, { side: "enemy", slot: 2 },
//   ]);
//   tq.current();   // → { side, slot, index }
//   tq.advance();   // step forward, returns the new current
//   tq.peek(1);     // look ahead n steps
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createTurnQueue(order) {
  let i = 0;
  return {
    current() {
      return Object.assign({ index: i }, order[i % order.length]);
    },
    peek(offset = 1) {
      return Object.assign({ index: i + offset }, order[(i + offset) % order.length]);
    },
    advance() {
      i = (i + 1) % order.length;
      return this.current();
    },
    reset() { i = 0; },
    setIndex(n) { i = n % order.length; },
    isFirstOfRound() { return i % order.length === 0; },
    indexOf() { return i; },
    length() { return order.length; },
  };
}
