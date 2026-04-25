function createPoisonSplash(scene: Phaser.Scene, x: number, y: number) {
  const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
  graphics.fillStyle(0xffffff);
  graphics.fillCircle(8, 8, 8);
  graphics.generateTexture('poison_dot', 16, 16);

  const liquidEmitter = scene.add.particles(x, y, 'poison_dot', {
    color: [0x44FF44, 0xADFF2F],
    speed: { min: 150, max: 400 },
    angle: { min: 0, max: 360 },
    gravityY: 800,
    lifespan: 600,
    scale: { start: 0.4, end: 0 },
    quantity: 20,
    emitting: false
  });

  const gasEmitter = scene.add.particles(x, y, 'poison_dot', {
    color: [0x228B22, 0x44FF44],
    speed: { min: 20, max: 80 },
    angle: { min: 0, max: 360 },
    lifespan: 1500,
    scale: { start: 0.8, end: 3 },
    alpha: { start: 0.6, end: 0 },
    rotate: { min: 0, max: 360 },
    quantity: 12,
    emitting: false,
    blendMode: 'SCREEN'
  });

  liquidEmitter.explode();
  gasEmitter.explode();

  scene.time.delayedCall(1500, () => {
    liquidEmitter.destroy();
    gasEmitter.destroy();
  });
}
