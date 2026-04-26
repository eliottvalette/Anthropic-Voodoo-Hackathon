export function playPlacementHighlight(scene: Phaser.Scene, x: number, y: number, cellSize: number) {
  // Create procedural white square texture if it doesn't exist
  if (!scene.textures.exists('vfx_square')) {
    const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.generateTexture('vfx_square', 32, 32);
  }

  // 1. Central Flash Square
  const flash = scene.add.image(x, y, 'vfx_square');
  flash.setDisplaySize(cellSize, cellSize);
  flash.setBlendMode(Phaser.BlendModes.ADD);
  flash.setTint(0xffffff);

  scene.tweens.add({
    targets: flash,
    scale: (cellSize / 32) * 1.2,
    alpha: 0,
    duration: 250,
    ease: 'Power2',
    onComplete: () => flash.destroy()
  });

  // 2. Particle Burst
  const emitter = scene.add.particles(x, y, 'vfx_square', {
    speed: { min: 50, max: 150 },
    scale: { start: 0.2, end: 0 },
    alpha: { start: 0.8, end: 0 },
    rotate: { min: 0, max: 360 },
    lifespan: 300,
    blendMode: 'ADD',
    tint: [0xffffff, 0xffd1dc],
    quantity: 12
  });

  emitter.explode();
  
  // Cleanup
  scene.time.delayedCall(350, () => emitter.destroy());
}
