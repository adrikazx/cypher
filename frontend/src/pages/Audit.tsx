import clsx from 'clsx'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Card, ErrorNote, PageHeader, Section, Stat, actionTone } from '../components/ui'
import { api, type Message } from '../lib/api'

const FILTERS = ['all', 'allow', 'verify', 'block'] as const

export default function Audit() {
  const [rows, setRows] = useState<Message[]>([])
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api.messages(undefined, 300).then(setRows).catch((e) => setError(e.message)) }, [])
  const shown = useMemo(() => rows.filter((r) => filter === 'all' || r.action === filter || (filter === 'verify' && r.verification)), [rows, filter])
  const count = (a: string) => rows.filter((r) => r.action === a).length

  return (
    <>
      <PageHeader eyebrow="accountability" title="Every decision, with its reason." lead="An auditable trail for moderators and appeals: which layer acted, the score it saw, and the relationship context at that moment." />
      <Section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="processed" value={rows.length} />
        <Stat label="delivered" value={count('allow')} tone="safe" />
        <Stat label="asked recipient" value={rows.filter((r) => r.verification).length} tone="amber" />
        <Stat label="blocked" value={count('block')} tone="signal" />
      </Section>

      <Section className="mt-5">
        <Card className="p-2 md:p-4">
          <div className="flex flex-wrap gap-2 p-3">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={clsx('relative rounded-full px-4 py-1.5 text-sm transition', filter === f ? 'text-ink' : 'text-bone-2 hover:text-bone')}>
                {filter === f && <motion.span layoutId="audit-filter" className="absolute inset-0 rounded-full bg-bone" />}
                <span className="relative">{f}</span>
              </button>
            ))}
          </div>
          <div className="divide-y divide-[rgb(237_232_224/0.06)]">
            {shown.length === 0 && <p className="p-8 text-center text-mute">Nothing here yet.</p>}
            {shown.map((r) => (
              <button key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} className="block w-full px-3 py-4 text-left transition hover:bg-white/[0.02] md:px-4">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 md:grid-cols-[60px_180px_1fr_auto_auto]">
                  <span className="font-mono text-xs text-mute">#{r.id}</span>
                  <span className="truncate font-mono text-xs text-bone-2">{r.sender} → {r.recipient}</span>
                  <span className={clsx('col-span-3 truncate text-sm md:col-span-1', r.action === 'block' && 'text-mute line-through decoration-signal/60')}>{r.text}</span>
                  <span className="hidden font-mono text-xs text-mute md:inline">P {r.score.toFixed(2)}</span>
                  <Badge tone={actionTone(r.verification ?? r.action)} className="hidden md:inline-flex">{r.verification ?? r.action} · L{r.layer}</Badge>
                </div>
                {open === r.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 grid gap-2 rounded-xl bg-ink-2 p-4 font-mono text-xs text-bone-2 sm:grid-cols-2 lg:grid-cols-4">
                    <span>room: {r.room}</span><span>reason: {r.reason}</span>
                    <span>S(u,v): {r.tolerance?.toFixed(3) ?? '-'}</span><span>dV: {r.delta_v?.toFixed(3) ?? '-'}</span>
                    <span className="sm:col-span-2 lg:col-span-4 text-mute">{new Date(r.created_at).toLocaleString()}</span>
                  </motion.div>
                )}
              </button>
            ))}
          </div>
        </Card>
        <div className="mt-4"><ErrorNote error={error} /></div>
      </Section>
    </>
  )
}
