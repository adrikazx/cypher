"""Fine-tune the Layer 2 transformer models.

    python -m ml.train_transformer                 # CYPHER hybrid (transformer + CNN)
    python -m ml.train_transformer --no-cnn        # plain transformer baseline (ablation)

Setup mirrors Section V of the paper (AdamW, linear warmup over 10 % of steps,
class-weighted cross entropy) but scaled to a 4 GB laptop GPU: DistilBERT
multilingual, max 128 tokens, mixed precision, frozen word-embedding matrix.
"""

import argparse
import json
import random
import time

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import f1_score, roc_auc_score
from tqdm import tqdm
from transformers import AutoTokenizer, get_linear_schedule_with_warmup

from cypher.config import ENCODER_NAME, HYBRID_DIR, MAX_LEN, MODELS_DIR, RESULTS_DIR
from cypher.models import HybridTransformerCNN
from ml.common import apply_platt, best_threshold, fit_platt, load_splits, report


def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def bucketed_batches(lengths, batch_size, shuffle=True, seed=0):
    """Group samples of similar length so padding (and wasted compute) stays small."""
    idx = np.arange(len(lengths))
    rng = np.random.default_rng(seed)
    if shuffle:
        rng.shuffle(idx)
    chunk = batch_size * 50
    batches = []
    for i in range(0, len(idx), chunk):
        part = idx[i:i + chunk]
        part = part[np.argsort(lengths[part])]
        batches += [part[j:j + batch_size] for j in range(0, len(part), batch_size)]
    if shuffle:
        rng.shuffle(batches)
    return batches


def collate(enc, ids, device):
    rows = [enc["input_ids"][i] for i in ids]
    width = max(len(r) for r in rows)
    input_ids = torch.zeros(len(rows), width, dtype=torch.long)
    mask = torch.zeros(len(rows), width, dtype=torch.long)
    for k, r in enumerate(rows):
        input_ids[k, :len(r)] = torch.tensor(r)
        mask[k, :len(r)] = 1
    return input_ids.to(device), mask.to(device)


@torch.no_grad()
def predict(model, enc, lengths, device, batch_size=128):
    model.eval()
    order = bucketed_batches(lengths, batch_size, shuffle=False)
    probs = np.zeros(len(lengths), dtype=np.float32)
    for b in order:
        ids, mask = collate(enc, b, device)
        with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=device.type == "cuda"):
            logits = model(ids, mask)
        probs[b] = torch.softmax(logits.float(), dim=-1)[:, 1].cpu().numpy()
    return probs


def measure_latency(model, tok, texts, device, n=200):
    model.eval()
    times = []
    with torch.no_grad():
        for t in texts[:n]:
            e = tok(t, truncation=True, max_length=MAX_LEN, return_tensors="pt").to(device)
            start = time.perf_counter()
            with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=device.type == "cuda"):
                model(e["input_ids"], e["attention_mask"])
            if device.type == "cuda":
                torch.cuda.synchronize()
            times.append(time.perf_counter() - start)
    return float(np.mean(times[10:]) * 1000)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-cnn", action="store_true")
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    name = "transformer_only" if args.no_cnn else "cypher_hybrid"
    out_dir = MODELS_DIR / "transformer_only" if args.no_cnn else HYBRID_DIR
    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"training {name} on {device}")

    train, val, test = load_splits()
    tok = AutoTokenizer.from_pretrained(ENCODER_NAME)
    encode = lambda df: tok(list(df.text), truncation=True, max_length=MAX_LEN)
    enc_tr, enc_va, enc_te = encode(train), encode(val), encode(test)
    len_tr = np.array([len(x) for x in enc_tr["input_ids"]])
    len_va = np.array([len(x) for x in enc_va["input_ids"]])
    len_te = np.array([len(x) for x in enc_te["input_ids"]])
    y_tr = torch.tensor(train.label.values)

    model = HybridTransformerCNN(ENCODER_NAME, use_cnn=not args.no_cnn).to(device)
    # the 119k-token embedding matrix is most of the parameter count; freezing it
    # keeps optimiser state inside 4 GB and barely changes accuracy
    model.encoder.embeddings.word_embeddings.weight.requires_grad = False

    head_params = [p for n, p in model.named_parameters() if not n.startswith("encoder") and p.requires_grad]
    enc_params = [p for n, p in model.named_parameters() if n.startswith("encoder") and p.requires_grad]
    optim = torch.optim.AdamW([{"params": enc_params, "lr": args.lr},
                               {"params": head_params, "lr": 1e-3}], weight_decay=0.01)
    steps = args.epochs * int(np.ceil(len(train) / args.batch_size))
    sched = get_linear_schedule_with_warmup(optim, int(0.1 * steps), steps)
    scaler = torch.amp.GradScaler(enabled=device.type == "cuda")

    counts = np.bincount(train.label.values)
    weights = torch.tensor(len(train) / (2 * counts), dtype=torch.float).to(device)
    loss_fn = nn.CrossEntropyLoss(weight=weights)

    history, best_f1, best_state, best_thr = [], -1, None, 0.5
    t_start = time.time()
    for epoch in range(1, args.epochs + 1):
        model.train()
        running, n = 0.0, 0
        bar = tqdm(bucketed_batches(len_tr, args.batch_size, seed=args.seed + epoch), desc=f"epoch {epoch}")
        for b in bar:
            ids, mask = collate(enc_tr, b, device)
            labels = y_tr[b].to(device)
            with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=device.type == "cuda"):
                loss = loss_fn(model(ids, mask).float(), labels)
            optim.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(optim)
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optim)
            scaler.update()
            sched.step()
            running += loss.item() * len(b)
            n += len(b)
            bar.set_postfix(loss=f"{running / n:.4f}")

        val_probs = predict(model, enc_va, len_va, device)
        thr = best_threshold(val.label, val_probs)
        val_f1 = f1_score(val.label, val_probs >= thr)
        val_auc = roc_auc_score(val.label, val_probs)
        history.append({"epoch": epoch, "train_loss": round(running / n, 4),
                        "val_f1": round(val_f1, 4), "val_auc": round(val_auc, 4)})
        print(history[-1])
        if val_f1 > best_f1:
            best_f1, best_thr = val_f1, thr
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

    train_minutes = (time.time() - t_start) / 60
    model.load_state_dict(best_state)
    calib = fit_platt(val.label.values, predict(model, enc_va, len_va, device))
    test_probs = predict(model, enc_te, len_te, device)
    latency = measure_latency(model, tok, list(test.text), device)

    n_params = sum(p.numel() for p in model.parameters())
    report(name, test, test_probs, best_thr, latency, extra={
        "device": torch.cuda.get_device_name(0) if device.type == "cuda" else "cpu",
        "epochs": args.epochs, "train_minutes": round(train_minutes, 1), "params_millions": round(n_params / 1e6, 1),
    })

    hist_dir = RESULTS_DIR / "history"
    hist_dir.mkdir(parents=True, exist_ok=True)
    (hist_dir / f"{name}.json").write_text(json.dumps(history, indent=2))

    out_dir.mkdir(parents=True, exist_ok=True)
    torch.save({k: v.half() if v.is_floating_point() else v for k, v in best_state.items()}, out_dir / "model.pt")
    tok.save_pretrained(out_dir)
    (out_dir / "meta.json").write_text(json.dumps({
        "encoder": ENCODER_NAME, "use_cnn": not args.no_cnn, "max_len": MAX_LEN,
        "threshold": float(apply_platt(np.array([best_thr]), *calib)[0]),  # in calibrated space
        "calibration": list(calib),
    }, indent=2))
    print("saved ->", out_dir)


if __name__ == "__main__":
    main()
