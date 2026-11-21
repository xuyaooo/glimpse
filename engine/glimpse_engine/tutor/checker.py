"""Step checker for fraction sums.

Exact arithmetic with the standard library is enough for the fractions demo. Equations and
other topics go through SymPy (`uv sync --extra math`), parsing the reader's LaTeX subset.
"""

from __future__ import annotations

from enum import Enum
from math import gcd

from .fractions import Frac


class Verdict(str, Enum):
    CORRECT = "correct"
    UNSIMPLIFIED = "unsimplified"  # right value, not in lowest terms: the teaching rules decide if that matters
    WRONG = "wrong"


def check_sum(a: Frac, b: Frac, answer: Frac) -> Verdict:
    if answer.value != a.value + b.value:
        return Verdict.WRONG
    if gcd(answer.num, answer.den) > 1:
        return Verdict.UNSIMPLIFIED
    return Verdict.CORRECT
