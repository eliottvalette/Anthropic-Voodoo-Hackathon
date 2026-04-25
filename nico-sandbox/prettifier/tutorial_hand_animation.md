# Tutorial Hand Animation

Use `nico-sandbox/prettifier/tutorial_hand_animation.js` in any generated playable HTML to add a tutorial hand overlay from game-space coordinates. It exposes both `TutorialHand.show(...)` and the shorter `addTutorialHandAnimation(...)` alias.

```html
<script src="nico-sandbox/prettifier/tutorial_hand_animation.js"></script>
<script>
  TutorialHand.show({
    container: "#game-stage",
    mode: "swipe", // "swipe", "drag", or "click"
    from: { x: 82, y: 528 },
    to: { x: 248, y: 392 },
    coordinateSize: { width: 384, height: 683 },
    handSrc: "nico-sandbox/runs/B11/final-assets-v1/ui/ui_hand_cursor.png"
  });
</script>
```

For a click tutorial, pass only the tap coordinate:

```js
TutorialHand.show({
  container: "#game-stage",
  mode: "click",
  at: { x: 190, y: 560 },
  coordinateSize: { width: 384, height: 683 },
  handSrc: "nico-sandbox/runs/B11/final-assets-v1/ui/ui_hand_cursor.png"
});
```

The function returns a controller:

```js
const hand = TutorialHand.show({ container: "#game-stage", mode: "drag", from: [82, 528], to: [248, 392] });
hand.update({ from: [90, 530], to: [260, 390] });
hand.replay();
hand.remove();
```

Options:

- `container`: selector or element that receives the overlay.
- `mode`: `swipe`, `drag`, `click`, or `tap`.
- `from` / `to`: game-space line coordinates for `swipe` and `drag`.
- `at`: game-space tap coordinate for `click`.
- `coordinateSize`: source coordinate system, usually the background size.
- `fit`: `contain`, `cover`, or `stretch`, matching how the game is scaled inside the container.
- `handSize`: hand width/height in coordinate-space pixels.
- `aspect`: optional image height/width ratio. Defaults to the B11 hand asset ratio.
- `repeat`: `false` to play once.
- `line`: `false` to hide the dashed tutorial line.
- `duration`, `delay`, `ease`: animation timing.
