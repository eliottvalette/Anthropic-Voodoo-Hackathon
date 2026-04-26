'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { BUILDERS, frameForGroup } from '@/lib/3d/builders'

interface Library3DCardProps {
  builder: string
  /** Optional: orbit camera Y angle bias. Default = 0.45 rad up. */
  cameraTilt?: number
  /** Spin speed (rad/sec). */
  spinSpeed?: number
}

/**
 * Renders the named procedural part inside a small canvas with a slowly orbiting
 * camera, soft sky gradient background, and a single directional light to keep
 * the low-poly shading readable. One renderer + scene per card; cleanup on
 * unmount.
 */
export default function Library3DCard({
  builder,
  cameraTilt = 0.45,
  spinSpeed = 0.6,
}: Library3DCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const ioRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const factory = BUILDERS[builder]
    if (!factory) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setSize(container.clientWidth, container.clientHeight, false)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    // Soft sky gradient background drawn into a tiny canvas texture.
    const bgCv = document.createElement('canvas')
    bgCv.width = 4
    bgCv.height = 256
    const bgCtx = bgCv.getContext('2d')!
    const grad = bgCtx.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#bfe3ff')
    grad.addColorStop(1, '#e8f4ff')
    bgCtx.fillStyle = grad
    bgCtx.fillRect(0, 0, 4, 256)
    const bgTex = new THREE.CanvasTexture(bgCv)
    scene.background = bgTex

    scene.add(new THREE.HemisphereLight(0xc6e6ff, 0x6a8a4a, 0.55))
    scene.add(new THREE.AmbientLight(0xffffff, 0.18))
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.2)
    sun.position.set(3, 5, 2)
    scene.add(sun)

    const obj = factory()
    scene.add(obj)
    const { center, radius } = frameForGroup(obj)
    const dist = Math.max(radius * 3.2, 3)

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)

    function fit() {
      const w = container!.clientWidth
      const h = container!.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    fit()

    const ro = new ResizeObserver(fit)
    ro.observe(container)

    let t = 0
    let last = performance.now()
    let visible = true
    ioRef.current = new IntersectionObserver(
      entries => {
        for (const e of entries) visible = e.isIntersecting
      },
      { threshold: 0.01 }
    )
    ioRef.current.observe(container)

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (visible) {
        t += dt * spinSpeed
        camera.position.set(
          center.x + Math.cos(t) * dist,
          center.y + Math.sin(cameraTilt) * dist * 0.55,
          center.z + Math.sin(t) * dist
        )
        camera.lookAt(center)
        // Spin propeller for fuselage cards
        const prop = obj.children.find(c => c.type === 'Group' && (c as THREE.Group).children.length === 3 && (c as THREE.Group).children[0].type === 'Mesh')
        if (prop) prop.rotation.x += dt * 8
        renderer.render(scene, camera)
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      ioRef.current?.disconnect()
      ro.disconnect()
      renderer.dispose()
      bgTex.dispose()
      // dispose geometries/materials of the rendered group
      obj.traverse(o => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(x => x.dispose())
        else if (mat) mat.dispose()
      })
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [builder, cameraTilt, spinSpeed])

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gradient-to-b from-[#bfe3ff] to-[#e8f4ff]"
    />
  )
}
