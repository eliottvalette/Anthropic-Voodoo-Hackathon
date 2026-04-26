// Iframe-side controller. Owns DOM rendering of the stage (playable,
// markers, preview hand). Holds NO gesture state — the React shell is
// the single source of truth. We post gesture-added on user
// interaction; the shell appends and sends back set-gestures with the
// full list, which is what we render.
(function () {
  'use strict'

  var els = {
    iframe: document.getElementById('game-frame'),
    preview: document.getElementById('preview-layer'),
    markers: document.getElementById('marker-layer'),
    capture: document.getElementById('capture-layer'),
    empty: document.getElementById('empty-hint'),
    stage: document.getElementById('stage'),
  }

  var state = {
    mode: 'click',
    gestures: [],
    handles: [],
    nextId: 1,
  }

  var HAND_IMG = 'hand.png'

  // --- helpers ----------------------------------------------------

  function rect() { return els.preview.getBoundingClientRect() }
  function pctToPx(p, r) { return { x: p.x * r.width / 100, y: p.y * r.height / 100 } }

  function pctFromEvent(ev) {
    var r = els.capture.getBoundingClientRect()
    return {
      x: clamp((ev.clientX - r.left) / r.width * 100, 0, 100),
      y: clamp((ev.clientY - r.top) / r.height * 100, 0, 100),
    }
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

  // --- preview render ---------------------------------------------

  function clearPreview() {
    state.handles.forEach(function (h) { try { h.remove() } catch (e) {} })
    state.handles = []
    els.markers.innerHTML = ''
  }

  function renderClickHand(r, g) {
    var p = pctToPx(g.at, r)
    var hand = document.createElement('div')
    hand.className = 'editor-click-hand'
    hand.style.setProperty('--anchor-x', (p.x - 96 * 0.12) + 'px')
    hand.style.setProperty('--anchor-y', (p.y - 108 * 0.08) + 'px')
    hand.style.setProperty('--delay', (g.delay || 0) + 'ms')
    hand.style.setProperty('--iter', g.repeat ? 'infinite' : '1')
    hand.style.setProperty('--hand-angle', (g.angle != null ? g.angle : 20) + 'deg')
    els.preview.appendChild(hand)

    var pulse = document.createElement('div')
    pulse.className = 'editor-click-pulse'
    pulse.style.setProperty('--pulse-x', p.x + 'px')
    pulse.style.setProperty('--pulse-y', p.y + 'px')
    pulse.style.setProperty('--delay', (g.delay || 0) + 'ms')
    pulse.style.setProperty('--iter', g.repeat ? 'infinite' : '1')
    els.preview.appendChild(pulse)

    return { remove: function () { hand.remove(); pulse.remove() } }
  }

  function renderSwipeHand(r, g) {
    var opts = {
      container: els.preview,
      mode: 'swipe',
      coordinateSize: { width: r.width, height: r.height },
      fit: 'stretch',
      delay: g.delay || 0,
      duration: g.duration || 1500,
      repeat: g.repeat !== false,
      from: pctToPx(g.from, r),
      to: pctToPx(g.to, r),
      handSrc: HAND_IMG,
    }
    if (typeof g.angle === 'number') opts.angle = g.angle * Math.PI / 180
    return window.TutorialHand.show(opts)
  }

  function renderMarkers(r) {
    state.gestures.forEach(function (g) {
      if (g.mode === 'click') {
        var p = pctToPx(g.at, r)
        appendDot(p.x, p.y, false, g.name)
      } else {
        var a = pctToPx(g.from, r)
        var b = pctToPx(g.to, r)
        var len = Math.hypot(b.x - a.x, b.y - a.y)
        var angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
        var line = document.createElement('div')
        line.className = 'anchor-line'
        line.style.left = a.x + 'px'
        line.style.top = a.y + 'px'
        line.style.width = len + 'px'
        line.style.transform = 'rotate(' + angle + 'deg)'
        els.markers.appendChild(line)
        appendDot(a.x, a.y, false, g.name)
        appendDot(b.x, b.y, true, null)
      }
    })
  }

  function appendDot(x, y, isEnd, label) {
    var dot = document.createElement('div')
    dot.className = 'anchor-dot' + (isEnd ? ' end' : '')
    dot.style.left = x + 'px'
    dot.style.top = y + 'px'
    els.markers.appendChild(dot)
    if (label) {
      var lab = document.createElement('div')
      lab.className = 'anchor-label'
      lab.textContent = label
      lab.style.left = x + 'px'
      lab.style.top = y + 'px'
      els.markers.appendChild(lab)
    }
  }

  function renderAll() {
    clearPreview()
    var r = rect()
    if (r.width === 0 || r.height === 0) return
    renderMarkers(r)
    state.gestures.forEach(function (g) {
      try {
        if (g.mode === 'click') state.handles.push(renderClickHand(r, g))
        else state.handles.push(renderSwipeHand(r, g))
      } catch (err) {
        post({ type: 'error', message: 'render failed: ' + (err && err.message ? err.message : String(err)) })
      }
    })
  }

  // --- capture (pointer events) ----------------------------------

  var dragStart = null
  var dragMarker = null
  var dragLine = null

  els.capture.addEventListener('pointerdown', function (ev) {
    ev.preventDefault()
    try { els.capture.setPointerCapture(ev.pointerId) } catch (e) {}
    var p = pctFromEvent(ev)
    dragStart = { p: p, clientX: ev.clientX, clientY: ev.clientY }

    if (state.mode === 'click') {
      addClick(p)
      dragStart = null
      return
    }

    var capRect = els.capture.getBoundingClientRect()
    dragMarker = document.createElement('div')
    dragMarker.className = 'capture-marker'
    dragMarker.style.left = (ev.clientX - capRect.left) + 'px'
    dragMarker.style.top = (ev.clientY - capRect.top) + 'px'
    els.capture.appendChild(dragMarker)

    dragLine = document.createElement('div')
    dragLine.className = 'capture-line'
    dragLine.style.left = (ev.clientX - capRect.left) + 'px'
    dragLine.style.top = (ev.clientY - capRect.top) + 'px'
    dragLine.style.width = '0px'
    els.capture.appendChild(dragLine)
  })

  var lastDragEcho = 0
  els.capture.addEventListener('pointermove', function (ev) {
    if (!dragStart || state.mode !== 'swipe' || !dragLine) return
    var dx = ev.clientX - dragStart.clientX
    var dy = ev.clientY - dragStart.clientY
    var len = Math.hypot(dx, dy)
    var angle = Math.atan2(dy, dx) * 180 / Math.PI
    dragLine.style.width = len + 'px'
    dragLine.style.transform = 'rotate(' + angle + 'deg)'

    var now = Date.now()
    if (now - lastDragEcho > 16) {
      lastDragEcho = now
      var to = pctFromEvent(ev)
      post({ type: 'drag-echo', from: dragStart.p, to: to })
    }
  })

  function endDrag(ev) {
    if (!dragStart) return
    if (state.mode === 'swipe') {
      var to = pctFromEvent(ev)
      var distPct = Math.hypot(to.x - dragStart.p.x, to.y - dragStart.p.y)
      if (distPct > 1.5) addSwipe(dragStart.p, to)
    }
    if (dragMarker) { dragMarker.remove(); dragMarker = null }
    if (dragLine) { dragLine.remove(); dragLine = null }
    dragStart = null
  }
  els.capture.addEventListener('pointerup', endDrag)
  els.capture.addEventListener('pointercancel', endDrag)

  function addClick(p) {
    var num = state.nextId++
    var g = {
      id: 'g' + num,
      name: 'Tap ' + num,
      mode: 'click',
      at: p,
      delay: 600,
      duration: 1800,
      repeat: true,
    }
    post({ type: 'gesture-added', gesture: g })
  }

  function addSwipe(from, to) {
    var num = state.nextId++
    var g = {
      id: 'g' + num,
      name: 'Swipe ' + num,
      mode: 'swipe',
      from: from,
      to: to,
      delay: 600,
      duration: 1500,
      repeat: true,
    }
    post({ type: 'gesture-added', gesture: g })
  }

  // --- postMessage I/O -------------------------------------------

  function post(msg) {
    try { window.parent.postMessage(msg, window.location.origin) } catch (e) {}
  }

  function onMessage(ev) {
    if (ev.origin !== window.location.origin) return
    var msg = ev.data
    if (!msg || typeof msg.type !== 'string') return
    switch (msg.type) {
      case 'load-playable':
        if (typeof msg.srcdoc === 'string') {
          els.iframe.srcdoc = msg.srcdoc
          els.empty.classList.add('hidden')
        }
        break
      case 'set-mode':
        if (msg.mode === 'click' || msg.mode === 'swipe') state.mode = msg.mode
        break
      case 'set-gestures':
        if (Array.isArray(msg.gestures)) {
          state.gestures = msg.gestures
          // Keep nextId ahead of any existing g<N>.
          msg.gestures.forEach(function (g) {
            var n = parseInt(String(g.id || '').replace(/^g/, ''), 10)
            if (!isNaN(n) && n >= state.nextId) state.nextId = n + 1
          })
          renderAll()
        }
        break
      case 'replay':
        renderAll()
        break
      case 'clear':
        state.gestures = []
        clearPreview()
        break
    }
  }

  window.addEventListener('message', onMessage)

  window.addEventListener('resize', function () {
    var r = rect()
    post({ type: 'size', width: r.width, height: r.height })
    renderAll()
  })

  // Signal ready after listeners attached.
  function emitReady() {
    var r = rect()
    post({ type: 'ready' })
    post({ type: 'size', width: r.width, height: r.height })
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(emitReady, 0)
  } else {
    document.addEventListener('DOMContentLoaded', emitReady)
  }
}())
