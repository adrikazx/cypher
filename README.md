<div align="center">

# CYPHER

**Context-aware, privacy-preserving cyberbullying mitigation**

A 5-layer system that tells banter from bullying by remembering relationships,
asking the person on the receiving end, and learning across devices without reading their chats.

![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-2.x-EE4C2C?logo=pytorch&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

![CYPHER landing page](docs/screenshots/home.png)

</div>

---

## Why CYPHER

Keyword filters and single-message classifiers judge every sentence in a vacuum. They cannot tell two
friends trading insults from a stranger launching a targeted attack (the *banter paradox*), they miss
new coded slang, and server-side retraining means decrypting private chats.

CYPHER splits the problem into five cooperating layers. Each layer only speaks when the one before it is unsure.

| Layer | Name | What it does | Code |
|---|---|---|---|
| L1 | **Web Sentinel** | Time-to-live cache of zero-day slang (`kys`, `unalive`, Hinglish slurs) + leetspeak de-obfuscation (`1d10t` -> `idiot`). Terms unseen for 60 days are evicted. | [`cypher/layers/sentinel.py`](cypher/layers/sentinel.py) |
| L2 | **Absolute Firewall** | Multilingual DistilBERT + 1-D CNN hybrid. Calibrated score above tau = 0.85 is blocked instantly. | [`cypher/layers/firewall.py`](cypher/layers/firewall.py), [`cypher/models.py`](cypher/models.py) |
| L3 | **Relational Graph** | Per-room directed graph of tolerance S(u,v). Intent variance dV = P - S decides deliver / ask / block. EMA update. | [`cypher/layers/relational_graph.py`](cypher/layers/relational_graph.py) |
| L4 | **Victim Verification** | Ambiguous messages are delivered with a private check-in shown only to the recipient. A "not okay" collapses S to 0. | [`cypher/pipeline.py`](cypher/pipeline.py) |
| L5 | **DP Swarm Learning** | Confirmed attacks become clipped, Gaussian-noised gradients aggregated with FedAvg. Renyi-DP privacy accounting. | [`cypher/layers/swarm.py`](cypher/layers/swarm.py) |

## Results

All numbers below were produced by the scripts in this repository on a held-out test set of
**9,433 messages** (English, Hindi, Hinglish). Training ran on a laptop RTX 3050 (4 GB).

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|---|
| **CYPHER hybrid (DistilBERT + CNN)** | **0.874** | **0.772** | 0.854 | **0.811** | **0.953** |
| DistilBERT only | 0.871 | 0.760 | 0.868 | 0.810 | 0.952 |
| BiLSTM + attention | 0.848 | 0.717 | 0.859 | 0.782 | 0.937 |
| TF-IDF + Linear SVM | 0.856 | 0.741 | 0.841 | 0.788 | 0.936 |
| TF-IDF + Logistic Regression | 0.850 | 0.718 | 0.867 | 0.785 | 0.936 |
| Naive Bayes | 0.783 | 0.610 | 0.874 | 0.718 | 0.883 |

**Relational context (10,000 simulated interactions, 30% friendly banter):**

| Policy | Benign messages wrongly blocked | Harmful messages stopped |
|---|---|---|
| Static keyword filter | 2,293 | 22.8% |
| Same model, no context | 2,954 | 56.4% |
| **Full CYPHER pipeline** | **1,621 (-45%)** | **68.1%** |

**Privacy / utility (Layer 5, 50 non-IID clients, 30 rounds):** F1 falls from 0.691 (no noise) to
0.530 at sigma = 1 (epsilon = 41.3) and 0.489 at sigma = 2 (epsilon = 16.9). Centralised training reaches 0.726.

Honest notes: the CNN branch adds very little over plain DistilBERT (+0.001 F1); code-mixed Hindi/Hinglish
remains much harder (F1 ~ 0.62) than English (0.86); explicit insults between friends are still blocked
by the zero-tolerance firewall. These are discussed in the [project report](docs/report/).

<p align="center">
  <img src="docs/screenshots/lab.png" width="49%" alt="Live Lab" />
  <img src="docs/screenshots/analyzer.png" width="49%" alt="Analyzer" />
  <img src="docs/screenshots/graph.png" width="49%" alt="Relational graph" />
  <img src="docs/screenshots/results.png" width="49%" alt="Results" />
</p>

## Run it locally

### Prerequisites

- **Python 3.10 - 3.12**
- **Node.js 18+** (for the web interface)
- Optional: an NVIDIA GPU for training the transformer (inference works on CPU)

### Option A - one command

```bash
# Windows
run.bat

# macOS / Linux
chmod +x run.sh && ./run.sh
```

This creates a virtual environment, installs dependencies, builds the UI and starts everything on
**http://127.0.0.1:8000**. The first run takes a few minutes.

> The repository ships a small pre-trained fallback model (`models/baseline/`, TF-IDF + Logistic
> Regression) so the app works immediately. To use the full transformer model, train it as shown
> in [Training the models](#training-the-models).

### Option B - step by step

```bash
# 1. Python environment
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install --upgrade pip

# (GPU only) install CUDA PyTorch first, e.g. for CUDA 12.4:
# pip install torch --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt

# 2. Start the API (from the repository root)
uvicorn backend.main:app --reload --port 8000

# 3. In a second terminal: the web interface (dev mode with hot reload)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The dev server proxies `/api` to port 8000.
Interactive API docs are at **http://127.0.0.1:8000/docs**.

### Training the models

```bash
python -m ml.download_data        # ~75 MB of public datasets -> data/raw/
python -m ml.prepare_data         # clean + 80/10/10 split    -> data/processed/
python -m ml.train_baselines      # Naive Bayes, LogReg, SVM  (~3 min, CPU)
python -m ml.train_bilstm         # BiLSTM + attention        (~2 min GPU)
python -m ml.train_transformer           # CYPHER hybrid      (~11 min on RTX 3050)
python -m ml.train_transformer --no-cnn  # DistilBERT-only ablation
python -m ml.simulate_banter      # relational-context ablation -> results/ablation.json
python -m ml.run_federated        # DP federated sweep           -> results/federated.json
python -m ml.make_figures         # report figures               -> results/figures/
```

The API picks up `models/hybrid/` automatically on the next start. Metrics are written to
`results/metrics/` and shown on the Results page.

### Telegram bot

CYPHER can moderate a real Telegram group. The bot sends every group message to the CYPHER API and:

- **allow** - does nothing,
- **block** - deletes the message and posts a short notice,
- **verify** - privately messages the person who was replied to: *"Was that okay?"* with 👍 / 👎 buttons.
  👎 hides the message, resets trust to zero and creates a privacy-preserving update; the sender is never told.

**One-time setup**

1. In Telegram, open **@BotFather**, send `/newbot`, choose a name and a username ending in `bot`, and copy the **token**.
2. Still in @BotFather, send `/setprivacy`, pick your bot and choose **Disable**, so the bot can read group messages.
3. Copy `.env.example` to `.env` and paste the token: `TELEGRAM_BOT_TOKEN=123456:ABC...`
   (`.env` is git-ignored, so the token never reaches GitHub.)
4. Create a Telegram group, add the bot, and make it an **admin** with the "Delete messages" permission.
5. Everyone who should receive private check-ins opens a chat with the bot once and presses **Start**
   (Telegram does not let bots message people who have never started them).

**Run it**

```bash
# terminal 1 - the CYPHER app/API
run.bat                      # or ./run.sh, or: uvicorn backend.main:app --port 8000

# terminal 2 - the bot
run_bot.bat                  # or ./run_bot.sh, or: python -m bot.telegram_bot
```

**Try it:** *reply* to a friend's message with `you played like a noob yesterday lol` (delivered), have someone
else reply the same way to a different person (they get a private check-in), send something explicitly abusive
(removed), or use `/check <message>` to see the score and the words behind it. Group decisions also appear live
in the web app's **Audit** and **Graph** pages (room `tg<chat id>`).

### Tests

```bash
python -m pytest -q
```

16 unit tests cover text normalisation, every layer's equations and the full routing logic
(with a stub model, so no training is needed).

## Project structure

```
CYPHER/
├── backend/main.py          FastAPI app (REST API + serves the built UI)
├── bot/telegram_bot.py      Telegram group moderation bot (uses the API)
├── cypher/                  core library
│   ├── layers/              sentinel · firewall · relational_graph · swarm
│   ├── pipeline.py          the 5-layer cascade
│   ├── models.py            Hybrid Transformer-CNN, BiLSTM
│   ├── store.py             SQLite persistence
│   └── text.py              cleaning + de-obfuscation
├── ml/                      data download, training, evaluation, figures
├── frontend/                React + Vite + Tailwind + Motion interface
├── results/                 metrics, curves, figures (committed)
├── models/baseline/         small fallback model (committed)
├── tests/                   pytest suite
└── docs/                    report, screenshots, original research drafts
```

## Configuration

Copy `.env.example` to `.env` to override thresholds (`CYPHER_TAU_STRICT`, `CYPHER_EMA_ALPHA`, ...),
model and database paths. Defaults match the paper.

## Team

**Paramartha Ghosh** and **Adrika Kundu**, Department of Information Technology,
Institute of Engineering & Management, Kolkata.
Guided by **Dr. Moutushi Singh** and **Dr. Avipsita Chatterjee**.

## License

[MIT](LICENSE) for the code. Datasets are not redistributed and keep their own licences
(Jigsaw: CC0 annotations over Wikipedia text under CC BY-SA 3.0; PRISM: see its Hugging Face dataset card).
