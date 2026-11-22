"""Layer 3 - Isolated Relational Graph.

One directed weighted graph G_k per chat room. The edge weight S(u,v) in [0,1]
is the tolerance baseline of v towards u: high values mean a history of
accepted rough banter.

  intent variance      dV = P_curr - S(u,v)                 (Eq. 5)
  EMA reinforcement    S <- alpha * S + (1 - alpha) * P     (Eq. 6)
  victim collapse      S -> 0 when the recipient flags      (Eq. 7)

Implementation note: the EMA is applied only to messages that were actually
borderline (P >= TAU_CLEAN) and accepted. Feeding every clean "good morning"
into the EMA would drag a friendship's tolerance back to zero, which is the
opposite of what the baseline is meant to capture.
"""

from cypher.config import DELTA_BLOCK, DELTA_VERIFY, EMA_ALPHA, INITIAL_TOLERANCE
from cypher.store import Store, now_iso


class RelationalGraph:
    def __init__(self, store: Store, alpha: float = EMA_ALPHA):
        self.store = store
        self.alpha = alpha

    def edge(self, room: str, src: str, dst: str) -> dict:
        row = self.store.one("SELECT * FROM edges WHERE room=? AND src=? AND dst=?", (room, src, dst))
        if row:
            return row
        return {"room": room, "src": src, "dst": dst, "tolerance": INITIAL_TOLERANCE,
                "interactions": 0, "flags": 0, "updated_at": None}

    def _save(self, e: dict):
        self.store.execute(
            """INSERT INTO edges(room, src, dst, tolerance, interactions, flags, updated_at) VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(room, src, dst) DO UPDATE SET tolerance=excluded.tolerance,
               interactions=excluded.interactions, flags=excluded.flags, updated_at=excluded.updated_at""",
            (e["room"], e["src"], e["dst"], e["tolerance"], e["interactions"], e["flags"], now_iso()),
        )

    def evaluate(self, room: str, src: str, dst: str, p: float) -> dict:
        e = self.edge(room, src, dst)
        dv = p - e["tolerance"]
        if dv > DELTA_BLOCK:
            decision = "block"
        elif dv > DELTA_VERIFY:
            decision = "verify"
        else:
            decision = "allow"
        return {"delta_v": round(dv, 4), "tolerance": round(e["tolerance"], 4), "decision": decision,
                "interactions": e["interactions"], "flags": e["flags"]}

    def touch(self, room: str, src: str, dst: str):
        e = self.edge(room, src, dst)
        e["interactions"] += 1
        self._save(e)

    def reinforce(self, room: str, src: str, dst: str, p: float) -> float:
        e = self.edge(room, src, dst)
        e["tolerance"] = self.alpha * e["tolerance"] + (1 - self.alpha) * p
        e["interactions"] += 1
        self._save(e)
        return e["tolerance"]

    def collapse(self, room: str, src: str, dst: str):
        e = self.edge(room, src, dst)
        e["tolerance"] = 0.0
        e["flags"] += 1
        e["interactions"] += 1
        self._save(e)

    def set_tolerance(self, room: str, src: str, dst: str, value: float):
        e = self.edge(room, src, dst)
        e["tolerance"] = max(0.0, min(1.0, value))
        self._save(e)

    def snapshot(self, room: str) -> dict:
        edges = self.store.query("SELECT src, dst, tolerance, interactions, flags, updated_at FROM edges WHERE room=?",
                                 (room,))
        users = sorted({e["src"] for e in edges} | {e["dst"] for e in edges})
        return {"room": room, "nodes": [{"id": u} for u in users], "edges": edges}
