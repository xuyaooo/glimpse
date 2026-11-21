"""Fractions kept exactly as written.

4/6 is not 2/3 here: the form a child writes is evidence. "Adds across" turns 3/4 + 1/2
into 4/6, and only the unreduced form tells that apart from other mistakes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from fractions import Fraction


@dataclass(frozen=True)
class Frac:
    num: int
    den: int

    def __post_init__(self) -> None:
        if self.den == 0:
            raise ValueError("a fraction's bottom cannot be zero")

    @property
    def value(self) -> Fraction:
        return Fraction(self.num, self.den)

    def __str__(self) -> str:
        return f"{self.num}/{self.den}"

    def to_json(self) -> dict[str, int]:
        return {"n": self.num, "d": self.den}


_PLAIN = re.compile(r"^\s*(-?\d+)\s*/\s*(-?\d+)\s*$")
_LATEX = re.compile(r"^\s*\\[dt]?frac\s*\{\s*(-?\d+)\s*\}\s*\{\s*(-?\d+)\s*\}\s*$")
_WHOLE = re.compile(r"^\s*(-?\d+)\s*$")


def parse_frac(text: str) -> Frac | None:
    """Parse "4/6", "\\frac{4}{6}" or a whole number. None for anything else, or a zero bottom."""
    for pattern in (_PLAIN, _LATEX):
        if m := pattern.match(text):
            num, den = int(m[1]), int(m[2])
            return Frac(num, den) if den != 0 else None
    if m := _WHOLE.match(text):
        return Frac(int(m[1]), 1)
    return None
