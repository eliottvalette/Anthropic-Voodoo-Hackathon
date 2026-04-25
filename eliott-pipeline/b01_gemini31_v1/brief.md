# Castle Clashers Portrait Artillery

## Video Understanding
- Core loop: Aim and fire weapons from your mobile fortress to destroy the enemy's fortress before they destroy yours.
- Player goal: Reduce the enemy castle's health to 0%.
- Fun driver: Satisfying physics-based destruction and the tactical choice of aiming at specific weak points.

## Playable Spec
- Summary: A single-file HTML5 2D physics artillery game adapted for portrait mobile. The player (bottom-left) drags to aim and fires projectiles at the enemy castle (top-right). The enemy auto-fires at fixed intervals. Health bars track damage. The game ends when either castle is destroyed, showing a call-to-action.
- Objective: Destroy the enemy castle before your castle is destroyed.
- Primary interaction: Drag anywhere on the screen to pull back a virtual slingshot, adjusting angle and power. Release to fire.
- Win condition: Enemy castle health reaches 0.

## Assets
- Background.png: Main background (Base64 encode into HTML)
- Blue Castle.png: Player base sprite (Base64 encode into HTML)
- Red Castle.png: Enemy base sprite (Base64 encode into HTML)
- Weapon_1.png: Player cannon/launcher (Base64 encode into HTML)
- Projectile_1.png: Player ammo (Base64 encode into HTML)
- Projectile_2.png: Enemy ammo (Base64 encode into HTML)
- Music.ogg: Background music (Base64 encode into HTML audio tag)
- Sfx.wav: Explosion/Shoot sound (Base64 encode into HTML audio tag)
- Character_Cyclop.psb: Unused due to format (Ignore (browser incompatible))

## Variation Parameters
- gravity = 900: Changes the arc of the projectiles, affecting aiming difficulty.
- player_damage = 34: Determines how many hits it takes to destroy the enemy castle (default 3 hits).
- enemy_fire_rate_ms = 3000: Controls the pressure on the player. Lower means faster enemy attacks.
- enemy_damage = 20: Determines how quickly the player loses.

## Acceptance Criteria
- Game runs entirely from a single HTML file with no external network requests.
- File size is under 5MB (achieved by base64 encoding only necessary PNGs and compressing audio if used).
- Drag-to-aim mechanic feels responsive on mobile touch screens.
- Trajectory line accurately predicts the physics arc of the projectile.
- Collisions between projectiles and castles register reliably.
- End card displays correctly when win/loss condition is met.
