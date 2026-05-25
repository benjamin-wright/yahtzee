import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  Camera,
  Color3,
  Color4,
  DynamicTexture,
  Engine,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  Vector4,
} from '@babylonjs/core'
import type { Die } from '../../scoring/types'

// ---------------------------------------------------------------------------
// Public handle exposed to parent via forwardRef
// ---------------------------------------------------------------------------

export interface DiceRendererHandle {
  /**
   * Begin a new throw.
   * values[0..4] – final settled values in original (unsorted) order.
   * rerollOriginalIndices – which original-order dice are being re-rolled
   *   (they exit first, then new dice fly in).  Empty set = first throw.
   */
  startThrow(values: Die[], rerollOriginalIndices: Set<number>): void
  /** Update the "?" face highlight for positioned dice. */
  updateReroll(rerollOriginalIndices: Set<number>): void
  /** Hide all dice and reset to idle (e.g. when switching away from random mode). */
  reset(): void
}

interface Props {
  /** Show the canvas overlay at all. */
  visible: boolean
  /**
   * One ref per sorted slot (index 0 = lowest value die).
   * DiceRenderer reads getBoundingClientRect() during the slide phase.
   */
  slotRefs: React.RefObject<HTMLDivElement | null>[]
  /** Fired after all dice have slid into their row positions. */
  onSettled: (sortedValues: Die[]) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIE_SIZE = 60          // world units ≈ px (orthographic)
const FACE_PX  = 128         // atlas column width in pixels
const ATLAS_W  = FACE_PX * 6 // 6 columns

// Gravity (pixels · s⁻²), positive = up in world space (Y-up)
const GRAVITY         = -950
const RESTITUTION     = 0.50
const FLOOR_FRICTION  = 0.76
const ANG_DAMPING     = 0.88
const REST_VEL        = 8    // px·s⁻¹ below which we consider the die "still"
const REST_ANG        = 0.10 // rad·s⁻¹
const REST_FRAMES     = 28   // consecutive frames at rest before confirmed
const SETTLE_MS       = 500  // pause after all dice at rest
const SLIDE_FRAMES    = 38   // frames for slide-to-slot animation
const EXIT_FRAMES     = 36   // frames for exit-off-screen animation

// Face index in the atlas (column 0-5) → die value that face shows.
// Ordering: face-0 = -Z (faces camera at default), face-1 = +Z (back),
// face-2 = +X (right), face-3 = -X (left), face-4 = +Y (top), face-5 = -Y (bottom)
const FACE_VALUES: Die[] = [6, 1, 2, 5, 3, 4]

// Die value → which atlas column faces the camera at default orientation
const CAMERA_FACE: Record<Die, number> = { 6:0, 1:1, 2:2, 5:3, 3:4, 4:5 }

// Rotation [rx, ry, rz] applied to the mesh so that the target value faces
// the camera (camera is at -Z looking toward +Z; the -Z face = face 0).
const VALUE_ROT: Record<Die, [number, number, number]> = {
  6: [ 0,                0, 0],
  1: [ 0,         Math.PI, 0],
  2: [ 0,   Math.PI / 2,   0],
  5: [ 0,  -Math.PI / 2,   0],
  3: [-Math.PI / 2,       0, 0],
  4: [ Math.PI / 2,       0, 0],
}

// ---------------------------------------------------------------------------
// Texture helpers
// ---------------------------------------------------------------------------

const DOT_XY: [number, number][][] = [
  [],                                                                              // 0 unused
  [[.5,.5]],                                                                       // 1
  [[.28,.72],[.72,.28]],                                                           // 2
  [[.28,.72],[.5,.5],[.72,.28]],                                                   // 3
  [[.28,.28],[.72,.28],[.28,.72],[.72,.72]],                                       // 4
  [[.28,.28],[.72,.28],[.5,.5],[.28,.72],[.72,.72]],                               // 5
  [[.28,.22],[.72,.22],[.28,.5],[.72,.5],[.28,.78],[.72,.78]],                     // 6
]

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawFaceColumn(
  ctx: CanvasRenderingContext2D,
  col: number,
  value: Die | '?',
  isDark: boolean,
) {
  const s = FACE_PX, x = col * s
  const bg     = isDark ? '#2c2b38' : '#faf8f4'
  const border = isDark ? '#3e3c52' : '#ccc8bf'
  const fg     = isDark ? '#e8e4f0' : '#1a1a1a'
  const red    = isDark ? '#e05252' : '#c0392b'

  ctx.fillStyle = border
  rrect(ctx, x + 2, 2, s - 4, s - 4, s * 0.14)
  ctx.fill()

  ctx.fillStyle = bg
  rrect(ctx, x + 5, 5, s - 10, s - 10, s * 0.12)
  ctx.fill()

  if (value === '?') {
    ctx.fillStyle = red
    ctx.font = `bold ${Math.round(s * 0.50)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('?', x + s / 2, s / 2)
  } else {
    const dotR = s * 0.093
    for (const [nx, ny] of DOT_XY[value]) {
      ctx.fillStyle = value === 1 ? red : fg
      ctx.beginPath()
      ctx.arc(x + nx * s, ny * s, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function buildAtlas(
  tex: DynamicTexture,
  isDark: boolean,
  questionCol: number | null = null,
) {
  const ctx = tex.getContext() as CanvasRenderingContext2D
  ctx.clearRect(0, 0, ATLAS_W, FACE_PX)
  for (let col = 0; col < 6; col++) {
    const v: Die | '?' = col === questionCol ? '?' : FACE_VALUES[col]
    drawFaceColumn(ctx, col, v, isDark)
  }
  tex.update()
}

// ---------------------------------------------------------------------------
// Physics helpers
// ---------------------------------------------------------------------------

function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s += 0x6d2b79f5
    let z = s
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

// Shortest-path angle lerp
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a
  while (d >  Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3) }

// ---------------------------------------------------------------------------
// Internal die state
// ---------------------------------------------------------------------------

type PhysState = {
  pos: [number, number, number]
  vel: [number, number, number]
  angVel: [number, number, number]
  rot: [number, number, number]
  restCount: number
}

type DieAnim = 'inactive' | 'throwing' | 'resting' | 'exiting' | 'sliding' | 'positioned'

interface DieState {
  mesh: ReturnType<typeof MeshBuilder.CreateBox>
  mat: StandardMaterial
  value: Die | null
  anim: DieAnim
  phys: PhysState
  slideStart: [number, number, number]      // pos snapshot at slide start
  slideRotStart: [number, number, number]   // rot snapshot at slide start
  slideTarget: [number, number]             // [wx, wy] target world pos
  slideRotTarget: [number, number, number]  // target rotation
  slideT: number                            // 0→1 progress
  exitT: number                             // 0→1 progress
  sortedSlot: number                        // which slot index (0-4) this die occupies
}

// ---------------------------------------------------------------------------
// Scene context (lives inside useEffect closure)
// ---------------------------------------------------------------------------

interface SceneCtx {
  engine: Engine
  scene: Scene
  dice: DieState[]
  normalTex: DynamicTexture
  rerollTexByValue: Partial<Record<Die, DynamicTexture>>
  isDark: boolean
  canvasW: number
  canvasH: number
  phase: 'idle' | 'exiting' | 'throwing' | 'settling' | 'sliding' | 'done'
  settleMs: number
  // pending new throw while exits are in-flight
  pendingValues: Die[] | null
  pendingKeep: Set<number>
  // current roll values (original order)
  currentValues: Die[]
  onSettled: ((sv: Die[]) => void) | null
  slotRefs: React.RefObject<HTMLDivElement | null>[]
  canvas: HTMLCanvasElement
}

// ---------------------------------------------------------------------------
// Physics update (called every frame for 'throwing' dice)
// ---------------------------------------------------------------------------

function stepPhysics(
  phys: PhysState,
  dt: number,
  minX: number, maxX: number,
  minY: number, maxY: number,
) {
  const h = DIE_SIZE / 2

  // Gravity
  phys.vel[1] += GRAVITY * dt

  // Integrate
  phys.pos[0] += phys.vel[0] * dt
  phys.pos[1] += phys.vel[1] * dt
  phys.pos[2] += phys.vel[2] * dt
  phys.rot[0] += phys.angVel[0] * dt
  phys.rot[1] += phys.angVel[1] * dt
  phys.rot[2] += phys.angVel[2] * dt

  // Damping
  phys.angVel[0] *= ANG_DAMPING
  phys.angVel[1] *= ANG_DAMPING
  phys.angVel[2] *= ANG_DAMPING

  // Floor
  if (phys.pos[1] < minY) {
    phys.pos[1] = minY
    const vy = Math.abs(phys.vel[1]) * RESTITUTION
    phys.vel[1] = vy < 15 ? 0 : vy
    phys.vel[0] *= FLOOR_FRICTION
    phys.vel[2] *= FLOOR_FRICTION
  }
  // Ceiling
  if (phys.pos[1] > maxY) {
    phys.pos[1] = maxY
    phys.vel[1] = -Math.abs(phys.vel[1]) * RESTITUTION
  }
  // Left/right walls
  if (phys.pos[0] < minX) { phys.pos[0] = minX; phys.vel[0] =  Math.abs(phys.vel[0]) * RESTITUTION }
  if (phys.pos[0] > maxX) { phys.pos[0] = maxX; phys.vel[0] = -Math.abs(phys.vel[0]) * RESTITUTION }
  // Z bounds (shallow — just enough for visual depth)
  if (phys.pos[2] < -h)   { phys.pos[2] = -h;   phys.vel[2] =  Math.abs(phys.vel[2]) * RESTITUTION }
  if (phys.pos[2] >  h)   { phys.pos[2] =  h;   phys.vel[2] = -Math.abs(phys.vel[2]) * RESTITUTION }

  // Rest detection
  const speed = Math.hypot(phys.vel[0], phys.vel[1], phys.vel[2])
  const aSp   = Math.hypot(phys.angVel[0], phys.angVel[1], phys.angVel[2])
  const onFloor = Math.abs(phys.pos[1] - minY) < 2
  if (speed < REST_VEL && aSp < REST_ANG && onFloor) {
    phys.restCount++
  } else {
    phys.restCount = 0
  }
}

function resolveDieDieCollisions(dice: DieState[]) {
  const minDist = DIE_SIZE * 0.92
  for (let i = 0; i < dice.length; i++) {
    const a = dice[i]
    if (a.anim !== 'throwing' && a.anim !== 'resting') continue
    for (let j = i + 1; j < dice.length; j++) {
      const b = dice[j]
      if (b.anim !== 'throwing' && b.anim !== 'resting') continue
      const dx = b.phys.pos[0] - a.phys.pos[0]
      const dy = b.phys.pos[1] - a.phys.pos[1]
      const dist = Math.hypot(dx, dy)
      if (dist < minDist && dist > 0.01) {
        const overlap = minDist - dist
        const nx = dx / dist, ny = dy / dist
        a.phys.pos[0] -= nx * overlap / 2
        a.phys.pos[1] -= ny * overlap / 2
        b.phys.pos[0] += nx * overlap / 2
        b.phys.pos[1] += ny * overlap / 2
        const dvx = b.phys.vel[0] - a.phys.vel[0]
        const dvy = b.phys.vel[1] - a.phys.vel[1]
        const dot = dvx * nx + dvy * ny
        if (dot < 0) {
          const imp = dot * RESTITUTION
          a.phys.vel[0] += imp * nx; a.phys.vel[1] += imp * ny
          b.phys.vel[0] -= imp * nx; b.phys.vel[1] -= imp * ny
          a.phys.angVel[2] += dvy * 0.008
          b.phys.angVel[2] -= dvy * 0.008
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Slot-position helpers
// ---------------------------------------------------------------------------

function slotWorldPos(
  slotRef: React.RefObject<HTMLDivElement | null>,
  canvasEl: HTMLCanvasElement,
): [number, number] | null {
  const el = slotRef.current
  if (!el) return null
  const sr = el.getBoundingClientRect()
  const cr = canvasEl.getBoundingClientRect()
  const sx = sr.left + sr.width  / 2 - cr.left
  const sy = sr.top  + sr.height / 2 - cr.top
  return [sx - cr.width / 2, cr.height / 2 - sy]
}

// ---------------------------------------------------------------------------
// Throw setup
// ---------------------------------------------------------------------------

function spawnDiePhysics(rand: () => number, W: number, H: number): PhysState {
  const half = DIE_SIZE / 2
  return {
    pos: [
      (rand() * 2 - 1) * (W / 2 - half * 2),
      -(H / 2 + half + rand() * 60),
      (rand() - 0.5) * 12,
    ],
    vel: [
      (rand() - 0.5) * 380,
      380 + rand() * 480,
      (rand() - 0.5) * 40,
    ],
    angVel: [
      (rand() - 0.5) * 18,
      (rand() - 0.5) * 18,
      (rand() - 0.5) * 18,
    ],
    rot: [rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2],
    restCount: 0,
  }
}

function beginThrow(ctx: SceneCtx, values: Die[], keepOriginal: Set<number>) {
  ctx.currentValues = [...values]
  ctx.phase = 'throwing'
  const rand = seededRng(Date.now() ^ 0xc0ffee)
  const W = ctx.canvasW, H = ctx.canvasH

  for (let i = 0; i < 5; i++) {
    const die = ctx.dice[i]
    die.value = values[i]

    if (keepOriginal.has(i)) {
      // kept: stays positioned, may rearrange in the slide step
      die.anim = 'positioned'
      die.mat.diffuseTexture = ctx.normalTex
      die.mesh.setEnabled(true)
      continue
    }

    die.anim = 'throwing'
    die.phys = spawnDiePhysics(rand, W, H)
    die.mesh.setEnabled(true)
    die.mat.diffuseTexture = ctx.normalTex
  }
}

// ---------------------------------------------------------------------------
// Slide-to-slots setup
// ---------------------------------------------------------------------------

function beginSlide(ctx: SceneCtx) {
  ctx.phase = 'sliding'
  const W = ctx.canvasW, H = ctx.canvasH
  const half = DIE_SIZE / 2

  // Sort original-order indices by value
  const sorted = [0, 1, 2, 3, 4].sort((a, b) => ctx.currentValues[a] - ctx.currentValues[b])

  for (let slot = 0; slot < 5; slot++) {
    const origIdx = sorted[slot]
    const die = ctx.dice[origIdx]
    die.sortedSlot = slot

    const wp = slotWorldPos(ctx.slotRefs[slot], ctx.canvas)
    // Fallback: evenly spaced along bottom of screen
    const fallbackX = -((5 - 1) / 2) * (DIE_SIZE + 10) + slot * (DIE_SIZE + 10)
    const fallbackY = -(H / 2) + half + 16
    const tx = wp ? wp[0] : fallbackX
    const ty = wp ? wp[1] : fallbackY

    die.slideStart      = [...die.phys.pos] as [number, number, number]
    die.slideRotStart   = [...die.phys.rot] as [number, number, number]
    die.slideTarget     = [tx, ty]
    die.slideRotTarget  = VALUE_ROT[ctx.currentValues[origIdx]]
    die.slideT          = 0
    die.anim            = 'sliding'

    // Clamp start pos inside bounds (sometimes positioned dice can be off if screen resized)
    die.slideStart[0] = Math.max(-(W/2 - half), Math.min(W/2 - half, die.slideStart[0]))
    die.slideStart[1] = Math.max(-(H/2 - half), Math.min(H/2 - half, die.slideStart[1]))
  }
}

// ---------------------------------------------------------------------------
// Per-frame update
// ---------------------------------------------------------------------------

function updateFrame(ctx: SceneCtx, dt: number) {
  const W = ctx.canvasW, H = ctx.canvasH
  const half = DIE_SIZE / 2
  const minX = -(W / 2) + half, maxX = W / 2 - half
  const minY = -(H / 2) + half, maxY = H / 2 - half

  // ── EXIT phase ────────────────────────────────────────────────────────────
  if (ctx.phase === 'exiting') {
    let anyStillExiting = false

    for (const die of ctx.dice) {
      if (die.anim !== 'exiting') continue
      anyStillExiting = true
      die.exitT += 1 / EXIT_FRAMES
      const t = Math.min(die.exitT, 1)
      const et = t * t  // ease-in

      // Fly off toward top-right
      const tx = W / 2 + DIE_SIZE
      const ty = H / 2 + DIE_SIZE
      die.phys.pos[0] = lerp(die.phys.pos[0], tx, et * dt * 4.5)
      die.phys.pos[1] = lerp(die.phys.pos[1], ty, et * dt * 4.5)
      die.phys.rot[0] += 7 * dt
      die.phys.rot[1] += 5 * dt
      die.phys.rot[2] += 3 * dt

      die.mesh.position.set(...die.phys.pos)
      die.mesh.rotation.set(...die.phys.rot)

      if (t >= 1) {
        die.anim = 'inactive'
        die.mesh.setEnabled(false)
      }
    }

    if (!anyStillExiting) {
      ctx.phase = 'idle'
      if (ctx.pendingValues) {
        const v = ctx.pendingValues
        const k = ctx.pendingKeep
        ctx.pendingValues = null
        beginThrow(ctx, v, k)
      }
    }
    return
  }

  // ── THROWING phase ────────────────────────────────────────────────────────
  if (ctx.phase === 'throwing') {
    resolveDieDieCollisions(ctx.dice)

    for (const die of ctx.dice) {
      if (die.anim !== 'throwing') continue
      stepPhysics(die.phys, dt, minX, maxX, minY, maxY)
      if (die.phys.restCount >= REST_FRAMES) die.anim = 'resting'
      die.mesh.position.set(...die.phys.pos)
      die.mesh.rotation.set(...die.phys.rot)
    }

    // Check if all active (non-kept) dice are resting
    const active = ctx.dice.filter(d => d.anim === 'throwing' || d.anim === 'resting')
    if (active.length > 0 && active.every(d => d.anim === 'resting')) {
      ctx.phase = 'settling'
      ctx.settleMs = SETTLE_MS
    }
    return
  }

  // ── SETTLING delay ────────────────────────────────────────────────────────
  if (ctx.phase === 'settling') {
    ctx.settleMs -= dt * 1000
    if (ctx.settleMs <= 0) {
      beginSlide(ctx)
    }
    return
  }

  // ── SLIDING phase ─────────────────────────────────────────────────────────
  if (ctx.phase === 'sliding') {
    let allDone = true

    for (const die of ctx.dice) {
      if (die.anim !== 'sliding') continue

      die.slideT = Math.min(die.slideT + 1 / SLIDE_FRAMES, 1)
      const et = easeOutCubic(die.slideT)

      const px = lerp(die.slideStart[0], die.slideTarget[0], et)
      const py = lerp(die.slideStart[1], die.slideTarget[1], et)
      const pz = lerp(die.slideStart[2], 0, et)
      const rx = lerpAngle(die.slideRotStart[0], die.slideRotTarget[0], et)
      const ry = lerpAngle(die.slideRotStart[1], die.slideRotTarget[1], et)
      const rz = lerpAngle(die.slideRotStart[2], die.slideRotTarget[2], et)

      die.mesh.position.set(px, py, pz)
      die.mesh.rotation.set(rx, ry, rz)

      // Keep physics state in sync so subsequent slide starts are correct
      die.phys.pos[0] = px; die.phys.pos[1] = py; die.phys.pos[2] = pz
      die.phys.rot[0] = rx; die.phys.rot[1] = ry; die.phys.rot[2] = rz

      if (die.slideT >= 1) {
        die.anim = 'positioned'
      } else {
        allDone = false
      }
    }

    if (allDone) {
      ctx.phase = 'done'
      // Pass values in original mesh order (0-4) — caller sorts for display
      ctx.onSettled?.([...ctx.currentValues])
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DiceRenderer = forwardRef<DiceRendererHandle, Props>(
  function DiceRenderer({ visible, slotRefs, onSettled }, ref) {
    const canvasRef   = useRef<HTMLCanvasElement>(null)
    const ctxRef      = useRef<SceneCtx | null>(null)
    const onSettledRef = useRef(onSettled)
    onSettledRef.current = onSettled

    const slotRefsRef = useRef(slotRefs)
    slotRefsRef.current = slotRefs

    // ── Scene lifecycle ──────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

      const engine = new Engine(canvas, true, { alpha: true, preserveDrawingBuffer: true })
      const scene  = new Scene(engine)
      scene.clearColor = new Color4(0, 0, 0, 0)

      // Camera – orthographic; 1 world-unit ≈ 1 CSS pixel
      const camera = new FreeCamera('cam', new Vector3(0, 0, -400), scene)
      camera.setTarget(Vector3.Zero())
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA

      const syncOrtho = () => {
        const w = canvas.clientWidth  || window.innerWidth
        const h = canvas.clientHeight || window.innerHeight
        camera.orthoLeft   = -w / 2
        camera.orthoRight  =  w / 2
        camera.orthoTop    =  h / 2
        camera.orthoBottom = -h / 2
        if (ctxRef.current) { ctxRef.current.canvasW = w; ctxRef.current.canvasH = h }
        engine.resize()
      }
      syncOrtho()
      window.addEventListener('resize', syncOrtho)

      // Light
      const light = new HemisphericLight('light', new Vector3(0.3, 1, -0.6).normalize(), scene)
      light.intensity    = 1.15
      light.groundColor  = new Color3(0.65, 0.65, 0.65)
      light.diffuse      = new Color3(1, 1, 1)
      light.specular     = new Color3(0, 0, 0)

      // Shared textures
      const normalTex = new DynamicTexture('atlas_normal', { width: ATLAS_W, height: FACE_PX }, scene, false)
      normalTex.hasAlpha = false
      buildAtlas(normalTex, isDark)

      const rerollTexByValue: Partial<Record<Die, DynamicTexture>> = {}
      for (let v = 1; v <= 6; v++) {
        const tex = new DynamicTexture(`atlas_reroll_${v}`, { width: ATLAS_W, height: FACE_PX }, scene, false)
        tex.hasAlpha = false
        buildAtlas(tex, isDark, CAMERA_FACE[v as Die])
        rerollTexByValue[v as Die] = tex
      }

      // faceUV: map atlas column i → box face i
      // V runs 1→0 to compensate for canvas-to-texture Y-flip
      const faceUV = Array.from({ length: 6 }, (_, i) =>
        new Vector4(i / 6, 1, (i + 1) / 6, 0),
      )

      // Create 5 die meshes
      const dice: DieState[] = Array.from({ length: 5 }, (_, i) => {
        const mesh = MeshBuilder.CreateBox(`die_${i}`, { size: DIE_SIZE, faceUV, wrap: true }, scene)
        mesh.setEnabled(false)

        const mat = new StandardMaterial(`die_mat_${i}`, scene)
        mat.diffuseTexture = normalTex
        mat.specularColor  = Color3.Black()
        mesh.material = mat

        return {
          mesh, mat, value: null,
          anim: 'inactive' as DieAnim,
          phys: { pos:[0,0,0], vel:[0,0,0], angVel:[0,0,0], rot:[0,0,0], restCount: 0 },
          slideStart: [0, 0, 0],
          slideRotStart: [0, 0, 0],
          slideTarget: [0, 0],
          slideRotTarget: [0, 0, 0],
          slideT: 0, exitT: 0, sortedSlot: i,
        }
      })

      const ctx: SceneCtx = {
        engine, scene, dice, normalTex, rerollTexByValue,
        isDark, canvasW: canvas.clientWidth || window.innerWidth,
        canvasH: canvas.clientHeight || window.innerHeight,
        phase: 'idle', settleMs: 0,
        pendingValues: null, pendingKeep: new Set(),
        currentValues: [1, 2, 3, 4, 5],
        onSettled: null,
        slotRefs: slotRefsRef.current,
        canvas,
      }
      ctxRef.current = ctx

      // Per-frame update
      let lastT = performance.now()
      scene.registerBeforeRender(() => {
        const now = performance.now()
        const dt  = Math.min((now - lastT) / 1000, 1 / 30)
        lastT = now
        ctx.slotRefs  = slotRefsRef.current
        ctx.onSettled = onSettledRef.current
        updateFrame(ctx, dt)
      })

      engine.runRenderLoop(() => scene.render())

      return () => {
        window.removeEventListener('resize', syncOrtho)
        engine.dispose()
        ctxRef.current = null
      }
    }, [])

    // ── Imperative handle ────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      startThrow(values, rerollOriginalIndices) {
        const ctx = ctxRef.current
        if (!ctx) return

        // Dice currently positioned that need to exit
        const exitDice = ctx.dice.filter(
          (d, i) => d.anim === 'positioned' && rerollOriginalIndices.has(i),
        )

        if (exitDice.length > 0) {
          for (const die of exitDice) {
            die.anim   = 'exiting'
            die.exitT  = 0
          }
          ctx.phase        = 'exiting'
          ctx.pendingValues = values
          ctx.pendingKeep   = new Set(
            [0,1,2,3,4].filter(i => !rerollOriginalIndices.has(i))
          )
        } else {
          // First throw or all dice inactive
          const keep = new Set([0,1,2,3,4].filter(i => !rerollOriginalIndices.has(i)))
          beginThrow(ctx, values, keep)
        }
      },

      updateReroll(rerollOriginalIndices) {
        const ctx = ctxRef.current
        if (!ctx) return
        for (let i = 0; i < 5; i++) {
          const die = ctx.dice[i]
          if (die.anim !== 'positioned' || die.value === null) continue
          die.mat.diffuseTexture = rerollOriginalIndices.has(i)
            ? (ctx.rerollTexByValue[die.value] ?? ctx.normalTex)
            : ctx.normalTex
        }
      },

      reset() {
        const ctx = ctxRef.current
        if (!ctx) return
        for (const die of ctx.dice) {
          die.anim   = 'inactive'
          die.value  = null
          die.mesh.setEnabled(false)
        }
        ctx.phase         = 'idle'
        ctx.pendingValues = null
      },
    }), [])

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 9998,
          display: visible ? 'block' : 'none',
        }}
      />
    )
  },
)

export default DiceRenderer
