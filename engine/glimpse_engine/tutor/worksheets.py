"""Printed worksheets. Problem ids match the numbered boxes on the paper."""

from __future__ import annotations

from .fractions import Frac

WORKSHEETS: dict[str, list[tuple[int, Frac, Frac]]] = {
    "fractions-1": [
        (1, Frac(1, 5), Frac(2, 5)),
        (2, Frac(3, 4), Frac(1, 2)),
        (3, Frac(2, 5), Frac(1, 3)),
        (4, Frac(1, 6), Frac(2, 3)),
        (5, Frac(3, 8), Frac(1, 4)),
        (6, Frac(2, 3), Frac(1, 4)),
    ],
}


def to_json(sheet_id: str) -> list[dict]:
    return [{"id": pid, "a": a.to_json(), "b": b.to_json()} for pid, a, b in WORKSHEETS[sheet_id]]
