import { motion } from 'motion/react'
import { Layers, Lock, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, ErrorNote, PageHeader, Section, Spinner, Stat } from '../components/ui'
import { api, type FedPoint, type SwarmStatus } from '../lib/api'
import { AXIS, GRID, SIGMA_RAMP, TOOLTIP } from '../lib/chart'
import { EASE } from '../lib/motion'

function NoiseViz({ sigma }: { sigma: number }) {
  // 48 bars: the clipped update plus Gaussian noise -> what actually leaves the device
  const [seed, setSeed] = useState(0)
  useEffect(() => { const t = setInterval(() => setSeed((s) => s + 1), 1400); return () => clearInterval(t) }, [])
  const bars = Array.from({ length: 48 }, (_, i) => {
    const signal = Math.sin(i * 0.45) * 0.5 + Math.cos(i * 0.21) * 0.3
    const u = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453
    const noise = ((u - Math.floor(u)) - 0.5) * 2 * sigma * 0.6
    return { signal, sent: signal + noise }
  })
  return (
    <div className="flex h-32 items-center gap-[3px]">
      {bars.map((b, i) => (
        <div key={i} className="relative flex h-full flex-1 items-center">
          <motion.div className="absolute w-full rounded-full bg-bone/15" style={{ top: '50%' }} animate={{ height: Math.abs(b.signal) * 60, y: b.signal > 0 ? -Math.abs(b.signal) * 60 : 0 }} />
          <motion.div className="absolute w-full rounded-full bg-[#5598e7]" style={{ top: '50%' }}
            animate={{ height: Math.max(2, Math.abs(b.sent) * 60), y: b.sent > 0 ? -Math.abs(b.sent) * 60 : 0, opacity: 0.85 }}
            transition={{ duration: 0.9, ease: EASE }} />
        </div>
      ))}
    </div>
  )
}

export default function Swarm() {
  const [status, setStatus] = useState<SwarmStatus | null>(null)
  const [sigma, setSigma] = useState(1)
  const [rounds, setRounds] = useState(15)
  const [clients, setClients] = useState(20)
  const [hist, setHist] = useState<FedPoint[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => api.swarm().then(setStatus).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const run = async () => {
    setBusy(true); setError(null); setHist([])
    try {
      const r = await api.federate(sigma, rounds, clients)
      // replay rounds so the curve draws itself
      for (let i = 0; i < r.history.length; i++) {
        setHist(r.history.slice(0, i + 1))
        await new Promise((res) => setTimeout(res, 60))
      }
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const last = hist.at(-1)
  return (
    <>
      <PageHeader eyebrow="layer 5 · differentially private swarm" title="Learn from attacks. Never read the chat." lead="When a victim flags a message, their device computes a gradient, clips it to norm C and drowns it in Gaussian noise before anything is sent. The server only ever averages noise-covered updates." />

      <Section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6 md:p-8">
          <div className="flex items-center justify-between">
            <div className="eyebrow">what leaves the phone</div>
            <span className="font-mono text-xs text-mute">σ = {sigma.toFixed(1)}</span>
          </div>
          <div className="mt-6"><NoiseViz sigma={sigma} /></div>
          <div className="mt-3 flex gap-5 font-mono text-[0.62rem] uppercase tracking-wider text-mute">
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-bone/30" /> clipped gradient</span>
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#5598e7]" /> + N(0, σ²C²) sent</span>
          </div>
          <p className="mt-5 font-mono text-xs text-bone-2">g̃ = g / max(1, ‖g‖₂ / C) + N(0, σ²C²I)   (Eq. 8)</p>
        </Card>

        <Card className="p-6">
          <div className="eyebrow mb-4 flex items-center gap-2"><Layers size={12} /> live node</div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="dp packets" value={status?.total_updates ?? '-'} hint="from flagged messages" />
            <Stat label="pending" value={status?.pending ?? '-'} hint="waiting for FedAvg" tone={status?.pending ? 'amber' : undefined} />
            <Stat label="rounds" value={status?.round ?? '-'} />
            <Stat label="ε so far" value={status ? status.epsilon.toFixed(1) : '-'} hint={`σ=${status?.noise_multiplier}, δ=1e-5`} />
          </div>
          <Button className="mt-4 w-full" variant="ghost" disabled={!status?.pending} onClick={async () => { await api.aggregate(); load() }}>
            <Lock size={14} /> aggregate pending updates
          </Button>
          <p className="mt-3 text-xs text-mute">Flag a message in the Live Lab to create a packet.</p>
        </Card>
      </Section>

      <Section className="mt-5">
        <Card className="p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="eyebrow">federated simulation · 20k messages, non-IID clients</div>
              <h3 className="mt-3 font-display text-2xl md:text-3xl">Turn the privacy dial.</h3>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3 md:max-w-2xl">
              {[['noise σ', sigma, setSigma, 0, 3, 0.1], ['rounds', rounds, setRounds, 5, 40, 1], ['clients', clients, setClients, 5, 60, 1]].map(([label, val, set, min, max, step]) => (
                <label key={label as string} className="block">
                  <span className="eyebrow flex justify-between">{label as string}<b className="text-bone">{val as number}</b></span>
                  <input type="range" min={min as number} max={max as number} step={step as number} value={val as number}
                    onChange={(e) => (set as (n: number) => void)(+e.target.value)} className="mt-2 w-full accent-[#5598e7]" />
                </label>
              ))}
            </div>
            <Button onClick={run} disabled={busy}>{busy ? <Spinner /> : <Play size={15} />} run</Button>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_260px]">
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={hist} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="round" {...AXIS} tickLine={false} />
                  <YAxis domain={[0, 1]} {...AXIS} tickLine={false} />
                  <Tooltip {...TOOLTIP} />
                  <ReferenceLine y={0.5} stroke={GRID} />
                  <Line type="monotone" dataKey="f1" name="F1" stroke={SIGMA_RAMP[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="accuracy" name="accuracy" stroke={SIGMA_RAMP[0]} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <Stat label="F1" value={last ? last.f1.toFixed(3) : '-'} />
              <Stat label="accuracy" value={last ? last.accuracy.toFixed(3) : '-'} />
              <Stat label="privacy ε" value={last?.epsilon != null ? last.epsilon.toFixed(1) : sigma === 0 ? '∞' : '-'} hint="lower is more private" />
            </div>
          </div>
          <p className="mt-4 text-sm text-mute">Solid: F1 · dashed: accuracy. More noise means a smaller ε (stronger privacy) and a slower, noisier model - the trade-off every private system has to choose.</p>
          <ErrorNote error={error} />
        </Card>
      </Section>
    </>
  )
}
