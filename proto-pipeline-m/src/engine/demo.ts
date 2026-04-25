import { fillPreamble } from "./preamble.ts";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PLACEHOLDER_ASSETS = `const A = {};`;

const PLACEHOLDER_CREATIVE = `
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
    resize(); addEventListener('resize', resize);

    const cta = { x: 0, y: 0, w: 200, h: 60 };
    let tapped = 0;

    function draw(){
      ctx.fillStyle = '#1e3a8a'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#f97316';
      const rw = Math.min(canvas.width*0.5, 320), rh = Math.min(canvas.height*0.3, 200);
      ctx.fillRect((canvas.width-rw)/2,(canvas.height-rh)/2-60,rw,rh);
      cta.w = 220; cta.h = 64;
      cta.x = (canvas.width-cta.w)/2; cta.y = (canvas.height-cta.h)/2 + 120;
      ctx.fillStyle = '#22c55e'; ctx.fillRect(cta.x, cta.y, cta.w, cta.h);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('PLAY NOW', cta.x + cta.w/2, cta.y + cta.h/2 + 8);
      ctx.fillText('demo_mechanic taps:' + tapped, canvas.width/2, 40);
      requestAnimationFrame(draw);
    }
    draw();

    canvas.addEventListener('pointerdown', function(e){
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      tapped++;
      if (x >= cta.x && x <= cta.x+cta.w && y >= cta.y && y <= cta.y+cta.h) {
        window.__cta('https://example.com');
      }
    });

    window.__engineState = { snapshot: function(){ return { entityCount: 1, score: tapped }; } };
`;

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "_demo.html");
const html = fillPreamble(PLACEHOLDER_ASSETS, PLACEHOLDER_CREATIVE);
writeFileSync(out, html, "utf8");
console.log(`wrote ${out} (${html.length} bytes)`);
