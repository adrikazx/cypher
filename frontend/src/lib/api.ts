const BASE = import.meta.env.VITE_API_URL ?? ''

export type Step = { layer: number; name: string; status: string; detail: string }
export type Hit = { term: string; severity: number }

export type Health = {
  status: string; version: string; backend: string; model: string
  threshold: number; tau_strict: number; tau_clean: number
}

export type Analysis = {
  score: number; model_score: number; verdict: 'clean' | 'borderline' | 'toxic'
  threshold: number; tau_strict: number; tau_clean: number; backend: string
  sentinel: { hits: Hit[]; normalized: string; obfuscated: boolean }
  explanation: { token: string; weight: number }[]
}

export type Decision = {
  message_id: number | null; action: 'allow' | 'block' | 'verify'; layer: number; reason: string
  score: number; model_score: number; delta_v: number | null; tolerance: number | null
  steps: Step[]; sentinel: { hits: Hit[]; normalized: string }
}

export type Message = {
  id: number; room: string; sender: string; recipient: string; text: string; score: number
  layer: number; action: string; reason: string; delta_v: number | null; tolerance: number | null
  verification: string | null; created_at: string
}

export type Edge = { src: string; dst: string; tolerance: number; interactions: number; flags: number; updated_at: string }
export type GraphData = { room: string; nodes: { id: string }[]; edges: Edge[] }
export type SlangTerm = { term: string; severity: number; source: string; first_seen: string; last_seen: string }

export type Metric = {
  model: string; accuracy: number; precision: number; recall: number; f1: number; roc_auc: number
  threshold: number; per_lang_f1: Record<string, number>; latency_ms: number; confusion: number[][]
  n_test: number; train_minutes?: number; train_seconds?: number; device?: string; params_millions?: number
}

export type FedPoint = { round: number; accuracy: number; f1: number; epsilon: number | null }

export type AblationPolicy = {
  false_positive_actions: number; fp_banter: number; fp_neutral: number; fp_rate: number
  harmful_caught: number; harmful_missed: number; recall: number; prompts: number; caught_after_delivery: number
}

export type Results = {
  metrics: Metric[]
  curves: Record<string, { roc: { fpr: number[]; tpr: number[] }; pr: { precision: number[]; recall: number[] } }>
  history: Record<string, { epoch: number; train_loss: number; val_f1: number; val_auc: number }[]>
  ablation: null | {
    config: Record<string, number | string>; counts: { benign: number; harmful: number; banter: number }
    policies: Record<'keyword' | 'standard_ai' | 'cypher', AblationPolicy>
    fp_reduction_vs_ai: number | null; fp_reduction_vs_keyword: number | null
    cypher_routing: Record<string, number>
  }
  federated: null | {
    setup: Record<string, number | string>; central: { accuracy: number; f1: number }
    runs: { noise_multiplier: number; history: FedPoint[] }[]
  }
}

export type SwarmStatus = {
  round: number; pending: number; total_updates: number; noise_multiplier: number; clip: number; epsilon: number
  recent: { id: number; created_at: string; norm_raw: number; norm_sent: number; noise_std: number; round: number | null }[]
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail ?? detail } catch { /* not json */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json() as Promise<T>
}

const post = <T,>(path: string, body?: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })

export const api = {
  health: () => req<Health>('/api/health'),
  analyze: (text: string) => post<Analysis>('/api/analyze', { text }),
  send: (room: string, sender: string, recipient: string, text: string) =>
    post<Decision>('/api/messages', { room, sender, recipient, text }),
  messages: (room?: string, limit = 200) =>
    req<Message[]>(`/api/messages?limit=${limit}${room ? `&room=${encodeURIComponent(room)}` : ''}`),
  verify: (id: number, flagged: boolean) => post<{ status: string; tolerance: number; dp_update?: Record<string, number> }>(`/api/messages/${id}/verify`, { flagged }),
  graph: (room: string) => req<GraphData>(`/api/graph/${room}`),
  setEdge: (room: string, src: string, dst: string, tolerance: number) =>
    post<GraphData>(`/api/graph/${room}/edge`, { src, dst, tolerance }),
  sentinel: () => req<{ ttl_days: number; terms: SlangTerm[] }>('/api/sentinel'),
  addTerm: (term: string, severity: number) => post<{ ttl_days: number; terms: SlangTerm[] }>('/api/sentinel', { term, severity }),
  purge: () => post<{ removed: number }>('/api/sentinel/purge'),
  swarm: () => req<SwarmStatus>('/api/swarm'),
  aggregate: () => post<{ round: number; aggregated: number; epsilon?: number }>('/api/swarm/aggregate'),
  results: () => req<Results>('/api/results'),
  federate: (noise_multiplier: number, rounds: number, clients: number) =>
    post<{ history: FedPoint[] }>('/api/federated/simulate', { noise_multiplier, rounds, clients }),
  stats: () => req<{ by_action: { action: string; n: number }[]; by_layer: { layer: number; action: string; n: number }[]; pending: number; total: number }>('/api/stats'),
  reset: () => post<{ status: string }>('/api/demo/reset'),
}
