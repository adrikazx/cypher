"""Download the public datasets used by CYPHER into data/raw/.

    python -m ml.download_data

Sources (public Hugging Face mirrors, no login needed):
  * Jigsaw Toxic Comment Classification Challenge (Wikipedia talk-page comments)
  * PRISM Hinglish / Hindi / English hate-speech corpus
"""

import sys
import urllib.request

from cypher.config import RAW_DIR

HF = "https://huggingface.co/datasets"
FILES = {
    "jigsaw_train.csv": f"{HF}/thesofakillers/jigsaw-toxic-comment-classification-challenge/resolve/main/train.csv",
    "prism_train.csv": f"{HF}/pankajbiswas6/prism-hinglish-hate-speech/resolve/main/data/train.csv",
    "prism_val.csv": f"{HF}/pankajbiswas6/prism-hinglish-hate-speech/resolve/main/data/val.csv",
    "prism_test.csv": f"{HF}/pankajbiswas6/prism-hinglish-hate-speech/resolve/main/data/test.csv",
}


def fetch(url: str, dest):
    def progress(blocks, block_size, total):
        if total > 0:
            done = min(blocks * block_size, total)
            sys.stdout.write(f"\r  {dest.name}: {done / 1e6:6.1f} / {total / 1e6:.1f} MB")
            sys.stdout.flush()

    urllib.request.urlretrieve(url, dest, reporthook=progress)
    print()


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        dest = RAW_DIR / name
        if dest.exists() and dest.stat().st_size > 0:
            print(f"  {name}: already present")
            continue
        fetch(url, dest)
    print("done ->", RAW_DIR)


if __name__ == "__main__":
    main()
