function createComboHeartVFX(scene: Phaser.Scene, x: number, y: number) {
  // Create procedural heart texture for particles
  if (!scene.textures.exists('vfx_heart_dot')) {
    const dot = scene.make.graphics({ x: 0, y: 0, add: false });
    dot.fillStyle(0xffffff, 1);
    dot.fillCircle(8, 8, 8);
    dot.generateTexture('vfx_heart_dot', 16, 16);
  }

  const container = scene.add.container(x, y);
  
  // Main Heart Graphic
  const heart = scene.add.graphics();
  heart.fillStyle(0xFF69B4, 1);
  heart.lineStyle(4, 0xFFFFFF, 0.8);
  
  const drawHeart = (g: Phaser.GameObjects.Graphics, size: number) => {
    g.beginPath();
    g.moveTo(0, size * 0.8);
    g.bezierCurveTo(-size, -size * 0.4, -size * 0.5, -size, 0, -size * 0.4);
    g.bezierCurveTo(size * 0.5, -size, size, -size * 0.4, 0, size * 0.8);
    g.closePath();
    g.fillPath();
    g.strokePath();
  };

  drawHeart(heart, 50);
  container.add(heart);

  // Outer Glow
  const glow = scene.add.graphics();
  glow.fillStyle(0xFFB6C1, 0.4);
  glow.fillCircle(0, 0, 70);
  container.addAt(glow, 0);

  // Pulse Animation
  scene.tweens.add({
    targets: container,
    scale: { from: 0.2, to: 1.8 },
    alpha: { from: 1, to: 0 },
    duration: 1000,
    ease: 'Cubic.easeOut',
    onComplete: () => container.destroy()
  });

  // Particle Burst
  const emitter = scene.add.particles(x, y, 'vfx_heart_dot', {
    speed: { min: 100, max: 400 },
    scale: { start: 0.8, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: 1000,
    blendMode: 'ADD',
    tint: [0xFF1493, 0xFF69B4, 0xFFFFFF],
    emitting: false
  });

  emitter.explode(24);
  scene.time.delayedCall(1200, () => emitter.destroy());
}
