import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, ErrorNote, PageHeader, Section } from '../components/ui'
import { api, type Edge, type GraphData } from '../lib/api'
import { EASE } from '../lib/motion'

type N = SimulationNodeDatum & { id: string }
const W = 820, H = 540

function edgeColor(e: Edge) {
  if (e.flags > 0 && e.tolerance < 0.05) return '#ff3b2f'
  if (e.tolerance >= 0.4) return '#3ee0c0'
  if (e.tolerance >= 0.2) return '#f5b942'
  return 'rgba(237,232,224,.35)'
}

function layout(data: GraphData) {
  const nodes: N[] = data.nodes.map((n) => ({ id: n.id }))
  const links = data.edges.map((e) => ({ source: e.src, target: e.dst }))
  const sim = forceSimulation(nodes)
    .force('link', forceLink(links).id((d) => (d as N).id).distance(230).strength(0.35))
    .force('charge', forceManyBody().strength(-1400))
    .force('x', forceX(W / 2).strength(0.045))
    .force('y', forceY(H / 2).strength(0.07))
    .force('center', forceCenter(W / 2, H / 2))
    .force('collide', forceCollide(80))
    .stop()
  for (let i = 0; i < 300; i++) sim.tick()
  const pad = 60
  nodes.forEach((n) => { n.x = Math.max(pad, Math.min(W - pad, n.x!)); n.y = Math.max(pad, Math.min(H - pad, n.y!)) })
  return Object.fromEntries(nodes.map((n) => [n.id, n]))
}

function curve(a: N, b: N) {
  const dx = b.x! - a.x!, dy = b.y! - a.y!
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len
  const off = 26
  const mx = (a.x! + b.x!) / 2 + nx * off, my = (a.y! + b.y!) / 2 + ny * off
  const r = 30
  const sx = a.x! + (dx / len) * r, sy = a.y! + (dy / len) * r
  const ex = b.x! - (dx / len) * (r + 6), ey = b.y! - (dy / len) * (r + 6)
  return { d: `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`, lx: mx, ly: my }
}

export default function Graph() {
  const [room, setRoom] = useState('squad')
  const [data, setData] = useState<GraphData | null>(null)
  const [sel, setSel] = useState<Edge | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => api.graph(room).then((d) => { setData(d); setError(null) }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [room]) // eslint-disable-line react-hooks/exhaustive-deps
  const pos = useMemo(() => (data ? layout(data) : {}), [data?.nodes.length, data?.edges.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (tol: number) => {
    if (!sel) return
    const d = await api.setEdge(room, sel.src, sel.dst, tol)
    setData(d)
    setSel(d.edges.find((e) => e.src === sel.src && e.dst === sel.dst) ?? null)
  }

  return (
    <>
      <PageHeader eyebrow="layer 3 · relational memory" title="Who tolerates what, from whom." lead="Each arrow is S(u, v): how much rough language v has accepted from u. It grows slowly with confirmed banter and collapses to zero the moment v says “not okay”." />
      <Section className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden p-2 md:p-4">
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="eyebrow">room</span>
            <input value={room} onChange={(e) => setRoom(e.target.value.trim() || 'squad')} className="w-36 rounded-full border hairline bg-ink-2 px-3 py-1 text-right font-mono text-xs" />
          </div>
          {data && data.nodes.length === 0 && <p className="p-10 text-center text-mute">No interactions in “{room}” yet. Send messages from the Live Lab.</p>}
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            <defs>
              {['#3ee0c0', '#f5b942', '#ff3b2f', 'rgba(237,232,224,.35)'].map((c, i) => (
                <marker key={i} id={`arrow${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={c} /></marker>
              ))}
              <radialGradient id="nodeGlow"><stop offset="0%" stopColor="#ff3b2f" stopOpacity=".35" /><stop offset="100%" stopColor="#ff3b2f" stopOpacity="0" /></radialGradient>
            </defs>
            {data?.edges.map((e, i) => {
              const a = pos[e.src], b = pos[e.dst]
              if (!a || !b) return null
              const { d, lx, ly } = curve(a, b)
              const color = edgeColor(e)
              const mi = ['#3ee0c0', '#f5b942', '#ff3b2f'].indexOf(color)
              const active = sel?.src === e.src && sel?.dst === e.dst
              return (
                <g key={`${e.src}-${e.dst}`} onClick={() => setSel(e)} className="cursor-pointer">
                  <path d={d} stroke="transparent" strokeWidth={18} fill="none" />
                  <motion.path d={d} fill="none" stroke={color} strokeWidth={1.2 + Math.min(e.interactions, 12) * 0.25 + (active ? 1.5 : 0)}
                    markerEnd={`url(#arrow${mi < 0 ? 3 : mi})`} strokeDasharray="6 6"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1, strokeDashoffset: [0, -24] }}
                    transition={{ pathLength: { duration: 1.2, delay: i * 0.05, ease: EASE }, opacity: { duration: 0.4 }, strokeDashoffset: { repeat: Infinity, duration: 1.4, ease: 'linear' } }}
                    style={{ filter: active ? `drop-shadow(0 0 6px ${color})` : undefined }} />
                  <text x={lx} y={ly} textAnchor="middle" className="fill-bone-2 font-mono text-[11px]">{e.tolerance.toFixed(2)}</text>
                </g>
              )
            })}
            {Object.values(pos).map((n, i) => (
              <motion.g key={n.id} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.06, type: 'spring', stiffness: 200, damping: 18 }} style={{ originX: `${n.x}px`, originY: `${n.y}px` }}>
                <circle cx={n.x} cy={n.y} r={52} fill="url(#nodeGlow)" opacity={data?.edges.some((e) => e.dst === n.id && e.flags > 0) ? 1 : 0} />
                <circle cx={n.x} cy={n.y} r={28} className="fill-ink-3 stroke-bone/20" strokeWidth={1} />
                <text x={n.x} y={n.y! + 4} textAnchor="middle" className="fill-bone font-display text-[11px] font-medium">{n.id}</text>
              </motion.g>
            ))}
          </svg>
          <div className="flex flex-wrap gap-4 px-3 pb-3 font-mono text-[0.62rem] uppercase tracking-wider text-mute">
            <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-safe" />S ≥ 0.4 banter-safe</span>
            <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-amber" />building trust</span>
            <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-bone/40" />stranger</span>
            <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-signal" />collapsed by victim</span>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <div className="eyebrow mb-4">selected edge</div>
            {sel ? (
              <motion.div key={`${sel.src}${sel.dst}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="font-display text-2xl">{sel.src} <span className="text-mute">→</span> {sel.dst}</div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><div className="eyebrow">S(u,v)</div><div className="mt-1 font-mono text-lg">{sel.tolerance.toFixed(3)}</div></div>
                  <div><div className="eyebrow">messages</div><div className="mt-1 font-mono text-lg">{sel.interactions}</div></div>
                  <div><div className="eyebrow">flags</div><div className="mt-1 font-mono text-lg">{sel.flags}</div></div>
                </div>
                <label className="eyebrow mt-6 block">override tolerance (demo)</label>
                <input type="range" min={0} max={1} step={0.01} defaultValue={sel.tolerance} onMouseUp={(e) => update(+(e.target as HTMLInputElement).value)} onTouchEnd={(e) => update(+(e.target as HTMLInputElement).value)} className="mt-3 w-full accent-[#3ee0c0]" />
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => update(0.65)}>make friends</Button>
                  <Button size="sm" variant="ghost" onClick={() => update(0.1)}>make strangers</Button>
                </div>
              </motion.div>
            ) : <p className="text-sm text-mute">Click an arrow to inspect it.</p>}
          </Card>
          <Card className="p-6">
            <div className="eyebrow mb-4">the maths</div>
            <div className="space-y-3 font-mono text-xs leading-relaxed text-bone-2">
              <p><Badge tone="verify">Eq. 5</Badge> dV = P − S(u,v)</p>
              <p><Badge tone="allow">Eq. 6</Badge> S ← αS + (1 − α)P, α = 0.85</p>
              <p><Badge tone="block">Eq. 7</Badge> victim flags ⇒ S → 0</p>
              <p className="pt-2 font-sans text-sm text-mute">dV ≤ 0.15 deliver · 0.15 – 0.50 ask recipient · &gt; 0.50 block as covert attack.</p>
            </div>
          </Card>
          <ErrorNote error={error} />
        </div>
      </Section>
    </>
  )
}
