function createHorizontalClearGlow(scene: Phaser.Scene, x: number, y: number, width: number) {
  const GLOW_COLOR = 0xFFD700;
  const CORE_COLOR = 0xFFFFFF;

  // Procedural texture generation for particles
  if (!scene.textures.exists('vfx_square')) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff).fillRect(0, 0, 8, 8);
    g.generateTexture('vfx_square', 8, 8);
    g.clear().fillCircle(4, 4, 4);
    g.generateTexture('vfx_circle', 8, 8);
  }

  // Create the beam layers
  const container = scene.add.container(x, y);
  const outerGlow = scene.add.rectangle(0, 0, width, 40, GLOW_COLOR, 0.4).setBlendMode(Phaser.BlendModes.ADD);
  const innerBeam = scene.add.rectangle(0, 0, width, 12, CORE_COLOR, 0.8).setBlendMode(Phaser.BlendModes.ADD);
  container.add([outerGlow, innerBeam]);

  // Particle Emitter
  const emitter = scene.add.particles(0, 0, 'vfx_square', {
    x: { min: -width / 2, max: width / 2 },
    y: { min: -10, max: 10 },
    speedY: { min: -80, max: 80 },
    speedX: { min: -30, max: 30 },
    scale: { start: 1.2, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: 600,
    blendMode: 'ADD',
    tint: [0xFFD700, 0xFFFACD, 0xFFFFFF],
    frequency: 15,
    maxParticles: 25
  });
  container.add(emitter);

  // Animation Sequence
  scene.tweens.add({
    targets: [outerGlow, innerBeam],
    scaleY: 2.5,
    alpha: 0,
    duration: 150,
    yoyo: true,
    hold: 100,
    onComplete: () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 500,
        onComplete: () => container.destroy()
      });
    }
  });

  // Secondary circular sparkles
  scene.add.particles(x, y, 'vfx_circle', {
    emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-width / 2, -5, width, 10) },
    speed: { min: 10, max: 40 },
    scale: { start: 0.5, end: 0 },
    lifespan: 800,
    quantity: 10,
    blendMode: 'ADD',
    stopAfter: 15
  });
}
