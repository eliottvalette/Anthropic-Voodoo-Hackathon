(function attachTutorialHand(global) {
  "use strict";

  var STYLE_ID = "tutorial-hand-animation-style";
  var SCRIPT_SRC = document.currentScript && document.currentScript.src ? document.currentScript.src : document.baseURI;
  var DEFAULT_HAND_SRC = new URL("../runs/B11/final-assets-v1/ui/ui_hand_cursor.png", SCRIPT_SRC).href;
  var DEFAULT_COORDINATE_SIZE = { width: 384, height: 683 };
  var DEFAULT_HAND_ASPECT = 842 / 748;
  var DEFAULT_HOTSPOT = { x: 0.1, y: 0.075 };
  var HAND_POINTER_ANGLE = 0.35;
  var CLICK_POINTER_ANGLE = 0.5;

  function toPoint(value, fallback) {
    if (!value) return fallback;
    if (Array.isArray(value)) return { x: Number(value[0]), y: Number(value[1]) };
    return { x: Number(value.x), y: Number(value.y) };
  }

  function toSize(value) {
    if (!value) return DEFAULT_COORDINATE_SIZE;
    if (Array.isArray(value)) return { width: Number(value[0]), height: Number(value[1]) };
    return { width: Number(value.width), height: Number(value.height) };
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".tutorial-hand-layer{position:absolute;inset:0;z-index:2147483000;pointer-events:none;overflow:visible;contain:layout style}",
      ".tutorial-hand-layer *{box-sizing:border-box}",
      ".tutorial-hand-guide{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}",
      ".tutorial-hand-guide-line{stroke:rgba(255,255,255,.9);stroke-width:5;stroke-linecap:round;stroke-dasharray:10 13;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45)) drop-shadow(0 0 8px rgba(255,255,255,.35));animation:tutorial-hand-dash .75s linear infinite}",
      ".tutorial-hand-guide-glow{stroke:rgba(86,202,255,.55);stroke-width:10;stroke-linecap:round;filter:blur(.4px)}",
      ".tutorial-hand-node{position:absolute;left:0;top:0;z-index:3;width:var(--hand-box-width);height:var(--hand-box-height);overflow:visible;transform:translate3d(var(--hand-start-x),var(--hand-start-y),0) rotate(var(--hand-angle)) scale(.94);transform-origin:var(--hand-hotspot-x) var(--hand-hotspot-y);opacity:0;will-change:transform,opacity;animation:tutorial-hand-swipe var(--duration) var(--ease) var(--delay) var(--iteration)}",
      ".tutorial-hand-node.is-click{transform:translate3d(var(--hand-start-x),var(--hand-start-y),0) rotate(var(--hand-angle)) scale(.9);animation:tutorial-hand-click var(--duration) var(--ease) var(--delay) var(--iteration)}",
      ".tutorial-hand-image{position:absolute;left:var(--hand-pad);top:var(--hand-pad);display:block;width:var(--hand-width);height:var(--hand-height);object-fit:contain;filter:drop-shadow(0 8px 10px rgba(0,0,0,.4))}",
      ".tutorial-hand-pulse{position:absolute;left:var(--tap-x);top:var(--tap-y);z-index:1;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.96);transform:translate(-50%,-50%) scale(.4);opacity:0;box-shadow:0 0 14px rgba(255,255,255,.7),0 0 26px rgba(86,202,255,.45);animation:tutorial-hand-pulse var(--duration) ease-out var(--delay) var(--iteration)}",
      ".tutorial-hand-dots{position:absolute;left:var(--tap-x);top:var(--tap-y);z-index:1;width:96px;height:96px;transform:translate(-50%,-50%) scale(.55);opacity:0;animation:tutorial-hand-dots var(--duration) ease-out var(--delay) var(--iteration)}",
      ".tutorial-hand-dots::before{content:\"\";position:absolute;inset:9px;border:2px dotted rgba(255,255,255,.72);border-radius:50%;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}",
      ".tutorial-hand-dot{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px;border-radius:50%;background:rgba(255,255,255,.98);box-shadow:0 0 0 1.5px rgba(44,57,55,.42),0 0 10px rgba(255,255,255,.84),0 0 18px rgba(86,202,255,.55);transform:rotate(var(--dot-angle)) translateY(-45px)}",
      ".tutorial-hand-spark{position:absolute;left:var(--tap-x);top:var(--tap-y);z-index:1;width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.92);transform:translate(-50%,-50%) scale(.1);opacity:0;box-shadow:0 -24px 0 -2px rgba(255,255,255,.9),17px -17px 0 -2px rgba(255,255,255,.88),24px 0 0 -2px rgba(255,255,255,.82),17px 17px 0 -2px rgba(255,255,255,.7),0 24px 0 -2px rgba(255,255,255,.72),-17px 17px 0 -2px rgba(255,255,255,.78),-24px 0 0 -2px rgba(255,255,255,.82),-17px -17px 0 -2px rgba(255,255,255,.84);animation:tutorial-hand-spark var(--duration) ease-out var(--delay) var(--iteration)}",
      "@keyframes tutorial-hand-dash{to{stroke-dashoffset:-23}}",
      "@keyframes tutorial-hand-swipe{0%,12%{opacity:0;transform:translate3d(var(--hand-start-x),var(--hand-start-y),0) rotate(var(--hand-angle)) scale(.88)}22%{opacity:1;transform:translate3d(var(--hand-start-x),var(--hand-start-y),0) rotate(var(--hand-angle)) scale(1.02)}72%{opacity:1;transform:translate3d(var(--hand-end-x),var(--hand-end-y),0) rotate(var(--hand-angle)) scale(1.02)}86%,100%{opacity:0;transform:translate3d(var(--hand-end-x),var(--hand-end-y),0) rotate(var(--hand-angle)) scale(.88)}}",
      "@keyframes tutorial-hand-click{0%,13%{opacity:0;transform:translate3d(var(--hand-start-x),var(--hand-start-y),0) rotate(var(--hand-angle)) scale(.74)}28%{opacity:1;transform:translate3d(var(--hand-start-x),var(--hand-start-y),0) rotate(var(--hand-angle)) scale(1.05)}46%{opacity:1;transform:translate3d(var(--hand-start-x),var(--hand-start-y),0) rotate(var(--hand-angle)) scale(.9)}64%{opacity:1;transform:translate3d(var(--hand-start-x),var(--hand-start-y),0) rotate(var(--hand-angle)) scale(1.03)}86%,100%{opacity:0;transform:translate3d(var(--hand-start-x),var(--hand-start-y),0) rotate(var(--hand-angle)) scale(.8)}}",
      "@keyframes tutorial-hand-pulse{0%,33%{opacity:0;transform:translate(-50%,-50%) scale(.25)}43%{opacity:1;transform:translate(-50%,-50%) scale(.62)}78%{opacity:0;transform:translate(-50%,-50%) scale(4.2)}100%{opacity:0;transform:translate(-50%,-50%) scale(4.2)}}",
      "@keyframes tutorial-hand-dots{0%,28%{opacity:0;transform:translate(-50%,-50%) scale(.48) rotate(-8deg)}40%{opacity:1;transform:translate(-50%,-50%) scale(.82) rotate(0deg)}68%{opacity:.95;transform:translate(-50%,-50%) scale(1.08) rotate(11deg)}88%,100%{opacity:0;transform:translate(-50%,-50%) scale(1.34) rotate(22deg)}}",
      "@keyframes tutorial-hand-spark{0%,37%{opacity:0;transform:translate(-50%,-50%) scale(.1) rotate(0deg)}46%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(12deg)}74%,100%{opacity:0;transform:translate(-50%,-50%) scale(1.7) rotate(24deg)}}",
      "@media (prefers-reduced-motion:reduce){.tutorial-hand-node,.tutorial-hand-pulse,.tutorial-hand-dots,.tutorial-hand-spark,.tutorial-hand-guide-line{animation-duration:.01ms!important;animation-iteration-count:1!important}}"
    ].join("");
    document.head.appendChild(style);
  }

  function getMetrics(container, coordinateSize, fit) {
    var rect = container.getBoundingClientRect();
    var baseW = coordinateSize.width || DEFAULT_COORDINATE_SIZE.width;
    var baseH = coordinateSize.height || DEFAULT_COORDINATE_SIZE.height;
    var mode = fit || "contain";

    if (mode === "stretch") {
      return { left: 0, top: 0, scaleX: rect.width / baseW, scaleY: rect.height / baseH };
    }

    var scale = mode === "cover" ? Math.max(rect.width / baseW, rect.height / baseH) : Math.min(rect.width / baseW, rect.height / baseH);
    return {
      left: (rect.width - baseW * scale) / 2,
      top: (rect.height - baseH * scale) / 2,
      scaleX: scale,
      scaleY: scale
    };
  }

  function mapPoint(point, metrics) {
    return {
      x: metrics.left + point.x * metrics.scaleX,
      y: metrics.top + point.y * metrics.scaleY
    };
  }

  function cssPixel(value) {
    return Math.round(value * 1000) / 1000 + "px";
  }

  function setLayerVars(layer, data) {
    var handWidth = data.handSize;
    var handHeight = data.handSize * data.aspect;
    var handPad = Math.max(handWidth, handHeight) * 0.32;
    var hotspotX = handPad + data.hotspot.x * handWidth;
    var hotspotY = handPad + data.hotspot.y * handHeight;
    var startLeft = data.from.x - hotspotX;
    var startTop = data.from.y - hotspotY;
    var endLeft = data.to.x - hotspotX;
    var endTop = data.to.y - hotspotY;

    layer.style.setProperty("--hand-width", cssPixel(handWidth));
    layer.style.setProperty("--hand-height", cssPixel(handHeight));
    layer.style.setProperty("--hand-pad", cssPixel(handPad));
    layer.style.setProperty("--hand-box-width", cssPixel(handWidth + handPad * 2));
    layer.style.setProperty("--hand-box-height", cssPixel(handHeight + handPad * 2));
    layer.style.setProperty("--hand-start-x", cssPixel(startLeft));
    layer.style.setProperty("--hand-start-y", cssPixel(startTop));
    layer.style.setProperty("--hand-end-x", cssPixel(endLeft));
    layer.style.setProperty("--hand-end-y", cssPixel(endTop));
    layer.style.setProperty("--hand-hotspot-x", cssPixel(hotspotX));
    layer.style.setProperty("--hand-hotspot-y", cssPixel(hotspotY));
    layer.style.setProperty("--tap-x", cssPixel(data.from.x));
    layer.style.setProperty("--tap-y", cssPixel(data.from.y));
    layer.style.setProperty("--hand-angle", data.angle + "rad");
    layer.style.setProperty("--duration", data.duration + "ms");
    layer.style.setProperty("--delay", data.delay + "ms");
    layer.style.setProperty("--iteration", data.repeat ? "infinite" : "1");
    layer.style.setProperty("--ease", data.ease);
  }

  function drawGuide(layer, from, to, showLine) {
    var existing = layer.querySelector(".tutorial-hand-guide");
    if (existing) existing.remove();
    if (!showLine) return;

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    var glow = document.createElementNS("http://www.w3.org/2000/svg", "line");
    var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    svg.classList.add("tutorial-hand-guide");
    svg.setAttribute("aria-hidden", "true");

    [glow, line].forEach(function applyCoords(node) {
      node.setAttribute("x1", from.x);
      node.setAttribute("y1", from.y);
      node.setAttribute("x2", to.x);
      node.setAttribute("y2", to.y);
    });
    glow.classList.add("tutorial-hand-guide-glow");
    line.classList.add("tutorial-hand-guide-line");
    svg.appendChild(glow);
    svg.appendChild(line);
    layer.insertBefore(svg, layer.firstChild);
  }

  function createLayer(container) {
    var computed = getComputedStyle(container);
    var previousPosition = container.style.position;
    var changedPosition = false;
    if (computed.position === "static") {
      container.style.position = "relative";
      changedPosition = true;
    }

    var layer = document.createElement("div");
    layer.className = "tutorial-hand-layer";
    layer.setAttribute("aria-hidden", "true");
    container.appendChild(layer);

    return {
      element: layer,
      restore: function restore() {
        layer.remove();
        if (changedPosition) container.style.position = previousPosition;
      }
    };
  }

  function normalizeOptions(options) {
    var opts = options || {};
    var mode = opts.mode || opts.type || "swipe";
    var coordinateSize = toSize(opts.coordinateSize || opts.coordinates || opts.baseSize);
    var at = toPoint(opts.at || opts.point, { x: coordinateSize.width / 2, y: coordinateSize.height / 2 });
    var from = toPoint(opts.from || opts.start || opts.line && opts.line.from, at);
    var to = toPoint(opts.to || opts.end || opts.line && opts.line.to, at);
    var handSize = Number(opts.handSize || opts.size || 104);
    var hotspot = opts.hotspot || DEFAULT_HOTSPOT;

    if (mode === "click" || mode === "tap") {
      to = from = at;
    }

    return {
      container: typeof opts.container === "string" ? document.querySelector(opts.container) : opts.container,
      mode: mode,
      coordinateSize: coordinateSize,
      from: from,
      to: to,
      handSrc: opts.handSrc || opts.src || DEFAULT_HAND_SRC,
      handSize: handSize,
      aspect: Number(opts.aspect || opts.handAspect || DEFAULT_HAND_ASPECT),
      hotspot: { x: Number(hotspot.x), y: Number(hotspot.y) },
      fit: opts.fit || "contain",
      duration: Number(opts.duration || (mode === "click" || mode === "tap" ? 1800 : 1350)),
      delay: Number(opts.delay || 0),
      repeat: opts.repeat !== false,
      line: opts.line !== false && mode !== "click" && mode !== "tap",
      angle: typeof opts.angle === "number" ? opts.angle : null,
      ease: opts.ease || "cubic-bezier(.18,.9,.18,1)"
    };
  }

  function showTutorialHand(options) {
    installStyles();
    var opts = normalizeOptions(options);
    if (!opts.container) {
      throw new Error("TutorialHand.show needs a container element or selector.");
    }

    var layerHandle = createLayer(opts.container);
    var layer = layerHandle.element;
    var hand = document.createElement("div");
    var image = document.createElement("img");
    var pulse = document.createElement("div");
    var dots = document.createElement("div");
    var spark = document.createElement("div");
    var currentOpts = opts;

    hand.className = "tutorial-hand-node";
    image.className = "tutorial-hand-image";
    image.alt = "";
    image.draggable = false;
    image.src = opts.handSrc;
    pulse.className = "tutorial-hand-pulse";
    dots.className = "tutorial-hand-dots";
    for (var dotIndex = 0; dotIndex < 12; dotIndex += 1) {
      var dot = document.createElement("span");
      dot.className = "tutorial-hand-dot";
      dot.style.setProperty("--dot-angle", dotIndex * 30 + "deg");
      dots.appendChild(dot);
    }
    spark.className = "tutorial-hand-spark";
    hand.appendChild(image);
    layer.appendChild(pulse);
    layer.appendChild(dots);
    layer.appendChild(spark);
    layer.appendChild(hand);

    function render(nextOptions) {
      currentOpts = normalizeOptions(Object.assign({}, currentOpts, nextOptions || {}, { container: currentOpts.container }));
      var metrics = getMetrics(currentOpts.container, currentOpts.coordinateSize, currentOpts.fit);
      var mappedFrom = mapPoint(currentOpts.from, metrics);
      var mappedTo = mapPoint(currentOpts.to, metrics);
      var dx = mappedTo.x - mappedFrom.x;
      var dy = mappedTo.y - mappedFrom.y;
      var pathAngle = Math.atan2(dy, dx || 1);
      var isClick = currentOpts.mode === "click" || currentOpts.mode === "tap";
      var angle = currentOpts.angle === null
        ? (isClick ? CLICK_POINTER_ANGLE : pathAngle) - HAND_POINTER_ANGLE
        : currentOpts.angle;
      var sizeScale = (metrics.scaleX + metrics.scaleY) / 2;

      setLayerVars(layer, {
        from: mappedFrom,
        to: mappedTo,
        hotspot: currentOpts.hotspot,
        handSize: currentOpts.handSize * sizeScale,
        aspect: currentOpts.aspect,
        angle: angle,
        duration: currentOpts.duration,
        delay: currentOpts.delay,
        repeat: currentOpts.repeat,
        ease: currentOpts.ease
      });
      drawGuide(layer, mappedFrom, mappedTo, currentOpts.line);
      hand.classList.toggle("is-click", isClick);
      pulse.style.display = isClick ? "block" : "none";
      dots.style.display = isClick ? "block" : "none";
      spark.style.display = isClick ? "block" : "none";
    }

    render();

    var resizeObserver = "ResizeObserver" in global ? new ResizeObserver(function onResize() { render(); }) : null;
    if (resizeObserver) resizeObserver.observe(opts.container);
    else global.addEventListener("resize", render);

    return {
      element: layer,
      update: render,
      replay: function replay() {
        layer.style.animation = "none";
        hand.style.animation = "none";
        pulse.style.animation = "none";
        dots.style.animation = "none";
        spark.style.animation = "none";
        void layer.offsetWidth;
        hand.style.animation = "";
        pulse.style.animation = "";
        dots.style.animation = "";
        spark.style.animation = "";
        layer.style.animation = "";
      },
      remove: function remove() {
        if (resizeObserver) resizeObserver.disconnect();
        else global.removeEventListener("resize", render);
        layerHandle.restore();
      }
    };
  }

  global.TutorialHand = {
    show: showTutorialHand,
    installStyles: installStyles
  };
  global.addTutorialHandAnimation = showTutorialHand;
})(window);
