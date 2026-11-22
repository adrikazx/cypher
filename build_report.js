// Builds docs/report/CYPHER_Project_Report.docx from the measured results in results/.
//   cd docs/report && npm install && node build_report.js
const fs = require('fs')
const path = require('path')
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak,
  PageNumber, Paragraph, ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType, NumberFormat,
} = require('docx')

const ROOT = path.resolve(__dirname, '..', '..')
const R = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, 'results', p), 'utf8'))
const metrics = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'results/metrics')).map((f) => {
  const m = R('metrics/' + f); return [m.model, m]
}))
const hist = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'results/history')).map((f) => [f.replace('.json', ''), R('history/' + f)]))
const ab = R('ablation.json')
const fed = R('federated.json')
const ds = R('dataset_stats.json')
const H = metrics.cypher_hybrid, T = metrics.transformer_only, B = metrics.bilstm_attention
const LR = metrics.logistic_regression, SVM = metrics.linear_svm, NB = metrics.naive_bayes

const f3 = (x) => x.toFixed(3)
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%'
const n = (x) => x.toLocaleString('en-IN')

// ---------------------------------------------------------------- layout
const FONT = 'Times New Roman'
const CONTENT_W = 11906 - 1800 - 1440 // A4 minus margins (DXA)
const MAX_IMG_PX = 560

let chapter = 0, fig = 0, tab = 0
const children = []

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 24, ...o })
function para(parts, o = {}) {
  const runs = (Array.isArray(parts) ? parts : [parts]).map((p) => (typeof p === 'string' ? run(p) : p))
  return new Paragraph({ children: runs, alignment: AlignmentType.JUSTIFIED, spacing: { line: 360, after: 160 }, ...o })
}
const P = (...parts) => children.push(para(parts))
const B_ = (t) => run(t, { bold: true })
const I_ = (t) => run(t, { italics: true })

function Chapter(title) {
  chapter += 1; fig = 0; tab = 0
  children.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.LEFT, spacing: { after: 60 },
    children: [new TextRun({ text: `CHAPTER ${chapter}`, font: FONT, size: 22, bold: true, color: '8A1C14', characterSpacing: 40 })] }))
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`${chapter}. ${title}`)] }))
}
const H2 = (t) => children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] }))
const H3 = (t) => children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] }))
const Unnumbered = (t) => children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(t)] }))

function bullets(items, ref = 'bullets') {
  for (const it of items) {
    const parts = (Array.isArray(it) ? it : [it]).map((p) => (typeof p === 'string' ? run(p) : p))
    children.push(new Paragraph({ numbering: { reference: ref, level: 0 }, children: parts, spacing: { line: 320, after: 80 }, alignment: AlignmentType.JUSTIFIED }))
  }
}
function numbered(items) {
  const ref = 'num' + numbered.count++
  numberingConfigs.push({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] })
  bullets(items, ref)
}
numbered.count = 0

function equation(text, label) {
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 },
    children: [new TextRun({ text, font: 'Cambria Math', size: 24 }), new TextRun({ text: label ? `\t\t(${label})` : '', font: FONT, size: 22 })] }))
}

function pngSize(file) {
  const b = fs.readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b }
}
function figure(rel, caption, widthPx = MAX_IMG_PX) {
  const { w, h, data } = pngSize(path.join(ROOT, rel))
  const width = Math.min(widthPx, MAX_IMG_PX)
  fig += 1
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 60 },
    children: [new ImageRun({ type: 'png', data, transformation: { width, height: Math.round((width * h) / w) } })] }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [new TextRun({ text: `Figure ${chapter}.${fig}: `, font: FONT, size: 20, bold: true }), new TextRun({ text: caption, font: FONT, size: 20, italics: true })] }))
}

const border = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' }
const borders = { top: border, bottom: border, left: border, right: border }
function table(caption, header, rows, widthsPct) {
  tab += 1
  const widths = widthsPct.map((p) => Math.floor((p / 100) * CONTENT_W))
  widths[widths.length - 1] = CONTENT_W - widths.slice(0, -1).reduce((a, b) => a + b, 0)
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 200, after: 80 },
    children: [new TextRun({ text: `Table ${chapter}.${tab}: `, font: FONT, size: 20, bold: true }), new TextRun({ text: caption, font: FONT, size: 20, italics: true })] }))
  const cell = (text, i, head, bold) => new TableCell({
    borders, width: { size: widths[i], type: WidthType.DXA },
    shading: head ? { fill: 'E8E4DE', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: i === 0 || String(text).length > 28 ? AlignmentType.LEFT : AlignmentType.CENTER,
      children: [new TextRun({ text: String(text), font: FONT, size: 20, bold: head || bold })] })],
  })
  children.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => (typeof c === 'object' && c !== null ? cell(c.t, i, false, c.b) : cell(c, i, false))) })),
    ],
  }))
  children.push(new Paragraph({ spacing: { after: 160 }, children: [] }))
}
const numberingConfigs = [
  { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
]

// ================================================================ FRONT MATTER
const front = []
const centered = (text, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: o.after ?? 120, before: o.before ?? 0 },
  children: [new TextRun({ text, font: FONT, size: o.size ?? 24, bold: o.bold, italics: o.italics, color: o.color })] })

front.push(
  centered('A PROJECT REPORT ON', { size: 24, bold: true, before: 600, after: 300 }),
  centered('CYPHER', { size: 64, bold: true, color: '8A1C14', after: 120 }),
  centered('A Context-Aware, Privacy-Preserving Architecture for Cyberbullying Mitigation', { size: 30, bold: true, after: 600 }),
  centered('Submitted in partial fulfilment of the requirements for the award of the degree of', { italics: true, after: 120 }),
  centered('BACHELOR OF TECHNOLOGY', { size: 28, bold: true, after: 600 }),
  centered('Submitted by', { italics: true, after: 160 }),
  centered('Paramartha Ghosh  (12023052017010)', { bold: true }),
  centered('B.Tech, Computer Science & Engineering (IoT, Cyber Security incl. Blockchain Technology)', { size: 22, after: 200 }),
  centered('Adrika Kundu  (12023052004001)', { bold: true }),
  centered('B.Tech, Information Technology', { size: 22, after: 600 }),
  centered('Under the guidance of', { italics: true, after: 160 }),
  centered('Dr. Moutushi Singh', { bold: true }),
  centered('Dr. Avipsita Chatterjee', { bold: true, after: 800 }),
  centered('DEPARTMENT OF INFORMATION TECHNOLOGY', { bold: true, size: 26 }),
  centered('INSTITUTE OF ENGINEERING & MANAGEMENT, KOLKATA', { bold: true, size: 26 }),
  centered('2026', { bold: true, size: 26 }),
)

const sectionTitle = (t) => new Paragraph({ alignment: AlignmentType.CENTER, pageBreakBefore: true, spacing: { after: 400 },
  children: [new TextRun({ text: t, font: FONT, size: 32, bold: true })] })
const fpara = (parts, o = {}) => para(parts, o)
const NB_ = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const sigBlock = (names) => new Table({
  borders: { top: NB_, bottom: NB_, left: NB_, right: NB_, insideHorizontal: NB_, insideVertical: NB_ },
  width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: names.map(() => Math.floor(CONTENT_W / names.length)),
  rows: [new TableRow({ children: names.map((nm) => new TableCell({
    width: { size: Math.floor(CONTENT_W / names.length), type: WidthType.DXA },
    borders: { top: NB_, bottom: NB_, left: NB_, right: NB_ },
    children: [
      new Paragraph({ spacing: { before: 900 }, alignment: AlignmentType.CENTER, children: [run('______________________')] }),
      ...nm.map((l, i) => new Paragraph({ alignment: AlignmentType.CENTER, children: [run(l, { bold: i === 0, size: 22 })] })),
    ],
  })) })],
})

const fed1 = fed.runs.find((r) => r.noise_multiplier === 1).history.at(-1)
front.push(
  sectionTitle('CERTIFICATE'),
  fpara(['This is to certify that the project report entitled ', B_('"CYPHER: A Context-Aware, Privacy-Preserving Architecture for Cyberbullying Mitigation"'),
    ', submitted by ', B_('Paramartha Ghosh (12023052017010)'), ' and ', B_('Adrika Kundu (12023052004001)'),
    ' in partial fulfilment of the requirements for the award of the degree of Bachelor of Technology, is a bonafide record of the work carried out by them under our supervision and guidance in the Department of Information Technology, Institute of Engineering & Management, Kolkata.']),
  fpara('To the best of our knowledge, the matter embodied in this report has not been submitted to any other university or institution for the award of any degree or diploma.'),
  sigBlock([['Dr. Moutushi Singh', 'Project Guide'], ['Dr. Avipsita Chatterjee', 'Project Guide'], ['Head of the Department', 'Information Technology']]),
  sectionTitle('DECLARATION'),
  fpara(['We hereby declare that the project work entitled ', B_('"CYPHER: A Context-Aware, Privacy-Preserving Architecture for Cyberbullying Mitigation"'),
    ' is an authentic record of our own work carried out at the Institute of Engineering & Management, Kolkata, under the guidance of Dr. Moutushi Singh and Dr. Avipsita Chatterjee.']),
  fpara('All experimental results reported here were produced by the software submitted with this report and can be reproduced with the scripts described in Appendix A. Wherever the work of others has been used, it has been acknowledged and cited.'),
  sigBlock([['Paramartha Ghosh', '12023052017010'], ['Adrika Kundu', '12023052004001']]),
  sectionTitle('ACKNOWLEDGEMENT'),
  fpara('We express our sincere gratitude to our project guides, Dr. Moutushi Singh and Dr. Avipsita Chatterjee, for their constant encouragement, critical feedback and patience throughout the three volumes of this project. Their insistence on grounding every claim in evidence shaped the final form of this work.'),
  fpara('We thank the Head of the Department and the faculty of the Department of Information Technology, Institute of Engineering & Management, for providing the academic environment and resources that made this project possible.'),
  fpara('We acknowledge the researchers whose work this project builds upon, in particular Prof. Mangala Kini and her team, Aditya Desai and colleagues, and Mohd Anul Haq, Aljwharah Alabdulwahab and Mohammed Alshehri, whose studies on machine-learning and deep-learning approaches to cyberbullying detection provided our starting point. We also thank the creators of the Jigsaw Toxic Comment and PRISM datasets for making their data publicly available.'),
  fpara('Finally, we thank our families and friends for their support.'),
  new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.RIGHT, children: [run('Paramartha Ghosh', { bold: true })] }),
  new Paragraph({ alignment: AlignmentType.RIGHT, children: [run('Adrika Kundu', { bold: true })] }),
  sectionTitle('ABSTRACT'),
  fpara(['Automated moderation tools judge every message in isolation. They cannot separate two friends trading insults from a stranger launching a targeted attack (the ', I_('banter paradox'), '), they miss newly coined abusive slang, and retraining them usually requires collecting private conversations on a central server. This project presents ', B_('CYPHER'), ', a five-layer moderation architecture that addresses all three problems and is implemented end-to-end as working software.']),
  fpara([`Layer 1 maintains a time-to-live cache of emerging slang and reverses leetspeak obfuscation. Layer 2 is a multilingual DistilBERT encoder fused with a one-dimensional convolutional network, trained on a composite corpus of ${n(ds.total)} English, Hindi and Hinglish comments. Layer 3 stores a directed, per-room graph of how much rough language each user has accepted from each other user, and compares every borderline message against that baseline. Layer 4 resolves the remaining ambiguous cases by asking only the recipient, privately. Layer 5 converts confirmed attacks into clipped, Gaussian-noised gradient updates that are combined with Federated Averaging, so the message text never leaves the device.`]),
  fpara([`On a held-out test set of ${n(H.n_test)} messages the hybrid classifier reaches an F1 score of ${f3(H.f1)}, a ROC-AUC of ${f3(H.roc_auc)} and an accuracy of ${pct(H.accuracy)}, ahead of Naive Bayes (F1 ${f3(NB.f1)}), TF-IDF linear models (${f3(LR.f1)}–${f3(SVM.f1)}) and a BiLSTM with attention (${f3(B.f1)}), at ${H.latency_ms.toFixed(1)} ms per message on a laptop GPU. In a simulation of ${n(ab.config.interactions)} chat interactions containing ${pct(ab.config.banter_share, 0)} friendly banter, the full pipeline reduced wrongful moderation actions by ${pct(ab.fp_reduction_vs_ai, 1)} compared with the same model used without context, while increasing the share of harmful messages stopped from ${pct(ab.policies.standard_ai.recall)} to ${pct(ab.policies.cypher.recall)}. The differentially private federated layer exhibits the expected privacy–utility trade-off, retaining an F1 of ${f3(fed1.f1)} at ε = ${fed1.epsilon.toFixed(1)}.`]),
  fpara('The report also documents where the system falls short: the convolutional branch contributes almost nothing over the plain transformer, code-mixed text remains markedly harder than English, and explicit insults exchanged between friends are still blocked by the zero-tolerance layer. These findings are measured rather than projected and are reproducible from the accompanying code.'),
  new Paragraph({ spacing: { before: 240 }, children: [run('Keywords: ', { bold: true }), run('cyberbullying detection, natural language processing, transformer, relational graph, federated learning, differential privacy, explainable AI.', { italics: true })] }),
  sectionTitle('TABLE OF CONTENTS'),
  new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }),
)

// ================================================================ CHAPTER 1
Chapter('Introduction')
H2('1.1 Background')
P('Social platforms, messaging apps and gaming chats have become the default spaces in which young people socialise. The same openness that makes these spaces valuable also makes them a channel for harassment that follows the victim home, persists indefinitely and can be amplified by thousands of onlookers within minutes. Surveys consistently report that a substantial fraction of teenagers experience online harassment, with documented links to anxiety, depression and self-harm.')
P('Platforms respond with automated moderation: keyword filters, and increasingly, machine-learning classifiers that assign each message a toxicity score. These tools have improved steadily on benchmark datasets, yet the people they are meant to protect still find them both too strict and too lenient. This project starts from the observation that the main limitation is not the classifier\'s accuracy on isolated sentences but the decision to judge sentences in isolation at all.')
H2('1.2 Problem statement')
P('Three concrete problems motivate CYPHER:')
numbered([
  [B_('The banter paradox. '), 'The sentence "you played like a noob yesterday lol" is affectionate between two friends who have teased each other for years and hostile when sent by a stranger. A model that sees only the text must either block both or allow both.'],
  [B_('Zero-day slang and obfuscation. '), 'Abusers adopt new coded terms ("unalive yourself", "kys") and spellings ("1d10t", "ki11") precisely to evade filters trained on yesterday\'s data.'],
  [B_('Privacy. '), 'Improving a model normally means collecting the very conversations that end-to-end encryption is designed to keep private. A safety system should be able to learn from confirmed abuse without reading anyone\'s messages.'],
])
H2('1.3 Objectives')
bullets([
  'Build a multilingual (English, Hindi, Hinglish) toxicity classifier and compare it fairly against classical and recurrent baselines on the same held-out data.',
  'Design and implement a relational memory that adjusts moderation to the history between sender and recipient.',
  'Hand borderline decisions to the person on the receiving end through a private, asymmetric prompt instead of an automatic ban.',
  'Implement differentially private federated learning so that confirmed attacks improve the system without exporting message text, and quantify the privacy cost.',
  'Deliver the complete system as reproducible, runnable software: training pipeline, REST API and an interactive web interface.',
  'Report only measured results, including negative ones.',
])
H2('1.4 Scope')
P('CYPHER moderates text messages in group chats. Images, memes, audio and video are out of scope and discussed as future work. The federated layer is evaluated in simulation on a single machine; deploying it across real devices is likewise future work. The relational-context ablation uses a simulated chat stream because no public dataset records both message text and long-term relationship history between the same users.')
H2('1.5 Contributions')
bullets([
  [B_('A working five-layer pipeline '), 'that implements the equations of the CYPHER design (TTL cache, hybrid classifier, intent variance with EMA updates, victim-driven edge collapse, clipped and noised FedAvg).'],
  [B_('A reproducible evaluation '), `of six models on ${n(ds.total)} labelled comments, including a direct ablation of the CNN branch.`],
  [B_('A relational-context simulation '), 'that measures how much wrongful moderation is removed by remembering relationships and asking recipients.'],
  [B_('An interactive web application '), 'in which every layer can be exercised and inspected live.'],
])
H2('1.6 Organisation of the report')
P('Chapter 2 reviews prior work. Chapter 3 states requirements. Chapter 4 presents the architecture and the design of each layer. Chapter 5 describes the implementation, Chapter 6 the testing, and Chapter 7 the experimental results. Chapter 8 discusses limitations and future work and Chapter 9 concludes. Appendix A explains how to run the software.')

// ================================================================ CHAPTER 2
Chapter('Literature Review')
H2('2.1 Lexicon and rule-based methods')
P('Early systems matched messages against curated lists of slurs and profanity. They are fast and transparent but fragile: they flag profanity used affectionately, miss abuse that uses ordinary words ("nobody in this group wants you"), and are trivially evaded by misspelling. Schmidt and Wiegand [1] survey these approaches and their failure modes.')
H2('2.2 Classical machine learning')
P('Bag-of-words and TF-IDF features with Naive Bayes, Support Vector Machines and Logistic Regression became the standard baselines. Kini et al. [12] and Desai et al. [11] report that such models are effective for binary bullying detection but struggle with sarcasm, slang and cultural variation; Davidson et al. [3] showed that they also confuse offensive language with hate speech and over-flag certain dialects.')
H2('2.3 Deep learning and transformers')
P('Convolutional networks over word embeddings [9] capture local n-gram patterns such as "go die" or repeated insults, while recurrent networks with attention model longer dependencies. Transformer encoders, beginning with BERT [2] and the attention mechanism of Vaswani et al. [5], learn contextual representations that distinguish the same word in different senses. DistilBERT [13] retains most of BERT\'s accuracy with 40% fewer parameters, which matters for real-time moderation. Haq et al. [10] report that transformer-based models outperform classical baselines on cyberbullying corpora.')
H2('2.4 Multilingual and code-mixed text')
P('Users in South Asia routinely mix Hindi and English, often in Roman script. The HASOC shared tasks [8] showed a marked drop in performance on code-mixed data compared with English. Multilingual encoders trained on many languages share sub-word vocabularies across scripts and are the usual starting point for such data.')
H2('2.5 Context and social features')
P('Several studies add user history, posting time or interaction graphs to text features and report gains over text-only models [11]. However, these features are usually global properties of a user ("has this account been reported before?"), not properties of a specific relationship between two people. The banter paradox requires the latter.')
H2('2.6 Privacy-preserving learning')
P('Federated Learning [4] trains a shared model by averaging updates computed on devices, so raw data stays local. On its own it does not guarantee privacy, because updates can leak information about training examples. Differential privacy [6] bounds that leakage; DP-SGD [7] achieves it by clipping each update and adding calibrated Gaussian noise, and Rényi differential privacy [14] gives tight accounting of the cumulative privacy loss over many rounds.')
H2('2.7 Explainability')
P('Moderation decisions affect people and must be explainable. LIME [15] explains a prediction by perturbing the input and observing the change in output; SHAP [16] assigns each feature a contribution based on Shapley values. Both are model-agnostic.')
H2('2.8 Research gap')
table('Coverage of design requirements by prior approaches', ['Approach', 'Context of relationship', 'New slang', 'Privacy', 'Victim in the loop'], [
  ['Keyword filters', 'No', 'Manual', 'Yes (local)', 'No'],
  ['Classical ML', 'No', 'Retraining', 'No', 'No'],
  ['Transformers', 'Sentence only', 'Retraining', 'No', 'No'],
  ['User-history features', 'Per user, not per pair', 'Retraining', 'No', 'No'],
  ['Federated learning', 'No', 'Yes', 'Partial', 'No'],
  [{ t: 'CYPHER', b: true }, { t: 'Per sender–recipient pair', b: true }, { t: 'TTL cache + FL', b: true }, { t: 'DP federated', b: true }, { t: 'Yes', b: true }],
], [24, 22, 18, 18, 18])
P('No single prior approach models the relationship between a specific sender and recipient, keeps up with new slang, preserves privacy and gives the victim a say. CYPHER combines existing techniques into an architecture that does all four.')

// ================================================================ CHAPTER 3
Chapter('Requirements Analysis')
H2('3.1 Functional requirements')
table('Functional requirements', ['ID', 'Requirement'], [
  ['FR1', 'Classify any text message with a calibrated toxicity probability.'],
  ['FR2', 'Detect and normalise coded slang and leetspeak before classification.'],
  ['FR3', 'Block explicit toxicity immediately regardless of context.'],
  ['FR4', 'Maintain a per-room, per-pair tolerance score and update it from accepted messages.'],
  ['FR5', 'Deliver ambiguous messages with a private prompt visible only to the recipient.'],
  ['FR6', 'On a victim\'s flag, reset the pair\'s tolerance to zero and create a privacy-preserving model update.'],
  ['FR7', 'Explain each decision by highlighting the words that drove the score.'],
  ['FR8', 'Log every decision with its layer, score and relationship context for audit.'],
  ['FR9', 'Allow moderators to add slang terms and purge expired ones.'],
  ['FR10', 'Display evaluation results from the training pipeline.'],
], [12, 88])
H2('3.2 Non-functional requirements')
bullets([
  [B_('Latency: '), 'well under one second per message so moderation does not delay conversation.'],
  [B_('Hardware: '), 'train on a consumer laptop GPU with 4 GB of memory; run inference on CPU.'],
  [B_('Reproducibility: '), 'every reported number is regenerated by a script.'],
  [B_('Usability: '), 'the interface works on desktop and mobile screens and respects reduced-motion settings.'],
  [B_('Privacy: '), 'Layer 5 never stores or transmits message text.'],
])
H2('3.3 Hardware and software requirements')
table('Development and runtime environment', ['Component', 'Specification used'], [
  ['Processor / GPU', 'Laptop CPU; NVIDIA GeForce RTX 3050 Laptop GPU, 4 GB'],
  ['Operating system', 'Windows 11 (also runs on Linux and macOS)'],
  ['Language runtimes', 'Python 3.11, Node.js 20'],
  ['Deep learning', 'PyTorch 2.6 (CUDA 12.4), Hugging Face Transformers'],
  ['Classical ML', 'scikit-learn, NumPy, pandas, SciPy'],
  ['Backend', 'FastAPI, Uvicorn, SQLite'],
  ['Frontend', 'React 19, TypeScript, Vite, Tailwind CSS 4, Motion, Recharts, d3-force'],
  ['Testing', 'pytest, Chrome DevTools'],
], [30, 70])
H2('3.4 Feasibility')
P('Technical feasibility was the main risk, because the original design assumed data-centre GPUs. Using DistilBERT instead of BERT-base, a maximum length of 128 tokens, mixed-precision training and a frozen word-embedding matrix brought one training epoch down to about five minutes on the 4 GB laptop GPU. All software used is open source, so there are no licensing costs.')

// ================================================================ CHAPTER 4
Chapter('System Design')
H2('4.1 Architecture overview')
P('CYPHER is organised as three tiers (Figure 4.1). A Python library, cypher, implements the five layers and their persistence. A FastAPI service exposes the library over REST. A React single-page application provides the user interface. The training and evaluation scripts in the ml package are offline tools whose outputs (model weights and result files) are read by the service.')
figure('results/figures/fig_system.png', 'Three-tier architecture of the CYPHER system')
H2('4.2 Decision flow')
P('Messages pass through the layers in order, and each layer can end the cascade (Figure 4.2). The design principle is that cheaper, more certain checks run first and that no layer is consulted unless the previous one is unsure.')
figure('results/figures/fig_flowchart.png', 'Cascading decision flow through the five layers', 430)
H2('4.3 Layer 1: Web Sentinel')
P('The sentinel keeps a cache C of slang terms w, each with a severity and the time t at which it was last observed. Only terms observed within the time-to-live window are active:')
equation('C_active = { wᵢ | t_now − tᵢ ≤ ΔT_TTL }', '1')
P('with ΔT_TTL = 60 days. Before matching, the text is normalised: URLs and mentions are replaced, emojis are converted to text and letters mixed with digits are de-obfuscated (1d10t → idiot, ki11 → kill). A matched term with severity of at least 0.9 is treated as explicit; weaker matches raise the model score proportionally.')
H2('4.4 Layer 2: Absolute Firewall')
P('The firewall is a hybrid network. A transformer encoder produces contextual embeddings E ∈ ℝ^(L×d). One-dimensional convolutions with kernel sizes h ∈ {2, 3, 4} and 128 filters each are applied over E:')
equation('cᵢ = ReLU(W_c · E_(i:i+h−1) + b)', '2')
P('Global max-pooling keeps the strongest response of each filter, ĉ = max(c). The pooled features are concatenated with the [CLS] vector and passed through dropout and a linear layer to a softmax over {clean, toxic}:')
equation('ŷ = softmax(W_out [h_CLS ; ĉ₂ ; ĉ₃ ; ĉ₄] + b_out)', '3')
P('If the calibrated probability exceeds τ_strict = 0.85 the message is blocked. If it is below τ_clean = 0.30 it is delivered. Only the grey zone in between continues to Layer 3.')
H2('4.5 Layer 3: Relational Graph')
P('Each chat room k has a directed weighted graph G_k. The weight S(u, v) ∈ [0, 1] is the tolerance baseline of recipient v towards sender u; new pairs start at 0.10. For a grey-zone message with probability P the intent variance is')
equation('ΔV = P − S(u, v)', '4')
P('If ΔV ≤ 0.15 the message is within the relationship\'s normal register and is delivered. If ΔV > 0.50 it is far outside it and blocked as a covert attack. In between, the decision is passed to Layer 4. Accepted borderline messages update the baseline with an exponential moving average:')
equation('S(u, v) ← α · S(u, v) + (1 − α) · P,   α = 0.85', '5')
H2('4.6 Layer 4: Asymmetric Victim Verification')
P('An ambiguous message is delivered, together with a prompt visible only to the recipient: "Was that message okay with you?". The sender sees nothing, which prevents retaliation. If the recipient flags the message, the edge collapses:')
equation('flag = 1  ⇒  S(u, v) → 0', '6')
P('so further rough messages from that sender are treated as hostile, and the message is handed to Layer 5. If the recipient approves, the EMA update of Equation 5 is applied.')
H2('4.7 Layer 5: Differentially Private Swarm Learning')
P('A flagged message is converted on the device into a gradient g of a lightweight classifier over hashed word n-grams (hashing avoids sharing any vocabulary). Before leaving the device the update is clipped to norm C and Gaussian noise is added:')
equation('g̃ = g / max(1, ‖g‖₂ / C) + N(0, σ²C²I)', '7')
P('The server combines K updates with Federated Averaging, weighted by local data size n_k and scaled by a server learning rate η:')
equation('W ← W + η · Σₖ (nₖ / N) · g̃ₖ', '8')
P('The cumulative privacy loss over T rounds is accounted with Rényi differential privacy of the Gaussian mechanism, ε_RDP(a) = T·a / 2σ², converted to (ε, δ) with δ = 10⁻⁵.')
H2('4.8 Data design')
table('SQLite tables used by the service', ['Table', 'Key fields', 'Purpose'], [
  ['edges', 'room, src, dst, tolerance, interactions, flags', 'Relational graph (Layer 3)'],
  ['messages', 'id, room, sender, recipient, score, layer, action, reason, ΔV, verification', 'Audit log and pending check-ins'],
  ['slang', 'term, severity, source, first_seen, last_seen', 'Sentinel TTL cache (Layer 1)'],
  ['dp_updates', 'norm_raw, norm_sent, noise_std, round', 'Metadata of DP packets (no text)'],
], [18, 50, 32])
H2('4.9 API design')
table('Main REST endpoints', ['Method and path', 'Description'], [
  ['POST /api/messages', 'Run a message through the pipeline and return the decision trace'],
  ['POST /api/messages/{id}/verify', 'Recipient approves or flags a pending message'],
  ['POST /api/analyze', 'Score and explain a text without affecting state'],
  ['GET /api/graph/{room}', 'Relational graph of a room'],
  ['GET, POST /api/sentinel', 'List or add slang terms; /purge evicts expired terms'],
  ['GET /api/swarm, POST /api/swarm/aggregate', 'DP node status and FedAvg aggregation'],
  ['POST /api/federated/simulate', 'Run a federated simulation with chosen σ, rounds and clients'],
  ['GET /api/results', 'Metrics, curves and experiment outputs for the Results page'],
], [38, 62])
H2('4.10 User interface design')
P('The interface follows the visual language of the project presentation: a near-black background, a single red accent reserved for threats, teal for safe outcomes and amber for pending decisions. These three colours are used consistently as status colours and never for decoration. Typography pairs a neo-grotesque sans-serif for headings with an editorial serif for explanatory text and a monospace face for scores and equations. Motion is used to explain rather than decorate: the landing page splits one message into two relationships as the reader scrolls, and a three-dimensional layer stack lights up the layer being described. All motion is disabled for users who request reduced motion.')

// ================================================================ CHAPTER 5
Chapter('Implementation')
H2('5.1 Technology stack')
P('The core library and API are written in Python; the interface in TypeScript. Table 5.1 lists the main components.')
table('Implementation technology', ['Layer of the stack', 'Technology', 'Reason'], [
  ['Model training', 'PyTorch, Transformers', 'Standard tools for transformer fine-tuning'],
  ['Baselines', 'scikit-learn', 'Reference implementations of NB, LR, SVM'],
  ['API', 'FastAPI + Uvicorn', 'Asynchronous, typed, automatic OpenAPI docs'],
  ['Persistence', 'SQLite', 'Zero-configuration, stands in for on-device storage'],
  ['Interface', 'React, Vite, Tailwind CSS', 'Fast builds and a consistent design system'],
  ['Motion and charts', 'Motion, Lenis, Recharts, d3-force', 'Scroll-driven animation, charts, graph layout'],
], [26, 34, 40])
H2('5.2 Dataset')
P([`Two public corpora were combined. The Jigsaw Toxic Comment Classification dataset [17] contains about 160,000 Wikipedia talk-page comments with six toxicity labels; a comment is treated as toxic if any label is set. To fit the training budget, all toxic comments were kept and clean ones were sampled at a ratio of three to one. The PRISM corpus contributes English, Hindi (Devanagari) and Roman-script Hinglish social-media posts labelled for hate speech. After cleaning and de-duplication the composite dataset contains ${n(ds.total)} samples (${pct(ds.toxic_share)} toxic), split 80/10/10 into ${n(ds.splits.train)} training, ${n(ds.splits.val)} validation and ${n(ds.splits.test)} test samples, stratified by source, language and label.`])
figure('results/figures/fig_dataset.png', 'Composition of the dataset by source, language and label')
H2('5.3 Pre-processing')
bullets([
  'HTML entities are unescaped; retweet markers and URLs are removed; user mentions become @user.',
  'Emojis are converted to text tokens with the emoji library (for example 😂 becomes :face_with_tears_of_joy:) so the model can use them.',
  'Characters repeated more than three times are shortened ("soooooo" → "soo").',
  'Case is preserved for the cased multilingual tokenizer; TF-IDF models lowercase internally.',
])
H2('5.4 Models')
H3('5.4.1 Classical baselines')
P('Naive Bayes uses word uni- and bi-gram TF-IDF features. Logistic Regression and the Linear SVM use a union of word (1–2) and character (2–5) n-gram TF-IDF features with balanced class weights; the SVM is calibrated with three-fold Platt scaling to produce probabilities. The Logistic Regression model is also shipped as the fallback model so the application runs without a GPU.')
H3('5.4.2 BiLSTM with attention')
P('A 50,000-word vocabulary, 200-dimensional trainable embeddings, a bidirectional LSTM with 128 units per direction and additive attention pooling, trained with Adam for four epochs.')
H3('5.4.3 CYPHER hybrid')
table('Hyper-parameters of the hybrid model', ['Parameter', 'Value'], [
  ['Encoder', 'distilbert-base-multilingual-cased (6 layers, d = 768)'],
  ['CNN', 'kernel sizes 2, 3, 4; 128 filters each; ReLU; masked global max-pool'],
  ['Classifier input', '768 ([CLS]) + 384 (CNN) = 1152 features, dropout 0.3'],
  ['Parameters', `${H.params_millions} million (word-embedding matrix frozen)`],
  ['Maximum length', '128 tokens, dynamic padding with length bucketing'],
  ['Optimiser', 'AdamW, lr 3×10⁻⁵ (encoder) and 10⁻³ (head), weight decay 0.01'],
  ['Schedule', 'Linear warm-up over 10% of steps, then linear decay'],
  ['Loss', 'Class-weighted cross-entropy'],
  ['Batch size / epochs', `32 / ${H.epochs} (best epoch kept by validation F1)`],
  ['Precision', 'Automatic mixed precision (FP16)'],
  ['Training time', `${H.train_minutes} minutes on ${H.device}`],
], [32, 68])
P('An identical model without the CNN branch (DistilBERT only) was trained with the same settings to measure what the convolutional branch contributes.')
H2('5.5 Threshold selection and calibration')
P('Class weighting pushes predicted probabilities upward, so a fixed threshold such as τ_strict = 0.85 would not mean "85% likely to be toxic". For each model the decision threshold for the classification metrics is chosen to maximise F1 on the validation set. Separately, Platt scaling is fitted on the validation set so that the probabilities used by the pipeline are calibrated and the design\'s thresholds keep their intended meaning.')
H2('5.6 Implementation notes on the layers')
P('Two refinements were made to the original design while implementing it, both documented in the source code:')
bullets([
  [B_('EMA only on borderline messages. '), 'Applying Equation 5 to every clean message ("see you at six") would drag a long friendship\'s tolerance back to zero. The update is therefore applied only to accepted messages whose score is in the grey zone.'],
  [B_('No shared bias term in Layer 5. '), 'In early federated runs the bias dominated each client\'s update; after clipping, the feature weights barely moved and the model predicted almost everything as clean (F1 0.36 without noise). Removing the shared bias and balancing classes locally raised the noise-free F1 to the values reported in Chapter 7.'],
])
H2('5.7 Explainability')
P('The Analyzer explains a score by occlusion: each word is removed in turn and the change in the model\'s log-odds is recorded. Measuring on the log-odds scale matters because near-certain predictions saturate; on the probability scale, removing any single word from a message scored at 0.98 changes almost nothing and punctuation could appear to "drive" the decision. The approach is model-agnostic, like LIME, but deterministic and fast enough for interactive use.')
H2('5.8 Web application')
P('The interface has eight views: a scroll-driven landing page; the Live Lab, where messages can be sent between demo users and each layer\'s decision is shown as a trace; the Analyzer; the Relational Graph; the Swarm page with a live federated simulation; the Sentinel cache; the Results dashboard; and the Audit log. The following figures show the main screens.')
figure('docs/screenshots/home.png', 'Landing page')
figure('docs/screenshots/lab.png', 'Live Lab: the same sentence delivered between friends (L3) and held for a private check-in from a stranger (L4)')
figure('docs/screenshots/analyzer.png', 'Analyzer: de-obfuscation, calibrated score and word-level attribution')
figure('docs/screenshots/graph.png', 'Relational graph: teal edges are established banter, the red edge was collapsed by the recipient')
figure('docs/screenshots/swarm-sim.png', 'Swarm page: live differentially private federated simulation')
figure('docs/screenshots/results.png', 'Results dashboard reading the measured metrics')
H2('5.9 Telegram integration')
P('Because every layer is exposed through the REST API, CYPHER is not tied to its own web interface. To demonstrate this, a moderation bot for Telegram groups was implemented (bot/telegram_bot.py, built on the official Bot API through the python-telegram-bot library). Each group chat becomes a CYPHER room; a message sent as a reply is treated as addressed to the person replied to, and other messages as addressed to the group.')
bullets([
  [B_('allow: '), 'the bot does nothing.'],
  [B_('block: '), 'the bot deletes the message and posts a short notice naming the reason.'],
  [B_('verify: '), 'the bot sends the recipient a private message with the quoted text and two buttons, "It’s fine" and "Not okay". The sender sees nothing. "Not okay" deletes the original group message, collapses the relationship edge and creates a differentially private update, exactly as in the web application.'],
])
P('A /check command returns the score, the decoded text and the words that drove the decision. WhatsApp was considered but not used: personal and group chats are end-to-end encrypted and the official Business API cannot read groups, which is precisely the setting in which CYPHER’s design argues that moderation must run on the device itself.')

// ================================================================ CHAPTER 6
Chapter('Testing')
H2('6.1 Strategy')
P('Testing was carried out at three levels: automated unit tests of each layer\'s logic, system tests of the full pipeline through the REST API with the trained model, and interface tests in a real browser at desktop and mobile sizes.')
H2('6.2 Unit tests')
P('Sixteen pytest tests run in about four seconds. They use a stub classifier with fixed scores so that the routing logic is tested independently of model quality. All sixteen pass.')
table('Unit tests', ['Area', 'What is verified', 'Result'], [
  ['Text cleaning', 'URLs, mentions, HTML entities, stretched letters', 'Pass'],
  ['De-obfuscation', '1d10t → idiot, ki11 → kill, st00pid → stoopid; plain numbers untouched', 'Pass'],
  ['Sentinel', 'Seed slang is matched; terms expire after the TTL and are purged', 'Pass'],
  ['Score fusion', 'Severity ≥ 0.9 is treated as explicit; weaker slang nudges the score', 'Pass'],
  ['Relational graph', 'EMA update equals Equation 5; flag collapses tolerance to 0', 'Pass'],
  ['Intent variance', 'Friend → allow, stranger → verify, large ΔV → block', 'Pass'],
  ['DP sanitiser', 'Clipped update has norm exactly C', 'Pass'],
  ['Privacy accounting', 'ε decreases with σ and increases with rounds', 'Pass'],
  ['Pipeline', 'Explicit → L2 block; same text routed differently by relationship; flag → L5 packet', 'Pass'],
], [20, 64, 16])
H2('6.3 System tests')
table('System tests through the API with the trained hybrid model', ['Scenario', 'Expected', 'Observed'], [
  ['"you played like a noob yesterday lol", kabir → aarav (friends, S = 0.60)', 'Delivered by L3', 'Allow, L3 (P = 0.52)'],
  ['Same text, rohan → meera (strangers)', 'Private check-in', 'Verify, L4 (ΔV = 0.42)'],
  ['"shut up you worthless piece of garbage"', 'Blocked by L2', 'Block, L2 (P = 0.91)'],
  ['"nobody in this group actually wants you here"', 'Not missed', 'Verify, L4 (P = 0.39)'],
  ['"u r a st00pid l0ser, k1ll urself"', 'De-obfuscated and blocked', 'Block, L2 (P = 0.98)'],
  ['Recipient flags a pending message', 'S → 0, DP packet queued', 'S = 0.00, packet ‖g‖ 0.71 → 128 after noise'],
], [48, 24, 28])
H2('6.4 Interface tests')
P('The interface was checked in Chrome at 1440×900 and with mobile emulation at 390×844, with and without reduced motion. The production build type-checks without errors.')
P('The Telegram bot’s handlers were exercised with simulated Telegram updates against the running API. A friend’s roast was left untouched, the same reply from a stranger produced a private check-in to the recipient, an explicit insult was deleted with a notice, a "Not okay" answer removed the original group message, and /check decoded "l0ser" and scored the message 91% toxic.')
H2('6.5 Defects found and fixed')
table('Defects found during testing', ['Defect', 'Cause', 'Fix'], [
  ['"ki11" normalised to "kiii"', 'Every 1 mapped to i', 'Doubled 1 maps to ll'],
  ['Landing-page demo claimed a friend\'s insult would pass', 'Real model scores "you\'re such an idiot" at 0.99 (explicit)', 'Demo now uses sentences the model actually places in the grey zone'],
  ['Attribution highlighted punctuation', 'Saturated probabilities near 1.0', 'Occlusion measured in log-odds; punctuation skipped'],
  ['Mobile page wider than screen', 'Marquee track not clipped', 'Overflow clipped on the strip and page'],
  ['Animated cards off-centre', 'CSS translate and animation transform combined', 'Animation library owns the transform'],
  ['Federated model predicted only "clean"', 'Bias term dominated clipped updates', 'Bias removed from shared update; local class balancing'],
], [32, 34, 34])

// ================================================================ CHAPTER 7
Chapter('Results and Discussion')
H2('7.1 Classification performance')
P(`Table 7.1 compares all six models on the ${n(H.n_test)}-message test set. Thresholds were chosen on the validation set, never on the test set.`)
const order = ['cypher_hybrid', 'transformer_only', 'bilstm_attention', 'linear_svm', 'logistic_regression', 'naive_bayes']
const label = { cypher_hybrid: 'CYPHER hybrid (DistilBERT + CNN)', transformer_only: 'DistilBERT only', bilstm_attention: 'BiLSTM + attention', linear_svm: 'TF-IDF + Linear SVM', logistic_regression: 'TF-IDF + Logistic Regression', naive_bayes: 'Naive Bayes' }
table('Test-set performance of all models', ['Model', 'Accuracy', 'Precision', 'Recall', 'F1', 'ROC-AUC'],
  order.map((k) => { const m = metrics[k]; const b = k === 'cypher_hybrid'; return [{ t: label[k], b }, { t: f3(m.accuracy), b }, { t: f3(m.precision), b }, { t: f3(m.recall), b }, { t: f3(m.f1), b }, { t: f3(m.roc_auc), b }] }),
  [36, 13, 13, 12, 12, 14])
figure('results/figures/fig_model_f1.png', 'F1 score of each model on the test set')
P([`The hybrid model achieves the best F1 (${f3(H.f1)}), accuracy (${pct(H.accuracy)}) and ROC-AUC (${f3(H.roc_auc)}). Both transformer models clearly outperform the recurrent and classical baselines, by about 0.02–0.03 F1 over the best TF-IDF model and 0.09 over Naive Bayes. Naive Bayes has the highest recall only because it flags far more messages, which shows in its low precision.`])
P([B_('The CNN branch contributes very little. '), `The hybrid model exceeds DistilBERT alone by only ${(H.f1 - T.f1).toFixed(4)} F1 and ${(H.roc_auc - T.roc_auc).toFixed(4)} AUC, a difference well within run-to-run variation. On this data the transformer already captures the local n-gram patterns that the convolutions were intended to add. The CNN is kept because its cost is small, but the evidence does not support claiming it as an improvement.`])
figure('results/figures/fig_roc_pr.png', 'ROC and precision–recall curves')
H2('7.2 Error analysis')
const cm = H.confusion
P(`Of ${n(cm[0][0] + cm[0][1])} clean test messages, ${n(cm[0][1])} were wrongly flagged (false positives); of ${n(cm[1][0] + cm[1][1])} toxic messages, ${n(cm[1][0])} were missed (Figure 7.3). Because the threshold maximises F1, the model leans slightly towards recall, which is the safer direction for a system in which Layers 3 and 4 can still release wrongly flagged borderline messages.`)
figure('results/figures/fig_confusion.png', 'Confusion matrix of the hybrid model', 300)
H2('7.3 Performance by language')
P(`Performance differs sharply by language (Figure 7.4). The hybrid model reaches an F1 of ${f3(H.per_lang_f1.english)} on English but only ${f3(H.per_lang_f1.hindi)} on Hindi and ${f3(H.per_lang_f1.hinglish)} on Hinglish. The non-English portion is small (under a fifth of the data), comes from a single corpus labelled for hate speech rather than general toxicity, and contains Romanised Hindi with highly variable spelling. Improving this slice is the most important direction for future work.`)
figure('results/figures/fig_per_language.png', 'F1 score by language')
H2('7.4 Training behaviour and latency')
const hh = hist.cypher_hybrid
P(`Both transformer models converged quickly (Figure 7.5). The hybrid model reached a validation F1 of ${f3(hh[0].val_f1)} after the first epoch and ${f3(hh.at(-1).val_f1)} after the second, so further epochs were not expected to help much. Average inference latency for a single message was ${H.latency_ms.toFixed(1)} ms on the GPU, comfortably inside the one-second target.`)
figure('results/figures/fig_convergence.png', 'Training loss and validation scores per epoch')
H2('7.5 Effect of relational context')
P(`To measure Layers 3 and 4, a simulation of ${n(ab.config.interactions)} interactions was run through the trained model in four rooms of ten users. ${pct(ab.config.banter_share, 0)} of the messages were rough banter between friend pairs, ${pct(ab.config.harmful_share, 0)} were sent from a bully to a victim (half real toxic test comments, half covert bullying without swear words), and the rest were real clean test comments between random users. Friend pairs received a short warm-up history that was not counted. When asked, friends approved banter with probability ${ab.config.p_approve_banter} and victims flagged abuse with probability ${ab.config.p_flag_attack}.`)
const pk = ab.policies
table('Moderation outcomes on the same 10,000-message stream', ['Policy', 'Benign blocked', 'of which banter', 'Harmful stopped', 'Private check-ins'], [
  ['Static keyword filter', n(pk.keyword.false_positive_actions), n(pk.keyword.fp_banter), pct(pk.keyword.recall), '–'],
  ['Same model, no context', n(pk.standard_ai.false_positive_actions), n(pk.standard_ai.fp_banter), pct(pk.standard_ai.recall), '–'],
  [{ t: 'Full CYPHER pipeline', b: true }, { t: n(pk.cypher.false_positive_actions), b: true }, { t: n(pk.cypher.fp_banter), b: true }, { t: pct(pk.cypher.recall), b: true }, { t: n(pk.cypher.prompts), b: true }],
], [32, 17, 17, 17, 17])
figure('results/figures/fig_ablation.png', 'Wrongful moderation and harmful messages stopped under each policy')
P([`The full pipeline wrongly blocked ${n(pk.cypher.false_positive_actions)} benign messages against ${n(pk.standard_ai.false_positive_actions)} for the same model without context, a reduction of `, B_(pct(ab.fp_reduction_vs_ai)), `, and ${pct(ab.fp_reduction_vs_keyword)} fewer than the keyword filter. At the same time it stopped more harmful messages (${pct(pk.cypher.recall)} against ${pct(pk.standard_ai.recall)}), ${pk.cypher.caught_after_delivery} of them through the victim's private flag.`])
const rt = ab.cypher_routing
P([B_('Where context did not help. '), `Of the banter messages, ${n(rt['banter:L2:block'] || 0)} were blocked at Layer 2 because the model scored them above 0.85: explicit insults such as "loser" or "shut up you idiot" are treated as explicit regardless of friendship, exactly as the zero-tolerance design specifies. Context can only rescue messages in the grey zone. In addition, ${n(rt['harmful:L2:allow'] || 0)} harmful messages, mostly covert bullying without abusive words, scored below 0.30 and were delivered without any check. Finally, ${n(pk.cypher.prompts)} private check-ins were shown, ${n(rt['neutral:L4:verify'] || 0)} of them for ordinary messages between users with no history; in a real deployment this frequency could cause prompt fatigue.`])
H2('7.6 Privacy–utility trade-off of Layer 5')
table('Federated learning with differential privacy (50 clients, 30 rounds, C = 1, δ = 10⁻⁵)', ['Noise σ', 'Final F1', 'Final accuracy', 'Privacy ε'],
  [['Centralised (no privacy)', f3(fed.central.f1), f3(fed.central.accuracy), '–'],
   ...fed.runs.map((r) => { const e = r.history.at(-1); return [`σ = ${r.noise_multiplier}`, f3(e.f1), f3(e.accuracy), e.epsilon == null ? '∞' : e.epsilon.toFixed(1)] })],
  [34, 22, 22, 22])
figure('results/figures/fig_federated.png', 'Test F1 over federated rounds for different noise levels')
P(`Without noise, federated training on non-IID clients reaches an F1 of ${f3(fed.runs[0].history.at(-1).f1)}, close to the centrally trained model (${f3(fed.central.f1)}). Adding noise lowers utility as expected: at σ = 1 the F1 is ${f3(fed1.f1)} with ε = ${fed1.epsilon.toFixed(1)}. These ε values are large compared with the single-digit budgets used in production systems. The bound is conservative (it ignores amplification from client sampling) and the simulation has only 50 clients; with thousands of participating devices the same noise is averaged over far more updates, allowing much smaller ε for the same accuracy.`)
H2('7.7 Comparison with the earlier project volumes')
P('The research paper and the earlier volumes of this project reported projected figures (for example 96.5% accuracy and an F1 of 0.962 for the hybrid model, and an 85.4% reduction in false positives) before the system had been built. The measured values in this chapter are lower: 87.4% accuracy, an F1 of 0.811 and a 45.1% reduction. The differences have identifiable causes: training on public data rather than a large collected corpus, a 4 GB laptop GPU and DistilBERT instead of BERT-base on data-centre hardware, two training epochs, and the inclusion of hard code-mixed text. We report the measured figures because they are the ones the submitted software reproduces.')
H2('7.8 Discussion')
P('The results support the central claim of the architecture, namely that remembering relationships and asking recipients removes a large share of wrongful moderation without letting more abuse through, while showing that the size of the benefit depends on how many messages fall into the grey zone. They do not support the claim that the CNN branch improves the classifier. The weakest component is coverage of code-mixed and covert abuse, which no layer currently compensates for.')

// ================================================================ CHAPTER 8
Chapter('Limitations and Future Work')
H2('8.1 Limitations')
bullets([
  'The relational-context evaluation uses a simulated chat stream with scripted banter and simulated recipient responses; real relationships and real users will behave differently.',
  'Hindi and Hinglish performance (F1 ≈ 0.62) is much weaker than English (0.86).',
  'Covert bullying without abusive vocabulary is often scored as clean and never reaches the context layers.',
  'The zero-tolerance threshold blocks explicit insults between close friends.',
  'Layer 5 is simulated on one machine with 50 clients; its privacy budgets are loose at that scale.',
  'The Sentinel\'s slang list is seeded manually; automated mining of public streams is not implemented.',
])
H2('8.2 Future work')
bullets([
  [B_('Better multilingual data: '), 'add HASOC and other code-mixed corpora and evaluate larger multilingual encoders such as XLM-R.'],
  [B_('Conversation context in Layer 2: '), 'feed the previous few messages to the classifier so covert attacks that only make sense in context are scored higher.'],
  [B_('Learned thresholds: '), 'tune τ and the ΔV bands per community using recipient feedback.'],
  [B_('User study: '), 'measure prompt fatigue and perceived fairness with real participants.'],
  [B_('On-device deployment: '), 'distil the model for mobile and run Layer 5 across real devices with secure aggregation.'],
  [B_('Multimodal abuse: '), 'extend to memes (CLIP) and voice (Whisper transcription followed by the text pipeline).'],
])

// ================================================================ CHAPTER 9
Chapter('Conclusion')
P(`This project designed, implemented and evaluated CYPHER, a five-layer system for cyberbullying moderation that considers who is talking to whom, gives the recipient the final say on ambiguous messages and learns from confirmed attacks without collecting message text. The multilingual hybrid classifier reached an F1 of ${f3(H.f1)} and a ROC-AUC of ${f3(H.roc_auc)} on ${n(H.n_test)} held-out messages, outperforming four baselines. In simulation, relational context and private recipient checks cut wrongful moderation by ${pct(ab.fp_reduction_vs_ai)} while stopping more abuse. The differentially private federated layer showed a clear and quantified privacy–utility trade-off.`)
P('Equally important, the evaluation identified what does not yet work: the convolutional branch adds little, code-mixed and covert abuse remain hard, and explicit banter is still blocked. Because every number in this report is produced by the accompanying software, these findings can be checked and built upon. We hope CYPHER shows that effective online safety does not require choosing between protecting users and respecting their relationships and privacy.')

// ================================================================ REFERENCES
Unnumbered('References')
const refs = [
  'A. Schmidt and M. Wiegand, "A survey on hate speech detection using natural language processing," in Proc. 5th Int. Workshop on Natural Language Processing for Social Media, 2017, pp. 1–10.',
  'J. Devlin, M.-W. Chang, K. Lee, and K. Toutanova, "BERT: Pre-training of deep bidirectional transformers for language understanding," in Proc. NAACL-HLT, 2019, pp. 4171–4186.',
  'T. Davidson, D. Warmsley, M. Macy, and I. Weber, "Automated hate speech detection and the problem of offensive language," in Proc. 11th Int. AAAI Conf. on Web and Social Media, 2017.',
  'H. B. McMahan, E. Moore, D. Ramage, S. Hampson, and B. Agüera y Arcas, "Communication-efficient learning of deep networks from decentralized data," in Proc. AISTATS, 2017.',
  'A. Vaswani et al., "Attention is all you need," in Advances in Neural Information Processing Systems, 2017.',
  'C. Dwork, "Differential privacy: A survey of results," in Proc. Int. Conf. on Theory and Applications of Models of Computation, Springer, 2008, pp. 1–19.',
  'M. Abadi et al., "Deep learning with differential privacy," in Proc. ACM SIGSAC Conf. on Computer and Communications Security, 2016, pp. 308–318.',
  'T. Mandl et al., "Overview of the HASOC track at FIRE 2019: Hate speech and offensive content identification in Indo-European languages," in Proc. 11th Forum for Information Retrieval Evaluation, 2019.',
  'Y. Kim, "Convolutional neural networks for sentence classification," in Proc. EMNLP, 2014, pp. 1746–1751.',
  'M. A. Haq, A. Alabdulwahab, and M. Alshehri, "Cyberbullying detection using machine learning and deep learning," Int. J. Advanced Computer Science and Applications, vol. 14, no. 10, 2023.',
  'A. Desai, S. Kalaskar, O. Kumbhar, and R. Dhumal, "Cyber bullying detection on social media using machine learning," ITM Web of Conferences, ICACC-2021, 2021.',
  'M. Kini et al., "Cyberbullying detection using traditional and deep learning methods," Int. J. Creative Research Thoughts, 2024.',
  'V. Sanh, L. Debut, J. Chaumond, and T. Wolf, "DistilBERT, a distilled version of BERT: smaller, faster, cheaper and lighter," arXiv:1910.01108, 2019.',
  'I. Mironov, "Rényi differential privacy," in Proc. IEEE 30th Computer Security Foundations Symposium, 2017, pp. 263–275.',
  'M. T. Ribeiro, S. Singh, and C. Guestrin, "Why should I trust you? Explaining the predictions of any classifier," in Proc. ACM SIGKDD, 2016.',
  'S. M. Lundberg and S.-I. Lee, "A unified approach to interpreting model predictions," in Advances in Neural Information Processing Systems, 2017.',
  'Jigsaw / Conversation AI, "Toxic Comment Classification Challenge," Kaggle, 2018.',
  'J. Konečný, H. B. McMahan, F. X. Yu, P. Richtárik, A. T. Suresh, and D. Bacon, "Federated learning: Strategies for improving communication efficiency," arXiv:1610.05492, 2016.',
]
refs.forEach((r, i) => children.push(new Paragraph({ spacing: { after: 120, line: 300 }, indent: { left: 540, hanging: 540 }, alignment: AlignmentType.JUSTIFIED,
  children: [run(`[${i + 1}]\t`, { size: 22 }), run(r, { size: 22 })] })))

// ================================================================ APPENDICES
Unnumbered('Appendix A: Running the Project')
P('The source code is organised as described in the repository README. The following commands reproduce every result in this report.')
const code = (t) => children.push(new Paragraph({ spacing: { after: 0, line: 260 }, shading: { fill: 'F2F0EC', type: ShadingType.CLEAR, color: 'auto' },
  children: [new TextRun({ text: t || ' ', font: 'Consolas', size: 19 })] }))
H2('A.1 Installation')
;['python -m venv .venv', '.venv\\Scripts\\activate            (Windows)   |   source .venv/bin/activate   (Linux/macOS)',
  'pip install torch --index-url https://download.pytorch.org/whl/cu124   (GPU only)', 'pip install -r requirements.txt'].forEach(code)
H2('A.2 Reproducing the results')
;['python -m ml.download_data', 'python -m ml.prepare_data', 'python -m ml.train_baselines', 'python -m ml.train_bilstm',
  'python -m ml.train_transformer', 'python -m ml.train_transformer --no-cnn', 'python -m ml.simulate_banter',
  'python -m ml.run_federated', 'python -m ml.make_figures', 'python -m pytest -q'].forEach(code)
H2('A.3 Running the application')
;['run.bat            (Windows: builds the interface and starts http://127.0.0.1:8000)', './run.sh           (Linux/macOS)',
  '', 'Development mode:', 'uvicorn backend.main:app --reload --port 8000', 'cd frontend && npm install && npm run dev      (http://localhost:5173)'].forEach(code)

H2('A.4 Telegram bot')
;['1. In Telegram, open @BotFather, send /newbot and copy the token.', '2. In @BotFather send /setprivacy, choose the bot, select Disable.',
  '3. Copy .env.example to .env and set TELEGRAM_BOT_TOKEN=<token>.', '4. Add the bot to a group and make it admin (Delete messages).',
  '5. Members press Start in a private chat with the bot once.', '6. Run the app (run.bat), then in a second window: run_bot.bat'].forEach(code)

Unnumbered('Appendix B: Additional Screens')
chapter = 'B'; fig = 0
figure('docs/screenshots/banter-paradox.png', 'Landing page: the banter paradox, one sentence and two relationships')
figure('docs/screenshots/layers.png', 'Landing page: scroll-driven explanation of the five layers')
figure('docs/screenshots/results-ablation.png', 'Results dashboard: relational-context ablation')
figure('docs/screenshots/audit.png', 'Audit log with per-decision reasons')
const mob = pngSize(path.join(ROOT, 'docs/screenshots/mobile-home.png'))
const mobLab = pngSize(path.join(ROOT, 'docs/screenshots/mobile-lab.png'))
fig += 1
children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [
  new ImageRun({ type: 'png', data: mob.data, transformation: { width: 200, height: Math.round(200 * mob.h / mob.w) } }),
  new TextRun('     '),
  new ImageRun({ type: 'png', data: mobLab.data, transformation: { width: 200, height: Math.round(200 * mobLab.h / mobLab.w) } }),
] }))
children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Figure B.${fig}: `, font: FONT, size: 20, bold: true }), new TextRun({ text: 'Mobile layout of the landing page and Live Lab (390 × 844)', font: FONT, size: 20, italics: true })] }))

// ================================================================ DOCUMENT
const footer = () => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] })
const page = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1800, right: 1440 } }

const doc = new Document({
  creator: 'Paramartha Ghosh, Adrika Kundu',
  title: 'CYPHER Project Report',
  description: 'Final year project report',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 34, bold: true, color: '111111' }, paragraph: { spacing: { before: 120, after: 360 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: '111111' }, paragraph: { spacing: { before: 320, after: 140 }, keepNext: true, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, italics: true, color: '333333' }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: { config: numberingConfigs },
  sections: [
    { properties: { titlePage: true, page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } }, footers: { default: footer(), first: new Footer({ children: [] }) }, children: front },
    { properties: { page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } }, footers: { default: footer() }, children },
  ],
})

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, 'CYPHER_Project_Report.docx')
  fs.writeFileSync(out, buf)
  console.log('wrote', out, (buf.length / 1e6).toFixed(1), 'MB')
})
