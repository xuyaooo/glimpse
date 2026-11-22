"""Specialise Laya for Glimpse: train a small classification head on Laya's embeddings.

What runs in the app today (decide/laya_service.py) needs no training: Laya embeds the exercise
and the closest labelled examples vote (k-nearest neighbours), mixed with Laya's own typed answer.
This is the next step: it learns one weight per (embedding dimension, animation kind) from the
same examples (decide/examples.py, every subject, + what the app learned, decide/learned.jsonl),
so the decision is one matrix product instead of a search, and it can be trained on more data.

It trains on the examples, scores on exercises it never saw (decide/eval.py: CASES and
EDGE_CASES) next to the k-NN on the same embeddings, and saves the head.

    decide/.venv/bin/python models/laya/train_head.py                 # ~1 min on a Mac
    decide/.venv/bin/python models/laya/train_head.py --epochs 400 --l2 3e-4 --extra my.jsonl

The functions below are what models/train_small_models.ipynb calls, one step at a time.
--extra adds a JSON-lines file of {"text": ..., "kind": ...} (e.g. teachers' corrections).
Output: models/laya/out/head.npz (weights) and models/laya/out/report.json (scores, mistakes).
"""
import argparse
import json
import os
import sys
import time
from collections import Counter

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "decide"))
from eval import CASES, EDGE_CASES  # noqa: E402
from examples_domains import DOMAIN_CASES  # noqa: E402
from examples import KINDS, generate  # noqa: E402
from laya_service import LEARNED, load_learned, nothing_to_decide, words  # noqa: E402

OUT = os.path.join(HERE, "out")
MODEL = "convaiinnovations/laya"


def unit(v):
    v = np.asarray(v, dtype=np.float32)
    return v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)


def softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


# ---------------------------------------------------------------- the steps


def load_laya():
    """Laya and its embedding function (downloads the model the first time, ~1.7 GB)."""
    import laya

    t = time.time()
    agent = laya.Agent(MODEL, vegaml=False)
    print(f"Laya loaded on {agent.device} in {time.time() - t:.1f}s")
    return agent, laya.embed_fn_from_agent(agent)


def training_rows(extra=None):
    """(text, kind) pairs: the generated examples, what the app learned, and an optional extra file."""
    rows = generate() + load_learned(LEARNED) + (load_learned(extra) if extra else [])
    return rows


def count_by_kind(rows):
    return dict(sorted(Counter(k for _, k in rows).items(), key=lambda kv: KINDS.index(kv[0])))


def embed_rows(embed, rows, batch=256):
    """The rows as unit vectors (read the way the service reads them) and their labels."""
    texts = [words(t) for t, _ in rows]
    t = time.time()
    X = unit(np.concatenate([embed(texts[i : i + batch]) for i in range(0, len(texts), batch)]))
    print(f"{len(rows)} examples embedded in {time.time() - t:.1f}s ({X.shape[1]} dimensions)")
    return X, np.array([KINDS.index(k) for _, k in rows])


def train_head(X, y, epochs=300, lr=0.05, l2=1e-4, scale=20.0, log=print):
    """Multinomial logistic regression, full batch, Adam; every kind counts as much as the others."""
    n = len(KINDS)
    rng = np.random.default_rng(0)
    W = rng.normal(0, 0.01, (X.shape[1], n)).astype(np.float32)
    b = np.zeros(n, dtype=np.float32)
    Y = np.eye(n, dtype=np.float32)[y]
    counts = np.bincount(y, minlength=n).astype(np.float32)
    w = (len(y) / (n * np.maximum(counts, 1)))[y][:, None]
    m = [np.zeros_like(W), np.zeros_like(b)]
    v = [np.zeros_like(W), np.zeros_like(b)]
    history = []
    for t in range(1, epochs + 1):
        P = softmax(scale * (X @ W) + b)
        G = w * (P - Y) / len(y)
        grads = [scale * X.T @ G + l2 * W, G.sum(axis=0)]
        for i, (p, g) in enumerate(zip((W, b), grads)):
            m[i] = 0.9 * m[i] + 0.1 * g
            v[i] = 0.999 * v[i] + 0.001 * g * g
            p -= lr * (m[i] / (1 - 0.9**t)) / (np.sqrt(v[i] / (1 - 0.999**t)) + 1e-8)
        if t % 50 == 0 or t == epochs:
            loss = float(-(w * Y * np.log(P + 1e-9)).sum() / len(y))
            history.append((t, loss, float((P.argmax(1) == y).mean())))
            if log and (t % 100 == 0 or t == epochs):
                log(f"  epoch {t:4}  loss {loss:.4f}  train accuracy {history[-1][2]:.3f}")
    return {"W": W, "b": b, "scale": scale, "history": history}


def head_decider(embed, head, abstain=0.35):
    """text -> (kind, probability) with the trained head; below `abstain` the answer is "none"."""

    def decide(text):
        w = words(text)
        if nothing_to_decide(w):
            return "none", 1.0
        p = softmax(head["scale"] * (unit(embed([w])) @ head["W"]) + head["b"])[0]
        k = int(p.argmax())
        return (KINDS[k] if p[k] >= abstain else "none"), float(p[k])

    return decide


def knn_decider(embed, X, y, k=9):
    """The same example vote as the service's bank (without Laya's typed answer), for comparison."""

    def decide(text):
        w = words(text)
        if nothing_to_decide(w):
            return "none", 1.0
        s = X @ unit(embed([w]))[0]
        top = np.argsort(-s)[:k]
        votes = np.bincount(y[top], weights=np.exp(40 * s[top]), minlength=len(KINDS))
        return KINDS[int(votes.argmax())], float(votes.max() / votes.sum())

    return decide


def evaluate(deciders, sets=None):
    """{method: {set: (right, total, mistakes)}} on exercises the training never saw."""
    sets = sets or {"held-out exercises": CASES, "edge cases": EDGE_CASES, "reading and science": DOMAIN_CASES}
    out = {}
    for method, fn in deciders.items():
        out[method] = {}
        for name, cases in sets.items():
            wrong = [{"text": t, "expected": want, "got": got} for t, want in cases for got in [fn(t)[0]] if got != want]
            out[method][name] = (len(cases) - len(wrong), len(cases), wrong)
    return out


def save_head(head, abstain, scores, n_examples, out=OUT):
    os.makedirs(out, exist_ok=True)
    np.savez(os.path.join(out, "head.npz"), W=head["W"], b=head["b"], kinds=np.array(KINDS), scale=head["scale"], abstain=abstain, model=MODEL)
    report = {
        "examples": n_examples,
        "kinds": len(KINDS),
        "scores": {f"{m}: {s}": f"{r}/{t}" for m, sets in scores.items() for s, (r, t, _) in sets.items()},
        "mistakes": {f"{m}: {s}": wrong for m, sets in scores.items() for s, (_, _, wrong) in sets.items()},
    }
    with open(os.path.join(out, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1, ensure_ascii=False)
    print(f"saved {os.path.relpath(out, ROOT)}/head.npz and report.json")
    return report


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--epochs", type=int, default=300)
    ap.add_argument("--lr", type=float, default=0.05)
    ap.add_argument("--l2", type=float, default=1e-4)
    ap.add_argument("--scale", type=float, default=20.0, help="logit scale (embeddings are unit vectors)")
    ap.add_argument("--abstain", type=float, default=0.35, help="below this probability the answer is 'none'")
    ap.add_argument("--extra", help="JSON lines of {text, kind} to train on as well")
    a = ap.parse_args()

    _, embed = load_laya()
    rows = training_rows(a.extra)
    X, y = embed_rows(embed, rows)
    head = train_head(X, y, a.epochs, a.lr, a.l2, a.scale)
    scores = evaluate({"head": head_decider(embed, head, a.abstain), "k-NN": knn_decider(embed, X, y)})
    for m, sets in scores.items():
        for s, (r, t, _) in sets.items():
            print(f"{m:5} {s}: {r}/{t}")
    save_head(head, a.abstain, scores, len(rows))


if __name__ == "__main__":
    main()
