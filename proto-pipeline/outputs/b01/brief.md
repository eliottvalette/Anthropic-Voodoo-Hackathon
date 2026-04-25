# Castle_Clashers_Playable

## Video Understanding
- Core loop: Players aim and fire various projectiles from their mobile castle to destroy the opponent's castle before their own is destroyed.
- Player goal: Reduce the enemy castle's health to 0% by hitting it with projectiles.
- Fun driver: Satisfying physics destruction, tactical aiming, and discovering different projectile types.

## Playable Spec
- Summary: A 2D artillery game using Canvas 2D. Players drag on their castle to aim a trajectory line and release to fire projectiles at the enemy castle. Simple ballistic physics and AABB rectangle collisions are used to detect hits, reducing castle health. The enemy auto-fires on a timer. The game ends when either castle's health reaches zero, triggering an end card.
- Objective: Destroy the enemy red castle before your blue castle is destroyed.
- Primary interaction: Drag to aim (showing a dotted trajectory line) and release to fire a projectile.
- Win condition: Enemy castle health reaches 0.

## Assets
- Background.png: Background environment (Scale to fit height, center horizontally)
- Blue Castle.png: Player base (Scale down to fit left side of screen)
- Red Castle.png: Enemy base (Scale down to fit right side of screen)
- Weapon_1.png: Player launcher visual (Anchor at center-left for rotation)
- Weapon_2.png: Enemy launcher visual (Anchor at center-right for rotation)
- Projectile_1.png: Player ammo (Scale down, rotate along velocity vector during flight)
- Projectile_2.png: Enemy ammo (Scale down, rotate along velocity vector during flight)
- Music.ogg: Background music (Loop, start on first interaction)
- Sfx.wav: Explosion/Hit sound (Play on projectile collision)

## Variation Parameters
- player_damage = 34: Determines how many hits it takes to destroy the enemy castle (default 3 hits for 100 health).
- enemy_damage = 20: Determines how quickly the player loses if they miss.
- gravity = 900: Affects the arc of the projectiles and aiming difficulty.
- enemy_fire_rate_ms = 3000: Controls the pressure on the player to aim and fire quickly.

## Acceptance Criteria
- Game renders entirely in a single HTML file using Canvas 2D.
- Dragging produces a visible dotted trajectory line.
- Releasing fires a projectile that follows the trajectory.
- Projectiles colliding with castles reduce the respective health bar.
- Enemy fires back automatically on a timer.
- End card displays when either castle's health reaches 0.
