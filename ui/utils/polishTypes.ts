// Canonical types for the hand-tutorial polish step.
// Shared between server (/api/polish, polishInjection.ts), client
// (PolishPanel), and the iframe stage (editor.js).

export type Point = { x: number; y: number } // 0..100, percentage of stage

export type BaseGesture = {
  id: string
  name: string
  delay: number
  duration: number
  repeat: boolean
}

export type ClickGesture = BaseGesture & {
  mode: 'click'
  at: Point
  angle?: number  // degrees, default 20 — rotation of the hand sprite around its hotspot
}

export type SwipeGesture = BaseGesture & {
  mode: 'swipe'
  from: Point
  to: Point
  angle?: number  // degrees override; if undefined, hand orients along the swipe path
}

export type Gesture = ClickGesture | SwipeGesture

// --- postMessage union types ---

export type ShellToStageMsg =
  | { type: 'load-playable'; srcdoc: string }
  | { type: 'set-mode'; mode: 'click' | 'swipe' }
  | { type: 'set-gestures'; gestures: Gesture[] }
  | { type: 'replay' }
  | { type: 'clear' }

export type StageToShellMsg =
  | { type: 'ready' }
  | { type: 'gesture-added'; gesture: Gesture }
  | { type: 'drag-echo'; from: Point; to: Point }
  | { type: 'error'; message: string }
  | { type: 'size'; width: number; height: number }

export function isGesture(value: unknown): value is Gesture {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return false
  if (typeof v.delay !== 'number' || typeof v.duration !== 'number') return false
  if (typeof v.repeat !== 'boolean') return false
  if (v.mode === 'click') {
    if (!isPoint(v.at)) return false
    if (v.angle !== undefined && typeof v.angle !== 'number') return false
    return true
  }
  if (v.mode === 'swipe') {
    if (!isPoint(v.from) || !isPoint(v.to)) return false
    if (v.angle !== undefined && typeof v.angle !== 'number') return false
    return true
  }
  return false
}

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return typeof p.x === 'number' && typeof p.y === 'number'
}
