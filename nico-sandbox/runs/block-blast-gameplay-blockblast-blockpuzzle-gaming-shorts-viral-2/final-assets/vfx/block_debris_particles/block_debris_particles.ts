export class DebrisManager {
  static init(scene: Phaser.Scene) {
    // Create Cube Texture
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff);
    g.fillRect(0, 0, 12, 12);
    g.fillStyle(0x000000, 0.2);
    g.fillRect(8, 0, 4, 12); // Side shading
    g.fillRect(0, 8, 12, 4); // Bottom shading
    g.generateTexture('debris_cube', 12, 12);

    // Create Swirl Texture
    g.clear();
    g.lineStyle(2, 0xffffff);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = 0.1 * i;
      const x = 8 + (2 + i) * Math.cos(angle * 5);
      const y = 8 + (2 + i) * Math.sin(angle * 5);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
    g.generateTexture('debris_swirl', 16, 16);
  }

  static spawn(scene: Phaser.Scene, x: number, y: number, color: number = 0xF8E8D0) {
    const textures = ['debris_cube', 'debris_swirl'];
    textures.forEach(tex => {
      const emitter = scene.add.particles(x, y, tex, {
        speed: { min: 100, max: 300 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.8, end: 0 },
        rotate: { start: 0, end: 360 },
        gravityY: 700,
        lifespan: 800,
        quantity: 6,
        tint: color,
        emitting: false
      });
      emitter.explode(6);
      scene.time.delayedCall(1000, () => emitter.destroy());
    });

    // Add small white sparkles
    const sparkles = scene.add.particles(x, y, 'debris_cube', {
      speed: { min: 50, max: 150 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD',
      lifespan: 400,
      emitting: false
    });
    sparkles.explode(8);
    scene.time.delayedCall(500, () => sparkles.destroy());
  }
}
