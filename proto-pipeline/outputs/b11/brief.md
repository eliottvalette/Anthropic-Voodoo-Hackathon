# Castle Clashers Playable

## Video Understanding
- Core loop: Players drag and drop units into their castle to automatically fire at and destroy the enemy's castle before their own is destroyed.
- Player goal: Reduce the enemy castle's health to 0% by strategically placing attacking units.
- Fun driver: Watching the satisfying, physics-based destruction of the castles and seeing the immediate impact of unit placement.

## Playable Spec
- Summary: A 2D Canvas portrait auto-battler where the player drags weapon turrets from a bottom UI roster onto designated slots on their castle. Placed weapons automatically fire ballistic projectiles at the enemy castle. The game ends when either castle's health reaches zero.
- Objective: Destroy the enemy castle before the player's castle is destroyed.
- Primary interaction: Drag and drop weapon icons from the bottom UI roster into empty slots on the player's castle.
- Win condition: Enemy castle health reaches 0.

## Assets
- Background.png: Background image (Base64 encode into HTML)
- Blue Castle.png: Player castle sprite (Base64 encode into HTML)
- Red Castle.png: Enemy castle sprite (Base64 encode into HTML)
- Weapon_1.png: Player draggable turret (Base64 encode into HTML)
- Weapon_2.png: Enemy turret (Base64 encode into HTML)
- Projectile_1.png: Player projectile sprite (Base64 encode into HTML)
- Projectile_2.png: Enemy projectile sprite (Base64 encode into HTML)
- Music.ogg: Background music (Base64 encode into HTML audio tag)
- Sfx.wav: Impact and placement sound effect (Base64 encode into HTML audio tag)

## Variation Parameters
- player_castle_health = 1000: Determines how long the player can survive enemy fire.
- enemy_castle_health = 1500: Determines how many player projectiles are needed to win.
- player_fire_rate_ms = 800: How often placed player weapons fire. Lower is faster.
- enemy_fire_rate_ms = 1200: How often the enemy castle fires. Controls difficulty pressure.
- projectile_gravity = 0.5: Affects the arc and travel time of projectiles.

## Acceptance Criteria
- Game renders entirely in a single HTML file using Canvas 2D with no external dependencies.
- Player can drag Weapon_1 from the bottom roster and drop it onto Blue Castle.
- Placed weapons automatically fire Projectile_1 in a ballistic arc towards Red Castle.
- Enemy castle automatically fires Projectile_2 in a ballistic arc towards Blue Castle.
- Projectiles colliding with castles reduce the respective health bar and trigger a simple particle explosion.
- Game ends and displays a CTA overlay when either health bar reaches 0.
- Audio plays on weapon placement and projectile impact.
