"""Shared helpers for the training scripts: data loading, metrics, result files."""

import json

import numpy as np
import pandas as pd
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, precision_recall_curve,
                             precision_score, recall_score, roc_auc_score, roc_curve)

from cypher.config import PROCESSED_DIR, RESULTS_DIR

METRICS_DIR = RESULTS_DIR / "metrics"
CURVES_DIR = RESULTS_DIR / "curves"


def load_splits():
    return tuple(pd.read_csv(PROCESSED_DIR / f"{s}.csv", keep_default_na=False) for s in ("train", "val", "test"))


def fit_platt(y_true, probs) -> tuple[float, float]:
    """Platt scaling on the validation set.

    Class-weighted training pushes probabilities upwards; calibrating them makes
    the paper's fixed tau_strict = 0.85 mean "85 % likely toxic" again.
    """
    from sklearn.linear_model import LogisticRegression

    z = np.log(np.clip(probs, 1e-6, 1 - 1e-6) / np.clip(1 - probs, 1e-6, 1)).reshape(-1, 1)
    lr = LogisticRegression(C=1e6).fit(z, y_true)
    return float(lr.coef_[0, 0]), float(lr.intercept_[0])


def apply_platt(probs, a: float, b: float):
    z = np.log(np.clip(probs, 1e-6, 1 - 1e-6) / np.clip(1 - probs, 1e-6, 1))
    return 1 / (1 + np.exp(-(a * z + b)))


def best_threshold(y_true, probs) -> float:
    """Pick the decision threshold that maximises F1 on the validation set."""
    p, r, t = precision_recall_curve(y_true, probs)
    f1 = 2 * p * r / np.clip(p + r, 1e-9, None)
    return float(t[np.argmax(f1[:-1])])


def report(name: str, df_test: pd.DataFrame, probs: np.ndarray, threshold: float, latency_ms: float, extra=None):
    y = df_test.label.values
    pred = (probs >= threshold).astype(int)
    per_lang = {
        lang: round(f1_score(g.label, pred[g.index.values]), 4)
        for lang, g in df_test.reset_index(drop=True).groupby("lang")
    }
    res = {
        "model": name,
        "accuracy": round(accuracy_score(y, pred), 4),
        "precision": round(precision_score(y, pred), 4),
        "recall": round(recall_score(y, pred), 4),
        "f1": round(f1_score(y, pred), 4),
        "roc_auc": round(roc_auc_score(y, probs), 4),
        "threshold": round(threshold, 4),
        "per_lang_f1": per_lang,
        "latency_ms": round(latency_ms, 3),
        "confusion": confusion_matrix(y, pred).tolist(),
        "n_test": int(len(y)),
    }
    if extra:
        res.update(extra)

    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    CURVES_DIR.mkdir(parents=True, exist_ok=True)
    (METRICS_DIR / f"{name}.json").write_text(json.dumps(res, indent=2))

    fpr, tpr, _ = roc_curve(y, probs)
    pr_p, pr_r, _ = precision_recall_curve(y, probs)
    step_roc = max(1, len(fpr) // 400)
    step_pr = max(1, len(pr_p) // 400)
    curves = {
        "roc": {"fpr": fpr[::step_roc].round(4).tolist(), "tpr": tpr[::step_roc].round(4).tolist()},
        "pr": {"precision": pr_p[::step_pr].round(4).tolist(), "recall": pr_r[::step_pr].round(4).tolist()},
    }
    (CURVES_DIR / f"{name}.json").write_text(json.dumps(curves))
    np.save(CURVES_DIR / f"{name}_probs.npy", probs.astype(np.float32))

    print(f"[{name}] acc={res['accuracy']} P={res['precision']} R={res['recall']} "
          f"F1={res['f1']} AUC={res['roc_auc']} thr={res['threshold']} per_lang={per_lang}")
    return res
