// Shared procedural Three.js mesh builders — mirror the recipes used inside
// the airplane-evolution playable HTML. Used by the library 3D viewer to
// preview each modular part with a tiny rotating canvas per card.

import * as THREE from 'three'

const PALETTE = {
  body: 0xd9633a,
  wing: 0xf2eadf,
  tail: 0xd9633a,
  accent: 0x1c2a3a,
  detail: 0x33363f,
  wheel: 0x222226,
}

function mat(color: number) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true })
}

// ── Wing geometry (trapezoidal swept wing extrusion) ────────────────────────
function makeWingShape(span: number, chord: number, thickness: number, sweep: number, tipChordRatio: number) {
  const tipChord = chord * tipChordRatio
  const half = thickness * 0.5
  const xRootLead = chord * 0.5
  const xRootTrail = -chord * 0.5
  const xTipLead = chord * 0.5 - sweep
  const xTipTrail = xTipLead - tipChord
  const v: [number, number, number][] = [
    [xRootLead, half, 0],
    [xRootTrail, half, 0],
    [xTipTrail, half, span],
    [xTipLead, half, span],
    [xRootLead, -half, 0],
    [xRootTrail, -half, 0],
    [xTipTrail, -half, span],
    [xTipLead, -half, span],
  ]
  const tris: [number, number, number][] = [
    [0, 1, 2], [0, 2, 3],
    [4, 7, 6], [4, 6, 5],
    [0, 3, 7], [0, 7, 4],
    [1, 5, 6], [1, 6, 2],
    [0, 4, 5], [0, 5, 1],
    [3, 2, 6], [3, 6, 7],
  ]
  const positions = new Float32Array(tris.length * 9)
  let i = 0
  for (const [a, b, c] of tris) {
    for (const idx of [a, b, c]) {
      positions[i++] = v[idx][0]
      positions[i++] = v[idx][1]
      positions[i++] = v[idx][2]
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}

// ── Builders ────────────────────────────────────────────────────────────────

export function buildFuselage(): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, 2.4, 12), mat(PALETTE.body))
  body.rotation.z = Math.PI / 2
  body.position.x = -0.1
  g.add(body)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 12), mat(PALETTE.body))
  nose.rotation.z = -Math.PI / 2
  nose.position.x = 1.45
  g.add(nose)
  const tailCap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 12), mat(PALETTE.body))
  tailCap.rotation.z = Math.PI / 2
  tailCap.position.x = -1.45
  g.add(tailCap)
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(PALETTE.accent)
  )
  cockpit.position.set(0.35, 0.30, 0)
  g.add(cockpit)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.10, 8), mat(PALETTE.detail))
  hub.rotation.z = Math.PI / 2
  hub.position.x = 1.83
  g.add(hub)
  const propGroup = new THREE.Group()
  propGroup.position.x = 1.88
  const bladeGeo = new THREE.BoxGeometry(0.04, 0.95, 0.06)
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(bladeGeo, mat(PALETTE.detail))
    b.rotation.x = (i / 3) * Math.PI * 2
    propGroup.add(b)
  }
  g.add(propGroup)
  // Landing gear
  const strutGeo = new THREE.BoxGeometry(0.05, 0.28, 0.05)
  const wheelGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.06, 10)
  for (const z of [-0.45, 0.45]) {
    const s = new THREE.Mesh(strutGeo, mat(PALETTE.detail))
    s.position.set(0.05, -0.36, z)
    g.add(s)
    const w = new THREE.Mesh(wheelGeo, mat(PALETTE.wheel))
    w.rotation.x = Math.PI / 2
    w.position.set(0.05, -0.52, z)
    g.add(w)
  }
  return g
}

export function buildWing(): THREE.Group {
  const g = new THREE.Group()
  // Render both wings so the preview shows the symmetric pair
  for (const side of [-1, +1] as const) {
    const geo = makeWingShape(1.5, 0.95, 0.07, 0.25, 0.65)
    const wing = new THREE.Mesh(geo, mat(PALETTE.wing))
    wing.position.set(-0.05, 0.05, side * 0.18)
    if (side < 0) wing.scale.z = -1
    wing.rotation.x = side < 0 ? -0.06 : 0.06
    g.add(wing)
  }
  return g
}

export function buildTail(): THREE.Group {
  const g = new THREE.Group()
  const finGeo = makeWingShape(0.65, 0.6, 0.06, 0.20, 0.45)
  const fin = new THREE.Mesh(finGeo, mat(PALETTE.tail))
  fin.position.set(-1.25, 0.10, 0)
  fin.rotation.x = -Math.PI / 2
  g.add(fin)
  for (const side of [-1, +1] as const) {
    const stabGeo = makeWingShape(0.55, 0.45, 0.05, 0.15, 0.55)
    const stab = new THREE.Mesh(stabGeo, mat(PALETTE.tail))
    stab.position.set(-1.25, 0.18, side * 0.16)
    if (side < 0) stab.scale.z = -1
    g.add(stab)
  }
  return g
}

export function buildTree(): THREE.Group {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 1.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b3f22, flatShading: true })
  )
  trunk.position.y = 0.7
  g.add(trunk)
  const leaf1 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.6, 1).scale(1, 1.1, 1),
    new THREE.MeshLambertMaterial({ color: 0x2f7a2f, flatShading: true })
  )
  leaf1.position.y = 2.2
  g.add(leaf1)
  const leaf2 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.0, 1),
    new THREE.MeshLambertMaterial({ color: 0x3a8a30, flatShading: true })
  )
  leaf2.position.set(0.7, 2.8, 0.3)
  g.add(leaf2)
  return g
}

export function buildGrass(): THREE.Group {
  // Build the same canvas-textured grass tuft used in the playable.
  const g = new THREE.Group()
  const cv = document.createElement('canvas')
  cv.width = 64
  cv.height = 90
  const ctx = cv.getContext('2d')!
  ctx.lineCap = 'round'
  ctx.lineWidth = 2.2
  for (let i = 0; i < 7; i++) {
    const x = 8 + i * 8 + Math.random() * 4
    const tip = 24 + Math.random() * 16
    const grad = ctx.createLinearGradient(x, 86, x, tip)
    grad.addColorStop(0, '#234d18')
    grad.addColorStop(0.5, '#3a8a30')
    grad.addColorStop(1, '#7bcc4a')
    ctx.strokeStyle = grad
    ctx.beginPath()
    ctx.moveTo(x, 88)
    ctx.quadraticCurveTo(x + (Math.random() * 6 - 3), (86 + tip) / 2, x + (Math.random() * 8 - 4), tip)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.needsUpdate = true
  // Show 5 tufts around a 0.5-radius ring so the user sees several
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const geo = new THREE.PlaneGeometry(0.7, 1.0)
    geo.translate(0, 0.5, 0)
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: false })
    )
    m.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5)
    m.rotation.y = Math.random() * Math.PI * 2
    g.add(m)
  }
  return g
}

export function buildFence(): THREE.Group {
  const g = new THREE.Group()
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x6b5238, flatShading: true })
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xc23b2a, flatShading: true })
  const POLE_ZS = [-1.6, -1.0, -0.4, 0.2, 0.8, 1.4, 2.0]
  for (const z of POLE_ZS) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 6), woodMat)
    post.position.set(0, 0.9, z - 0.2)
    g.add(post)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.18, 6), flagMat)
    tip.position.set(0, 1.85, z - 0.2)
    g.add(tip)
  }
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.12, POLE_ZS[POLE_ZS.length - 1] - POLE_ZS[0] + 0.2),
    woodMat
  )
  beam.position.set(0, 1.78, (POLE_ZS[0] + POLE_ZS[POLE_ZS.length - 1]) / 2 - 0.2)
  g.add(beam)
  return g
}

// Small helper: bounding-sphere center/radius for camera framing
export function frameForGroup(group: THREE.Object3D): { center: THREE.Vector3; radius: number } {
  const box = new THREE.Box3().setFromObject(group)
  const center = new THREE.Vector3()
  box.getCenter(center)
  const size = new THREE.Vector3()
  box.getSize(size)
  const radius = Math.max(size.x, size.y, size.z) * 0.6
  return { center, radius }
}

// Registry: keyed by `builder` field in catalog.json
export const BUILDERS: Record<string, () => THREE.Group> = {
  fuselage: buildFuselage,
  wing: buildWing,
  tail: buildTail,
  tree: buildTree,
  grass: buildGrass,
  fence: buildFence,
}
