export const ASSETS_SLOT = "/* ASSETS_BASE64 */";
export const CREATIVE_SLOT = "/* CREATIVE_SLOT */";

export const CANVAS_W = 360;
export const CANVAS_H = 640;

export const PREAMBLE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden}
body{display:flex;align-items:center;justify-content:center}
#game{display:block;background:#000;touch-action:none;width:100vw;height:calc(100vw*16/9);max-height:100vh;max-width:calc(100vh*9/16);aspect-ratio:9/16}
</style>
</head><body>
<canvas id="game" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
<script>
(function(){
  function whenReady(cb){
    if(typeof mraid==='undefined')return cb();
    if(mraid.getState&&mraid.getState()==='loading'){mraid.addEventListener('ready',cb);}else{cb();}
  }
  window.__cta=function(url){
    if(typeof mraid!=='undefined'&&mraid.open){mraid.open(url);}else{window.open(url,'_blank');}
  };
  window.__A={};
  window.__engineState={
    inputs:0,
    frames:0,
    snapshot:function(){return {inputs:this.inputs,frames:this.frames};}
  };
  function __bumpInput(){window.__engineState.inputs++;}
  window.addEventListener('pointerdown',__bumpInput,true);
  window.addEventListener('pointerup',__bumpInput,true);
  window.addEventListener('touchstart',__bumpInput,true);
  (function tick(){window.__engineState.frames++;requestAnimationFrame(tick);})();
  whenReady(function(){
    ${ASSETS_SLOT}
    ${CREATIVE_SLOT}
  });
})();
</script>
</body></html>
`;

export function fillPreamble(assetsBase64: string, creativeSlot: string): string {
  return PREAMBLE_HTML
    .replace(ASSETS_SLOT, assetsBase64)
    .replace(CREATIVE_SLOT, creativeSlot);
}
