"""Classical baselines: Naive Bayes, Logistic Regression and Linear SVM on TF-IDF.

The logistic regression model is also saved as the lightweight fallback that the
API uses when the transformer weights are not available (e.g. a fresh clone).
"""

import time

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import ComplementNB
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC

from cypher.config import BASELINE_PATH
from ml.common import apply_platt, best_threshold, fit_platt, load_splits, report


def features():
    return FeatureUnion([
        ("word", TfidfVectorizer(lowercase=True, ngram_range=(1, 2), min_df=2, max_features=200_000, sublinear_tf=True)),
        ("char", TfidfVectorizer(lowercase=True, analyzer="char_wb", ngram_range=(2, 5), min_df=3,
                                 max_features=200_000, sublinear_tf=True)),
    ])


def timed_latency(model, texts, n=200):
    sample = list(texts[:n])
    start = time.perf_counter()
    for t in sample:
        model.predict_proba([t])
    return (time.perf_counter() - start) * 1000 / len(sample)


def main():
    train, val, test = load_splits()
    models = {
        "naive_bayes": Pipeline([("tfidf", TfidfVectorizer(lowercase=True, ngram_range=(1, 2), min_df=2)),
                                 ("clf", ComplementNB(alpha=0.5))]),
        "logistic_regression": Pipeline([("tfidf", features()),
                                         ("clf", LogisticRegression(C=4.0, max_iter=2000, class_weight="balanced"))]),
        "linear_svm": Pipeline([("tfidf", features()),
                                ("clf", CalibratedClassifierCV(LinearSVC(C=0.5, class_weight="balanced"), cv=3))]),
    }
    for name, model in models.items():
        t0 = time.time()
        model.fit(train.text, train.label)
        val_probs = model.predict_proba(val.text)[:, 1]
        thr = best_threshold(val.label, val_probs)
        probs = model.predict_proba(test.text)[:, 1]
        report(name, test, probs, thr, timed_latency(model, test.text),
               extra={"train_seconds": round(time.time() - t0, 1)})
        if name == "logistic_regression":
            calib = fit_platt(val.label.values, val_probs)
            BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
            joblib.dump({"pipeline": model, "calibration": calib,
                         "threshold": float(apply_platt(np.array([thr]), *calib)[0])}, BASELINE_PATH, compress=3)
            print("saved fallback model ->", BASELINE_PATH)


if __name__ == "__main__":
    main()
