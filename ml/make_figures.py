"""Render every figure used in the project report from the JSON results.

    python -m ml.make_figures

Light-background figures (the report is printed). Categorical colours are the
validated reference palette (light steps), assigned to models in a fixed order.
"""

import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

from cypher.config import FIGURES_DIR, PROCESSED_DIR, RESULTS_DIR

ORDER = ["cypher_hybrid", "transformer_only", "bilstm_attention", "logistic_regression", "linear_svm", "naive_bayes"]
COLOR = dict(zip(ORDER, ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"]))
LABEL = {
    "cypher_hybrid": "CYPHER hybrid (DistilBERT+CNN)", "transformer_only": "DistilBERT only",
    "bilstm_attention": "BiLSTM + attention", "logistic_regression": "TF-IDF + LogReg",
    "linear_svm": "TF-IDF + Linear SVM", "naive_bayes": "Naive Bayes",
}
BLUE_RAMP = ["#86b6ef", "#3987e5", "#1c5cab", "#0d366b"]
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e2dc"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": MUTED, "axes.labelcolor": INK,
    "axes.titleweight": "bold", "axes.titlesize": 12, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "xtick.color": MUTED, "ytick.color": MUTED,
    "legend.frameon": False, "figure.dpi": 150, "savefig.bbox": "tight", "savefig.dpi": 200,
})


def load():
    metrics = {}
    for p in (RESULTS_DIR / "metrics").glob("*.json"):
        m = json.loads(p.read_text())
        metrics[m["model"]] = m
    curves = {p.stem: json.loads(p.read_text()) for p in (RESULTS_DIR / "curves").glob("*.json")}
    history = {p.stem: json.loads(p.read_text()) for p in (RESULTS_DIR / "history").glob("*.json")}
    read = lambda n: json.loads((RESULTS_DIR / n).read_text()) if (RESULTS_DIR / n).exists() else None
    return metrics, curves, history, read("ablation.json"), read("federated.json")


def save(fig, name):
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIGURES_DIR / name)
    plt.close(fig)
    print("wrote", name)


def fig_models(metrics):
    models = [m for m in ORDER if m in metrics]
    fig, ax = plt.subplots(figsize=(7.5, 3.6))
    vals = [metrics[m]["f1"] for m in models]
    y = np.arange(len(models))[::-1]
    ax.barh(y, vals, color="#2a78d6", height=0.55)
    for yi, v in zip(y, vals):
        ax.text(v + 0.004, yi, f"{v:.3f}", va="center", color=INK, fontsize=9)
    ax.set_yticks(y, [LABEL[m] for m in models])
    ax.set_xlim(0.5, 1.0)
    ax.set_xlabel("F1 score (held-out test set)")
    ax.grid(axis="y", visible=False)
    ax.set_title("Layer 2 classifier comparison", loc="left")
    save(fig, "fig_model_f1.png")


def fig_curves(metrics, curves):
    models = [m for m in ORDER if m in curves]
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    for m in models:
        lw = 2.4 if m == "cypher_hybrid" else 1.4
        axes[0].plot(curves[m]["roc"]["fpr"], curves[m]["roc"]["tpr"], color=COLOR[m], lw=lw,
                     label=f"{LABEL[m]} (AUC {metrics[m]['roc_auc']:.3f})")
        axes[1].plot(curves[m]["pr"]["recall"], curves[m]["pr"]["precision"], color=COLOR[m], lw=lw, label=LABEL[m])
    axes[0].plot([0, 1], [0, 1], ls="--", color=GRID)
    axes[0].set(xlabel="False positive rate", ylabel="True positive rate", title="ROC curves")
    axes[1].set(xlabel="Recall", ylabel="Precision", title="Precision-recall curves", ylim=(0.2, 1.02))
    axes[0].legend(fontsize=7.5, loc="lower right")
    save(fig, "fig_roc_pr.png")


def fig_languages(metrics):
    models = [m for m in ["cypher_hybrid", "transformer_only", "bilstm_attention", "logistic_regression"] if m in metrics]
    langs = sorted(next(iter(metrics.values()))["per_lang_f1"].keys())
    x = np.arange(len(langs))
    w = 0.8 / len(models)
    fig, ax = plt.subplots(figsize=(7.5, 3.8))
    for i, m in enumerate(models):
        vals = [metrics[m]["per_lang_f1"].get(l, 0) for l in langs]
        bars = ax.bar(x + i * w - 0.4 + w / 2, vals, w * 0.92, color=COLOR[m], label=LABEL[m])
        if m == "cypher_hybrid":
            for b, v in zip(bars, vals):
                ax.text(b.get_x() + b.get_width() / 2, v + 0.012, f"{v:.2f}", ha="center", fontsize=8, color=INK)
    ax.set_xticks(x, [l.capitalize() for l in langs])
    ax.set_ylim(0, 1)
    ax.set_ylabel("F1 score")
    ax.grid(axis="x", visible=False)
    ax.legend(fontsize=8, ncol=2, loc="upper right")
    ax.set_title("Performance by language", loc="left")
    save(fig, "fig_per_language.png")


def fig_convergence(history):
    if not history:
        return
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.4))
    for k, h in history.items():
        ep = [r["epoch"] for r in h]
        axes[0].plot(ep, [r["train_loss"] for r in h], marker="o", color=COLOR.get(k), label=LABEL.get(k, k))
        axes[1].plot(ep, [r["val_f1"] for r in h], marker="o", color=COLOR.get(k), label=f"{LABEL.get(k, k)} F1")
        axes[1].plot(ep, [r["val_auc"] for r in h], marker="s", ls="--", color=COLOR.get(k), alpha=0.6, label=f"{LABEL.get(k, k)} AUC")
    axes[0].set(xlabel="Epoch", ylabel="Weighted cross-entropy", title="Training loss")
    axes[1].set(xlabel="Epoch", ylabel="Score", title="Validation F1 / AUC")
    for a in axes:
        a.set_xticks(range(1, max(len(h) for h in history.values()) + 1))
    axes[1].legend(fontsize=7)
    save(fig, "fig_convergence.png")


def fig_confusion(metrics):
    m = metrics.get("cypher_hybrid") or max(metrics.values(), key=lambda x: x["f1"])
    cm = np.array(m["confusion"])
    fig, ax = plt.subplots(figsize=(3.8, 3.4))
    ax.imshow(cm, cmap=matplotlib.colors.LinearSegmentedColormap.from_list("b", ["#f0f6fe", "#1c5cab"]))
    for (i, j), v in np.ndenumerate(cm):
        ax.text(j, i, f"{v:,}", ha="center", va="center", color="white" if v > cm.max() / 2 else INK, fontsize=12, weight="bold")
    ax.set_xticks([0, 1], ["Clean", "Toxic"])
    ax.set_yticks([0, 1], ["Clean", "Toxic"])
    ax.set(xlabel="Predicted", ylabel="Actual")
    ax.grid(False)
    ax.set_title(LABEL[m["model"]].split(" (")[0], loc="left")
    save(fig, "fig_confusion.png")


def fig_ablation(ab):
    if not ab:
        return
    names = [("keyword", "Static keyword\nfilter"), ("standard_ai", "Same model,\nno context"), ("cypher", "Full CYPHER\npipeline")]
    fp = [ab["policies"][k]["false_positive_actions"] for k, _ in names]
    rec = [ab["policies"][k]["recall"] * 100 for k, _ in names]
    fig, axes = plt.subplots(1, 2, figsize=(9.5, 3.6))
    bars = axes[0].bar([n for _, n in names], fp, color=["#86b6ef", "#3987e5", "#1c5cab"], width=0.55)
    for b, v in zip(bars, fp):
        axes[0].text(b.get_x() + b.get_width() / 2, v * 1.01 + 5, f"{v:,}", ha="center", color=INK)
    axes[0].set(ylabel="Benign messages blocked", title="False-positive moderation actions")
    axes[0].grid(axis="x", visible=False)
    bars = axes[1].bar([n for _, n in names], rec, color=["#86b6ef", "#3987e5", "#1c5cab"], width=0.55)
    for b, v in zip(bars, rec):
        axes[1].text(b.get_x() + b.get_width() / 2, v + 1, f"{v:.1f}%", ha="center", color=INK)
    axes[1].set(ylabel="Harmful messages stopped (%)", title="Recall on harmful messages", ylim=(0, 105))
    axes[1].grid(axis="x", visible=False)
    save(fig, "fig_ablation.png")


def fig_federated(fed):
    if not fed:
        return
    fig, ax = plt.subplots(figsize=(7.5, 3.8))
    for i, run in enumerate(fed["runs"]):
        h = run["history"]
        eps = h[-1]["epsilon"]
        lab = f"σ = {run['noise_multiplier']}  (ε = {'∞' if eps is None else f'{eps:.1f}'})"
        ax.plot([r["round"] for r in h], [r["f1"] for r in h], color=BLUE_RAMP[i], lw=2, label=lab)
    ax.axhline(fed["central"]["f1"], ls="--", color=MUTED, lw=1)
    ax.text(1, fed["central"]["f1"] + 0.01, f"centralised (no privacy) F1 = {fed['central']['f1']:.3f}", color=MUTED, fontsize=8)
    ax.set(xlabel="Federated round", ylabel="Test F1", title="Layer 5: privacy-utility trade-off", ylim=(0, 0.85))
    ax.legend(fontsize=8, loc="lower right")
    save(fig, "fig_federated.png")


def fig_dataset():
    parts = [pd.read_csv(PROCESSED_DIR / f"{s}.csv", keep_default_na=False) for s in ("train", "val", "test")]
    df = pd.concat(parts)
    df["group"] = df.source.str.capitalize() + " / " + df.lang.str.capitalize()
    g = df.groupby(["group", "label"]).size().unstack(fill_value=0)
    stats = {
        "total": int(len(df)), "splits": {s: int(len(p)) for s, p in zip(("train", "val", "test"), parts)},
        "toxic_share": round(float(df.label.mean()), 4),
        "groups": {k: {"clean": int(r[0]), "toxic": int(r[1])} for k, r in g.iterrows()},
        "median_words": int(df.text.str.split().str.len().median()),
    }
    (RESULTS_DIR / "dataset_stats.json").write_text(json.dumps(stats, indent=2))
    fig, ax = plt.subplots(figsize=(7.5, 3.2))
    y = np.arange(len(g))
    ax.barh(y, g[0], color="#86b6ef", label="Clean (0)")
    ax.barh(y, g[1], left=g[0] + g.values.sum(1).max() * 0.004, color="#1c5cab", label="Toxic (1)")
    for yi, (c, t) in enumerate(zip(g[0], g[1])):
        ax.text(c + t + 400, yi, f"{c + t:,}", va="center", fontsize=8, color=INK)
    ax.set_yticks(y, g.index)
    ax.set_xlabel("Samples")
    ax.grid(axis="y", visible=False)
    ax.legend(fontsize=8, loc="center right")
    ax.set_title(f"Composite dataset ({len(df):,} samples)", loc="left")
    save(fig, "fig_dataset.png")


def box(ax, x, y, w, h, text, fc, ec="#52514e", fs=8.5, bold=False):
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h, boxstyle="round,pad=0.02,rounding_size=0.06", fc=fc, ec=ec, lw=1))
    ax.text(x, y, text, ha="center", va="center", fontsize=fs, color=INK, weight="bold" if bold else "normal", wrap=True)


def arrow(ax, a, b, label=None, color="#52514e", lx=0, ly=0):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=12, color=color, lw=1.1))
    if label:
        ax.text((a[0] + b[0]) / 2 + lx, (a[1] + b[1]) / 2 + ly, label, fontsize=7.5, color=MUTED, ha="center")


def fig_flowchart():
    fig, ax = plt.subplots(figsize=(8, 9.5))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 12)
    ax.axis("off")
    blue, red, green, amber = "#e3eefc", "#fde4e2", "#e1f5ec", "#fdf1d8"
    box(ax, 5, 11.3, 4, 0.7, "Incoming message", blue, bold=True)
    box(ax, 5, 10.1, 4.4, 0.8, "L1  Web Sentinel\nslang cache + de-obfuscation", blue)
    box(ax, 5, 8.8, 4.4, 0.8, "L2  Absolute Firewall\nDistilBERT + CNN score P", blue)
    box(ax, 8.6, 8.8, 2.4, 0.8, "BLOCK\nzero tolerance", red)
    box(ax, 1.4, 8.8, 2.2, 0.8, "ALLOW\nclean", green)
    box(ax, 5, 7.1, 4.4, 0.8, "L3  Relational Graph\ndV = P - S(u,v)", blue)
    box(ax, 8.6, 7.1, 2.4, 0.8, "BLOCK\ncovert attack", red)
    box(ax, 1.4, 7.1, 2.2, 0.8, "ALLOW\n+ EMA update", green)
    box(ax, 5, 5.4, 4.4, 0.8, "L4  Victim Verification\nprivate prompt to recipient", amber)
    box(ax, 1.4, 3.8, 2.2, 0.8, "ALLOW\n+ reinforce S", green)
    box(ax, 8.6, 3.8, 2.4, 0.8, "HIDE + S -> 0", red)
    box(ax, 8.6, 2.2, 2.4, 0.9, "L5  Swarm Learning\nclip + noise -> FedAvg", amber)
    arrow(ax, (5, 10.95), (5, 10.5))
    arrow(ax, (5, 9.7), (5, 9.2))
    arrow(ax, (7.2, 8.8), (7.4, 8.8), "P > 0.85", ly=0.15)
    arrow(ax, (2.8, 8.8), (2.5, 8.8), "P < 0.30", ly=0.15)
    arrow(ax, (5, 8.4), (5, 7.5), "grey zone", lx=0.6)
    arrow(ax, (7.2, 7.1), (7.4, 7.1), "dV > 0.50", ly=0.15)
    arrow(ax, (2.8, 7.1), (2.5, 7.1), "dV <= 0.15", ly=0.15)
    arrow(ax, (5, 6.7), (5, 5.8), "ambiguous", lx=0.6)
    arrow(ax, (3.6, 5.1), (1.6, 4.2), "thumbs up", lx=-0.3)
    arrow(ax, (6.4, 5.1), (8.4, 4.2), "thumbs down", lx=0.3)
    arrow(ax, (8.6, 3.4), (8.6, 2.65))
    ax.set_title("CYPHER cascading decision flow", loc="left", fontsize=12, weight="bold")
    save(fig, "fig_flowchart.png")


def fig_system():
    fig, ax = plt.subplots(figsize=(10, 4.6))
    ax.set_xlim(0, 20)
    ax.set_ylim(0, 9)
    ax.axis("off")
    blue, grey, amber, green = "#e3eefc", "#f0efec", "#fdf1d8", "#e1f5ec"
    box(ax, 3, 4.5, 4.6, 6.6, "", grey)
    ax.text(3, 7.4, "React + Vite frontend", ha="center", weight="bold", fontsize=9)
    for i, t in enumerate(["Live Lab", "Analyzer", "Graph", "Swarm", "Sentinel", "Results / Audit"]):
        box(ax, 3, 6.5 - i * 0.95, 3.6, 0.7, t, "white", fs=8)
    box(ax, 9, 4.5, 4, 6.6, "", blue)
    ax.text(9, 7.4, "FastAPI service", ha="center", weight="bold", fontsize=9)
    for i, t in enumerate(["/api/messages", "/api/analyze", "/api/graph", "/api/swarm", "/api/sentinel", "/api/results"]):
        box(ax, 9, 6.5 - i * 0.95, 3.2, 0.7, t, "white", fs=8)
    box(ax, 15.5, 4.5, 6, 6.6, "", amber)
    ax.text(15.5, 7.4, "cypher core (Python)", ha="center", weight="bold", fontsize=9)
    for i, t in enumerate(["L1 Sentinel (TTL cache)", "L2 Firewall (DistilBERT+CNN)", "L3 Relational graph",
                           "L4 Verification", "L5 DP swarm node", "SQLite store"]):
        box(ax, 15.5, 6.5 - i * 0.95, 5, 0.7, t, green if i == 5 else "white", fs=8)
    arrow(ax, (5.3, 4.5), (6.95, 4.5), "JSON / REST", ly=0.25)
    arrow(ax, (11.05, 4.5), (12.45, 4.5), "pipeline", ly=0.25)
    ax.text(10, 0.4, "Offline: ml/ scripts train models and write results/ -> served read-only to the Results page",
            ha="center", fontsize=8.5, color=MUTED)
    ax.set_title("System architecture", loc="left", fontsize=12, weight="bold")
    save(fig, "fig_system.png")


def main():
    metrics, curves, history, ab, fed = load()
    fig_models(metrics)
    fig_curves(metrics, curves)
    fig_languages(metrics)
    fig_convergence(history)
    fig_confusion(metrics)
    fig_ablation(ab)
    fig_federated(fed)
    if (PROCESSED_DIR / "train.csv").exists():
        fig_dataset()
    fig_flowchart()
    fig_system()


if __name__ == "__main__":
    main()
