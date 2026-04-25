export const ASSETS_SLOT = "/* ASSETS_BASE64 */";
export const CREATIVE_SLOT = "/* CREATIVE_SLOT */";

export const PREAMBLE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{display:block;width:100%;height:100%;touch-action:none}</style>
</head><body>
<canvas id="game"></canvas>
<script>
(function(){
  function whenReady(cb){
    if(typeof mraid==='undefined')return cb();
    if(mraid.getState&&mraid.getState()==='loading'){mraid.addEventListener('ready',cb);}else{cb();}
  }
  window.__cta=function(url){
    if(typeof mraid!=='undefined'&&mraid.open){mraid.open(url);}else{window.open(url,'_blank');}
  };
  window.__engineState={ snapshot:function(){return {entityCount:0,score:0};} };
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
