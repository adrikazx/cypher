import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Card, ErrorNote, PageHeader, Section, Stat } from '../components/ui'
import { api, type Results as R } from '../lib/api'
import { AXIS, GRID, MODEL_COLOR, MODEL_LABEL, MODEL_ORDER, SIGMA_RAMP, TOOLTIP } from '../lib/chart'
import { CountUp, Reveal } from '../lib/motion'

const legendStyle = { fontSize: 12, color: '#b9b2a8', paddingTop: 12 }

function ChartCard({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <Reveal className={className}>
      <Card className="h-full p-5 md:p-7">
        <div className="mb-5">
          <h3 className="font-display text-lg tracking-tight md:text-xl">{title}</h3>
          {sub && <p className="mt-1 text-sm text-mute">{sub}</p>}
        </div>
        {children}
      </Card>
    </Reveal>
  )
}

export default function Results() {
  const [data, setData] = useState<R | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api.results().then(setData).catch((e) => setError(e.message)) }, [])

  const metrics = useMemo(() => (data?.metrics ?? []).slice().sort((a, b) => MODEL_ORDER.indexOf(a.model) - MODEL_ORDER.indexOf(b.model)), [data])
  const best = (k: 'accuracy' | 'precision' | 'recall' | 'f1' | 'roc_auc') => Math.max(...metrics.map((m) => m[k]))
  const hybrid = metrics.find((m) => m.model === 'cypher_hybrid') ?? metrics[0]

  const roc = useMemo(() => {
    if (!data) return []
    const grid = Array.from({ length: 51 }, (_, i) => i / 50)
    return grid.map((x) => {
      const row: Record<string, number> = { fpr: x }
      for (const m of metrics) {
        const c = data.curves[m.model]?.roc
        if (!c) continue
        let j = c.fpr.findIndex((f) => f >= x)
        if (j < 0) j = c.fpr.length - 1
        row[m.model] = c.tpr[j]
      }
      return row
    })
  }, [data, metrics])

  const langs = useMemo(() => {
    const keys = Array.from(new Set(metrics.flatMap((m) => Object.keys(m.per_lang_f1))))
    return keys.map((lang) => ({ lang, ...Object.fromEntries(metrics.map((m) => [m.model, m.per_lang_f1[lang]])) }))
  }, [metrics])
  const langModels = ['cypher_hybrid', 'transformer_only', 'logistic_regression'].filter((m) => metrics.some((x) => x.model === m))

  const conv = useMemo(() => {
    const h = data?.history ?? {}
    const epochs = Math.max(0, ...Object.values(h).map((x) => x.length))
    return Array.from({ length: epochs }, (_, i) => ({ epoch: i + 1, ...Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v[i]?.val_f1])) }))
  }, [data])

  const ab = data?.ablation
  const abBars = ab ? ([['keyword', 'Static keyword filter'], ['standard_ai', 'Same model, no context'], ['cypher', 'Full CYPHER pipeline']] as const).map(([k, label]) => ({
    label, fp: ab.policies[k].false_positive_actions, recall: ab.policies[k].recall,
  })) : []

  const fed = data?.federated
  const fedRows = fed ? fed.runs[0].history.map((p, i) => ({ round: p.round, ...Object.fromEntries(fed.runs.map((r) => [`s${r.noise_multiplier}`, r.history[i]?.f1])) })) : []

  return (
    <>
      <PageHeader eyebrow="evaluation" title="Measured on data it never saw." lead={`Every number below was produced by the training scripts in this repository on a held-out test set of ${hybrid?.n_test?.toLocaleString() ?? '…'} messages (English, Hindi and Hinglish).`} />
      <Section><ErrorNote error={error} /></Section>

      {hybrid && (
        <Section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="F1" value={<CountUp value={hybrid.f1} decimals={3} />} hint={MODEL_LABEL[hybrid.model]} />
          <Stat label="ROC-AUC" value={<CountUp value={hybrid.roc_auc} decimals={3} />} />
          <Stat label="recall" value={<CountUp value={hybrid.recall * 100} decimals={1} suffix="%" />} hint="share of toxic messages caught" />
          <Stat label="latency" value={<CountUp value={hybrid.latency_ms} decimals={1} suffix=" ms" />} hint={hybrid.device ?? 'per message'} />
        </Section>
      )}

      <Section className="mt-5">
        <Reveal>
          <Card className="overflow-x-auto p-2 md:p-4" >
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left">
                  {['model', 'accuracy', 'precision', 'recall', 'F1', 'ROC-AUC', 'latency'].map((h) => <th key={h} className="eyebrow px-4 py-3 font-normal">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.model} className={clsx('border-t hairline', m.model === 'cypher_hybrid' && 'bg-white/[0.025]')}>
                    <td className="px-4 py-3.5"><span className="mr-2.5 inline-block h-2 w-2 rounded-full" style={{ background: MODEL_COLOR[m.model] }} />{MODEL_LABEL[m.model] ?? m.model}</td>
                    {(['accuracy', 'precision', 'recall', 'f1', 'roc_auc'] as const).map((k) => (
                      <td key={k} className={clsx('px-4 py-3.5 font-mono tabular-nums', m[k] === best(k) ? 'text-bone' : 'text-mute')}>{m[k].toFixed(3)}{m[k] === best(k) && ' ▲'}</td>
                    ))}
                    <td className="px-4 py-3.5 font-mono text-mute tabular-nums">{m.latency_ms.toFixed(1)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Reveal>
      </Section>

      <Section className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="F1 by model" sub="Held-out test set, threshold chosen on validation">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={metrics.map((m) => ({ name: MODEL_LABEL[m.model]?.split(' (')[0] ?? m.model, f1: m.f1 }))} layout="vertical" margin={{ left: 20, right: 40 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0.5, 1]} {...AXIS} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} {...AXIS} tickLine={false} axisLine={false} />
                <Tooltip {...TOOLTIP} formatter={(v) => Number(v).toFixed(4)} />
                <Bar dataKey="f1" fill="#3987e5" radius={[0, 4, 4, 0]} barSize={18}>
                  <LabelList dataKey="f1" position="right" formatter={(v) => Number(v).toFixed(3)} style={{ fill: '#b9b2a8', fontSize: 11, fontFamily: 'Geist Mono Variable' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="ROC curves" sub="True-positive rate against false-positive rate">
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={roc} margin={{ right: 10, left: -20 }}>
                <CartesianGrid stroke={GRID} />
                <XAxis dataKey="fpr" type="number" domain={[0, 1]} {...AXIS} tickLine={false} />
                <YAxis domain={[0, 1]} {...AXIS} tickLine={false} />
                <Tooltip {...TOOLTIP} formatter={(v, n) => [Number(v).toFixed(3), MODEL_LABEL[String(n)] ?? n]} labelFormatter={(l) => `FPR ${Number(l).toFixed(2)}`} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={GRID} strokeDasharray="4 4" />
                {metrics.map((m) => <Line key={m.model} dataKey={m.model} name={m.model} stroke={MODEL_COLOR[m.model]} strokeWidth={m.model === 'cypher_hybrid' ? 2.5 : 1.5} dot={false} />)}
                <Legend wrapperStyle={legendStyle} formatter={(v) => MODEL_LABEL[String(v)]?.split(' (')[0] ?? v} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="F1 by language" sub="Code-mixed Hinglish is the hardest slice for every model">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={langs} margin={{ left: -20 }} barGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="lang" {...AXIS} tickLine={false} />
                <YAxis domain={[0, 1]} {...AXIS} tickLine={false} />
                <Tooltip {...TOOLTIP} formatter={(v, n) => [Number(v).toFixed(3), MODEL_LABEL[String(n)] ?? n]} />
                {langModels.map((m) => <Bar key={m} dataKey={m} fill={MODEL_COLOR[m]} radius={[4, 4, 0, 0]} barSize={16} />)}
                <Legend wrapperStyle={legendStyle} formatter={(v) => MODEL_LABEL[String(v)]?.split(' (')[0] ?? v} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Training convergence" sub="Validation F1 after each epoch">
          <div className="h-72">
            {conv.length ? (
              <ResponsiveContainer>
                <LineChart data={conv} margin={{ right: 10, left: -20 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="epoch" {...AXIS} tickLine={false} />
                  <YAxis domain={['auto', 'auto']} {...AXIS} tickLine={false} />
                  <Tooltip {...TOOLTIP} formatter={(v, n) => [Number(v).toFixed(4), MODEL_LABEL[String(n)] ?? n]} />
                  {Object.keys(data?.history ?? {}).map((k) => <Line key={k} dataKey={k} stroke={MODEL_COLOR[k]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: '#0e0c11' }} />)}
                  <Legend wrapperStyle={legendStyle} formatter={(v) => MODEL_LABEL[String(v)]?.split(' (')[0] ?? v} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-mute">Run <code className="font-mono">python -m ml.train_transformer</code> to populate.</p>}
          </div>
        </ChartCard>
      </Section>

      {ab && (
        <Section className="mt-24">
          <Reveal><p className="eyebrow">ablation · {ab.config.interactions?.toLocaleString()} simulated interactions, {Math.round(Number(ab.config.banter_share) * 100)}% friendly banter</p></Reveal>
          <Reveal><h2 className="mt-4 max-w-3xl font-display text-[clamp(1.8rem,4vw,3.2rem)] leading-[1] tracking-[-0.03em]">Context removes {Math.round((ab.fp_reduction_vs_ai ?? 0) * 100)}% of wrongful moderation.</h2></Reveal>
          <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <ChartCard title="Benign messages wrongly blocked" sub="Banter + ordinary chat, lower is better">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={abBars} layout="vertical" margin={{ left: 30, right: 50 }}>
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" {...AXIS} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={150} {...AXIS} tickLine={false} axisLine={false} />
                    <Tooltip {...TOOLTIP} />
                    <Bar dataKey="fp" name="false positives" fill="#3987e5" radius={[0, 4, 4, 0]} barSize={22}>
                      {abBars.map((_, i) => <Cell key={i} fillOpacity={i === 2 ? 1 : 0.55} />)}
                      <LabelList dataKey="fp" position="right" style={{ fill: '#b9b2a8', fontSize: 11, fontFamily: 'Geist Mono Variable' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <div className="grid grid-cols-2 gap-3 content-start">
              <Stat label="harmful caught · AI" value={`${(ab.policies.standard_ai.recall * 100).toFixed(1)}%`} />
              <Stat label="harmful caught · CYPHER" value={`${(ab.policies.cypher.recall * 100).toFixed(1)}%`} hint={`${ab.policies.cypher.caught_after_delivery} via victim flag`} />
              <Stat label="private check-ins" value={ab.policies.cypher.prompts.toLocaleString()} hint="shown only to recipients" tone="amber" />
              <Stat label="vs keyword filter" value={`−${Math.round((ab.fp_reduction_vs_keyword ?? 0) * 100)}%`} hint="false positives" tone="safe" />
            </div>
          </div>
        </Section>
      )}

      {fed && (
        <Section className="mt-24">
          <ChartCard title="Privacy vs utility (Layer 5)" sub={`${fed.setup.clients} non-IID clients · clip C = ${fed.setup.clip} · δ = ${fed.setup.delta}. Dashed: centrally trained model on the same features (F1 ${fed.central.f1.toFixed(3)}).`}>
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <div className="h-80">
                <ResponsiveContainer>
                  <LineChart data={fedRows} margin={{ right: 10, left: -20 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="round" {...AXIS} tickLine={false} />
                    <YAxis domain={[0, 0.8]} {...AXIS} tickLine={false} />
                    <Tooltip {...TOOLTIP} formatter={(v, n) => [Number(v).toFixed(3), `σ = ${String(n).slice(1)}`]} />
                    <ReferenceLine y={fed.central.f1} stroke="#ede8e0" strokeOpacity={0.4} strokeDasharray="6 4" />
                    {fed.runs.map((r, i) => <Line key={r.noise_multiplier} dataKey={`s${r.noise_multiplier}`} stroke={SIGMA_RAMP[i]} strokeWidth={2} dot={false} />)}
                    <Legend wrapperStyle={legendStyle} formatter={(v) => `σ = ${String(v).slice(1)}`} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {fed.runs.map((r, i) => {
                  const end = r.history.at(-1)!
                  return (
                    <div key={r.noise_multiplier} className="flex items-center justify-between rounded-xl border hairline px-4 py-3">
                      <span className="flex items-center gap-2 font-mono text-sm"><i className="h-2 w-2 rounded-full" style={{ background: SIGMA_RAMP[i] }} />σ = {r.noise_multiplier}</span>
                      <span className="text-right font-mono text-xs text-mute">F1 <b className="text-bone">{end.f1.toFixed(3)}</b><br />ε {end.epsilon == null ? '∞' : end.epsilon.toFixed(1)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </ChartCard>
        </Section>
      )}
    </>
  )
}
