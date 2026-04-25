# castle_clashers_lite

## Video Understanding
- Core loop: Players take turns aiming and firing various weapons at an enemy castle to destroy its structure and deplete its health before their own castle is destroyed.
- Player goal: Reduce the enemy castle's health to 0% by hitting it with projectiles.
- Fun driver: Satisfying physics-based destruction, visual feedback of crumbling castles, and the tactical choice of different projectile types.

## Playable Spec
- Summary: A 2D turn-based artillery game utilizing an inlined lightweight physics engine (e.g., Matter.js). To achieve the requested block-based destruction using the provided single-image castle assets, the implementation will slice the castle images into a grid of rectangular physics bodies at runtime. The player drags anywhere on screen to aim (rendering a dotted trajectory line) and releases to fire. The AI takes a simplified automated turn after the player.
- Objective: Destroy the enemy's red castle before they destroy your blue castle.
- Primary interaction: Drag and hold to draw a trajectory line, release to fire a projectile.
- Win condition: Enemy castle health reaches 0%.

## Assets
- Background.png: Environment background (Compress to JPEG, scale down to max 1280px height to save space, base64 encode.)
- Blue Castle.png: Player base (Base64 encode. Will be drawn onto a canvas and sliced into blocks at runtime.)
- Red Castle.png: Enemy base (Base64 encode. Will be drawn onto a canvas and sliced into blocks at runtime.)
- Character_Orc.psb: Player avatar (Convert to PNG during build, scale down to 128x128, base64 encode.)
- Projectile_1.png: Player weapon (Scale down to 64x64, base64 encode.)
- Projectile_2.png: Enemy weapon (Scale down to 64x64, base64 encode.)
- Sfx.wav: Impact and explosion sound (Convert to MP3, compress bitrate, base64 encode.)

## Variation Parameters
- projectile_impulse = 0.05: Determines how violently the castle blocks fly apart upon impact.
- gravity_scale = 1: Affects the arc of the trajectory and how heavy the falling castle blocks feel.
- enemy_accuracy = 0.8: Determines how close the enemy's automated shot lands to the center of the player's castle.
- castle_grid_size = 5: Number of columns/rows the castle image is sliced into. Higher means more granular destruction but lower performance.

## Acceptance Criteria
- Entire playable is contained within a single HTML file under 5MB.
- No external network requests are made for scripts, images, or audio.
- Castle images are dynamically sliced into physics-enabled blocks that react to collisions.
- Player can drag to aim with a visible trajectory line and release to fire.
- Game alternates turns between player and an automated enemy.
- Health bars update dynamically based on castle damage.
