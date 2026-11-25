/* Voice orb. A calm, central presence for voice mode, drawn on canvas at 60fps.
 *   idle      → slow breathing
 *   listening → accent tint, swells and ripples with the mic level
 *   speaking  → neutral core, rhythmic pulses from the (synthetic) speech level
 *   thinking  → gentle breathing, a soft highlight and a faint arc rotate slowly
 *   muted     → still, desaturated
 * Every visual parameter is a spring toward the state's target, so state changes
 * blend over ~300 ms. Colours come only from tokens (--orb-core, --orb-listen,
 * --orb-glow, --text-tertiary), re-read on theme change. Reduced motion → a static
 * ring whose thickness shows the state. The loop pauses while the tab is hidden. */

import { useEffect, useRef } from 'react'
import { cx } from './cx'

export type OrbState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'muted'

export interface OrbProps {
  state: OrbState
  /** 0..1. Mic level while listening, speech level while speaking. */
  level?: number
  /** Alternative to `level` for 60fps sources: read every frame, no re-render needed. */
  levelRef?: { readonly current: number }
  /** Canvas box in CSS px. The orb body is ~60% of it; the rest is room for glow and ripples. */
  size?: number
  className?: string
  /** Accessible name. Omit to hide the orb from assistive tech (the caller labels the state). */
  label?: string
}

/* ------------------------------- parameters ------------------------------- */

interface Params {
  tint: number       // 0 core colour → 1 listen colour
  pump: number       // scale gain per unit level
  ripple: number     // ripple emission strength per unit level
  wobble: number     // edge deformation gain per unit level
  breathAmp: number  // idle breathing amplitude (scale)
  breathRate: number // breathing speed, rad/s
  deform: number     // resting edge deformation
  flow: number       // speed of the edge noise, rad/s
  glow: number       // resting outer glow strength
  sheen: number      // rotating highlight strength (thinking)
  spin: number       // rotation speed, rad/s
  dim: number        // 0 normal → 1 muted
}

const TARGETS: Record<OrbState, Params> = {
  idle:      { tint: 0,    pump: 0,    ripple: 0,   wobble: 0,    breathAmp: 0.022, breathRate: 1.9, deform: 0.010, flow: 0.35, glow: 0.35, sheen: 0,   spin: 0.15, dim: 0 },
  listening: { tint: 1,    pump: 0.17, ripple: 1,   wobble: 0.022, breathAmp: 0.008, breathRate: 2.4, deform: 0.012, flow: 0.9,  glow: 0.55, sheen: 0,   spin: 0.2,  dim: 0 },
  speaking:  { tint: 0,    pump: 0.12, ripple: 0.6, wobble: 0.02, breathAmp: 0.006, breathRate: 2.2, deform: 0.010, flow: 0.7,  glow: 0.45, sheen: 0,   spin: 0.2,  dim: 0 },
  thinking:  { tint: 0.12, pump: 0,    ripple: 0,   wobble: 0,    breathAmp: 0.026, breathRate: 3.0, deform: 0.016, flow: 0.55, glow: 0.35, sheen: 1,   spin: 1.6,  dim: 0 },
  muted:     { tint: 0,    pump: 0,    ripple: 0,   wobble: 0,    breathAmp: 0,     breathRate: 1.0, deform: 0.004, flow: 0.1,  glow: 0,    sheen: 0,   spin: 0,    dim: 1 },
}
const KEYS = Object.keys(TARGETS.idle) as (keyof Params)[]

/* --------------------------------- colour --------------------------------- */

interface RGBA { r: number; g: number; b: number; a: number }
interface Palette { core: RGBA; listen: RGBA; glow: RGBA; muted: RGBA }

let probe: CanvasRenderingContext2D | null = null
function parseColor(css: string, fallback: RGBA): RGBA {
  if (!css.trim()) return fallback
  if (!probe) probe = document.createElement('canvas').getContext('2d')
  if (!probe) return fallback
  probe.fillStyle = 'transparent'
  probe.fillStyle = css.trim()
  const v = String(probe.fillStyle)
  if (v.startsWith('#')) {
    const n = parseInt(v.slice(1), 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const m = v.match(/rgba?\(([^)]+)\)/)
  if (!m) return fallback
  const [r, g, b, a = '1'] = m[1].split(',').map((s) => s.trim())
  return { r: +r, g: +g, b: +b, a: +a }
}
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 }
function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el)
  const g = (n: string) => cs.getPropertyValue(n)
  return {
    core: parseColor(g('--orb-core'), BLACK),
    listen: parseColor(g('--orb-listen'), BLACK),
    glow: parseColor(g('--orb-glow'), BLACK),
    muted: parseColor(g('--text-tertiary'), BLACK),
  }
}
const mix = (a: RGBA, b: RGBA, t: number): RGBA => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t })
const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 }
const lighten = (c: RGBA, t: number) => mix(c, { ...WHITE, a: c.a }, t)
const darken = (c: RGBA, t: number) => mix(c, { ...BLACK, a: c.a }, t)
const css = (c: RGBA, alpha = c.a) => `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`
const luminance = (c: RGBA) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255

/* --------------------------------- motion --------------------------------- */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)

interface Spring { x: number; v: number }
function stepSpring(s: Spring, target: number, k: number, c: number, dt: number) {
  const a = k * (target - s.x) - c * s.v
  s.v += a * dt
  s.x += s.v * dt
}

interface Ripple { born: number; strength: number }

/* ---------------------------------- Orb ---------------------------------- */

export function Orb({ state, level = 0, levelRef, size = 220, className, label }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(state)
  const levelPropRef = useRef(level)
  const extRef = useRef(levelRef)
  const redrawStatic = useRef<(() => void) | null>(null)
  stateRef.current = state
  levelPropRef.current = level
  extRef.current = levelRef

  useEffect(() => { redrawStatic.current?.() }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let dpr = 1
    const fit = () => {
      dpr = Math.min(3, window.devicePixelRatio || 1)
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
    }
    fit()

    let palette = readPalette(canvas)
    const mo = new MutationObserver(() => { palette = readPalette(canvas); redrawStatic.current?.() })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
    const mqDark = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => { palette = readPalette(canvas); redrawStatic.current?.() }
    mqDark.addEventListener('change', onScheme)
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    /* --- simulation state --- */
    const p: Record<keyof Params, Spring> = {} as Record<keyof Params, Spring>
    for (const k of KEYS) p[k] = { x: TARGETS[stateRef.current][k], v: 0 }
    const lvl: Spring = { x: 0, v: 0 }
    let breathPhase = 0
    let flowPhase = Math.random() * 10
    let spinPhase = -Math.PI * 0.75
    let t = 0
    let last = performance.now()
    let lastRipple = -1
    let prevLevel = 0
    const ripples: Ripple[] = []
    const N = 128
    const phases = [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28]

    const cxy = () => (size * dpr) / 2

    const drawStatic = () => {
      const W = size * dpr
      const c = W / 2
      ctx.clearRect(0, 0, W, W)
      const st = stateRef.current
      const R = W * 0.3
      const col = st === 'listening' ? palette.listen : st === 'muted' ? palette.muted : palette.core
      const thick = { idle: 2, listening: 6, speaking: 4, thinking: 3, muted: 1.5 }[st] * dpr
      ctx.beginPath()
      ctx.arc(c, c, R, 0, Math.PI * 2)
      ctx.fillStyle = css(col, 0.06)
      ctx.fill()
      ctx.setLineDash(st === 'muted' ? [4 * dpr, 4 * dpr] : st === 'thinking' ? [10 * dpr, 6 * dpr] : [])
      ctx.lineWidth = thick
      ctx.strokeStyle = css(col, st === 'muted' ? 0.6 : 0.9)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const frame = (dtRaw: number) => {
      const W = size * dpr
      const c = cxy()
      const target = TARGETS[stateRef.current]
      // integrate in small steps for stability
      let remaining = Math.min(dtRaw, 0.1)
      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 120)
        remaining -= dt
        for (const k of KEYS) stepSpring(p[k], target[k], 190, 24, dt)
        const ext = extRef.current
        const inLevel = clamp01(ext ? ext.current : levelPropRef.current)
        stepSpring(lvl, inLevel, 260, 26, dt)
      }
      const dt = Math.min(dtRaw, 0.1)
      t += dt
      breathPhase += p.breathRate.x * dt
      flowPhase += p.flow.x * dt
      spinPhase += p.spin.x * dt

      const L = clamp01(lvl.x)
      const tint = clamp01(p.tint.x)
      const dim = clamp01(p.dim.x)
      const sheen = clamp01(p.sheen.x)

      /* geometry */
      const baseR = W * 0.3
      const breath = Math.sin(breathPhase) * p.breathAmp.x
      const scale = 1 + breath + L * Math.max(0, p.pump.x)
      const R = baseR * scale
      const deform = Math.max(0, p.deform.x) + L * Math.max(0, p.wobble.x)

      /* ripples: on a rising edge of the level */
      const rise = L - prevLevel
      prevLevel = L
      const rippleGain = Math.max(0, p.ripple.x)
      if (rippleGain > 0.05 && L > 0.22 && rise > 0.004 && t - lastRipple > 0.32 && ripples.length < 4) {
        ripples.push({ born: t, strength: Math.min(1, L * rippleGain) })
        lastRipple = t
      }
      for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].born > 1.25) ripples.splice(i, 1)

      /* colours */
      let base = mix(palette.core, palette.listen, tint)
      base = mix(base, palette.muted, dim * 0.85)
      const glowCol = mix({ ...palette.core, a: 0.10 }, palette.glow, tint)
      const glowAlphaScale = glowCol.a
      const baseAlpha = 1 - dim * 0.55

      ctx.clearRect(0, 0, W, W)

      /* outer glow (soft halo) */
      const glowStrength = Math.max(0, p.glow.x) + L * 0.9 * (1 - dim)
      if (glowStrength > 0.01) {
        const inner = R * 0.92
        const outer = R * (1.32 + L * 0.28)
        const g = ctx.createRadialGradient(c, c, inner, c, c, outer)
        g.addColorStop(0, css(glowCol, glowAlphaScale * glowStrength * 0.9))
        g.addColorStop(0.45, css(glowCol, glowAlphaScale * glowStrength * 0.35))
        g.addColorStop(1, css(glowCol, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(c, c, outer, 0, Math.PI * 2)
        ctx.fill()

        // faint ring that expands with level
        const ringR = R * (1.13 + L * 0.2)
        ctx.beginPath()
        ctx.arc(c, c, ringR, 0, Math.PI * 2)
        ctx.lineWidth = (1 + L * 1.5) * dpr
        ctx.strokeStyle = css(glowCol, Math.min(1, glowAlphaScale * (0.2 + glowStrength * 0.9)))
        ctx.stroke()
      }

      /* ripples */
      for (const r of ripples) {
        const prog = (t - r.born) / 1.25
        const rr = R * (1.04 + 0.4 * easeOut(prog))
        ctx.beginPath()
        ctx.arc(c, c, rr, 0, Math.PI * 2)
        ctx.lineWidth = 1.25 * dpr
        const ripCol = mix(palette.core, palette.listen, tint)
        ctx.strokeStyle = css(ripCol, r.strength * 0.32 * Math.pow(1 - prog, 2))
        ctx.stroke()
      }

      /* thinking arc: a thin comet around the ring */
      if (sheen > 0.01) {
        const arcR = R * 1.13
        const start = spinPhase
        const sweep = Math.PI * 0.55
        const arcCol = mix(palette.core, palette.listen, 0.6)
        const steps = 24
        ctx.lineCap = 'round'
        ctx.lineWidth = 1.6 * dpr
        for (let i = 0; i < steps; i++) {
          const a0 = start + (sweep * i) / steps
          const a1 = start + (sweep * (i + 1)) / steps
          ctx.beginPath()
          ctx.arc(c, c, arcR, a0, a1 + 0.01)
          ctx.strokeStyle = css(arcCol, sheen * 0.55 * Math.pow((i + 1) / steps, 1.6))
          ctx.stroke()
        }
        ctx.lineCap = 'butt'
      }

      /* body path: layered sine noise on the edge */
      ctx.beginPath()
      const pts: [number, number][] = []
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        const n =
          0.36 * Math.sin(2 * a + phases[0] + flowPhase * 1.0) +
          0.32 * Math.sin(3 * a + phases[1] - flowPhase * 1.3) +
          0.22 * Math.sin(5 * a + phases[2] + flowPhase * 1.7) +
          0.12 * Math.sin(7 * a + phases[3] - flowPhase * 2.3) * (0.4 + L)
        const rr = R * (1 + deform * n)
        pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr])
      }
      const mid = (i: number) => {
        const a = pts[i % N], b = pts[(i + 1) % N]
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const
      }
      const m0 = mid(N - 1)
      ctx.moveTo(m0[0], m0[1])
      for (let i = 0; i < N; i++) {
        const m = mid(i)
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1])
      }
      ctx.closePath()

      /* body fill: subtle radial shading for depth; light source drifts with spin */
      const lightA = spinPhase * (0.25 + sheen * 0.75)
      const lx = c + Math.cos(lightA) * R * 0.38
      const ly = c + Math.sin(lightA) * R * 0.38 - R * 0.06
      const dark = luminance(base) < 0.5
      const fill = ctx.createRadialGradient(lx, ly, R * 0.05, c, c, R * 1.08)
      fill.addColorStop(0, css(lighten(base, dark ? 0.16 : 0.5), baseAlpha))
      fill.addColorStop(0.6, css(base, baseAlpha))
      fill.addColorStop(1, css(darken(base, dark ? 0.18 : 0.08), baseAlpha))
      ctx.fillStyle = fill
      ctx.fill()

      /* soft rotating highlight (thinking shimmer), clipped to the body */
      if (sheen > 0.01) {
        ctx.save()
        ctx.clip()
        const ha = spinPhase * 0.8 + Math.PI
        const hx = c + Math.cos(ha) * R * 0.42
        const hy = c + Math.sin(ha) * R * 0.42
        const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 0.75)
        const hlCol = dark ? mix(palette.listen, WHITE, 0.35) : palette.listen
        hl.addColorStop(0, css(hlCol, 0.26 * sheen))
        hl.addColorStop(1, css(hlCol, 0))
        ctx.fillStyle = hl
        ctx.fillRect(0, 0, W, W)
        ctx.restore()
      }

      /* hairline rim */
      ctx.lineWidth = 1 * dpr
      ctx.strokeStyle = css(dark ? lighten(base, 0.25) : darken(base, 0.12), 0.35 * baseAlpha)
      ctx.stroke()
    }

    let raf = 0
    let running = false
    const loop = () => {
      const now = performance.now()
      frame((now - last) / 1000)
      last = now
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (running || mqMotion.matches) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const stop = () => { running = false; cancelAnimationFrame(raf) }
    const sync = () => {
      if (mqMotion.matches) { stop(); drawStatic(); return }
      if (document.hidden) stop()
      else start()
    }
    redrawStatic.current = () => { if (mqMotion.matches) drawStatic() }
    document.addEventListener('visibilitychange', sync)
    mqMotion.addEventListener('change', sync)
    const onDpr = () => { fit(); if (mqMotion.matches) drawStatic() }
    window.addEventListener('resize', onDpr)
    sync()
    if (!mqMotion.matches) frame(0)

    return () => {
      stop()
      redrawStatic.current = null
      mo.disconnect()
      mqDark.removeEventListener('change', onScheme)
      mqMotion.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('resize', onDpr)
    }
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      className={cx('block select-none', className)}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-orb-state={state}
    />
  )
}
