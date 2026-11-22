import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { Sparkles, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge, Card, ErrorNote, PageHeader, ScoreDial, Section, Spinner, Stat, actionTone } from '../components/ui'
import { api, type Analysis } from '../lib/api'
import { EASE } from '../lib/motion'

const EXAMPLES = [
  'Oh wow, you are SUCH a genius 🙄',
  'nobody would miss you if you left',
  'u r a st00pid l0ser, k1ll urself',
  'tu bewakoof hai kya, kuch bhi bolta hai',
  'Go kill it at the interview today, champ!',
  'thanks for sharing the notes, see you tomorrow',
]

function Heatmap({ tokens }: { tokens: Analysis['explanation'] }) {
  const max = Math.max(0.02, ...tokens.map((t) => Math.abs(t.weight)))
  return (
    <div className="flex flex-wrap gap-1.5 leading-loose">
      {tokens.map((t, i) => {
        const v = t.weight / max
        const bg = v > 0 ? `rgba(255,59,47,${Math.min(0.85, v * 0.85)})` : `rgba(62,224,192,${Math.min(0.5, -v * 0.5)})`
        return (
          <motion.span key={`${t.token}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025, ease: EASE }}
            title={`contribution ${t.weight >= 0 ? '+' : ''}${t.weight.toFixed(3)}`}
            className={clsx('rounded-md px-1.5 py-0.5 font-mono text-sm', Math.abs(v) > 0.5 && v > 0 && 'text-ink')}
            style={{ background: bg }}>{t.token}</motion.span>
        )
      })}
    </div>
  )
}

export default function Analyzer() {
  const [text, setText] = useState(EXAMPLES[0])
  const [res, setRes] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number>(0)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (!text.trim()) return
    timer.current = window.setTimeout(async () => {
      setBusy(true); setError(null)
      try { setRes(await api.analyze(text)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
    }, 450)
    return () => window.clearTimeout(timer.current)
  }, [text])

  const top = res ? [...res.explanation].sort((a, b) => b.weight - a.weight).slice(0, 3).filter((t) => t.weight > 0.01) : []

  return (
    <>
      <PageHeader eyebrow="layer 2 · explainable" title="Why was this flagged?" lead="Every score comes with its reasons. Words are removed one at a time and the drop in toxicity is measured - the redder the word, the more it carried the decision." />
      <Section className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card className="p-6 md:p-8">
          <label className="eyebrow" htmlFor="txt">message</label>
          <textarea id="txt" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000}
            className="input mt-3 resize-none font-serif text-xl leading-snug md:text-2xl" />
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => setText(e)} className={clsx('rounded-full border px-3 py-1.5 text-left text-xs transition', e === text ? 'border-bone/40 text-bone' : 'hairline text-mute hover:text-bone')}>
                {e.length > 32 ? e.slice(0, 32) + '…' : e}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {res && (
              <motion.div key={res.score + text} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-8">
                <div className="eyebrow mb-3 flex items-center gap-2"><Sparkles size={12} /> attribution</div>
                <Heatmap tokens={res.explanation} />
                {top.length > 0 && (
                  <p className="mt-5 text-sm text-bone-2">Driven mostly by {top.map((t, i) => <span key={i}><b className="text-signal">“{t.token}”</b>{i < top.length - 1 ? ', ' : ''}</span>)}.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <div className="space-y-5">
          <Card className="flex flex-col items-center p-8">
            <div className="flex w-full items-center justify-between">
              <span className="eyebrow">verdict</span>
              {busy ? <Spinner className="text-mute" /> : res && <Badge tone={actionTone(res.verdict)}>{res.verdict}</Badge>}
            </div>
            <div className="mt-6"><ScoreDial score={res?.score ?? 0} tauClean={res?.tau_clean ?? 0.3} tauStrict={res?.tau_strict ?? 0.85} size={260} /></div>
            <div className="mt-6 grid w-full grid-cols-3 gap-2 text-center font-mono text-[0.6rem] uppercase tracking-wider text-mute">
              <span className="text-safe">clean &lt; {res?.tau_clean ?? 0.3}</span><span className="text-amber">context zone</span><span className="text-signal">&gt; {res?.tau_strict ?? 0.85} block</span>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="model only" value={res ? res.model_score.toFixed(3) : '-'} hint="calibrated probability" />
            <Stat label="after sentinel" value={res ? res.score.toFixed(3) : '-'} hint="fused with slang cache" tone={res && res.score > res.model_score + 0.01 ? 'amber' : undefined} />
          </div>

          <Card className="p-6">
            <div className="eyebrow mb-3 flex items-center gap-2"><Wand2 size={12} /> layer 1 · sentinel</div>
            {res?.sentinel.obfuscated && (
              <p className="mb-3 text-sm text-bone-2">De-obfuscated to <span className="font-mono text-amber">“{res.sentinel.normalized}”</span></p>
            )}
            <div className="flex flex-wrap gap-2">
              {res?.sentinel.hits.length ? res.sentinel.hits.map((h) => (
                <Badge key={h.term} tone={h.severity >= 0.9 ? 'block' : 'verify'}>{h.term} · {h.severity.toFixed(2)}</Badge>
              )) : <span className="text-sm text-mute">No zero-day slang matched.</span>}
            </div>
            {res && <p className="mt-4 font-mono text-[0.65rem] text-mute">backend: {res.backend}</p>}
          </Card>
          <ErrorNote error={error} />
        </div>
      </Section>
    </>
  )
}
