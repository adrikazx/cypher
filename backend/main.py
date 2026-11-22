"""CYPHER REST API.

Run from the repository root:
    uvicorn backend.main:app --reload --port 8000
"""

import json
import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from cypher import __version__
from cypher.config import DB_PATH, PROCESSED_DIR, RESULTS_DIR, ROOT, TAU_CLEAN, TAU_STRICT
from cypher.layers.swarm import simulate
from cypher.pipeline import CypherPipeline
from cypher.store import Store

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("cypher.api")

DEMO_ROOM = "squad"
DEMO_EDGES = [  # (src, dst, tolerance) - long-time friends who trash talk each other
    ("aarav", "priya", 0.62), ("priya", "aarav", 0.58),
    ("aarav", "kabir", 0.55), ("kabir", "aarav", 0.6),
]
state: dict = {}


def seed_demo(pipe: CypherPipeline):
    pipe.store.reset()
    for src, dst, tol in DEMO_EDGES:
        pipe.graph.set_tolerance(DEMO_ROOM, src, dst, tol)
    for src, dst, text in [
        ("priya", "aarav", "are we still on for the match tonight?"),
        ("aarav", "priya", "obviously, bring snacks this time you freeloader"),
        ("kabir", "aarav", "you played like a noob yesterday lol"),
        ("rohan", "meera", "hey, can you share the DBMS notes?"),
    ]:
        pipe.process(DEMO_ROOM, src, dst, text)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    store = Store(DB_PATH)
    pipe = CypherPipeline(store)
    if not store.one("SELECT id FROM messages LIMIT 1"):
        seed_demo(pipe)
    state["pipe"] = pipe
    state["lock"] = threading.Lock()
    log.info("CYPHER ready - firewall backend: %s", pipe.firewall.backend)
    yield


app = FastAPI(title="CYPHER API", version=__version__, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def pipe() -> CypherPipeline:
    return state["pipe"]


# ---------------------------------------------------------------- schemas
class TextIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class MessageIn(TextIn):
    room: str = DEMO_ROOM
    sender: str = Field(..., min_length=1, max_length=40)
    recipient: str = Field(..., min_length=1, max_length=40)


class VerifyIn(BaseModel):
    flagged: bool


class EdgeIn(BaseModel):
    src: str
    dst: str
    tolerance: float = Field(..., ge=0, le=1)


class SlangIn(BaseModel):
    term: str = Field(..., min_length=2, max_length=60)
    severity: float = Field(..., ge=0, le=1)


class FedIn(BaseModel):
    noise_multiplier: float = Field(1.0, ge=0, le=5)
    rounds: int = Field(15, ge=1, le=60)
    clients: int = Field(20, ge=2, le=100)


# ---------------------------------------------------------------- routes
@app.get("/api/health")
def health():
    fw = pipe().firewall
    return {"status": "ok", "version": __version__, "backend": fw.backend, "model": fw.description,
            "threshold": round(fw.threshold, 4), "tau_strict": TAU_STRICT, "tau_clean": TAU_CLEAN}


@app.post("/api/analyze")
def analyze(body: TextIn):
    return pipe().analyze(body.text)


@app.post("/api/messages")
def send_message(body: MessageIn):
    if body.sender == body.recipient:
        raise HTTPException(400, "sender and recipient must differ")
    with state["lock"]:
        return pipe().process(body.room, body.sender.lower(), body.recipient.lower(), body.text).as_dict()


@app.get("/api/messages")
def list_messages(room: str | None = None, limit: int = 100):
    if room:
        return pipe().store.query("SELECT * FROM messages WHERE room=? ORDER BY id DESC LIMIT ?", (room, limit))
    return pipe().store.query("SELECT * FROM messages ORDER BY id DESC LIMIT ?", (limit,))


@app.post("/api/messages/{message_id}/verify")
def verify(message_id: int, body: VerifyIn):
    with state["lock"]:
        try:
            return pipe().resolve(message_id, body.flagged)
        except KeyError:
            raise HTTPException(404, "message not found")


@app.get("/api/graph/{room}")
def graph(room: str):
    return pipe().graph.snapshot(room)


@app.post("/api/graph/{room}/edge")
def set_edge(room: str, body: EdgeIn):
    pipe().graph.set_tolerance(room, body.src.lower(), body.dst.lower(), body.tolerance)
    return pipe().graph.snapshot(room)


@app.get("/api/sentinel")
def sentinel_terms():
    s = pipe().sentinel
    return {"ttl_days": s.ttl.days, "terms": s.active_terms()}


@app.post("/api/sentinel")
def add_term(body: SlangIn):
    pipe().sentinel.observe(body.term, body.severity, source="moderator")
    return sentinel_terms()


@app.post("/api/sentinel/purge")
def purge_terms():
    return {"removed": pipe().sentinel.purge()}


@app.get("/api/swarm")
def swarm_status():
    return pipe().swarm.status()


@app.post("/api/swarm/aggregate")
def swarm_aggregate():
    with state["lock"]:
        return pipe().swarm.aggregate()


@app.get("/api/stats")
def stats():
    store = pipe().store
    return {
        "by_action": store.query("SELECT action, COUNT(*) AS n FROM messages GROUP BY action"),
        "by_layer": store.query("SELECT layer, action, COUNT(*) AS n FROM messages GROUP BY layer, action"),
        "pending": store.one("SELECT COUNT(*) AS n FROM messages WHERE verification='pending'")["n"],
        "total": store.one("SELECT COUNT(*) AS n FROM messages")["n"],
    }


@app.post("/api/demo/reset")
def reset_demo():
    with state["lock"]:
        seed_demo(pipe())
    return {"status": "reset", "room": DEMO_ROOM}


def _read_json(path: Path):
    return json.loads(path.read_text()) if path.exists() else None


@app.get("/api/results")
def results():
    metrics = [json.loads(p.read_text()) for p in sorted((RESULTS_DIR / "metrics").glob("*.json"))]
    curves = {p.stem: json.loads(p.read_text()) for p in (RESULTS_DIR / "curves").glob("*.json")}
    history = {p.stem: json.loads(p.read_text()) for p in (RESULTS_DIR / "history").glob("*.json")}
    return {"metrics": metrics, "curves": curves, "history": history,
            "ablation": _read_json(RESULTS_DIR / "ablation.json"),
            "federated": _read_json(RESULTS_DIR / "federated.json")}


@app.post("/api/federated/simulate")
def federated(body: FedIn):
    train_path, test_path = PROCESSED_DIR / "train.csv", PROCESSED_DIR / "test.csv"
    if not train_path.exists():
        raise HTTPException(409, "processed dataset not found - run `python -m ml.prepare_data` first, "
                                 "or view the pre-computed curves on the Results page")
    train = pd.read_csv(train_path, keep_default_na=False).sample(n=20000, random_state=1)
    test = pd.read_csv(test_path, keep_default_na=False).sample(n=3000, random_state=1)
    history = simulate(train.text.values, train.label.values, train.lang.values, test.text.values,
                       test.label.values, n_clients=body.clients, rounds=body.rounds,
                       noise_multiplier=body.noise_multiplier)
    return {"config": body.model_dump(), "history": history}


# ---------------------------------------------------------------- frontend
DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        file = DIST / path
        return FileResponse(file if path and file.is_file() else DIST / "index.html")
