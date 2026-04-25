function createFloatingGhost(scene: Phaser.Scene, x: number, y: number) {
  const container = scene.add.container(x, y);

  // Generate Smoke Texture
  const smokeGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  smokeGfx.fillStyle(0x333344, 1);
  smokeGfx.fillCircle(16, 16, 16);
  smokeGfx.generateTexture('ghost_smoke', 32, 32);

  // Smoke Emitter
  const emitter = scene.add.particles(0, 0, 'ghost_smoke', {
    speed: { min: 20, max: 50 },
    scale: { start: 0.5, end: 1.5 },
    alpha: { start: 0.4, end: 0 },
    lifespan: 1500,
    frequency: 150,
    blendMode: 'NORMAL',
    emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 40) }
  });
  container.add(emitter);

  // Ghost Body Graphics
  const body = scene.add.graphics();
  
  // Draw Translucent Body
  body.fillStyle(0xA0D8EF, 0.6);
  body.fillRoundedRect(-35, -50, 70, 100, { tl: 35, tr: 35, bl: 10, br: 10 });
  
  // Draw Face (Eyes and Mouth)
  body.fillStyle(0x111111, 0.8);
  // Left Eye
  body.fillEllipse(-18, -15, 14, 22);
  // Right Eye
  body.fillEllipse(18, -15, 14, 22);
  // Mouth
  body.fillEllipse(0, 20, 18, 28);

  container.add(body);

  // Floating Animation
  scene.tweens.add({
    targets: container,
    y: y - 30,
    duration: 1500,
    ease: 'Sine.easeInOut',
    yoyo: true,
    loop: -1
  });

  // Spectral Pulse
  scene.tweens.add({
    targets: body,
    alpha: 0.4,
    duration: 1000,
    ease: 'Sine.easeInOut',
    yoyo: true,
    loop: -1
  });

  // Cleanup after duration
  scene.time.delayedCall(3000, () => {
    scene.tweens.add({
      targets: container,
      alpha: 0,
      scale: 1.5,
      duration: 500,
      onComplete: () => container.destroy()
    });
  });

  return container;
}
