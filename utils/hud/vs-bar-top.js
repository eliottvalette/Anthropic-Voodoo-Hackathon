// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: vs-bar-top
// TYPE: hud
// PURPOSE: Top header showing two players VS each other (Castle Clashers style)
//          Two trapezoid bars with HP%, plus center "Vs" text
// USAGE:
//   drawVsBarTop(ctx, {
//     playerName, enemyName,
//     playerHpPct, enemyHpPct,
//     playerColor: "#08aeea", enemyColor: "#e80e16",
//   });
// CANVAS WIDTH: 360 (call before camera transform)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawVsBarTop(ctx, opts) {
  const playerColor = opts.playerColor || "#08aeea";
  const enemyColor = opts.enemyColor || "#e80e16";
  const W = 360;

  ctx.save();
  drawTrapezoidBar(ctx, 8, 8, 132, 28, playerColor, true);
  drawTrapezoidBar(ctx, 220, 8, 132, 28, enemyColor, false);

  ctx.fillStyle = "#111";
  ctx.font = "900 53px Arial";
  ctx.textAlign = "center";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.strokeText("Vs", W / 2, 55);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Vs", W / 2, 52);

  drawCastleIcon(ctx, 30, 56, playerColor);
  drawCastleIcon(ctx, W - 64, 56, enemyColor);
  drawOutlinedText(ctx, (opts.playerHpPct | 0) + "%", 13, 111, 30, "left");
  drawOutlinedText(ctx, (opts.enemyHpPct | 0) + "%", W - 13, 111, 30, "right");
  ctx.restore();
}

function drawTrapezoidBar(ctx, x, y, w, h, color, leftFacing) {
  ctx.save();
  ctx.fillStyle = "#111111";
  ctx.beginPath();
  ctx.moveTo(x - 1, y - 1);
  ctx.lineTo(x + w + 1, y - 1);
  ctx.lineTo(x + w - (leftFacing ? 5 : 0), y + h + 5);
  ctx.lineTo(x + (leftFacing ? 0 : 5), y + h + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - (leftFacing ? 8 : 0), y + h);
  ctx.lineTo(x + (leftFacing ? 0 : 8), y + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCastleIcon(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#d9d6c8";
  ctx.strokeStyle = "#3a3a35";
  ctx.lineWidth = 2;
  ctx.fillRect(0, 18, 34, 28);
  ctx.strokeRect(0, 18, 34, 28);
  ctx.beginPath();
  ctx.moveTo(4, 18);
  ctx.lineTo(17, 0);
  ctx.lineTo(30, 18);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2b2924";
  ctx.fillRect(12, 29, 10, 17);
  ctx.restore();
}

function drawOutlinedText(ctx, text, x, y, size, align) {
  ctx.save();
  ctx.font = "900 " + size + "px Arial";
  ctx.textAlign = align;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = Math.max(4, size * 0.18);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
  ctx.restore();
}
