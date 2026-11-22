import clsx from 'clsx'
import { motion, useInView, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import { ArrowRight, ArrowUpRight, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SignalField from '../components/SignalField'
import { Button, Section } from '../components/ui'
import { api, type Results } from '../lib/api'
import { CountUp, EASE, Magnetic, Reveal, SplitText } from '../lib/motion'

const LAYERS = [
  { n: '01', name: 'Web Sentinel', tag: 'zero-day slang', eq: 'C_active = { w | t_now - t_w <= TTL }',
    body: 'A time-to-live cache of coded abuse - "kys", "unalive", "1d10t", Hinglish slurs. Terms that stop appearing in the wild are evicted after 60 days, so the list never bloats.' },
  { n: '02', name: 'Absolute Firewall', tag: 'transformer + CNN', eq: 'y = softmax(W [CLS ; maxpool(conv(E))])',
    body: 'A multilingual transformer reads the context, a 1-D CNN catches aggressive n-grams. Anything above tau = 0.85 is blocked instantly - no context can excuse it.' },
  { n: '03', name: 'Relational Graph', tag: 'per-room memory', eq: 'dV = P - S(u,v);  S <- aS + (1-a)P',
    body: 'Every chat keeps its own directed graph of who tolerates what from whom. Years of trash talk between friends raise the baseline; a stranger starts near zero.' },
  { n: '04', name: 'Victim Verification', tag: 'asymmetric prompt', eq: 'flag => S(u,v) -> 0',
    body: 'When intent is ambiguous, only the recipient sees a quiet check-in. One tap collapses trust. The sender never learns they were reported - no retaliation, no gaslighting.' },
  { n: '05', name: 'Swarm Learning', tag: 'DP federated', eq: 'g~ = clip(g, C) + N(0, s^2 C^2)',
    body: 'A confirmed attack becomes a clipped, noised gradient. Devices pool knowledge through FedAvg; the message itself never leaves the phone.' },
]

const SLANG = ['kys', 'unalive yourself', '1d10t', 'ratioed', 'bkl', 'touch grass', 'no one would miss you', 'aukat', 'ki11', 'npc', 'leave the group', 'chutiya']

function Hero({ stats }: { stats: { f1?: number; auc?: number; fpCut?: number } }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const [p, setP] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', setP)
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '35%'])
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])

  return (
    <div ref={ref} className="relative h-[100svh] min-h-[640px] overflow-hidden">
      <div className="absolute inset-0"><SignalField progress={p} /></div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_60%,transparent_20%,#08070a_75%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />

      <motion.div style={{ y, opacity }} className="relative mx-auto flex h-full max-w-7xl flex-col justify-end px-5 pb-16 pt-28 md:justify-center md:px-10 md:pb-6 md:pt-32">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 1 }} className="eyebrow mb-6 flex items-center gap-3">
          <span className="h-px w-8 bg-signal" /> context-aware digital safety
        </motion.p>
        <h1 className="max-w-4xl font-display text-[clamp(3rem,8.6vw,7.8rem)] font-medium leading-[0.9] tracking-[-0.05em]">
          <SplitText text="Same words." delay={0.4} />
          <br />
          <span className="font-serif font-normal italic tracking-[-0.02em] text-signal"><SplitText text="Different intent." delay={0.7} /></span>
        </h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 1, ease: EASE }}
          className="mt-7 max-w-xl text-base leading-relaxed text-bone-2 md:text-lg">
          CYPHER tells banter from bullying by remembering relationships, asking the person on the receiving end,
          and learning across devices without ever reading their chats.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, duration: 1, ease: EASE }} className="mt-9 flex flex-wrap gap-3">
          <Magnetic><Link to="/lab"><Button>Open the live lab <ArrowRight size={16} /></Button></Link></Magnetic>
          <Link to="/results"><Button variant="ghost">See the evidence</Button></Link>
        </motion.div>

        <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8, duration: 1 }}
          className="mt-14 hidden max-w-xl grid-cols-3 gap-6 border-t hairline pt-6 md:grid">
          {[
            ['test F1', stats.f1 != null ? <CountUp value={stats.f1} decimals={3} /> : '-'],
            ['ROC-AUC', stats.auc != null ? <CountUp value={stats.auc} decimals={3} /> : '-'],
            ['false bans cut', stats.fpCut != null ? <CountUp value={stats.fpCut * 100} decimals={0} suffix="%" /> : '-'],
          ].map(([k, v]) => (
            <div key={k as string}><dt className="eyebrow">{k}</dt><dd className="mt-2 font-display text-3xl font-medium tracking-tight tabular-nums">{v}</dd></div>
          ))}
        </motion.dl>
      </motion.div>

      <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2.4 }} className="absolute bottom-6 right-6 hidden items-center gap-3 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-mute md:flex">
        scroll <span className="h-10 w-px bg-gradient-to-b from-bone/50 to-transparent" />
      </motion.div>
    </div>
  )
}

function Marquee() {
  const row = [...SLANG, ...SLANG]
  return (
    <div className="relative overflow-hidden border-y hairline py-6 mask-fade-x">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
        {row.map((s, i) => (
          <span key={i} className={clsx('flex items-center gap-10 text-3xl md:text-5xl', i % 2 ? 'font-serif text-bone-2' : 'font-display text-outline')}>
            <span className="relative">{s}<span className="absolute left-0 top-1/2 h-[2px] w-full origin-left bg-signal/70" /></span>
            <span className="h-2 w-2 rounded-full bg-signal/60" />
          </span>
        ))}
      </div>
    </div>
  )
}

function Bubble({ who, meta, tone, x, opacity, verdict }: { who: string; meta: string; tone: 'safe' | 'signal'; x: MotionValue<string>; opacity: MotionValue<number>; verdict: string }) {
  return (
    <motion.div style={{ x, y: '-50%' }} className="absolute left-1/2 top-1/2 w-[min(82vw,380px)]">
      <motion.div style={{ opacity }} className="mb-3 flex items-center justify-between font-mono text-[0.62rem] uppercase tracking-wider text-mute">
        <span>{who}</span><span>{meta}</span>
      </motion.div>
      <div className="rounded-[26px] rounded-bl-md border hairline bg-ink-3 px-6 py-5 text-xl shadow-[0_40px_80px_-30px_rgba(0,0,0,.9)] md:text-2xl">
        you played like a noob yesterday lol
      </div>
      <motion.div style={{ opacity }} className={clsx('mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider',
        tone === 'safe' ? 'bg-safe/10 text-safe glow-safe' : 'bg-amber/10 text-amber glow-amber')}>
        {verdict}
      </motion.div>
    </motion.div>
  )
}

function BanterParadox() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [wide, setWide] = useState(true)
  useEffect(() => {
    const f = () => setWide(window.innerWidth >= 768)
    f(); window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const spread = wide ? 52 : 0
  const leftX = useTransform(scrollYProgress, [0.15, 0.5], ['-50%', `${-50 - spread}%`])
  const rightX = useTransform(scrollYProgress, [0.15, 0.5], ['-50%', `${-50 + spread}%`])
  const leftY = useTransform(scrollYProgress, [0.15, 0.5], ['0%', wide ? '0%' : '-62%'])
  const rightY = useTransform(scrollYProgress, [0.15, 0.5], ['0%', wide ? '0%' : '62%'])
  const meta = useTransform(scrollYProgress, [0.45, 0.6], [0, 1])
  const titleOpacity = useTransform(scrollYProgress, [0, 0.12, 0.8, 1], [0, 1, 1, 0.3])
  const caption = useTransform(scrollYProgress, [0.62, 0.75], [0, 1])

  return (
    <div ref={ref} className="relative h-[280vh]">
      <div className="sticky top-0 flex h-[100svh] flex-col overflow-hidden">
        <motion.div style={{ opacity: titleOpacity }} className="mx-auto w-full max-w-7xl px-5 pt-28 md:px-10">
          <p className="eyebrow">the banter paradox</p>
          <h2 className="mt-4 max-w-3xl font-display text-[clamp(1.8rem,4.5vw,3.6rem)] leading-[1] tracking-[-0.03em]">
            A keyword filter sees the same sentence <span className="font-serif font-normal italic tracking-[-0.01em] text-bone-2">twice.</span>
          </h2>
        </motion.div>
        <div className="relative flex-1">
          <motion.div style={{ y: leftY }} className="absolute inset-0">
            <Bubble who="kabir -> aarav" meta="3 yrs of banter / S = 0.62" tone="safe" x={leftX} opacity={meta} verdict="L3 · within tolerance · delivered" />
          </motion.div>
          <motion.div style={{ y: rightY }} className="absolute inset-0">
            <Bubble who="unknown -> meera" meta="first contact / S = 0.10" tone="signal" x={rightX} opacity={meta} verdict="L4 · meera is asked privately" />
          </motion.div>
        </div>
        <motion.p style={{ opacity: caption }} className="mx-auto mb-10 max-w-xl px-5 text-center font-serif text-xl text-bone-2 md:text-2xl">
          CYPHER sees two relationships.
        </motion.p>
      </div>
    </div>
  )
}

function LayerStack({ active }: { active: number }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px] [perspective:1400px]">
      <div className="absolute inset-0 [transform-style:preserve-3d] [transform:rotateX(58deg)_rotateZ(-38deg)]">
        {LAYERS.map((l, i) => {
          const on = i === active
          const passed = i < active
          return (
            <motion.div
              key={l.n}
              className={clsx('absolute inset-[14%] grid place-items-center rounded-[28px] border backdrop-blur-sm',
                on ? 'border-signal/70 bg-signal/[0.12]' : passed ? 'border-bone/20 bg-white/[0.03]' : 'border-bone/10 bg-white/[0.015]')}
              animate={{ z: (4 - i) * 46 - (on ? -18 : 0), opacity: on ? 1 : passed ? 0.55 : 0.8,
                boxShadow: on ? '0 0 80px -10px rgba(255,59,47,.55), inset 0 0 40px rgba(255,59,47,.15)' : '0 20px 40px -20px rgba(0,0,0,.8)' }}
              transition={{ duration: 0.8, ease: EASE }}
            >
              <span className={clsx('font-display text-5xl font-semibold', on ? 'text-signal' : 'text-bone/15')}>{l.n}</span>
            </motion.div>
          )
        })}
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,59,47,.12),transparent_60%)] blur-2xl" />
    </div>
  )
}

function LayerBlock({ layer, index, onActive }: { layer: (typeof LAYERS)[number]; index: number; onActive: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-45% 0px -45% 0px' })
  useEffect(() => { if (inView) onActive(index) }, [inView, index, onActive])
  return (
    <div ref={ref} className="flex min-h-[70vh] flex-col justify-center py-10 md:min-h-[85vh]">
      <Reveal>
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-signal">{layer.n}</span>
          <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
          <span className="eyebrow">{layer.tag}</span>
        </div>
        <h3 className="mt-6 font-display text-[clamp(2rem,4vw,3.4rem)] leading-none tracking-[-0.03em]">{layer.name}</h3>
        <p className="mt-6 max-w-lg font-serif text-xl leading-snug text-bone-2 md:text-2xl">{layer.body}</p>
        <code className="mt-8 inline-block rounded-xl border hairline bg-ink-2 px-4 py-3 font-mono text-xs text-bone-2 md:text-sm">{layer.eq}</code>
      </Reveal>
    </div>
  )
}

function Layers() {
  const [active, setActive] = useState(0)
  return (
    <Section className="relative">
      <div className="pt-24">
        <p className="eyebrow">architecture</p>
        <h2 className="mt-4 max-w-3xl font-display text-[clamp(2rem,5vw,4rem)] leading-[0.98] tracking-[-0.03em]">
          Five layers. <span className="font-serif font-normal italic tracking-[-0.01em] text-bone-2">Each one only speaks when the last one is unsure.</span>
        </h2>
      </div>
      <div className="grid gap-10 md:grid-cols-2">
        <div className="sticky top-16 z-10 h-[42vh] md:top-0 md:h-[100svh]">
          <div className="flex h-full items-center bg-gradient-to-b from-ink via-ink/90 to-transparent md:bg-none">
            <LayerStack active={active} />
          </div>
        </div>
        <div>
          {LAYERS.map((l, i) => <LayerBlock key={l.n} layer={l} index={i} onActive={setActive} />)}
        </div>
      </div>
    </Section>
  )
}

function PrivatePrompt() {
  const [choice, setChoice] = useState<null | 'ok' | 'flag'>(null)
  return (
    <Section className="mt-24 grid items-center gap-16 md:grid-cols-2">
      <div>
        <Reveal><p className="eyebrow">asymmetric verification</p></Reveal>
        <h2 className="mt-4 font-display text-[clamp(2rem,4.6vw,3.8rem)] leading-[0.98] tracking-[-0.03em]">
          <SplitText text="The person who was hurt gets the final word." />
        </h2>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-bone-2">
            No moderator queue, no public report button. The recipient alone sees this card. The sender's screen does not change either way.
          </p>
        </Reveal>
      </div>
      <Reveal delay={0.1} className="flex justify-center">
        <motion.div whileHover={{ rotateY: -6, rotateX: 4 }} transition={{ type: 'spring', stiffness: 120 }} className="relative w-[300px] rounded-[46px] border border-white/10 bg-ink-2 p-3 shadow-[0_60px_120px_-40px_rgba(255,59,47,.35),0_40px_80px_-30px_rgba(0,0,0,.9)] [transform-style:preserve-3d]">
          <div className="rounded-[36px] bg-ink-3 p-5">
            <div className="mx-auto mb-6 h-5 w-24 rounded-full bg-ink" />
            <div className="eyebrow mb-3">meera · squad chat</div>
            <div className="w-[85%] rounded-2xl rounded-bl-sm bg-ink-4 px-4 py-3 text-sm">nobody actually wants you in this group</div>
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.6, duration: 0.8, ease: EASE }}
              className="mt-5 rounded-2xl border border-amber/30 bg-amber/[0.06] p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-amber"><ShieldCheck size={16} /> Only you can see this</div>
              <p className="mt-2 text-sm text-bone-2">Was that message okay with you?</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => setChoice('ok')} className={clsx('flex items-center justify-center gap-2 rounded-xl border py-2 text-sm transition', choice === 'ok' ? 'border-safe bg-safe/15 text-safe' : 'hairline hover:bg-white/5')}><ThumbsUp size={14} /> It's fine</button>
                <button onClick={() => setChoice('flag')} className={clsx('flex items-center justify-center gap-2 rounded-xl border py-2 text-sm transition', choice === 'flag' ? 'border-signal bg-signal/15 text-signal' : 'hairline hover:bg-white/5')}><ThumbsDown size={14} /> Not okay</button>
              </div>
            </motion.div>
            <motion.p key={choice} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 min-h-10 font-mono text-[0.65rem] leading-relaxed text-mute">
              {choice === 'flag' ? 'edge collapsed: S -> 0 · DP gradient queued · message hidden' : choice === 'ok' ? 'tolerance reinforced via EMA' : 'awaiting recipient'}
            </motion.p>
          </div>
        </motion.div>
      </Reveal>
    </Section>
  )
}

function Numbers({ results }: { results: Results | null }) {
  const hybrid = results?.metrics.find((m) => m.model === 'cypher_hybrid')
  const best = hybrid ?? results?.metrics.slice().sort((a, b) => b.f1 - a.f1)[0]
  const ab = results?.ablation
  const fed = results?.federated?.runs.find((r) => r.noise_multiplier === 1)
  const items = [
    { k: 'F1 on held-out test', v: best?.f1, d: 3, s: '', note: best ? `${best.model.replace(/_/g, ' ')} · ${best.n_test.toLocaleString()} messages` : '' },
    { k: 'ROC-AUC', v: best?.roc_auc, d: 3, s: '', note: 'threshold-free ranking quality' },
    { k: 'fewer false bans', v: ab?.fp_reduction_vs_ai != null ? ab.fp_reduction_vs_ai * 100 : undefined, d: 0, s: '%', note: 'vs. the same model without context' },
    { k: 'privacy budget', v: fed?.history.at(-1)?.epsilon ?? undefined, d: 1, s: '', note: 'epsilon at sigma = 1, 30 rounds' },
  ]
  return (
    <Section className="mt-40">
      <Reveal><p className="eyebrow">measured, not claimed</p></Reveal>
      <div className="mt-8 grid gap-px overflow-hidden rounded-3xl border hairline bg-line sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <Reveal key={it.k} delay={i * 0.08} className="bg-ink p-7 md:p-9">
            <div className="eyebrow">{it.k}</div>
            <div className="mt-5 font-display text-5xl font-medium tabular-nums md:text-6xl">
              {it.v != null ? <CountUp value={it.v} decimals={it.d} suffix={it.s} /> : <span className="text-mute">-</span>}
            </div>
            <div className="mt-4 text-sm text-mute">{it.note}</div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={0.2}>
        <p className="mt-5 text-sm text-mute">Every figure on this site is read from <code className="font-mono text-bone-2">results/</code>, produced by the training scripts in this repository.</p>
      </Reveal>
    </Section>
  )
}

function Closing() {
  return (
    <Section className="mt-40">
      <div className="relative overflow-hidden rounded-[40px] border hairline bg-ink-2 px-6 py-20 text-center md:px-16 md:py-28">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-signal/20 blur-[120px]" />
        <p className="eyebrow">your turn</p>
        <h2 className="mx-auto mt-5 max-w-3xl font-display text-[clamp(2.2rem,6vw,5rem)] leading-[0.95] tracking-[-0.04em]">
          <SplitText text="Try to slip something past it." />
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-bone-2">Leetspeak, Hinglish, sarcasm, emoji-only insults. Watch each layer react in real time.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Magnetic><Link to="/analyze"><Button>Open the analyzer <ArrowUpRight size={16} /></Button></Link></Magnetic>
          <Link to="/lab"><Button variant="ghost">Chat as two people</Button></Link>
        </div>
      </div>
    </Section>
  )
}

export default function Home() {
  const [results, setResults] = useState<Results | null>(null)
  useEffect(() => { api.results().then(setResults).catch(() => null) }, [])
  const hybrid = results?.metrics.find((m) => m.model === 'cypher_hybrid')
  const best = hybrid ?? results?.metrics.slice().sort((a, b) => b.f1 - a.f1)[0]
  return (
    <>
      <Hero stats={{ f1: best?.f1, auc: best?.roc_auc, fpCut: results?.ablation?.fp_reduction_vs_ai ?? undefined }} />
      <Marquee />
      <BanterParadox />
      <Layers />
      <PrivatePrompt />
      <Numbers results={results} />
      <Closing />
    </>
  )
}
