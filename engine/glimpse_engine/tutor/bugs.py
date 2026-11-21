"""Misconception library.

A bug is a function from the problem to the answer a child with that misconception would
write, unreduced. A diagnosis only counts when a bug reproduces the child's *exact* answer.

AI-proposed bugs go through `verify_hypothesis` before they join the library. Run their code
in a subprocess with a timeout; never `exec` model output inside the engine process.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from math import lcm

from .fractions import Frac

BugFn = Callable[[Frac, Frac], Frac]
Problem = tuple[Frac, Frac]


@dataclass(frozen=True)
class Bug:
    id: str
    name: str  # for teachers
    child_label: str  # short, drawn next to the circled answer
    skill: str  # learner-model skill it points at
    fn: BugFn = field(repr=False, compare=False)
    origin: str = "team"  # "team" or "ai"

    def predict(self, a: Frac, b: Frac) -> Frac | None:
        try:
            out = self.fn(a, b)
        except (ArithmeticError, ValueError, TypeError):
            return None
        return out if isinstance(out, Frac) else None


SEED: list[Bug] = [
    Bug("adds_across", "Adds the tops and the bottoms", "added the tops and the bottoms", "common_den",
        lambda a, b: Frac(a.num + b.num, a.den + b.den)),
    Bug("no_scaling", "Common bottom by multiplying, top not scaled", "changed the bottom, not the top", "scale_top",
        lambda a, b: Frac(a.num + b.num, a.den * b.den)),
    Bug("lcd_no_scaling", "Smallest common bottom, top not scaled", "changed the bottom, not the top", "scale_top",
        lambda a, b: Frac(a.num + b.num, lcm(a.den, b.den))),
    Bug("keeps_bigger_bottom", "Adds the tops, keeps the bigger bottom", "kept one of the bottoms", "common_den",
        lambda a, b: Frac(a.num + b.num, max(a.den, b.den))),
    Bug("multiplies", "Multiplies instead of adding", "multiplied instead of adding", "same_den",
        lambda a, b: Frac(a.num * b.num, a.den * b.den)),
    Bug("right_top_adds_bottoms", "Right top, but adds the bottoms", "added the bottoms", "common_den",
        lambda a, b: Frac(a.num * b.den + b.num * a.den, a.den + b.den)),
]


def diagnose(a: Frac, b: Frac, answer: Frac, library: Iterable[Bug] = SEED) -> list[Bug]:
    """Every bug that reproduces the child's exact written answer. Several means: ask a diagnostic problem."""
    return [bug for bug in library if bug.predict(a, b) == answer]


def pick_diagnostic(candidates: Sequence[Bug], pool: Iterable[Problem]) -> Problem | None:
    """The next problem where each candidate bug predicts a different wrong answer.

    If the child then writes one of those answers, we know which misconception it is, and
    that it was not a slip.
    """
    for a, b in pool:
        right = a.value + b.value
        predictions = [bug.predict(a, b) for bug in candidates]
        if any(p is None or p.value == right for p in predictions):
            continue
        if len(set(predictions)) == len(predictions):
            return a, b
    return None


def verify_hypothesis(fn: BugFn, a: Frac, b: Frac, answer: Frac, probes: Iterable[Problem]) -> bool:
    """Accept an AI-proposed bug only if it explains the child, and not just this one answer.

    1. It reproduces the exact answer.
    2. It is not a constant: `return Frac(4, 6)` passes check 1 and explains nothing.
    3. It is actually wrong on at least one other problem.
    """
    candidate = Bug("candidate", "candidate", "", "?", fn, origin="ai")
    if candidate.predict(a, b) != answer:
        return False
    probes = list(probes)
    outputs = [candidate.predict(x, y) for x, y in probes]
    if not outputs or any(o is None for o in outputs):
        return False
    if len(set(outputs)) < 2:
        return False
    return any(o is not None and o.value != x.value + y.value for o, (x, y) in zip(outputs, probes))
