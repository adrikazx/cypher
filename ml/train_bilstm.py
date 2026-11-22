"""BiLSTM + attention baseline (Table I of the paper)."""

import time
from collections import Counter

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import f1_score

from cypher.models import BiLSTMAttention
from cypher.text import words
from ml.common import best_threshold, load_splits, report

MAX_TOKENS = 100
VOCAB_SIZE = 50_000


def build_vocab(texts):
    counts = Counter(w.lower() for t in texts for w in words(t))
    vocab = {w: i + 2 for i, (w, _) in enumerate(counts.most_common(VOCAB_SIZE - 2))}  # 0 pad, 1 unk
    return vocab


def encode(texts, vocab):
    out = np.zeros((len(texts), MAX_TOKENS), dtype=np.int64)
    for i, t in enumerate(texts):
        ids = [vocab.get(w.lower(), 1) for w in words(t)][:MAX_TOKENS]
        out[i, :len(ids)] = ids
    return torch.from_numpy(out)


@torch.no_grad()
def predict(model, x, device, bs=512):
    model.eval()
    out = []
    for i in range(0, len(x), bs):
        out.append(torch.softmax(model(x[i:i + bs].to(device)), -1)[:, 1].cpu())
    return torch.cat(out).numpy()


def main():
    torch.manual_seed(42)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    train, val, test = load_splits()
    vocab = build_vocab(train.text)
    x_tr, x_va, x_te = (encode(list(d.text), vocab) for d in (train, val, test))
    y_tr = torch.tensor(train.label.values)

    model = BiLSTMAttention(len(vocab) + 2).to(device)
    counts = np.bincount(train.label.values)
    loss_fn = nn.CrossEntropyLoss(weight=torch.tensor(len(train) / (2 * counts), dtype=torch.float).to(device))
    optim = torch.optim.Adam(model.parameters(), lr=2e-3)

    best, best_state, best_thr = -1, None, 0.5
    t0 = time.time()
    for epoch in range(4):
        model.train()
        perm = torch.randperm(len(x_tr))
        for i in range(0, len(perm), 128):
            b = perm[i:i + 128]
            loss = loss_fn(model(x_tr[b].to(device)), y_tr[b].to(device))
            optim.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optim.step()
        vp = predict(model, x_va, device)
        thr = best_threshold(val.label, vp)
        f1 = f1_score(val.label, vp >= thr)
        print(f"epoch {epoch + 1} val F1 {f1:.4f}")
        if f1 > best:
            best, best_thr = f1, thr
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

    model.load_state_dict(best_state)
    probs = predict(model, x_te, device)

    times = []
    with torch.no_grad():
        for row in x_te[:200]:
            s = time.perf_counter()
            model(row.unsqueeze(0).to(device))
            if device.type == "cuda":
                torch.cuda.synchronize()
            times.append(time.perf_counter() - s)
    report("bilstm_attention", test, probs, best_thr, float(np.mean(times[10:]) * 1000),
           extra={"train_seconds": round(time.time() - t0, 1)})


if __name__ == "__main__":
    main()
