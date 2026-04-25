// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: shake
// TYPE: vfx
// PURPOSE: Camera/screen shake with linear decay — impact, explosion, hit
// USAGE:
//   const s = createShake();        // { intensity, decay }
//   s.intensity = 10;               // trigger on hit
//   s.update(dt);                   // call every frame (dt in ms)
//   const offset = s.offset();      // { x, y } to apply to ctx.translate
// PARAMS (createShake):
//   decay    — intensity loss per ms (default 0.045)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createShake(decay = 0.045) {
  return {
    intensity: 0,
    decay,
    update(dt) {
      this.intensity = Math.max(0, this.intensity - dt * this.decay);
    },
    offset() {
      const i = this.intensity;
      return {
        x: (Math.random() - 0.5) * i,
        y: (Math.random() - 0.5) * i,
      };
    },
    trigger(amount) {
      this.intensity = Math.max(this.intensity, amount);
    },
  };
}
