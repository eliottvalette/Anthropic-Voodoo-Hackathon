class ThumbsUpVFX extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    
    const bgHeart = scene.add.graphics();
    bgHeart.fillStyle(0xfce4c4, 0.4);
    this.drawHeart(bgHeart, 0, 0, 60);
    
    const icon = scene.add.graphics();
    const bounds = { w: 40, h: 40 };
    
    // Draw Thumbs Up Shape
    icon.lineStyle(4, 0x2d8a2d, 1);
    icon.fillStyle(0xa2fca2, 1);
    
    // Procedural path for a stylized thumbs up
    const path = [
      {x: -15, y: 5}, {x: -15, y: 20}, {x: 15, y: 20}, // Bottom/Palm
      {x: 20, y: 15}, {x: 20, y: -5}, // Fingers side
      {x: 5, y: -5}, {x: 10, y: -25}, // Thumb base to tip
      {x: -5, y: -25}, {x: -10, y: -5}, // Thumb tip to wrist
      {x: -25, y: -5}, {x: -25, y: 5} // Wrist
    ];
    
    icon.beginPath();
    icon.moveTo(path[0].x, path[0].y);
    path.forEach(p => icon.lineTo(p.x, p.y));
    icon.closePath();
    icon.fillPath();
    icon.strokePath();

    this.add([bgHeart, icon]);
    scene.add.existing(this);

    // Pop Animation
    this.setScale(0);
    scene.tweens.add({
      targets: this,
      scale: { from: 0, to: 1.2 },
      duration: 150,
      ease: 'Back.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: this,
          scale: 1,
          duration: 100
        });
        this.emitParticles(scene);
      }
    });

    // Cleanup
    scene.time.delayedCall(600, () => this.destroy());
  }

  private drawHeart(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number) {
    g.beginPath();
    g.moveTo(x, y + size / 4);
    g.quadraticCurveTo(x, y, x + size / 4, y);
    g.quadraticCurveTo(x + size / 2, y, x + size / 2, y + size / 4);
    g.quadraticCurveTo(x + size / 2, y, x + size * 0.75, y);
    g.quadraticCurveTo(x + size, y, x + size, y + size / 4);
    g.quadraticCurveTo(x + size, y + size / 2, x + size / 2, y + size * 0.75);
    g.quadraticCurveTo(x, y + size / 2, x, y + size / 4);
    g.fillPath();
  }

  private emitParticles(scene: Phaser.Scene) {
    const emitter = scene.add.particles(0, 0, 'white_pixel', {
      x: this.x,
      y: this.y,
      speed: { min: 50, max: 120 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0x4ade80,
      lifespan: 400,
      blendMode: 'ADD',
      quantity: 8,
      emitting: false
    });
    emitter.explode();
    scene.time.delayedCall(500, () => emitter.destroy());
  }
}
