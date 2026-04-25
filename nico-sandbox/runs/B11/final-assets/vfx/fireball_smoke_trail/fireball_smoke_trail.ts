export function createSmokeTrail(scene: Phaser.Scene, projectile: Phaser.GameObjects.Components.Transform) {
  // Create a procedural 'puffy cloud' texture
  const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
  graphics.fillStyle(0xffffff);
  // Draw 4 overlapping circles to create a puff shape
  graphics.fillCircle(16, 16, 12);
  graphics.fillCircle(10, 12, 8);
  graphics.fillCircle(22, 12, 8);
  graphics.fillCircle(16, 22, 10);
  graphics.generateTexture('smoke_puff', 32, 32);

  const particles = scene.add.particles(0, 0, 'smoke_puff', {
    follow: projectile,
    lifespan: 1200,
    speed: { min: 5, max: 20 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.5, end: 1.8 },
    alpha: { start: 1, end: 0 },
    rotate: { min: 0, max: 360 },
    tint: [0xD29B6C, 0xB07D50, 0xF4D1A6],
    frequency: 60,
    blendMode: 'NORMAL',
    emitCallback: (particle) => {
        // Add slight random offset to make it look less uniform
        particle.x += Phaser.Math.Between(-5, 5);
        particle.y += Phaser.Math.Between(-5, 5);
    }
  });

  return particles;
}
