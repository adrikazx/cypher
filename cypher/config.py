"""Central paths and thresholds. Values can be overridden with environment variables."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
MODELS_DIR = Path(os.getenv("CYPHER_MODELS_DIR", ROOT / "models"))
RESULTS_DIR = ROOT / "results"
FIGURES_DIR = RESULTS_DIR / "figures"
DB_PATH = Path(os.getenv("CYPHER_DB", ROOT / "data" / "cypher.db"))

HYBRID_DIR = MODELS_DIR / "hybrid"
BASELINE_PATH = MODELS_DIR / "baseline" / "tfidf_lr.joblib"

ENCODER_NAME = os.getenv("CYPHER_ENCODER", "distilbert-base-multilingual-cased")
MAX_LEN = 128

# Layer 2 - zero tolerance threshold from the paper (tau_strict)
TAU_STRICT = float(os.getenv("CYPHER_TAU_STRICT", 0.85))
# below this a message is considered clean and skips the relational check
TAU_CLEAN = float(os.getenv("CYPHER_TAU_CLEAN", 0.30))

# Layer 3 - relational graph
EMA_ALPHA = float(os.getenv("CYPHER_EMA_ALPHA", 0.85))
INITIAL_TOLERANCE = 0.10
DELTA_VERIFY = 0.15  # intent variance above this -> ask the recipient
DELTA_BLOCK = 0.50   # intent variance above this -> covert attack, block

# Layer 1 - sentinel TTL (days)
SLANG_TTL_DAYS = int(os.getenv("CYPHER_SLANG_TTL_DAYS", 60))

# Layer 5 - differential privacy
DP_CLIP = 1.0
DP_NOISE_MULTIPLIER = 1.0
DP_DELTA = 1e-5
HASH_DIM = 2 ** 18
