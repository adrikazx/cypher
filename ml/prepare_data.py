"""Build the composite CYPHER dataset.

Sources
  * Jigsaw Toxic Comment Classification (English, Wikipedia talk pages)
  * PRISM Hinglish/Hindi/English hate-speech corpus (code-switched social media)

A comment is labelled 1 (toxic) if any of the six Jigsaw labels is set.
Clean Jigsaw comments are down-sampled to a 3:1 ratio so the run fits on a
4 GB laptop GPU; the imbalance that remains is handled with class weights.

Output: data/processed/{train,val,test}.csv  (80/10/10, stratified on source+label)
"""

import argparse

import pandas as pd
from sklearn.model_selection import train_test_split

from cypher.config import PROCESSED_DIR, RAW_DIR
from cypher.text import clean

JIGSAW_LABELS = ["toxic", "severe_toxic", "obscene", "threat", "insult", "identity_hate"]


def load_jigsaw(neg_ratio: float, seed: int) -> pd.DataFrame:
    df = pd.read_csv(RAW_DIR / "jigsaw_train.csv")
    df["label"] = (df[JIGSAW_LABELS].sum(axis=1) > 0).astype(int)
    pos = df[df.label == 1]
    neg = df[df.label == 0].sample(n=int(len(pos) * neg_ratio), random_state=seed)
    out = pd.concat([pos, neg])
    return pd.DataFrame({"text": out.comment_text, "label": out.label, "lang": "english", "source": "jigsaw"})


def load_prism() -> pd.DataFrame:
    parts = [pd.read_csv(RAW_DIR / f"prism_{s}.csv") for s in ("train", "val", "test")]
    df = pd.concat(parts, ignore_index=True)
    return pd.DataFrame({"text": df.text, "label": df.label.astype(int), "lang": df.lang, "source": "prism"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--neg-ratio", type=float, default=3.0)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    df = pd.concat([load_jigsaw(args.neg_ratio, args.seed), load_prism()], ignore_index=True)
    df["text"] = df.text.map(clean)
    df = df[df.text.str.len() > 2].drop_duplicates("text").reset_index(drop=True)

    strat = df.source + "_" + df.lang + "_" + df.label.astype(str)
    train, rest = train_test_split(df, test_size=0.2, stratify=strat, random_state=args.seed)
    val, test = train_test_split(rest, test_size=0.5, stratify=strat.loc[rest.index], random_state=args.seed)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    for name, part in (("train", train), ("val", val), ("test", test)):
        part.sample(frac=1, random_state=args.seed).to_csv(PROCESSED_DIR / f"{name}.csv", index=False)

    print(f"total {len(df)}  train {len(train)}  val {len(val)}  test {len(test)}")
    print(df.groupby(["source", "lang"]).label.agg(["count", "mean"]).round(3))


if __name__ == "__main__":
    main()
