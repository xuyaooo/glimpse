"""Turns a diagnosis into a visual scene and a short spoken hint.

The scene is data (see docs/protocol.md, "Visual"): the web app draws it. No model writes
drawing code. Hints are reviewed templates with number slots, one per language.
"""

from __future__ import annotations

from math import lcm
from typing import Any

from .bugs import Bug
from .fractions import Frac

HINTS: dict[str, dict[str, str]] = {
    "smaller": {
        "fr": "Regarde : {ans}, c'est plus petit que {big}. Est-ce qu'on peut ajouter et obtenir moins ?",
        "en": "Look: {ans} is smaller than {big}. Can adding give you less?",
        "de": "Schau: {ans} ist kleiner als {big}. Kann Addieren etwas kleiner machen?",
        "it": "Guarda: {ans} è più piccolo di {big}. Sommando si può ottenere di meno?",
    },
    "same_size": {
        "fr": "Les morceaux ont-ils la même taille ? Transforme d'abord {part} en {scaled}.",
        "en": "Are the pieces the same size? Turn {part} into {scaled} first.",
        "de": "Sind die Stücke gleich gross? Mach zuerst aus {part} {scaled}.",
        "it": "I pezzi sono della stessa grandezza? Trasforma prima {part} in {scaled}.",
    },
    "look_again": {
        "fr": "Regarde encore cette ligne.",
        "en": "Have another look at this line.",
        "de": "Schau dir diese Zeile noch einmal an.",
        "it": "Guarda ancora questa riga.",
    },
    "well_done": {
        "fr": "Bravo ! Cette fois, les morceaux ont la même taille.",
        "en": "Well done! This time the pieces are the same size.",
        "de": "Super! Diesmal sind die Stücke gleich gross.",
        "it": "Bravo! Questa volta i pezzi sono della stessa grandezza.",
    },
}


def hint(key: str, lang: str, **slots: Any) -> dict[str, str]:
    table = HINTS[key]
    text = table.get(lang, table["en"]).format(**slots)
    out = {"text": text, "lang": lang if lang in table else "en"}
    if out["lang"] != "en":
        out["translation"] = table["en"].format(**slots)
    return out


def _part(f: Frac, label: str, tone: str, note: str | None = None) -> dict[str, Any]:
    part: dict[str, Any] = {"n": f.num, "d": f.den, "label": label, "tone": tone}
    if note:
        part["note"] = note
    return part


def _rescaled(a: Frac, b: Frac) -> tuple[Frac, Frac]:
    """The operand that needs new, smaller pieces, and how it looks with the common bottom."""
    d = lcm(a.den, b.den)
    part = b if b.den != d else a
    return part, Frac(part.num * (d // part.den), d)


def explain_wrong_sum(problem: int, a: Frac, b: Frac, answer: Frac, bug: Bug | None, lang: str) -> tuple[dict, dict]:
    """Explanation scene and hint for a wrong sum a + b = answer."""
    bigger = a if a.value >= b.value else b
    other = b if bigger is a else a
    part, scaled = _rescaled(a, b)
    same_size_step = f"Make the pieces the same size first: {part} is the same as {scaled}."

    if answer.value < bigger.value:
        # Adding can't make it smaller: the strongest counter-example for "adds across".
        explanation = {
            "problem": problem,
            "heading": f"Problem {problem}",
            "title": "Can adding make something smaller?",
            "visual": {
                "kind": "compare_pies",
                "left": _part(answer, f"your answer, {answer}", "marker"),
                "relation": "<",
                "right": _part(bigger, f"{bigger} on its own", "pen"),
            },
            "steps": [
                f"Your answer, {answer}, is smaller than {bigger}.",
                f"But you added {other} to {bigger}, so the answer must be bigger than {bigger}.",
                same_size_step,
            ],
        }
        return explanation, hint("smaller", lang, ans=answer, big=bigger)

    explanation = {
        "problem": problem,
        "heading": f"Problem {problem}",
        "title": "Are the pieces the same size?",
        "visual": {
            "kind": "bar_model",
            "rows": [
                _part(a, str(a), "pen"),
                _part(b, str(b), "marker"),
                _part(scaled, str(scaled), "marker", note=f"cut {part} into smaller pieces"),
            ],
        },
        "steps": [
            f"{a} and {b} are cut into different-sized pieces.",
            same_size_step,
            "Now add the tops. The bottom stays the same.",
        ],
    }
    if bug is None:
        return explanation, hint("look_again", lang)
    return explanation, hint("same_size", lang, part=part, scaled=scaled)
