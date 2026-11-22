"""Correct GLM-OCR's readings, one photo at a time, in the terminal.

    python3 models/glm-ocr/review.py            # the photos nobody reviewed yet
    python3 models/glm-ocr/review.py --all      # go through every photo again

For each photo it opens the image (macOS Preview, or prints the path) and shows the reading:
  Enter      the reading is right
  e          type the right transcription (LaTeX, one line per line on the paper; end with an empty line)
  s          skip for now
  d          drop this photo (blurry, no maths, a hand in the way...)
  q          save and quit
Everything is saved to data/ocr.jsonl as you go.
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
INDEX = os.path.join(DATA, "ocr.jsonl")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    if not os.path.exists(INDEX):
        sys.exit("No data yet: run python3 models/glm-ocr/build_dataset.py first")
    rows = [json.loads(line) for line in open(INDEX, encoding="utf-8") if line.strip()]

    def save():
        with open(INDEX, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    todo = [r for r in rows if a.all or not r.get("reviewed")]
    print(f"{len(todo)} photos to review ({sum(1 for r in rows if r.get('reviewed'))} already reviewed)\n")
    for i, r in enumerate(todo, 1):
        path = os.path.join(DATA, r["image"])
        if sys.platform == "darwin":
            subprocess.run(["open", "-g", path], check=False)
        print(f"[{i}/{len(todo)}] {path}\n--- reading ---\n{r['text']}\n---------------")
        choice = input("Enter = right, e = edit, s = skip, d = drop, q = quit: ").strip().lower()
        if choice == "q":
            break
        if choice == "s":
            continue
        if choice == "d":
            rows.remove(r)
        elif choice == "e":
            print("The right transcription (an empty line ends it):")
            lines = []
            while True:
                line = input()
                if not line.strip():
                    break
                lines.append(line.rstrip())
            if lines:
                r.update(text="\n".join(lines), source="corrected", reviewed=True)
        else:
            r["reviewed"] = True
        save()
    save()
    print(f"saved: {sum(1 for r in rows if r.get('reviewed'))} reviewed of {len(rows)}")


if __name__ == "__main__":
    main()
