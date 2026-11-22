import { useEffect, useRef } from 'react'

type Node = { x: number; y: number; z: number; vx: number; vy: number; vz: number; hot: number }
type Pulse = { a: number; b: number; t: number }

/**
 * Hero canvas: a slowly rotating constellation around a red core.
 * Edges connect nearby nodes; "pulses" travel along edges like messages in a
 * network, and nodes flare red when a pulse reaches them. `progress` (0..1,
 * from scroll) pushes the network apart and dims it.
 */
export default function SignalField({ progress = 0, className = '' }: { progress?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const progressRef = useRef(progress)
  progressRef.current = progress

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, dpr = 1, raf = 0
    const pointer = { x: -9999, y: -9999, active: false }

    const isSmall = () => window.innerWidth < 768
    const count = isSmall() ? 60 : 120
    const nodes: Node[] = Array.from({ length: count }, () => {
      const r = 0.25 + Math.random() * 0.75
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      return {
        x: r * Math.sin(ph) * Math.cos(th), y: r * Math.sin(ph) * Math.sin(th), z: r * Math.cos(ph),
        vx: (Math.random() - 0.5) * 0.0006, vy: (Math.random() - 0.5) * 0.0006, vz: (Math.random() - 0.5) * 0.0006,
        hot: 0,
      }
    })
    const pulses: Pulse[] = []

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true
    }
    const onLeave = () => { pointer.active = false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerleave', onLeave)

    let angle = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(now - last, 50); last = now
      const p = progressRef.current
      ctx.clearRect(0, 0, w, h)

      const cx = w * (isSmall() ? 0.5 : 0.74)
      const cy = h * (isSmall() ? 0.3 : 0.5)
      const scale = Math.min(w, h) * (isSmall() ? 0.55 : 0.48) * (1 + p * 1.4)
      angle += reduce ? 0 : dt * 0.00006
      const cos = Math.cos(angle), sin = Math.sin(angle)
      const tilt = 0.35 + (pointer.active ? (pointer.y / h - 0.5) * 0.3 : 0)
      const ct = Math.cos(tilt), st = Math.sin(tilt)

      // project
      const proj = nodes.map((n) => {
        if (!reduce) {
          n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt
          const d = Math.hypot(n.x, n.y, n.z)
          if (d > 1 || d < 0.2) { n.vx *= -1; n.vy *= -1; n.vz *= -1 }
        }
        n.hot = Math.max(0, n.hot - dt * 0.0012)
        const x1 = n.x * cos - n.z * sin
        const z1 = n.x * sin + n.z * cos
        const y1 = n.y * ct - z1 * st
        const z2 = n.y * st + z1 * ct
        const persp = 1 / (1.9 - z2)
        let sx = cx + x1 * scale * persp
        let sy = cy + y1 * scale * persp
        if (pointer.active) {
          const dx = sx - pointer.x, dy = sy - pointer.y
          const dist = Math.hypot(dx, dy)
          if (dist < 140) { const f = (1 - dist / 140) * 18; sx += (dx / (dist || 1)) * f; sy += (dy / (dist || 1)) * f }
        }
        return { sx, sy, depth: persp, n }
      })

      const fade = 1 - p * 0.85
      const maxDist = Math.min(w, h) * (isSmall() ? 0.16 : 0.13)

      // edges
      const links: [number, number][] = []
      for (let i = 0; i < proj.length; i++) {
        for (let j = i + 1; j < proj.length; j++) {
          const a = proj[i], b = proj[j]
          const d = Math.hypot(a.sx - b.sx, a.sy - b.sy)
          if (d < maxDist) {
            links.push([i, j])
            const heat = Math.max(a.n.hot, b.n.hot)
            const alpha = (1 - d / maxDist) * 0.22 * fade * Math.min(a.depth, b.depth) * 1.6
            ctx.strokeStyle = heat > 0.05 ? `rgba(255,59,47,${alpha + heat * 0.35})` : `rgba(237,232,224,${alpha})`
            ctx.lineWidth = 0.7
            ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
          }
        }
      }

      // pulses travel along random edges
      if (!reduce && links.length && Math.random() < 0.08 && pulses.length < 14) {
        const [a, b] = links[(Math.random() * links.length) | 0]
        pulses.push({ a, b, t: 0 })
      }
      for (let k = pulses.length - 1; k >= 0; k--) {
        const pl = pulses[k]
        pl.t += dt * 0.0016
        const A = proj[pl.a], B = proj[pl.b]
        if (pl.t >= 1) { B.n.hot = 1; pulses.splice(k, 1); continue }
        const x = A.sx + (B.sx - A.sx) * pl.t, y = A.sy + (B.sy - A.sy) * pl.t
        const g = ctx.createRadialGradient(x, y, 0, x, y, 10)
        g.addColorStop(0, `rgba(255,90,70,${0.9 * fade})`); g.addColorStop(1, 'rgba(255,59,47,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill()
      }

      // nodes
      for (const { sx, sy, depth, n } of proj) {
        const r = 0.6 + depth * 1.6
        ctx.fillStyle = n.hot > 0.05 ? `rgba(255,${80 - n.hot * 40},${60 - n.hot * 30},${0.6 + n.hot * 0.4})` : `rgba(237,232,224,${0.45 * fade * depth * 1.4})`
        ctx.beginPath(); ctx.arc(sx, sy, r + n.hot * 2.2, 0, Math.PI * 2); ctx.fill()
      }

      // core
      const t = now * 0.0018
      const pulse = reduce ? 0.5 : (Math.sin(t) + 1) / 2
      const coreR = 6 + pulse * 2
      for (let ring = 0; ring < 3; ring++) {
        const rr = ((t * 22 + ring * 40) % 120)
        ctx.strokeStyle = `rgba(255,59,47,${(1 - rr / 120) * 0.35 * fade})`
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(cx, cy, coreR + rr, 0, Math.PI * 2); ctx.stroke()
      }
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120)
      halo.addColorStop(0, `rgba(255,59,47,${0.55 * fade})`)
      halo.addColorStop(0.25, `rgba(255,59,47,${0.12 * fade})`)
      halo.addColorStop(1, 'rgba(255,59,47,0)')
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = `rgba(255,120,100,${fade})`
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 0.6, 0, Math.PI * 2); ctx.fill()

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} className={`h-full w-full ${className}`} aria-hidden />
}
