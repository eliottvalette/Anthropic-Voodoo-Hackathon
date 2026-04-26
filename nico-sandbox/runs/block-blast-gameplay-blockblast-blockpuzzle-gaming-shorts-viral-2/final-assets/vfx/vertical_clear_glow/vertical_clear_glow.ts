async function playVerticalClearEffect(scene: Phaser.Scene, x: number, y: number, height: number) {
  const duration = 450;
  const colors = [0xFFFFFF, 0xFFFF00, 0xFFA500];

  // Create a 4x4 white circle texture for particles if it doesn't exist
  if (!scene.textures.exists('glow_particle')) {
    const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(2, 2, 2);
    graphics.generateTexture('glow_particle', 4, 4);
  }

  // 1. The Main Beam (Procedural Graphics)
  const beam = scene.add.graphics();
  beam.setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: beam,
    alpha: 0,
    duration: duration,
    ease: 'Cubic.easeOut',
    onUpdate: (tween) => {
      const p = tween.progress;
      const width = 60 * (1 - p);
      beam.clear();
      // Outer Glow
      beam.fillStyle(colors[2], 0.3 * (1 - p));
      beam.fillRect(x - width, y - height / 2, width * 2, height);
      // Inner Glow
      beam.fillStyle(colors[1], 0.6 * (1 - p));
      beam.fillRect(x - width / 2, y - height / 2, width, height);
      // Core
      beam.fillStyle(colors[0], 1 - p);
      beam.fillRect(x - 4, y - height / 2, 8, height);
    },
    onComplete: () => beam.destroy()
  });

  // 2. Particle Burst
  const emitter = scene.add.particles(x, y, 'glow_particle', {
    emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-5, -height / 2, 10, height) },
    speedX: { min: -400, max: 400 },
    speedY: { min: -50, max: 50 },
    scale: { start: 1.5, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: 400,
    blendMode: 'ADD',
    tint: [0xFFFF00, 0xFFFFFF, 0xFFA500],
    quantity: 40,
    frequency: -1
  });

  emitter.explode();
  
  // Cleanup
  scene.time.delayedCall(duration + 100, () => emitter.destroy());
}
