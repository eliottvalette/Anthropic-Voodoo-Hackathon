export class PinkSparkleBurst extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    // Create star texture procedurally
    if (!scene.textures.exists('vfx_star')) {
      const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(0xffffff);
      graphics.beginPath();
      for (let i = 0; i < 5; i++) {
        graphics.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * 10, Math.sin((18 + i * 72) * Math.PI / 180) * 10);
        graphics.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * 4, Math.sin((54 + i * 72) * Math.PI / 180) * 4);
      }
      graphics.closePath();
      graphics.fillPath();
      graphics.generateTexture('vfx_star', 20, 20);
    }

    const emitterManager = scene.add.particles(0, 0, 'vfx_star', {
      x: x,
      y: y,
      speed: { min: 150, max: 450 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { start: 0, end: 360 },
      lifespan: 600,
      blendMode: 'ADD',
      tint: [0xFF00FF, 0xFF69B4, 0xFFFFFF],
      quantity: 40,
      emitting: false
    });

    const sparkEmitter = scene.add.particles(0, 0, 'vfx_star', {
      x: x,
      y: y,
      speed: { min: 300, max: 600 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.2, end: 0 },
      lifespan: 300,
      blendMode: 'ADD',
      tint: 0xFFFFFF,
      quantity: 20,
      emitting: false
    });

    emitterManager.explode();
    sparkEmitter.explode();

    scene.time.delayedCall(800, () => {
      emitterManager.destroy();
      sparkEmitter.destroy();
      this.destroy();
    });
  }
}
