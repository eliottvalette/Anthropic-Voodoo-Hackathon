function createFireExplosion(scene: Phaser.Scene, x: number, y: number) {
  // Generate procedural circle texture if it doesn't exist
  if (!scene.textures.exists('vfx_dot')) {
    const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0xffffff);
    graphics.fillCircle(8, 8, 8);
    graphics.generateTexture('vfx_dot', 16, 16);
  }

  const emitterManager = scene.add.particles(x, y, 'vfx_dot', {
    emitting: false
  });

  // 1. Core Fireball
  emitterManager.createEmitter({
    tint: [0xFFFF00, 0xFF8C00, 0xFF4500],
    blendMode: 'ADD',
    lifespan: 400,
    speed: { min: 50, max: 200 },
    scale: { start: 4, end: 0 },
    quantity: 15,
    frequency: -1
  }).explode();

  // 2. High-speed Sparks
  emitterManager.createEmitter({
    tint: 0xFFFF00,
    lifespan: { min: 300, max: 600 },
    speed: { min: 300, max: 600 },
    scale: { start: 0.6, end: 0 },
    quantity: 25,
    frequency: -1
  }).explode();

  // 3. Dark Debris Chunks
  emitterManager.createEmitter({
    tint: 0x333333,
    lifespan: 800,
    speed: { min: 150, max: 350 },
    gravityY: 1000,
    scale: { start: 1.5, end: 0.5 },
    rotate: { start: 0, end: 720 },
    quantity: 10,
    frequency: -1
  }).explode();

  // 4. Expanding Smoke
  emitterManager.createEmitter({
    tint: 0x222222,
    lifespan: 1000,
    speed: { min: 20, max: 80 },
    scale: { start: 1, end: 5 },
    alpha: { start: 0.5, end: 0 },
    quantity: 12,
    frequency: -1
  }).explode();

  // 5. Shockwave Ring (Procedural Graphics)
  const ring = scene.add.graphics();
  ring.lineStyle(4, 0xFFFF00, 1);
  ring.strokeCircle(x, y, 10);
  scene.tweens.add({
    targets: ring,
    alpha: 0,
    scale: 8,
    duration: 300,
    onComplete: () => ring.destroy()
  });

  // Cleanup
  scene.time.delayedCall(1000, () => emitterManager.destroy());
}
