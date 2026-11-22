"""Layer 2 - Absolute Firewall.

Loads the fine-tuned hybrid transformer-CNN if its weights are present and
falls back to the TF-IDF logistic-regression model otherwise, so the system
still runs on a fresh clone without a GPU.
"""

import json
import logging

import joblib
import numpy as np

from cypher.config import BASELINE_PATH, HYBRID_DIR
from cypher.text import words

log = logging.getLogger("cypher.firewall")


class Firewall:
    def __init__(self, prefer: str = "auto"):
        self.backend = None
        if prefer in ("auto", "hybrid") and (HYBRID_DIR / "model.pt").exists():
            try:
                self._load_hybrid()
            except Exception as exc:  # torch missing, corrupt weights, ...
                log.warning("hybrid model unavailable (%s), using baseline", exc)
        if self.backend is None:
            if not BASELINE_PATH.exists():
                raise FileNotFoundError(
                    f"No model found. Run `python -m ml.train_baselines` (fast) or "
                    f"`python -m ml.train_transformer` first. Looked in {BASELINE_PATH.parent.parent}")
            bundle = joblib.load(BASELINE_PATH)
            self.pipeline = bundle["pipeline"]
            self.threshold = float(bundle["threshold"])
            self.calibration = tuple(bundle.get("calibration", (1.0, 0.0)))
            self.backend = "tfidf-logreg"
            self.description = "TF-IDF (word + char n-grams) + Logistic Regression"
        log.info("firewall backend: %s", self.backend)

    def _load_hybrid(self):
        import torch
        from transformers import AutoTokenizer

        from cypher.models import HybridTransformerCNN

        meta = json.loads((HYBRID_DIR / "meta.json").read_text())
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = HybridTransformerCNN(meta["encoder"], use_cnn=meta["use_cnn"])
        state = torch.load(HYBRID_DIR / "model.pt", map_location="cpu")
        model.load_state_dict({k: v.float() if v.is_floating_point() else v for k, v in state.items()})
        self.model = model.to(self.device).eval()
        self.tok = AutoTokenizer.from_pretrained(HYBRID_DIR)
        self.max_len = meta["max_len"]
        self.threshold = float(meta["threshold"])
        self.calibration = tuple(meta.get("calibration", (1.0, 0.0)))
        self.backend = "hybrid-transformer-cnn"
        self.description = f"{meta['encoder']} + 1D-CNN (k=2,3,4) hybrid"
        self._torch = torch

    def score(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        """Calibrated toxicity probabilities."""
        raw = self.raw_score(texts, batch_size)
        a, b = self.calibration
        z = np.log(np.clip(raw, 1e-6, 1 - 1e-6) / np.clip(1 - raw, 1e-6, 1))
        return 1 / (1 + np.exp(-(a * z + b)))

    def raw_score(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        if not texts:
            return np.zeros(0)
        if self.backend == "tfidf-logreg":
            return self.pipeline.predict_proba(texts)[:, 1]
        torch = self._torch
        out = []
        with torch.no_grad():
            for i in range(0, len(texts), batch_size):
                enc = self.tok(texts[i:i + batch_size], truncation=True, max_length=self.max_len,
                               padding=True, return_tensors="pt").to(self.device)
                with torch.autocast(device_type=self.device.type, dtype=torch.float16,
                                    enabled=self.device.type == "cuda"):
                    logits = self.model(enc["input_ids"], enc["attention_mask"])
                out.append(torch.softmax(logits.float(), -1)[:, 1].cpu().numpy())
        return np.concatenate(out)

    def explain(self, text: str, max_words: int = 48) -> list[dict]:
        """Occlusion attribution: how much does the score drop when each word is removed?

        Model-agnostic (works for both backends) and in the spirit of LIME's
        perturbation approach, but deterministic and cheap enough for a live UI.
        """
        toks = words(text)[:max_words]
        if not toks:
            return []
        # compare on the logit scale: near P = 0 or 1 probabilities saturate and every
        # word would look equally (un)important
        logit = lambda p: np.log(np.clip(p, 1e-6, 1 - 1e-6) / np.clip(1 - p, 1e-6, 1))
        base = logit(self.score([text]))[0]
        idx = [i for i, t in enumerate(toks) if any(c.isalnum() for c in t)]  # skip punctuation
        variants = [" ".join(toks[:i] + toks[i + 1:]) for i in idx]
        drops = dict(zip(idx, base - logit(self.score(variants)))) if idx else {}
        return [{"token": t, "weight": round(float(drops.get(i, 0.0)), 4)} for i, t in enumerate(toks)]
