"""The decision model: which ready-made animation explains an exercise.

Laya (convaiinnovations/laya, Apache-2.0, a 421M bidirectional encoder) runs on this computer.
It decides in two ways, voted together:
  - its own typed answer to "Which animation best explains this maths exercise?" (questions.py);
  - its embedding of the exercise, compared with labelled examples (examples.py, plus every
    confirmed example in learned.jsonl): the closest examples vote.
It abstains (kind "none") when it is unsure; the engine then shows the written explanation.

    decide/.venv/bin/python decide/laya_service.py        # http://127.0.0.1:8091
    POST /decide {"text": "\\int_0^1 \\frac{1}{1+x} dx"}  -> {"kind": "area", "probability": 0.93, ...}
    POST /learn  {"text": "...", "kind": "area"}         -> learns it from now on
    GET  /health
"""
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from examples import KINDS, generate  # noqa: E402
from examples_domains import READING_KINDS, SCIENCE_KINDS  # noqa: E402
from subjects import SUBJECT_EXAMPLES  # noqa: E402
from questions import QUESTIONS  # noqa: E402

PORT = int(os.environ.get("DECIDE_PORT", "8091"))
LEARNED = os.path.join(HERE, "learned.jsonl")
K = 9
SUBJECTS = ["maths", "reading", "science"]
# each animation kind belongs to a subject ("none" to none: its subject comes from Laya's answer)
SUBJECT_OF = {**{k: "maths" for k in KINDS if k != "none"}, **{k: "reading" for k in READING_KINDS}, **{k: "science" for k in SCIENCE_KINDS}}
ABSTAIN_BELOW = 0.2
SHARPNESS = 160  # how strongly the closest kind wins
MATCH_FLOOR = 0.86  # below this similarity to its closest examples, the winning kind is only the least unlike one
MAX_EXAMPLES = 20000  # the bank (and learned.jsonl) stops growing here
MAX_BODY = 100_000  # bytes in a request (a text is cut at 2000 characters anyway)


SUPERSCRIPT = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")
SUBSCRIPT = str.maketrans("₀₁₂₃₄₅₆₇₈₉₋", "0123456789-")
VULGAR = {"½": (1, 2), "⅓": (1, 3), "⅔": (2, 3), "¼": (1, 4), "¾": (3, 4), "⅕": (1, 5), "⅖": (2, 5), "⅗": (3, 5), "⅘": (4, 5),
          "⅙": (1, 6), "⅚": (5, 6), "⅐": (1, 7), "⅛": (1, 8), "⅜": (3, 8), "⅝": (5, 8), "⅞": (7, 8), "⅑": (1, 9), "⅒": (1, 10)}


def words(text):
    """LaTeX -> words, the way the examples and the questions are read."""
    t = str(text).replace("$", " ")
    # typed symbols read like their LaTeX (2³ is 2^3, 6 * 7 and 6·7 are 6 times 7, ½ is 1 over 2)
    t = re.sub(r"[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+", lambda m: "^" + m.group().translate(SUPERSCRIPT), t)
    t = re.sub(r"[₀₁₂₃₄₅₆₇₈₉₋]+", lambda m: "_" + m.group().translate(SUBSCRIPT), t)
    t = re.sub("[" + "".join(VULGAR) + "]", lambda m: " (%d) over (%d) " % VULGAR[m.group()], t)
    t = t.replace("**", "^").replace("°", "^\\circ ").replace("∫", "\\int").replace("→", "->").replace("π", " pi ")
    t = re.sub(r"[*·⋅∙×]", " times ", t)
    t = t.replace("÷", " div ").replace("−", "-").replace("–", "-").replace("√", " square root of ")
    t = re.sub(r"(\d)\s*[xX×]\s*(?=\d)", r"\1 times ", t)  # 6x7, 6 x 7: times, not an unknown
    # the same LaTeX written another way reads the same: \frac {1}{2}, \frac{1} {2}, x^{2} (as the OCR writes)
    t = re.sub(r"\\(qquad|quad|[,;:! ])", " ", t)
    t = re.sub(r"\\(left|right)\b", " ", t)
    t = re.sub(r"\\(text|mathrm|mathbf)\s*\{", "{", t)
    t = re.sub(r"\\([a-zA-Z]+)\s+\{", r"\\\1{", t)
    t = re.sub(r"\}\s+\{", "}{", t)
    t = re.sub(r"([\^_])\{([^{}]*)\}", r"\1\2", t)
    t = re.sub(r"\\int_\{?([^{}\s^]+)\}?\^\{?([^{}\s]+)\}?", r" integral from \1 to \2 of ", t)
    t = t.replace("\\int", " integral of ")
    t = re.sub(r"\\[dt]?frac\s*(\d)\s*(\d)", r" (\1) over (\2) ", t)  # \frac12
    while True:  # innermost first, until nothing is left to read
        u = re.sub(r"\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}", r" (\1) over (\2) ", t)
        u = re.sub(r"\\sqrt\{([^{}]*)\}", r" square root of \1 ", u)
        u = re.sub(r"([\^_])\{([^{}]*)\}", r"\1\2", u)
        if u == t:
            break
        t = u
    t = re.sub(r"\\(ldots|cdots|dots)", " ... ", t)
    t = re.sub(r"\\(times|cdot)", " times ", t)
    t = re.sub(r"\\(sin|cos|tan|ln|log|lim|sum|vec|det|binom|pi)", r" \1 ", t)
    t = t.replace("{", " ").replace("}", " ").replace("\\", " ")
    return re.sub(r"\s+", " ", t).strip()


# A line with nothing to explain: no letter or digit at all, or only a number or an answer (0, = 7, = -3, = 0.5, = 1/2).
_ANSWER_ONLY = re.compile(r"=?\s*[-+]?\s*\d+(?:[.,]\d+)?\s*=?|=\s*[-+]?\s*(?:\(\d+\) over \(\d+\)|\d+\s*/\s*\d+)")


def nothing_to_decide(w):
    return not re.search(r"[^\W_]", w) or bool(_ANSWER_ONLY.fullmatch(w))


def load_learned(path):
    """The confirmed examples in learned.jsonl; a blank or broken line is skipped, not fatal."""
    rows = []
    if not os.path.exists(path):
        return rows
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except ValueError:
                print(f"[decide] {os.path.basename(path)} line {n}: not JSON, skipped", file=sys.stderr, flush=True)
                continue
            if isinstance(r, dict) and isinstance(r.get("text"), str) and r.get("kind") in KINDS:
                rows.append((r["text"], r["kind"]))
            else:
                print(f"[decide] {os.path.basename(path)} line {n}: no text or unknown kind, skipped", file=sys.stderr, flush=True)
    return rows


class Decider:
    def __init__(self):
        import laya

        t = time.time()
        self.agent = laya.Agent("convaiinnovations/laya", vegaml=False)
        self.embed = laya.embed_fn_from_agent(self.agent)
        self.lock = threading.Lock()
        rows = generate() + load_learned(LEARNED)
        self.texts = [words(t) for t, _ in rows]
        self.labels = np.array([KINDS.index(k) for _, k in rows])
        self.bank = self._unit(self.embed(self.texts))
        self._subjects()
        self.decide("3 + 4 =")  # warm up
        print(f"[decide] Laya ready on {self.agent.device} in {time.time() - t:.1f}s, {len(rows)} examples", flush=True)

    @staticmethod
    def _unit(v):
        v = np.asarray(v, dtype=np.float32)
        return v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)

    def decide(self, text):
        t = time.time()
        w = words(text)
        if nothing_to_decide(w):
            return {"kind": "none", "probability": 0.0, "abstained": True, "alternatives": [], "laya": None, "nearest": None,
                    "subject": None, "subject_probability": 0.0, "ms": round((time.time() - t) * 1000)}
        with self.lock:
            q = self._unit(self.embed([w]))[0]
            answers = self.agent.predict(w, {"animation": QUESTIONS["animation"], "subject": QUESTIONS["subject"]})["answers"]
            typed = answers["animation"]
            bank, labels, texts = self.bank, self.labels, self.texts  # one consistent view, even while learn() adds
            subj_bank, subj_labels = self._subjects()
        sims = bank @ q
        top = np.argsort(-sims)[:K]
        # each kind competes with its best matches (mean of its 3 closest examples), so a kind
        # with fewer examples isn't outvoted by sheer numbers
        best = np.full(len(KINDS), -1.0)
        for k in range(len(KINDS)):
            s_k = np.sort(sims[labels == k])[-3:]
            if len(s_k):
                best[k] = s_k.mean()
        knn = np.exp((best - best.max()) * SHARPNESS)
        knn /= knn.sum()
        lay = np.zeros(len(KINDS))
        probs = typed.get("probabilities") or typed.get("probs")
        if isinstance(probs, dict):
            for k, p in probs.items():
                if k in KINDS:
                    lay[KINDS.index(k)] = p
        elif typed.get("choice") in KINDS:
            lay[KINDS.index(typed["choice"])] = typed.get("answer_confidence") or 0.5
        p = 0.8 * knn + 0.2 * (lay / lay.sum() if lay.sum() else lay)
        order = np.argsort(-p)
        choice = KINDS[order[0]]
        abstained = p[order[0]] < ABSTAIN_BELOW or best[order[0]] < MATCH_FLOOR
        subject, subject_p = self._subject(q, answers.get("subject") or {}, subj_bank, subj_labels)
        return {
            "kind": "none" if abstained else choice,
            "probability": round(float(p[order[0]]), 3),
            "abstained": bool(abstained),
            "alternatives": [{"kind": KINDS[i], "probability": round(float(p[i]), 3)} for i in order[1:3]],
            "laya": typed.get("choice"),
            "nearest": texts[top[0]],
            "subject": subject,
            "subject_probability": subject_p,
            "ms": round((time.time() - t) * 1000),
        }

    def _subjects(self):
        """The examples the subject vote uses (built once): every example with a kind (its subject)
        and the subject examples for the lines no animation explains (decide/subjects.py)."""
        if getattr(self, "subj_bank", None) is None:
            keep = [i for i, k in enumerate(self.labels) if KINDS[k] in SUBJECT_OF]
            extra = [(words(t), sub) for sub, ts in SUBJECT_EXAMPLES.items() for t in ts]
            try:
                extra_vecs = self._unit(self.embed([t for t, _ in extra]))
            except Exception:  # the subject examples are a help, not a need: the kinds' examples still vote
                extra, extra_vecs = [], np.zeros((0, self.bank.shape[1]), dtype=np.float32)
            self.subj_labels = np.array([SUBJECTS.index(SUBJECT_OF[KINDS[self.labels[i]]]) for i in keep] + [SUBJECTS.index(sub) for _, sub in extra], dtype=int)
            self.subj_bank = np.vstack([self.bank[keep], extra_vecs])
        return self.subj_bank, self.subj_labels

    @staticmethod
    def _subject(q, typed, subj_bank, subj_labels):
        """The school subject: the closest examples vote (each subject with the mean of its 3 best,
        over the animation examples and the subject examples), mixed with Laya's own answer to
        "which school subject?"."""
        sims = subj_bank @ q
        best = np.array([np.sort(sims[subj_labels == i])[-3:].mean() if (subj_labels == i).any() else -1.0 for i in range(len(SUBJECTS))])
        knn = np.exp((best - best.max()) * SHARPNESS)
        knn /= knn.sum()
        lay = np.zeros(len(SUBJECTS))
        probs = typed.get("probabilities") or typed.get("probs")
        if isinstance(probs, dict):
            for k, v in probs.items():
                if k in SUBJECTS:
                    lay[SUBJECTS.index(k)] = v
        elif typed.get("choice") in SUBJECTS:
            lay[SUBJECTS.index(typed["choice"])] = 1.0
        lay = lay / lay.sum() if lay.sum() else np.full(len(SUBJECTS), 1 / len(SUBJECTS))
        mix = 0.75 * knn + 0.25 * lay
        i = int(np.argmax(mix))
        return SUBJECTS[i], round(float(mix[i]), 3)

    def learn(self, text, kind):
        if kind not in KINDS:
            raise ValueError(f"kind must be one of {KINDS}")
        w = words(text)
        if nothing_to_decide(w):
            raise ValueError("nothing to learn in this text")
        with self.lock:
            k = KINDS.index(kind)
            # already known (the same words, the same kind): nothing new, the file doesn't grow
            if any(t == w and int(lab) == k for t, lab in zip(self.texts, self.labels)):
                return {"ok": True, "examples": len(self.texts), "known": True}
            if len(self.texts) >= MAX_EXAMPLES:
                raise ValueError(f"no more examples are learned (the limit is {MAX_EXAMPLES})")
            v = self._unit(self.embed([w]))
            # new arrays, swapped together: a decide() running now keeps its own consistent view
            self.bank, self.labels, self.texts = np.vstack([self.bank, v]), np.append(self.labels, KINDS.index(kind)), self.texts + [w]
        with open(LEARNED, "a") as f:
            f.write(json.dumps({"text": text, "kind": kind, "at": time.time()}) + "\n")
        return {"ok": True, "examples": len(self.texts)}


decider = None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": decider is not None, "model": "convaiinnovations/laya", "examples": len(decider.texts) if decider else 0})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            if self.path not in ("/decide", "/learn"):
                return self._send(404, {"error": "not found"})
            length = self.headers.get("Content-Length")
            if length is None:  # e.g. a chunked body, which this server can't read
                return self._send(411, {"error": "Content-Length required"})
            if int(length) < 0:
                return self._send(400, {"error": "bad Content-Length"})
            if int(length) > MAX_BODY:
                return self._send(413, {"error": "body too large"})
            body = json.loads(self.rfile.read(int(length)) or b"{}")
            if not isinstance(body, dict) or not isinstance(body.get("text"), str):
                return self._send(400, {"error": "text must be a string"})
            if decider is None:
                return self._send(503, {"error": "loading"})
            if self.path == "/decide":
                return self._send(200, decider.decide(body["text"][:2000]))
            return self._send(200, decider.learn(body["text"][:2000], body.get("kind")))
        except Exception as e:  # noqa: BLE001
            self._send(400, {"error": str(e)})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"[decide] loading Laya, http://127.0.0.1:{PORT}", flush=True)
    decider = Decider()
    threading.Event().wait()
