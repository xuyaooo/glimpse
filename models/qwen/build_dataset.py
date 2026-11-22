"""Training data for the tutor model (qwen3.5), from what students did in Glimpse.

The engine saves every session (GET /api/history): the lines written with Glim's hint, the
questions asked with Glim's answer, and the worked solutions. This turns them into chat
examples in the format MLX (mlx-lm) and most fine-tuning tools read:

    {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}

    python3 models/qwen/build_dataset.py                       # engine on http://127.0.0.1:3001
    python3 models/qwen/build_dataset.py --engine https://your-app.vercel.app --valid 0.1

Output: models/qwen/data/train.jsonl and valid.jsonl (never committed: it is children's work).

Read models/README.md first: training a model on its own answers teaches it nothing new. Fix
the answers that were wrong or vague (by hand, or with a stronger model as the teacher) before
training; --only-reviewed keeps the examples whose "reviewed" field you set to true.
"""
import argparse
import json
import os
import random
import re
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TEST_STUDENT = re.compile(r"^(qa|e2e|fail|test)[-_]|^unknown$")

# The same voice as the engine's tutor (server/engine/session.js, TUTOR_INTRO), shortened
SYSTEM = (
    "You are Glim, a kind, patient maths tutor. The student is often a child: use short, simple words and match "
    "the level of the maths. Be concrete: use the actual numbers. A hint gives the next step, not the whole answer."
)


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def plain(tex):
    """LaTeX -> readable maths for the prompt: \\frac{1}{2} -> 1/2."""
    t = str(tex or "")
    for _ in range(4):
        t = re.sub(r"\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}", r"(\1)/(\2)", t)
    t = re.sub(r"\((\w+)\)/\((\w+)\)", r"\1/\2", t)
    t = t.replace("\\times", "×").replace("\\cdot", "·").replace("\\div", "÷").replace("$", "")
    return re.sub(r"\s+", " ", re.sub(r"\\text\{([^}]*)\}", r"\1", t)).strip()


def examples(records):
    out = []
    for r in records:
        d = r.get("data") or {}
        kind = r.get("kind")
        if kind == "line" and d.get("hint") and d.get("latex"):
            verdict = {"correct": "right", "wrong": "not right yet", "unsure": "not finished"}.get(d.get("verdict"), d.get("verdict"))
            user = f'The student wrote: {plain(d["latex"])}\nIt is {verdict}.{(" Note: " + d["note"]) if d.get("note") else ""}\nGive one short hint.'
            out.append(("hint", user, d["hint"], r))
        elif kind == "question" and d.get("text") and d.get("answer"):
            about = f' about {plain(d["about"])}' if d.get("about") else ""
            out.append(("answer", f'The student points at the page{about} and asks: "{d["text"]}"', d["answer"], r))
        elif kind == "steps" and d.get("items") and d.get("about"):
            target = {"title": d.get("title") or "", "steps": d["items"], "result": d.get("result") or ""}
            out.append(("steps", f"Solve step by step, as JSON {{title, steps: [{{say, math}}], result}}: {plain(d['about'])}", json.dumps(target, ensure_ascii=False), r))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engine", default="http://127.0.0.1:3001")
    ap.add_argument("--valid", type=float, default=0.1, help="share kept apart to check the training")
    ap.add_argument("--include-tests", action="store_true", help="keep the test students (qa-..., e2e...)")
    ap.add_argument("--only-reviewed", action="store_true", help="only records with data.reviewed == true")
    ap.add_argument("--out", default=os.path.join(HERE, "data"))
    a = ap.parse_args()

    records, before, ref = [], None, None
    while True:  # every record, 500 at a time, newest first
        q = f"{a.engine}/api/history?limit=500" + (f"&before={before}&beforeRef={urllib.parse.quote(ref)}" if before else "")
        page = get(q)
        records += page
        if len(page) < 500:
            break
        before, ref = page[-1]["at"], page[-1]["ref"]
    kept = [r for r in records if a.include_tests or not TEST_STUDENT.search(str(r.get("studentId", "")))]
    if a.only_reviewed:
        kept = [r for r in kept if (r.get("data") or {}).get("reviewed") is True]
    rows = examples(kept)

    random.Random(7).shuffle(rows)
    n_valid = max(1, int(len(rows) * a.valid)) if len(rows) > 10 else 0
    os.makedirs(a.out, exist_ok=True)
    counts = {}
    for name, part in (("valid", rows[:n_valid]), ("train", rows[n_valid:])):
        with open(os.path.join(a.out, f"{name}.jsonl"), "w", encoding="utf-8") as f:
            for task, user, answer, r in part:
                counts[task] = counts.get(task, 0) + 1
                msg = {"messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}, {"role": "assistant", "content": answer}]}
                f.write(json.dumps(msg, ensure_ascii=False) + "\n")
    print(f"{len(records)} records, {len(kept)} kept, {len(rows)} examples {counts}: {len(rows) - n_valid} train, {n_valid} valid -> {os.path.relpath(a.out)}")
    if len(rows) < 200:
        print("Few examples: fine for trying the pipeline; a useful fine-tune needs a few hundred reviewed ones.")


if __name__ == "__main__":
    main()
