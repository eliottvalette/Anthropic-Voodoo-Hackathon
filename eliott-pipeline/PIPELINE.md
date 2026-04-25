# Video-to-Playable Pipeline

Objectif : transformer une vidéo de gameplay et un dossier d'assets disponibles en prototype HTML jouable, sans laisser un LLM inventer ou perdre des contraintes entre les étapes.

Le principe central : Gemini extrait des observations, mais la pipeline produit des artefacts structurés et vérifiables avant toute génération de code.

## Inputs

### Required

- `video_path` : vidéo verticale de gameplay, par exemple `ressources/Video Example/B01.mp4`.
- `asset_dir` : dossier d'assets disponibles, par exemple `ressources/Castle Clashers Assets`.
- `playable_examples` : exemples de bundles finaux, par exemple `ressources/Playable Example/*.html`.

### Optional

- Contraintes de réseau publicitaire ou VSDK.
- Taille max du HTML final.
- Gameplay cible prioritaire : win path, lose path, tutorial path, etc.

## Stage 0 - Project Probe

But : comprendre le format des ressources avant d'appeler un LLM.

Actions :

- Lire les dimensions, types MIME, tailles fichiers.
- Extraire durée, fps, résolution vidéo.
- Identifier les formats problématiques, par exemple `.psb` à convertir avant usage web.
- Regarder la forme des exemples HTML : autonome, assets inline, VSDK/super-html, taille cible.

Output : `00_project_probe.json`

```json
{
  "videos": [
    {
      "path": "ressources/Video Example/B01.mp4",
      "width": 1080,
      "height": 1920,
      "fps": 60,
      "duration_s": 56.35,
      "size_bytes": 72343340
    }
  ],
  "assets": [
    {
      "path": "ressources/Castle Clashers Assets/Blue Castle.png",
      "kind": "image",
      "width": 731,
      "height": 958,
      "web_ready": true
    }
  ],
  "packaging_reference": {
    "html_is_self_contained": true,
    "uses_vsdk": true,
    "approx_size_mb": 5
  }
}
```

Quality gate :

- Tous les inputs existent.
- Les vidéos sont lisibles.
- Les assets web-ready et non web-ready sont séparés.

## Stage 1 - Visual Sampling

But : créer une base objective pour comparer et corriger Gemini.

Actions :

- Générer des contact sheets à cadence faible, par exemple 1 frame toutes les 4 secondes.
- Générer une deuxième extraction plus dense autour des moments critiques si nécessaire.
- Conserver les timestamps des frames.

Outputs :

- `01_contact_sheet.jpg`
- `01_frames_manifest.json`

```json
{
  "frames": [
    {
      "timestamp_s": 0,
      "path": "frames/b01_0000.jpg"
    },
    {
      "timestamp_s": 4,
      "path": "frames/b01_0004.jpg"
    }
  ]
}
```

Quality gate :

- On doit voir les scènes principales : start, placement, tir, dégâts, fin.
- Si la vidéo a des actions rapides, utiliser une cadence plus dense sur ces segments.

## Stage 2 - Gemini Video Analysis

But : obtenir des observations horodatées, pas une spec de jeu directement.

Model target :

- `gemini-3.1-pro-preview` pour la meilleure qualité.
- File API pour les vidéos de cette taille.
- `--fps 2` quand les contrôles ou micro-actions sont importants.

Ne pas demander "fais-moi le jeu". Demander des JSON séparés.

### 2A - Timeline

Output : `02a_timeline.json`

```json
{
  "events": [
    {
      "timestamp": "00:03.500",
      "event_type": "unit_placement",
      "observation": "Player drags Cyclops from bottom UI to a platform inside the blue castle.",
      "evidence": "bottom card moves toward a room slot",
      "confidence": 1
    }
  ]
}
```

### 2B - Controls And Mechanics

Output : `02b_mechanics.json`

```json
{
  "controls": [
    {
      "name": "place_unit",
      "gesture": "drag card to castle slot",
      "evidence_timestamps": ["00:03.500", "00:06.000"],
      "confidence": 1
    },
    {
      "name": "aim_and_fire",
      "gesture": "drag from placed unit, release to shoot",
      "evidence_timestamps": ["00:04.500"],
      "confidence": 1
    }
  ],
  "mechanics": [
    {
      "name": "castle_health",
      "description": "Each castle has a global percentage health value.",
      "confidence": 1
    }
  ],
  "contradictions": [
    {
      "topic": "manual_fire_vs_auto_fire",
      "observations": [
        "B01 shows drag-to-aim manual shots.",
        "B11 suggests placed units can auto-fire."
      ],
      "resolution_needed": true
    }
  ]
}
```

### 2C - UI And Visual Requirements

Output : `02c_visual_ui.json`

```json
{
  "hud": [
    "top blue/red health bars",
    "castle icons and percentage text",
    "VS label centered"
  ],
  "bottom_panel": [
    "three unit cards",
    "cards become visible when player can place or select a unit"
  ],
  "vfx": [
    "dotted ballistic trajectory",
    "projectile smoke trails",
    "impact explosion",
    "simple castle damage overlay"
  ]
}
```

Quality gate :

- Every claim must have timestamp evidence.
- Any uncertainty is explicit.
- Contradictions are kept, not averaged away.

## Stage 3 - Asset Mapping

But : relier les observations aux fichiers locaux disponibles.

Actions :

- Classer les assets par rôle : background, castle, unit, projectile, weapon, audio.
- Marquer les conversions nécessaires.
- Définir les fallback visuals si un asset ne peut pas être utilisé.

Output : `03_asset_map.json`

```json
{
  "background": {
    "source": "Background.png",
    "usage": "parallax or cropped vertical background",
    "ready": true
  },
  "castles": {
    "player": "Blue Castle.png",
    "enemy": "Red Castle.png"
  },
  "units": [
    {
      "name": "cyclops",
      "source": "Character_Cyclop.psb",
      "ready": false,
      "required_conversion": "psb_to_png"
    }
  ],
  "projectiles": [
    "Projectile_1.png",
    "Projectile_2.png"
  ]
}
```

Quality gate :

- La spec ne référence aucun asset inexistant.
- Les `.psb` sont soit convertis, soit remplacés par placeholders explicites.

## Stage 4 - Canonical Game Spec

But : produire la source de vérité qui va guider le prototype.

Cette étape fusionne les outputs Gemini, les assets et les décisions de scope. Elle ne doit pas être une concaténation brute.

Output : `04_game_spec.json`

```json
{
  "target": {
    "orientation": "portrait",
    "aspect_ratio": "9:16",
    "platform": "mobile playable ad",
    "output": "single html"
  },
  "core_loop": [
    "show two castles",
    "player places/selects a unit",
    "player aims and fires",
    "projectile damages enemy castle",
    "enemy periodically fires back",
    "health reaches zero",
    "show win or fail end card"
  ],
  "chosen_control_model": {
    "unit_placement": true,
    "manual_aim": true,
    "auto_fire": false,
    "reason": "B01 provides clearer playable interaction; B11 validates lose state."
  },
  "entities": {
    "castle": {
      "health": 100,
      "damage_model": "global_health_plus_visual_cracks"
    },
    "unit": {
      "types": ["cyclops", "skeleton", "orc"],
      "prototype_minimum": ["skeleton"]
    },
    "projectile": {
      "motion": "ballistic",
      "collision": "castle_bounds",
      "impact": "damage_and_particles"
    }
  },
  "prototype_scope": {
    "must_have": [
      "top health bars",
      "two castle sprites",
      "unit card drag/drop",
      "drag-to-aim trajectory",
      "projectile collision",
      "enemy return fire",
      "win/fail screen"
    ],
    "can_skip": [
      "true mesh destruction",
      "perfect physics parity",
      "full audio mix",
      "all menus"
    ]
  }
}
```

Quality gate :

- Les contradictions sont résolues par une décision explicite.
- Le scope est assez petit pour être implémenté vite.
- Le spec contient tout ce qu'il faut pour coder sans revoir la vidéo à chaque fonction.

## Stage 5 - Implementation Plan

But : passer de la spec au code sans demander à un LLM de deviner l'architecture.

Output : `05_implementation_plan.md`

Contenu attendu :

- Runtime choisi : `Canvas 2D` pour premier jet, ou Pixi si le template local est utilisé.
- File layout.
- Asset loading.
- State machine.
- Input model.
- Collision model.
- Export strategy.

Recommended architecture for first playable :

```text
src/
  main.ts
  assets.ts
  game.ts
  input.ts
  physics.ts
  render.ts
  entities/
    castle.ts
    unit.ts
    projectile.ts
  ui/
    hud.ts
    cards.ts
    end-card.ts
```

For a single-file playable prototype, keep the same conceptual modules but bundle them into one HTML later.

Quality gate :

- Each required feature maps to code ownership.
- No feature depends on unspecified ML output.

## Stage 6 - Prototype Build

But : créer un jeu jouable avant packaging final.

Output :

- `prototype/index.html`
- `prototype/src/*.ts`
- `prototype/assets/*` or generated data URLs

Minimum viable interaction :

1. Page opens in portrait layout.
2. Player drags unit card into castle slot.
3. Player drags from unit to aim.
4. Dotted trajectory updates live.
5. Release fires projectile.
6. Enemy castle health decreases on impact.
7. Enemy periodically fires back.
8. Win/fail end card appears.

Quality gate :

- Works with mouse and touch.
- No layout overlap on mobile viewport.
- Main loop is stable for at least 60 seconds.

## Stage 7 - Automated Verification

But : éviter de valider seulement "ça charge chez moi".

Outputs :

- `07_screenshots/desktop.png`
- `07_screenshots/mobile.png`
- `07_test_report.json`

Checks :

- HTML loads without console errors.
- Canvas is not blank.
- Unit card is visible.
- Simulated drag/drop places a unit.
- Simulated aim/release spawns a projectile.
- Health changes after collision.
- End state can be reached by test hook or accelerated damage.

Quality gate :

- Screenshots show expected UI.
- Test interaction changes game state.
- No fatal console errors.

## Stage 8 - Packaging

But : transformer le prototype lisible en HTML autonome similaire aux exemples.

Output :

- `dist/CastleClashers.html`
- `dist/build_report.json`

Actions :

- Inline JS/CSS.
- Inline compressed PNG/audio as data URLs if size allows.
- Add VSDK/super-html integration or stubs depending target.
- Minify after validation, not before.

Quality gate :

- Final HTML opens standalone.
- Final size is acceptable for the target network.
- Same verification suite passes on `dist/CastleClashers.html`.

## Recommended Iteration Loop

For the current project, use this order:

1. Run Gemini analysis on `B01.mp4` with `--fps 2`.
2. Run Gemini analysis on `B11.mp4` with default FPS for lose state.
3. Merge into `04_game_spec.json`.
4. Implement a minimal Canvas 2D prototype from the spec.
5. Verify with screenshots and scripted interaction.
6. Only then package into a single HTML.

## Why This Pipeline Beats The Initial Version

The initial pipeline had one risky handoff:

```text
video breakdown + assets -> LLM -> feature sheet + code layout
```

That lets the model silently smooth over contradictions. Here, the risky part is split:

```text
video -> observed JSON -> contradiction report -> canonical game spec -> implementation plan -> code
```

This keeps Gemini useful for perception and timestamped extraction, while the product decisions remain explicit and testable.

## Current Finding From Gemini Tests

Observed from the first probes:

- `B01` with default FPS is useful but too coarse.
- `B01 --fps 2` gives the best extraction for controls and timeline.
- `B11` is useful for fail state and auto-fire/slot-placement evidence.
- Gemini identifies the main assets correctly.
- Gemini may conflate manual aiming and auto-fire, so the canonical spec must choose one deliberately.

Recommended first playable decision:

- Use `B01` as the primary interaction target.
- Use `B11` only to validate lose-state and unit-slot interpretation.
- Implement manual drag-to-aim as the first prototype control model.
- Keep auto-fire as a later variant or enemy-only behavior.
