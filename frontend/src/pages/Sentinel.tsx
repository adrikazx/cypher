import { AnimatePresence, motion } from 'motion/react'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, ErrorNote, PageHeader, Section } from '../components/ui'
import { api, type SlangTerm } from '../lib/api'

function daysLeft(lastSeen: string, ttl: number) {
  const age = (Date.now() - new Date(lastSeen).getTime()) / 86_400_000
  return Math.max(0, ttl - age)
}

export default function Sentinel() {
  const [terms, setTerms] = useState<SlangTerm[]>([])
  const [ttl, setTtl] = useState(60)
  const [term, setTerm] = useState('')
  const [sev, setSev] = useState(0.6)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const load = () => api.sentinel().then((r) => { setTerms(r.terms); setTtl(r.ttl_days) }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const add = async () => {
    if (term.trim().length < 2) return
    const r = await api.addTerm(term.trim(), sev)
    setTerms(r.terms); setTerm(''); setNote(`“${term.trim()}” is now active for ${r.ttl_days} days.`)
  }
  const shown = terms.filter((t) => t.term.includes(q.toLowerCase()))

  return (
    <>
      <PageHeader eyebrow="layer 1 · web sentinel" title="Slang has a shelf life." lead="Coded abuse appears overnight and dies just as fast. Every term carries the date it was last seen; anything quiet for longer than the TTL window is purged." />
      <Section className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-5">
          <Card className="p-6">
            <div className="eyebrow mb-4">observe a new term</div>
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. unalive" className="input" maxLength={60} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <label className="eyebrow mt-5 flex justify-between">severity <b className="text-bone">{sev.toFixed(2)}</b></label>
            <input type="range" min={0.1} max={1} step={0.05} value={sev} onChange={(e) => setSev(+e.target.value)} className="mt-2 w-full accent-[#ff3b2f]" />
            <p className="mt-2 text-xs text-mute">≥ 0.90 is treated as explicit and blocked at layer 2; lower values nudge the model score upward.</p>
            <Button className="mt-5 w-full" onClick={add} disabled={term.trim().length < 2}><Plus size={15} /> add to cache</Button>
            {note && <p className="mt-3 text-sm text-safe">{note}</p>}
          </Card>
          <Card className="p-6">
            <div className="eyebrow">eviction policy</div>
            <p className="mt-3 font-mono text-sm text-bone-2">C_active = {'{'} wᵢ | t_now − tᵢ ≤ {ttl} days {'}'}</p>
            <Button variant="ghost" className="mt-5 w-full" onClick={async () => { const r = await api.purge(); setNote(`Purged ${r.removed} expired term(s).`); load() }}>
              <Trash2 size={15} /> run purge now
            </Button>
          </Card>
          <ErrorNote error={error} />
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="eyebrow">active cache · {terms.length} terms</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter" className="w-36 rounded-full border hairline bg-ink-2 px-3 py-1 text-sm" />
          </div>
          <div className="mt-5 divide-y divide-[rgb(237_232_224/0.06)]" data-lenis-prevent>
            <AnimatePresence initial={false}>
              {shown.map((t, i) => {
                const left = daysLeft(t.last_seen, ttl)
                return (
                  <motion.div key={t.term} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i, 20) * 0.015 }}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 sm:grid-cols-[1.2fr_1fr_auto]">
                    <span className="font-mono text-sm">{t.term}</span>
                    <div className="order-3 col-span-2 flex items-center gap-3 sm:order-none sm:col-span-1">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                        <motion.div className="h-full rounded-full bg-gradient-to-r from-amber to-signal" initial={{ width: 0 }} animate={{ width: `${t.severity * 100}%` }} transition={{ duration: 0.8 }} />
                      </div>
                      <span className="w-10 text-right font-mono text-xs text-mute">{t.severity.toFixed(2)}</span>
                    </div>
                    <Badge tone={t.source === 'seed' ? 'neutral' : 'verify'}>{Math.round(left)}d left</Badge>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </Card>
      </Section>
    </>
  )
}
