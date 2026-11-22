"""Layer 5 - Differentially Private Swarm (federated) Learning.

Each edge device trains a small logistic-regression head over hashed n-gram
features. Hashing means no shared vocabulary ever has to leave the device.
Before an update is sent it is clipped and noised (Eq. 8):

    g~ = g / max(1, ||g||_2 / C) + N(0, sigma^2 C^2 I)

and the server combines K updates with FedAvg (Eq. 9).

Privacy accounting uses Renyi DP of the Gaussian mechanism composed over T
rounds (client-level, no subsampling amplification - a conservative bound):
    eps_RDP(a) = T * a / (2 sigma^2),   eps = min_a eps_RDP(a) + log(1/delta) / (a - 1)
"""

import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.metrics import accuracy_score, f1_score

from cypher.config import DP_CLIP, DP_DELTA, DP_NOISE_MULTIPLIER
from cypher.store import Store, now_iso

FED_DIM = 2 ** 14


def make_vectorizer(dim: int = FED_DIM) -> HashingVectorizer:
    return HashingVectorizer(n_features=dim, ngram_range=(1, 2), alternate_sign=False, norm="l2", lowercase=True)


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def logistic_grad(w, b, X, y, pos_weight: float = 1.0):
    p = sigmoid(X @ w + b)
    err = (p - y) * np.where(y == 1, pos_weight, 1.0)
    return X.T @ err / X.shape[0], float(err.mean())


def dp_sanitize(update: np.ndarray, clip: float, noise_multiplier: float, rng: np.random.Generator):
    norm = float(np.linalg.norm(update))
    clipped = update / max(1.0, norm / clip)
    noisy = clipped + rng.normal(0.0, noise_multiplier * clip, size=update.shape) if noise_multiplier > 0 else clipped
    return noisy, norm


def rdp_epsilon(noise_multiplier: float, rounds: int, delta: float = DP_DELTA) -> float:
    if noise_multiplier <= 0:
        return float("inf")
    orders = np.concatenate([np.linspace(1.01, 10, 200), np.arange(11, 256)])
    eps = rounds * orders / (2 * noise_multiplier ** 2) + np.log(1 / delta) / (orders - 1)
    return float(eps.min())


def partition_clients(langs: np.ndarray, n_clients: int, rng: np.random.Generator, skew: float = 0.7):
    """Non-IID split: each client gets most of its data from one language group."""
    groups = {g: list(rng.permutation(np.where(langs == g)[0])) for g in np.unique(langs)}
    names = list(groups)
    total = len(langs)
    per_client = total // n_clients
    clients = []
    for c in range(n_clients):
        home = names[c % len(names)]
        take = []
        for g in names:
            want = int(per_client * (skew if g == home else (1 - skew) / (len(names) - 1)))
            take += groups[g][:want]
            groups[g] = groups[g][want:]
        clients.append(np.array(take, dtype=int))
    return clients


def simulate(train_texts, train_y, train_lang, test_texts, test_y, n_clients=50, rounds=30,
             noise_multiplier=1.0, clip=DP_CLIP, local_steps=5, local_lr=10.0, server_lr=5.0, seed=0,
             callback=None):
    rng = np.random.default_rng(seed)
    vec = make_vectorizer()
    X = vec.transform(train_texts)
    Xt = vec.transform(test_texts)
    y = np.asarray(train_y, dtype=float)
    yt = np.asarray(test_y)
    clients = partition_clients(np.asarray(train_lang), n_clients, rng)

    w = np.zeros(X.shape[1])
    b = 0.0
    history = []
    for r in range(1, rounds + 1):
        deltas, sizes = [], []
        for idx in clients:
            if len(idx) == 0:
                continue
            lw, lb = w.copy(), b
            Xc, yc = X[idx], y[idx]
            pos = max(yc.sum(), 1.0)
            pos_weight = (len(yc) - pos) / pos  # computed locally, never shared
            for _ in range(local_steps):
                gw, _ = logistic_grad(lw, lb, Xc, yc, pos_weight)
                lw -= local_lr * gw
            # no shared bias: with class-balanced local loss it is unnecessary, and a bias term
            # dominates the update norm so clipping would wipe out the actual feature weights
            update = lw - w
            noisy, _ = dp_sanitize(update, clip, noise_multiplier, rng)
            deltas.append(noisy)
            sizes.append(len(idx))
        sizes = np.array(sizes, dtype=float)
        # Eq. 9: W <- W - eta * sum_k (n_k / N) * g~_k  (here the update is already a descent direction)
        avg = (np.stack(deltas) * (sizes / sizes.sum())[:, None]).sum(0)
        w += server_lr * avg

        probs = sigmoid(Xt @ w + b)
        pred = (probs >= 0.5).astype(int)
        point = {"round": r, "accuracy": round(accuracy_score(yt, pred), 4), "f1": round(f1_score(yt, pred), 4),
                 "epsilon": round(rdp_epsilon(noise_multiplier, r), 3) if noise_multiplier > 0 else None}
        history.append(point)
        if callback:
            callback(point)
    return history


class SwarmNode:
    """Live Layer 5 used by the API: turns a victim-confirmed attack into a DP update.

    Only the sanitised gradient vector is kept; the message text is discarded
    immediately after featurisation.
    """

    def __init__(self, store: Store, noise_multiplier: float = DP_NOISE_MULTIPLIER, clip: float = DP_CLIP, seed=None):
        self.store = store
        self.noise_multiplier = noise_multiplier
        self.clip = clip
        self.vec = make_vectorizer()
        self.w = np.zeros(FED_DIM)
        self.b = 0.0
        self.pending: list[np.ndarray] = []
        self.rng = np.random.default_rng(seed)
        row = self.store.one("SELECT MAX(round) AS r FROM dp_updates")
        self.round = (row["r"] or 0) if row else 0

    def local_update(self, text: str, label: int = 1, lr: float = 1.0) -> dict:
        x = self.vec.transform([text])
        gw, gb = logistic_grad(self.w, self.b, x, np.array([float(label)]))
        update = -lr * np.append(gw, gb)
        noisy, raw_norm = dp_sanitize(update, self.clip, self.noise_multiplier, self.rng)
        self.pending.append(noisy)
        sent_norm = float(np.linalg.norm(noisy))
        self.store.execute("INSERT INTO dp_updates(created_at, norm_raw, norm_sent, noise_std, round) VALUES (?,?,?,?,NULL)",
                           (now_iso(), raw_norm, sent_norm, self.noise_multiplier * self.clip))
        return {"norm_raw": round(raw_norm, 4), "norm_sent": round(sent_norm, 4),
                "noise_std": self.noise_multiplier * self.clip, "dimensions": int(noisy.size),
                "pending": len(self.pending)}

    def aggregate(self) -> dict:
        if not self.pending:
            return {"round": self.round, "aggregated": 0}
        avg = np.mean(self.pending, axis=0)
        self.w += avg[:-1]
        self.b += avg[-1]
        n = len(self.pending)
        self.pending.clear()
        self.round += 1
        self.store.execute("UPDATE dp_updates SET round=? WHERE round IS NULL", (self.round,))
        return {"round": self.round, "aggregated": n, "epsilon": round(rdp_epsilon(self.noise_multiplier, self.round), 3)}

    def status(self) -> dict:
        total = self.store.one("SELECT COUNT(*) AS n FROM dp_updates")["n"]
        recent = self.store.query("SELECT * FROM dp_updates ORDER BY id DESC LIMIT 20")
        return {"round": self.round, "pending": len(self.pending), "total_updates": total,
                "noise_multiplier": self.noise_multiplier, "clip": self.clip,
                "epsilon": round(rdp_epsilon(self.noise_multiplier, max(self.round, 1)), 3),
                "recent": recent}
