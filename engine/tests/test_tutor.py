from fastapi.testclient import TestClient

from glimpse_engine.server import app
from glimpse_engine.tutor.bugs import SEED, diagnose, pick_diagnostic, verify_hypothesis
from glimpse_engine.tutor.checker import Verdict, check_sum
from glimpse_engine.tutor.fractions import Frac, parse_frac

F = Frac
PROBES = [(F(1, 3), F(1, 4)), (F(2, 5), F(1, 2)), (F(1, 6), F(3, 4))]


def test_parse_keeps_the_written_form():
    assert parse_frac("4/6") == F(4, 6)
    assert parse_frac(r"\frac{4}{6}") == F(4, 6)
    assert parse_frac(" 3 ") == F(3, 1)
    assert parse_frac("4/0") is None
    assert parse_frac("four sixths") is None
    assert F(4, 6) != F(2, 3)


def test_checker():
    assert check_sum(F(1, 5), F(2, 5), F(3, 5)) is Verdict.CORRECT
    assert check_sum(F(3, 4), F(1, 2), F(4, 6)) is Verdict.WRONG
    assert check_sum(F(1, 2), F(1, 4), F(6, 8)) is Verdict.UNSIMPLIFIED


def test_adds_across_is_diagnosed_exactly():
    assert [b.id for b in diagnose(F(3, 4), F(1, 2), F(4, 6))] == ["adds_across"]
    # Same value, different form: not the same mistake.
    assert diagnose(F(3, 4), F(1, 2), F(2, 3)) == []


def test_ambiguous_answer_gets_a_diagnostic_problem():
    candidates = diagnose(F(1, 2), F(1, 3), F(2, 6))
    assert {b.id for b in candidates} == {"no_scaling", "lcd_no_scaling"}
    a, b = pick_diagnostic(candidates, [(F(1, 2), F(1, 4)), (F(1, 4), F(1, 6))])
    predictions = {bug.predict(a, b) for bug in candidates}
    assert len(predictions) == len(candidates)


def test_ai_hypothesis_must_generalise():
    adds_across = next(b for b in SEED if b.id == "adds_across").fn
    assert verify_hypothesis(adds_across, F(3, 4), F(1, 2), F(4, 6), PROBES)
    # Hard-coding the answer reproduces it but explains nothing.
    assert not verify_hypothesis(lambda _a, _b: F(4, 6), F(3, 4), F(1, 2), F(4, 6), PROBES)
    # The correct method is not a misconception.
    correct = lambda a, b: F(a.num * b.den + b.num * a.den, a.den * b.den)  # noqa: E731
    assert not verify_hypothesis(correct, F(3, 4), F(1, 2), F(10, 8), PROBES)


def test_websocket_flow_marks_and_explains_a_mistake():
    with TestClient(app).websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "hello"
        ws.send_json({"type": "session_start", "student": "amara", "worksheet": "fractions-1", "lang": "fr"})
        assert ws.receive_json()["type"] == "worksheet"
        ws.receive_json()  # progress
        ws.receive_json()  # status

        ws.send_json({"type": "check_typed", "problem": 2, "answer": "4/6"})
        events = []
        while not events or events[-1] != {"type": "status", "state": "watching"}:
            events.append(ws.receive_json())
        by_type = {e["type"]: e for e in events if e["type"] != "mark"}
        marks = [e["mark"] for e in events if e["type"] == "mark"]

        assert marks[0] == {"problem": 2, "verdict": "wrong", "label": "added the tops and the bottoms"}
        # The follow-up is a problem still ahead, where "adds across" predicts 3/8 instead of 11/15.
        assert marks[1] == {"problem": 3, "verdict": "next", "label": "try this one next"}
        assert by_type["explain"]["explanation"]["visual"]["kind"] == "compare_pies"
        assert by_type["hint"]["hint"]["lang"] == "fr"
