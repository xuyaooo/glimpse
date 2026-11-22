"""Training data for the reader (GLM-OCR), from the camera frames Glimpse already saved.

When the engine runs locally it keeps each frame it read and what GLM-OCR read on it, in
debug-frames/engine/<time>.jpg + <time>.json ({"ocr": "...", "lines": [...]}). This collects
them, plus the test photos, as {image, text} pairs: GLM-OCR's reading is only a first draft
of the label. Correct the wrong ones with review.py before training: a model trained on its
own mistakes learns them.

    python3 models/glm-ocr/build_dataset.py            # -> models/glm-ocr/data/ocr.jsonl + images/
    python3 models/glm-ocr/review.py                    # correct the labels, one photo at a time
    python3 models/glm-ocr/build_dataset.py --split     # -> train.jsonl / valid.jsonl (reviewed only)

Each line of ocr.jsonl: {"id", "image": "images/<id>.jpg", "text": "<transcription>",
"source": "glm-ocr" | "corrected", "reviewed": false | true}. Running it again keeps your
corrections and adds the new frames. data/ is never committed (photos of children's work).
"""
import argparse
import json
import os
import random
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(HERE, "data")
PROMPT = "Text Recognition:"  # what the engine asks GLM-OCR (server/engine/reader.js)


def load(path):
    rows = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    r = json.loads(line)
                    rows[r["id"]] = r
    return rows


def save(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def collect(frames):
    found = []
    if os.path.isdir(frames):
        for name in sorted(os.listdir(frames)):
            if not name.endswith(".json"):
                continue
            jpg = os.path.join(frames, name[:-5] + ".jpg")
            try:
                info = json.load(open(os.path.join(frames, name), encoding="utf-8"))
            except ValueError:
                continue
            text = "\n".join(info.get("lines") or []) or str(info.get("ocr") or "").strip()
            if os.path.exists(jpg) and text:
                found.append((name[:-5], jpg, text))
    return found


def as_chat(r):
    """The pair in the chat format of mlx-vlm and transformers' image-text-to-text models."""
    return {"images": [r["image"]], "messages": [{"role": "user", "content": PROMPT}, {"role": "assistant", "content": r["text"]}]}


def update_index(frames=os.path.join(ROOT, "debug-frames", "engine")):
    """Adds the frames not in data/ocr.jsonl yet (corrections are kept); returns every row."""
    os.makedirs(os.path.join(DATA, "images"), exist_ok=True)
    index = os.path.join(DATA, "ocr.jsonl")
    rows = load(index)
    added = 0
    for fid, jpg, text in collect(frames):
        if fid in rows:
            continue  # kept as it is: it may have been corrected
        dest = os.path.join("images", fid + ".jpg")
        shutil.copyfile(jpg, os.path.join(DATA, dest))
        rows[fid] = {"id": fid, "image": dest, "text": text, "source": "glm-ocr", "reviewed": False}
        added += 1
    ordered = sorted(rows.values(), key=lambda r: r["id"])
    save(index, ordered)
    print(f"{len(ordered)} photos ({added} new), {sum(1 for r in ordered if r.get('reviewed'))} reviewed -> {os.path.relpath(index, ROOT)}")
    return ordered


def split(rows, valid=0.15, use_all=False):
    """train.jsonl / valid.jsonl from the reviewed pairs (or all of them, to try the pipeline)."""
    use = [r for r in rows if use_all or r.get("reviewed")]
    if len(use) < 10:
        print("Fewer than 10 usable pairs: review more with review.py first (or use_all=True to try the pipeline).")
        return [], []
    use = sorted(use, key=lambda r: r["id"])
    random.Random(7).shuffle(use)
    n = max(1, int(len(use) * valid))
    tr, va = [as_chat(r) for r in use[n:]], [as_chat(r) for r in use[:n]]
    save(os.path.join(DATA, "train.jsonl"), tr)
    save(os.path.join(DATA, "valid.jsonl"), va)
    print(f"train.jsonl: {len(tr)}, valid.jsonl: {len(va)} (images are relative to {os.path.relpath(DATA, ROOT)}/)")
    return tr, va


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frames", default=os.path.join(ROOT, "debug-frames", "engine"))
    ap.add_argument("--split", action="store_true", help="write train.jsonl / valid.jsonl from the reviewed pairs")
    ap.add_argument("--valid", type=float, default=0.15)
    ap.add_argument("--all", action="store_true", help="with --split: also the pairs nobody reviewed (not recommended)")
    a = ap.parse_args()
    rows = update_index(a.frames)
    if a.split:
        split(rows, a.valid, a.all)


if __name__ == "__main__":
    main()
