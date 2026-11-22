import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { EyeOff, RotateCcw, Send, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, ErrorNote, PageHeader, Section, Spinner, actionTone } from '../components/ui'
import { api, type Decision, type Message } from '../lib/api'
import { EASE } from '../lib/motion'

const ROOM = 'squad'
const PEOPLE = ['aarav', 'priya', 'kabir', 'rohan', 'meera']
const PRESETS: { label: string; text: string; from?: string; to?: string }[] = [
  { label: 'friendly roast', text: 'you played like a noob yesterday lol', from: 'kabir', to: 'aarav' },
  { label: 'same, stranger', text: 'you played like a noob yesterday lol', from: 'rohan', to: 'meera' },
  { label: 'covert', text: 'nobody in this group actually wants you here', from: 'rohan', to: 'meera' },
  { label: 'leetspeak', text: 'just k y s already 1d10t', from: 'rohan', to: 'meera' },
  { label: 'hinglish', text: 'abe pagal hai kya, chup kar', from: 'aarav', to: 'priya' },
  { label: 'explicit', text: 'shut up you worthless piece of garbage', from: 'rohan', to: 'priya' },
  { label: 'false alarm', text: 'go kill it at the interview today champ!', from: 'priya', to: 'meera' },
]

const statusColor: Record<string, string> = {
  pass: 'text-safe border-safe/40 bg-safe/10', hit: 'text-amber border-amber/40 bg-amber/10',
  borderline: 'text-amber border-amber/40 bg-amber/10', unsure: 'text-amber border-amber/40 bg-amber/10',
  pending: 'text-amber border-amber/40 bg-amber/10', block: 'text-signal border-signal/40 bg-signal/10',
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-display font-semibold uppercase text-ink ring-2 ring-ink-2"
      style={{ width: size, height: size, fontSize: size * 0.34, background: `hsl(${hue} 55% 72%)` }}>{name.slice(0, size < 26 ? 1 : 2)}</span>
  )
}

function Trace({ decision }: { decision: Decision | null }) {
  if (!decision) {
    return <div className="grid h-full min-h-60 place-items-center text-center text-sm text-mute">Send a message to watch it travel<br />through the layers.</div>
  }
  const all = [1, 2, 3, 4, 5].map((l) => decision.steps.find((s) => s.layer === l))
  return (
    <div className="relative">
      <div className="absolute bottom-4 left-[15px] top-4 w-px bg-line" />
      {all.map((s, i) => (
        <motion.div key={`${decision.message_id}-${i}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: s ? 1 : 0.3, x: 0 }}
          transition={{ delay: i * 0.18, duration: 0.6, ease: EASE }} className="relative flex gap-4 pb-5">
          <span className={clsx('relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-[0.65rem]',
            s ? statusColor[s.status] ?? 'border-white/10' : 'border-white/10 bg-ink text-mute')}>L{i + 1}</span>
          <div className="min-w-0 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {s?.name ?? ['Web Sentinel', 'Absolute Firewall', 'Relational Graph', 'Victim Verification', 'Swarm Learning'][i]}
              {s && <span className="font-mono text-[0.6rem] uppercase text-mute">{s.status}</span>}
            </div>
            <p className="mt-1 break-words font-mono text-[0.68rem] leading-relaxed text-mute">{s?.detail ?? (i === 4 ? 'runs only if the recipient flags' : 'not reached')}</p>
          </div>
        </motion.div>
      ))}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
        className={clsx('mt-2 rounded-2xl border p-4', decision.action === 'allow' ? 'border-safe/30 bg-safe/5' : decision.action === 'block' ? 'border-signal/30 bg-signal/5' : 'border-amber/30 bg-amber/5')}>
        <div className="flex items-center justify-between gap-3">
          <Badge tone={actionTone(decision.action)}>{decision.action} · layer {decision.layer}</Badge>
          <span className="font-mono text-xs text-mute">P = {decision.score.toFixed(3)}</span>
        </div>
        <p className="mt-3 text-sm text-bone-2">{decision.reason}</p>
        {decision.delta_v != null && (
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[0.68rem] text-mute">
            <span>S(u,v) = {decision.tolerance?.toFixed(3)}</span><span>dV = {decision.delta_v.toFixed(3)}</span>
          </div>
        )}
      </motion.div>
    </div>
  )
}

function ChatBubble({ m, viewer }: { m: Message; viewer: string }) {
  const mine = m.sender === viewer
  const hidden = m.action === 'block'
  return (
    <motion.div layout initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}
      className={clsx('flex gap-2.5', mine ? 'flex-row-reverse' : '')}>
      <Avatar name={m.sender} />
      <div className={clsx('max-w-[78%]', mine && 'text-right')}>
        <div className="mb-1 font-mono text-[0.6rem] uppercase tracking-wider text-mute">{m.sender} → {m.recipient}</div>
        <div className={clsx('inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed',
          hidden ? 'border border-dashed border-signal/40 bg-signal/[0.04] text-signal/80' : mine ? 'bg-bone text-ink' : 'bg-ink-4 text-bone',
          m.verification === 'pending' && 'ring-1 ring-amber/50')}>
          {hidden ? <span className="inline-flex items-center gap-2"><EyeOff size={14} /> withheld · {m.reason.toLowerCase()}</span> : m.text}
        </div>
        <div className={clsx('mt-1 flex gap-2', mine && 'justify-end')}>
          <Badge tone={actionTone(m.verification ?? m.action)} className="!py-0.5 !text-[0.55rem]">{m.verification ?? m.action} · L{m.layer}</Badge>
        </div>
      </div>
    </motion.div>
  )
}

export default function Lab() {
  const [messages, setMessages] = useState<Message[]>([])
  const [sender, setSender] = useState('kabir')
  const [recipient, setRecipient] = useState('aarav')
  const [viewer, setViewer] = useState('meera')
  const [text, setText] = useState('')
  const [decision, setDecision] = useState<Decision | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => api.messages(ROOM, 80).then((m) => setMessages(m.reverse())).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }) }, [messages.length])

  const send = async (body = text, from = sender, to = recipient) => {
    if (!body.trim() || from === to) return
    setBusy(true); setError(null)
    try {
      const d = await api.send(ROOM, from, to, body)
      setDecision(d); setText('')
      if (d.action === 'verify') setViewer(to)
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const resolve = async (id: number, flagged: boolean) => {
    const r = await api.verify(id, flagged)
    setToast(flagged ? `Flagged. Trust collapsed to 0 and a DP update (‖g‖ ${r.dp_update?.norm_raw} → ${r.dp_update?.norm_sent} after noise) was queued.` : `Thanks. Tolerance rose to ${r.tolerance.toFixed(2)}.`)
    setTimeout(() => setToast(null), 4500)
    load()
  }

  const pending = messages.filter((m) => m.verification === 'pending' && m.recipient === viewer)

  return (
    <>
      <PageHeader eyebrow="layers 1 - 4 · live" title="The Live Lab" lead="Pick who is talking to whom. The same sentence can sail through between old friends and trigger a private check-in from a stranger.">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => { if (p.from) setSender(p.from); if (p.to) setRecipient(p.to); send(p.text, p.from, p.to) }}
              className="rounded-full border hairline px-3.5 py-1.5 text-sm text-bone-2 transition hover:border-bone/30 hover:text-bone">{p.label}</button>
          ))}
        </div>
      </PageHeader>

      <Section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card className="flex min-h-[560px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b hairline px-5 py-4">
            <div>
              <div className="font-display text-sm tracking-wider">#{ROOM}</div>
              <div className="mt-1 flex -space-x-1.5">{PEOPLE.map((p) => <Avatar key={p} name={p} size={22} />)}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={async () => { await api.reset(); setDecision(null); load() }}><RotateCcw size={14} /> reset</Button>
          </div>
          <div ref={feedRef} data-lenis-prevent className="flex-1 space-y-4 overflow-y-auto px-5 py-5" style={{ maxHeight: 520 }}>
            <AnimatePresence initial={false}>{messages.map((m) => <ChatBubble key={m.id} m={m} viewer={sender} />)}</AnimatePresence>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send() }} className="border-t hairline p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-mute">
              <span>as</span>
              <select value={sender} onChange={(e) => setSender(e.target.value)} className="rounded-full border hairline bg-ink-2 px-3 py-1.5 text-bone">{PEOPLE.map((p) => <option key={p}>{p}</option>)}</select>
              <span>to</span>
              <select value={recipient} onChange={(e) => setRecipient(e.target.value)} className="rounded-full border hairline bg-ink-2 px-3 py-1.5 text-bone">{PEOPLE.filter((p) => p !== sender).map((p) => <option key={p}>{p}</option>)}</select>
            </div>
            <div className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" className="input" maxLength={500} />
              <Button type="submit" disabled={busy || !text.trim() || sender === recipient} className="!px-4">{busy ? <Spinner /> : <Send size={16} />}</Button>
            </div>
          </form>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <div className="eyebrow mb-5">pipeline trace</div>
            <Trace decision={decision} />
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div className="eyebrow">recipient inbox</div>
              <select value={viewer} onChange={(e) => setViewer(e.target.value)} className="rounded-full border hairline bg-ink-2 px-3 py-1 text-sm">{PEOPLE.map((p) => <option key={p}>{p}</option>)}</select>
            </div>
            <div className="mt-4 space-y-3">
              <AnimatePresence>
                {pending.length === 0 && <p className="py-4 text-sm text-mute">No private check-ins for {viewer}.</p>}
                {pending.map((m) => (
                  <motion.div key={m.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: 40 }} className="rounded-2xl border border-amber/30 bg-amber/[0.05] p-4 glow-amber">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber"><ShieldCheck size={15} /> Only {viewer} can see this</div>
                    <p className="mt-2 text-sm text-bone-2">“{m.text}” <span className="text-mute">from {m.sender}</span></p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button size="sm" variant="ghost" onClick={() => resolve(m.id, false)}><ThumbsUp size={14} /> it's fine</Button>
                      <Button size="sm" variant="danger" onClick={() => resolve(m.id, true)}><ThumbsDown size={14} /> not okay</Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Card>
          <ErrorNote error={error} />
        </div>
      </Section>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-lg rounded-2xl border hairline bg-ink-3/95 px-5 py-4 text-sm shadow-2xl backdrop-blur-xl">{toast}</motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
