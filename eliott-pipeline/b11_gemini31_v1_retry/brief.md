# Castle Clashers Playable Ad

## Video Understanding
- Core loop: Drag and drop units into your castle to automatically fire at and destroy the enemy's castle before yours falls.
- Player goal: Destroy the enemy castle by reducing its health to 0%.
- Fun driver: Satisfying destruction physics and the strategic placement of units to maximize damage.

## Playable Spec
- Summary: A portrait-oriented 2D tower defense playable where the user drags a weapon unit from a bottom UI panel onto a designated slot on their castle. Once placed, the unit automatically fires projectiles at the enemy castle. The enemy castle fires back automatically. The game ends when either castle's health reaches zero.
- Objective: Destroy the enemy castle before the player's castle is destroyed.
- Primary interaction: Drag and drop a unit card from the bottom UI onto a valid slot on the player's castle.
- Win condition: Enemy castle health reaches 0.

## Assets
- Background.png: Game background (Scale and crop to fill the portrait canvas.)
- Blue Castle.png: Player base sprite (Scale down to fit bottom-left quadrant.)
- Red Castle.png: Enemy base sprite (Scale down to fit top-right quadrant.)
- Weapon_1.png: Draggable unit icon and deployed turret sprite (Use as the primary deployable unit to avoid PSB conversion issues in browser.)
- Projectile_1.png: Player projectile sprite (Scale down appropriately.)
- Projectile_2.png: Enemy projectile sprite (Scale down appropriately.)
- Sfx.wav: Impact and firing sound effect (Base64 encode into the HTML file.)

## Variation Parameters
- player_fire_rate_ms = 800: Determines how fast the player deals damage after deployment.
- enemy_fire_rate_ms = 1200: Controls the pressure and difficulty.
- player_damage_per_hit = 20: Determines how many hits are required to win (e.g., 20 means 5 hits to destroy 100 health).
- enemy_damage_per_hit = 15: Determines how quickly the player loses if they don't deploy fast enough.

## Acceptance Criteria
- Must be a single HTML file with no external dependencies.
- All required image and audio assets must be base64 encoded inline.
- Total file size must be under 5 MB.
- Must run smoothly at 60fps on mobile browsers.
- Drag and drop must work with both mouse and touch events.
- Health bars must accurately reflect current health and trigger the end state at 0.
