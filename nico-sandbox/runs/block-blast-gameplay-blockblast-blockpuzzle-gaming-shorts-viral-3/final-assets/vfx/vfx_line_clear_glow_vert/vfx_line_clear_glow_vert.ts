function createVerticalClearEffect(scene: Phaser.Scene, x: number, y: number, height: number) {
  const container = scene.add.container(x, y);
  const colors = [0xFFD600, 0xFFF176, 0xFFFFFF];

  // 1. Vertical Beam Glow
  const beam = scene.add.graphics();
  beam.fillStyle(0xFFFFFF, 0.6);
  beam.fillRect(-20, -height / 2, 40, height);
  beam.setBlendMode(Phaser.BlendModes.ADD);
  container.add(beam);

  // 2. Procedural Hearts (3 blocks high)
  const blockSize = height / 3;
  for (let i = 0; i < 3; i++) {
    const heartY = -height / 2 + (i * blockSize) + blockSize / 2;
    const heart = scene.add.graphics();
    
    // Draw Heart Shape
    heart.fillStyle(0xFFD600, 1);
    const drawHeart = (g: Phaser.GameObjects.Graphics, size: number) => {
      g.beginPath();
      g.moveTo(0, size * 0.3);
      g.bezierCurveTo(size * 0.5, -size * 0.2, size * 1.2, size * 0.5, 0, size * 1.2);
      g.bezierCurveTo(-size * 1.2, size * 0.5, -size * 0.5, -size * 0.2, 0, size * 0.3);
      g.closePath();
      g.fillPath();
    };

    heart.setPosition(0, heartY);
    drawHeart(heart, 25);
    
    // Inner Glow
    const innerGlow = scene.add.graphics();
    innerGlow.fillStyle(0xFFFFFF, 0.8);
    innerGlow.setPosition(0, heartY);
    drawHeart(innerGlow, 15);
    innerGlow.setBlendMode(Phaser.BlendModes.ADD);
    
    container.add([heart, innerGlow]);
  }

  // 3. Particle Emitter
  const particles = scene.add.particles(0, 0, 'white_pixel', {
    x: { min: -25, max: 25 },
    y: { min: -height / 2, max: height / 2 },
    lifespan: 600,
    speedY: { min: -100, max: -20 },
    scale: { start: 4, end: 0 },
    alpha: { start: 1, end: 0 },
    blendMode: 'ADD',
    frequency: 10,
    emitting: true
  });
  container.add(particles);

  // 4. Animation Timeline
  scene.tweens.add({
    targets: container,
    alpha: { from: 1, to: 0 },
    scaleX: { from: 1, to: 1.5 },
    duration: 800,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      container.destroy();
    }
  });

  // Flash effect
  scene.tweens.add({
    targets: beam,
    scaleX: 2,
    alpha: 0,
    duration: 300,
    ease: 'Expo.easeOut'
  });
}
