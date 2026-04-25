export function createExplosion(scene: Phaser.Scene, x: number, y: number) {
  const createTexture = (key: string, drawFn: (g: Phaser.GameObjects.Graphics) => void, size: number) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    drawFn(g);
    g.generateTexture(key, size, size);
  };

  createTexture('smoke_p', g => { g.fillStyle(0xffffff); g.fillCircle(16, 16, 16); }, 32);
  createTexture('stone_p', g => { g.fillStyle(0x696969); g.fillPolygon([8,0, 16,8, 12,16, 0,12]); }, 16);
  createTexture('spark_p', g => { g.fillStyle(0xffff00); g.fillRect(0, 7, 16, 2); }, 16);
  createTexture('crack_p', g => { g.fillStyle(0x222222); g.fillPolygon([16,0, 32,10, 28,32, 10,28, 0,16]); }, 32);

  const crack = scene.add.image(x, y, 'crack_p').setScale(0).setAlpha(0.8);
  scene.tweens.add({ targets: crack, scale: 3, duration: 100, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: crack, alpha: 0, duration: 800, delay: 200, onComplete: () => crack.destroy() });

  const smoke = scene.add.particles(x, y, 'smoke_p', {
    speed: { min: 40, max: 100 },
    scale: { start: 0.5, end: 2.5 },
    alpha: { start: 0.6, end: 0 },
    lifespan: 800,
    quantity: 8,
    emitting: false
  });

  const debris = scene.add.particles(x, y, 'stone_p', {
    speed: { min: 150, max: 300 },
    angle: { min: 0, max: 360 },
    gravityY: 700,
    rotate: { min: 0, max: 360 },
    lifespan: 1000,
    quantity: 6,
    emitting: false
  });

  const sparks = scene.add.particles(x, y, 'spark_p', {
    speed: { min: 400, max: 700 },
    lifespan: 250,
    scaleX: { start: 3, end: 0 },
    scaleY: 0.2,
    rotate: (p: any) => Phaser.Math.RadToDeg(Math.atan2(p.velocityY, p.velocityX)),
    blendMode: 'ADD',
    quantity: 15,
    emitting: false
  });

  smoke.explode();
  debris.explode();
  sparks.explode();

  scene.time.delayedCall(1200, () => {
    smoke.destroy();
    debris.destroy();
    sparks.destroy();
  });
}
