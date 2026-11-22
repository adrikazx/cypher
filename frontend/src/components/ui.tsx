import clsx from 'clsx'
import { motion } from 'motion/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { EASE, Reveal, SplitText, useSpotlight } from '../lib/motion'

export function Card({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' }) {
  const ref = useSpotlight<HTMLDivElement>()
  const Tag = as
  return <Tag ref={ref} className={clsx('spot rounded-3xl', className)}>{children}</Tag>
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'safe'; size?: 'sm' | 'md' }

export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={clsx(
        'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-medium transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-9 px-4 text-sm' : 'h-12 px-6 text-[0.95rem]',
        variant === 'primary' && 'bg-bone text-ink hover:shadow-[0_0_0_6px_rgb(237_232_224/0.08)]',
        variant === 'ghost' && 'border hairline bg-white/[0.02] text-bone hover:bg-white/[0.06]',
        variant === 'danger' && 'bg-signal text-ink hover:shadow-[0_0_40px_-6px_rgb(255_59_47/0.8)]',
        variant === 'safe' && 'bg-safe text-ink hover:shadow-[0_0_40px_-6px_rgb(62_224_192/0.7)]',
        className,
      )}
    >
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      {variant === 'primary' && (
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      )}
    </button>
  )
}

const toneMap = {
  allow: 'text-safe border-safe/30 bg-safe/10',
  block: 'text-signal border-signal/30 bg-signal/10',
  verify: 'text-amber border-amber/30 bg-amber/10',
  neutral: 'text-bone-2 border-white/10 bg-white/5',
} as const

export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof toneMap; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-wider', toneMap[tone], className)}>
      {children}
    </span>
  )
}

export function actionTone(action?: string | null): keyof typeof toneMap {
  if (action === 'allow' || action === 'approved' || action === 'clean') return 'allow'
  if (action === 'block' || action === 'flagged' || action === 'toxic') return 'block'
  if (action === 'verify' || action === 'pending' || action === 'borderline') return 'verify'
  return 'neutral'
}

export function PageHeader({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="relative mx-auto max-w-7xl px-5 pb-10 pt-32 md:px-10 md:pb-16 md:pt-44">
      <Reveal><p className="eyebrow mb-6 flex items-center gap-3"><span className="h-px w-8 bg-signal" />{eyebrow}</p></Reveal>
      <h1 className="font-display text-[clamp(2.4rem,7vw,6.4rem)] font-medium leading-[0.92] tracking-[-0.045em]">
        <SplitText text={title} />
      </h1>
      {lead && (
        <Reveal delay={0.25}>
          <p className="mt-6 max-w-2xl font-serif text-xl leading-snug text-bone-2 md:mt-8 md:text-2xl">{lead}</p>
        </Reveal>
      )}
      {children && <Reveal delay={0.35} className="mt-8">{children}</Reveal>}
    </header>
  )
}

/** Semi-circular gauge with the decision zones painted on the track. */
export function ScoreDial({ score, tauClean, tauStrict, size = 240 }: { score: number; tauClean: number; tauStrict: number; size?: number }) {
  const r = 90, c = Math.PI * r
  const color = score > tauStrict ? '#ff3b2f' : score >= tauClean ? '#f5b942' : '#3ee0c0'
  const arc = (from: number, to: number, stroke: string) => (
    <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke={stroke} strokeWidth="3"
      strokeDasharray={`${(to - from) * c} ${c}`} strokeDashoffset={-from * c} strokeLinecap="butt" />
  )
  return (
    <div style={{ width: size }} className="relative">
      <svg viewBox="0 0 200 112" className="w-full overflow-visible">
        {arc(0, tauClean, 'rgb(62 224 192 / .25)')}
        {arc(tauClean, tauStrict, 'rgb(245 185 66 / .25)')}
        {arc(tauStrict, 1, 'rgb(255 59 47 / .3)')}
        <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="rgb(255 255 255 / .05)" strokeWidth="14" strokeLinecap="round" />
        <motion.path
          d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score) }}
          transition={{ duration: 1.2, ease: EASE }} style={{ filter: `drop-shadow(0 0 12px ${color})` }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <motion.div key={score} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="font-display text-5xl font-semibold tabular-nums" style={{ color }}>
          {(score * 100).toFixed(0)}<span className="text-xl text-mute">%</span>
        </motion.div>
        <div className="eyebrow mt-1">toxicity probability</div>
      </div>
    </div>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'signal' | 'safe' | 'amber' }) {
  return (
    <div className="rounded-2xl border hairline bg-white/[0.015] p-5">
      <div className="eyebrow">{label}</div>
      <div className={clsx('mt-3 font-display text-3xl font-medium tabular-nums md:text-4xl',
        tone === 'signal' && 'text-signal', tone === 'safe' && 'text-safe', tone === 'amber' && 'text-amber')}>{value}</div>
      {hint && <div className="mt-2 text-sm text-mute">{hint}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="rounded-2xl border border-signal/30 bg-signal/5 px-4 py-3 text-sm text-signal">
      {error.includes('fetch') ? 'Cannot reach the CYPHER API. Is the backend running on port 8000?' : error}
    </div>
  )
}

export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('mx-auto max-w-7xl px-5 md:px-10', className)}>{children}</section>
}
