"""WebSocket server the web app talks to. Run: uv run uvicorn glimpse_engine.server:app --reload

Protocol: docs/protocol.md. Until the camera pipeline exists, send `check_typed` (problem
number + the answer as text) to drive the real checker and misconception library.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from . import __version__
from .tutor.bugs import SEED, Bug, diagnose, pick_diagnostic
from .tutor.checker import Verdict, check_sum
from .tutor.explain import explain_wrong_sum, hint
from .tutor.fractions import parse_frac
from .tutor.worksheets import WORKSHEETS, to_json

log = logging.getLogger("glimpse")
app = FastAPI(title="Glimpse engine", version=__version__)

CAMERA_AVAILABLE = False  # set by the vision pipeline once it can open the camera


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "version": __version__, "camera": CAMERA_AVAILABLE}


class Session:
    def __init__(self, socket: WebSocket) -> None:
        self.socket = socket
        self.lang = "en"
        self.sheet = "fractions-1"
        self.done: set[int] = set()
        self.suspected: dict[int, Bug] = {}  # diagnostic problem id -> bug it should confirm

    async def send(self, event: dict[str, Any]) -> None:
        await self.socket.send_json(event)

    async def handle(self, msg: dict[str, Any]) -> None:
        kind = msg.get("type")
        if kind == "session_start":
            await self.start(str(msg.get("worksheet", "fractions-1")), str(msg.get("lang", "en")))
        elif kind == "check_typed":
            await self.check_typed(int(msg["problem"]), str(msg["answer"]))
        elif kind == "check":
            await self.check_from_camera()
        elif kind == "ask_start":
            await self.send({"type": "status", "state": "listening"})
        elif kind == "ask_end":
            # TODO(speech): Whisper transcript + fingertip target -> question router -> answer.
            await self.send({"type": "answer", "explanation": None, "hint": hint("look_again", self.lang)})
            await self.send({"type": "status", "state": "watching"})
        elif kind == "session_end":
            self.done.clear()
            self.suspected.clear()
        else:
            log.info("ignored message %r", kind)

    async def start(self, sheet: str, lang: str) -> None:
        self.sheet = sheet if sheet in WORKSHEETS else "fractions-1"
        self.lang = lang
        self.done.clear()
        self.suspected.clear()
        await self.send({"type": "worksheet", "id": self.sheet, "problems": to_json(self.sheet)})
        await self.send({"type": "progress", "current": 1})
        await self.send({"type": "status", "state": "watching"})

    async def check_from_camera(self) -> None:
        # TODO(vision): crop the finished line, read it, then run the same path as check_typed.
        log.info("check pressed, but the camera pipeline is not connected yet")
        await self.send({"type": "status", "state": "watching"})

    async def check_typed(self, problem_id: int, text: str) -> None:
        problems = {pid: (a, b) for pid, a, b in WORKSHEETS[self.sheet]}
        if problem_id not in problems:
            return
        answer = parse_frac(text)
        if answer is None:
            await self.send({"type": "hint", "hint": hint("look_again", self.lang)})
            return
        a, b = problems[problem_id]
        await self.send({"type": "progress", "current": problem_id})
        await self.send({"type": "written", "problem": problem_id, "answer": answer.to_json()})
        await self.send({"type": "status", "state": "thinking"})
        self.done.add(problem_id)

        if check_sum(a, b, answer) is not Verdict.WRONG:
            await self.send({"type": "mark", "mark": {"problem": problem_id, "verdict": "correct"}})
            suspected = self.suspected.pop(problem_id, None)
            if suspected is not None:
                # The diagnostic problem came back right: the idea clicked (or it was a slip).
                await self.send({"type": "explain", "explanation": None})
                await self.send({"type": "hint", "hint": hint("well_done", self.lang)})
                await self.send({"type": "insight", "insight": {
                    "text": "Pieces must be the same size before you add them.",
                    "evidence": f"You showed it on problem {problem_id}: {a} + {b} = {answer}",
                }})
            else:
                await self.send({"type": "hint", "hint": None})
            await self.send({"type": "status", "state": "watching"})
            return

        matches = diagnose(a, b, answer, SEED)
        bug = matches[0] if matches else None
        if not matches:
            log.info("no library match for %s + %s = %s; this is where the LLM hypothesis step goes", a, b, answer)
        explanation, spoken = explain_wrong_sum(problem_id, a, b, answer, bug, self.lang)
        mark: dict[str, Any] = {"problem": problem_id, "verdict": "wrong"}
        if bug is not None:
            mark["label"] = bug.child_label
        await self.send({"type": "mark", "mark": mark})
        await self.send({"type": "explain", "explanation": explanation})
        await self.send({"type": "hint", "hint": spoken})

        if matches:
            remaining = [(pid, x, y) for pid, x, y in WORKSHEETS[self.sheet] if pid not in self.done]
            remaining.sort(key=lambda r: (r[0] < problem_id, r[0]))  # prefer problems still ahead of the child
            choice = pick_diagnostic(matches, [(x, y) for _, x, y in remaining])
            if choice is not None:
                next_id = next(pid for pid, x, y in remaining if (x, y) == choice)
                self.suspected[next_id] = matches[0]
                await self.send({"type": "mark", "mark": {"problem": next_id, "verdict": "next", "label": "try this one next"}})
        await self.send({"type": "status", "state": "watching"})


@app.websocket("/ws")
async def websocket(socket: WebSocket) -> None:
    await socket.accept()
    session = Session(socket)
    await session.send({"type": "hello", "version": __version__, "camera": CAMERA_AVAILABLE})
    try:
        while True:
            await session.handle(await socket.receive_json())
    except WebSocketDisconnect:
        pass
