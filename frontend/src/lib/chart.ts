// Chart colours. Validated with the dataviz palette validator against the
// CYPHER dark surface (#0e0c11): lightness band, chroma, CVD separation and
// contrast all pass. Status colours (signal/safe/amber) are deliberately NOT
// reused for series - they mean block/allow/verify everywhere else in the UI.

export const MODEL_ORDER = ['cypher_hybrid', 'transformer_only', 'bilstm_attention', 'logistic_regression', 'linear_svm', 'naive_bayes']

export const MODEL_COLOR: Record<string, string> = {
  cypher_hybrid: '#3987e5',
  transformer_only: '#d95926',
  bilstm_attention: '#199e70',
  logistic_regression: '#c98500',
  linear_svm: '#d55181',
  naive_bayes: '#0ca30c',
}

export const MODEL_LABEL: Record<string, string> = {
  cypher_hybrid: 'CYPHER hybrid (DistilBERT + CNN)',
  transformer_only: 'DistilBERT only',
  bilstm_attention: 'BiLSTM + attention',
  logistic_regression: 'TF-IDF + LogReg',
  linear_svm: 'TF-IDF + Linear SVM',
  naive_bayes: 'Naive Bayes',
}

// ordinal: one hue, light -> dark (sigma = 0 is lightest)
export const SIGMA_RAMP = ['#9ec5f4', '#5598e7', '#2a78d6', '#184f95']

export const AXIS = { stroke: 'rgba(237,232,224,.18)', fontSize: 11, tick: { fill: '#a39c93', fontSize: 11, fontFamily: 'Geist Mono Variable, monospace' } }
export const GRID = 'rgba(237,232,224,.06)'
export const TOOLTIP = {
  contentStyle: { background: '#16131a', border: '1px solid rgba(237,232,224,.1)', borderRadius: 12, fontSize: 12, color: '#ede8e0' },
  labelStyle: { color: '#b9b2a8', fontFamily: 'Geist Mono Variable, monospace', fontSize: 11 },
  itemStyle: { color: '#ede8e0' },
  cursor: { stroke: 'rgba(237,232,224,.2)', fill: 'rgba(237,232,224,.04)' },
}
