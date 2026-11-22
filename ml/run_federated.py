"""Layer 5 experiment: privacy / utility trade-off of DP federated learning.

50 non-IID clients (each dominated by one language), 30 FedAvg rounds, update
clipping C = 1 and Gaussian noise multipliers sigma in {0, 0.5, 1, 2}. A
centrally-trained model on the same hashed features is the upper bound.
"""

import json

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score

from cypher.config import RESULTS_DIR
from cypher.layers.swarm import make_vectorizer, simulate
from ml.common import load_splits

SIGMAS = [0.0, 0.5, 1.0, 2.0]


def main():
    train, _, test = load_splits()
    vec = make_vectorizer()
    central = LogisticRegression(max_iter=1000, C=4.0, class_weight="balanced").fit(vec.transform(train.text),
                                                                                   train.label)
    pred = central.predict(vec.transform(test.text))
    out = {"setup": {"clients": 50, "rounds": 30, "clip": 1.0, "delta": 1e-5, "local_steps": 5, "local_lr": 10.0, "server_lr": 5.0,
                     "features": "hashed word 1-2 grams, 16384 dims"},
           "central": {"accuracy": round(accuracy_score(test.label, pred), 4),
                       "f1": round(f1_score(test.label, pred), 4)},
           "runs": []}
    print("central:", out["central"])
    for sigma in SIGMAS:
        hist = simulate(train.text.values, train.label.values, train.lang.values, test.text.values,
                        test.label.values, n_clients=50, rounds=30, noise_multiplier=sigma, seed=0)
        out["runs"].append({"noise_multiplier": sigma, "history": hist})
        print(f"sigma={sigma}: final {hist[-1]}")
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "federated.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
