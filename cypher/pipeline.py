"""The CYPHER cascading pipeline (Figure 1 of the paper).

    message -> L1 sentinel scan -> L2 firewall
               |  score > tau_strict ............ block (zero tolerance)
               |  score < tau_clean ............. allow
               v
            L3 relational graph  dV = P - S(u,v)
               |  dV > delta_block .............. block (covert attack)
               |  dV <= delta_verify ............ allow + EMA reinforce
               v
            L4 asymmetric verification (recipient only)
               |  thumbs up ..................... allow + reinforce
               |  thumbs down ................... collapse edge -> L5 DP update
"""

from dataclasses import dataclass, field

from cypher.config import TAU_CLEAN, TAU_STRICT
from cypher.layers.firewall import Firewall
from cypher.layers.relational_graph import RelationalGraph
from cypher.layers.sentinel import Sentinel
from cypher.layers.swarm import SwarmNode
from cypher.store import Store, now_iso


@dataclass
class Decision:
    message_id: int | None
    action: str            # allow | block | verify
    layer: int             # layer that made the final call
    reason: str
    score: float
    model_score: float
    delta_v: float | None = None
    tolerance: float | None = None
    steps: list = field(default_factory=list)
    sentinel: dict = field(default_factory=dict)

    def as_dict(self):
        return self.__dict__.copy()


def combine(model_p: float, max_severity: float) -> float:
    """Fuse the model probability with Layer 1 lexicon evidence.

    Zero-day terms with severity >= 0.9 (e.g. "kys") are treated as explicit;
    weaker slang nudges the score up proportionally.
    """
    if max_severity >= 0.9:
        return max(model_p, max_severity)
    return model_p + (1 - model_p) * 0.5 * max_severity


class CypherPipeline:
    def __init__(self, store: Store, firewall: Firewall | None = None, swarm_seed=None):
        self.store = store
        self.sentinel = Sentinel(store)
        self.firewall = firewall or Firewall()
        self.graph = RelationalGraph(store)
        self.swarm = SwarmNode(store, seed=swarm_seed)

    # ------------------------------------------------------------------
    def score_text(self, text: str) -> tuple[float, float, dict]:
        scan = self.sentinel.scan(text)
        variants = [scan["cleaned"]] + ([scan["normalized"]] if scan["obfuscated"] else [])
        model_p = float(max(self.firewall.score(variants)))
        return combine(model_p, scan["max_severity"]), model_p, scan

    def process(self, room: str, sender: str, recipient: str, text: str,
                precomputed: tuple[float, float, dict] | None = None, log: bool = True) -> Decision:
        score, model_p, scan = precomputed or self.score_text(text)
        steps = [{
            "layer": 1, "name": "Web Sentinel",
            "status": "hit" if scan["hits"] else "pass",
            "detail": (f"matched {', '.join(h['term'] for h in scan['hits'])}" if scan["hits"] else "no zero-day slang")
                      + (" (de-obfuscated)" if scan["obfuscated"] else ""),
        }]

        def finish(action, layer, reason, dv=None, tol=None, verification=None):
            mid = None
            if log:
                mid = self.store.execute(
                    """INSERT INTO messages(room, sender, recipient, text, score, layer, action, reason,
                       delta_v, tolerance, verification, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (room, sender, recipient, text, score, layer, action, reason, dv, tol, verification, now_iso()),
                ).lastrowid
            return Decision(mid, action, layer, reason, round(score, 4), round(model_p, 4),
                            dv, tol, steps, {"hits": scan["hits"], "normalized": scan["normalized"]})

        # Layer 2 ------------------------------------------------------
        if score > TAU_STRICT:
            steps.append({"layer": 2, "name": "Absolute Firewall", "status": "block",
                          "detail": f"P={score:.2f} > tau_strict={TAU_STRICT}"})
            return finish("block", 2, "Explicit toxicity (zero tolerance)")
        if score < TAU_CLEAN:
            steps.append({"layer": 2, "name": "Absolute Firewall", "status": "pass",
                          "detail": f"P={score:.2f} < {TAU_CLEAN}, clean"})
            self.graph.touch(room, sender, recipient)
            return finish("allow", 2, "Clean message")
        steps.append({"layer": 2, "name": "Absolute Firewall", "status": "borderline",
                      "detail": f"P={score:.2f} in grey zone, checking context"})

        # Layer 3 ------------------------------------------------------
        ev = self.graph.evaluate(room, sender, recipient, score)
        dv, tol = ev["delta_v"], ev["tolerance"]
        if ev["decision"] == "block":
            steps.append({"layer": 3, "name": "Relational Graph", "status": "block",
                          "detail": f"dV={dv:.2f} (S={tol:.2f}) exceeds hostile threshold"})
            return finish("block", 3, "Covert attack: hostile intent variance", dv, tol)
        if ev["decision"] == "allow":
            new_tol = self.graph.reinforce(room, sender, recipient, score)
            steps.append({"layer": 3, "name": "Relational Graph", "status": "pass",
                          "detail": f"dV={dv:.2f} within tolerance S={tol:.2f}; S -> {new_tol:.2f}"})
            return finish("allow", 3, "Within relationship tolerance (banter)", dv, tol)
        steps.append({"layer": 3, "name": "Relational Graph", "status": "unsure",
                      "detail": f"dV={dv:.2f} (S={tol:.2f}) ambiguous"})

        # Layer 4 ------------------------------------------------------
        steps.append({"layer": 4, "name": "Victim Verification", "status": "pending",
                      "detail": f"delivered with a private check-in shown only to {recipient}"})
        return finish("verify", 4, "Ambiguous: recipient asked privately", dv, tol, verification="pending")

    # ------------------------------------------------------------------
    def resolve(self, message_id: int, flagged: bool) -> dict:
        msg = self.store.one("SELECT * FROM messages WHERE id=?", (message_id,))
        if not msg:
            raise KeyError(message_id)
        if msg["verification"] != "pending":
            return {"message_id": message_id, "status": msg["verification"], "already_resolved": True}

        room, src, dst = msg["room"], msg["sender"], msg["recipient"]
        if flagged:
            self.graph.collapse(room, src, dst)
            dp = self.swarm.local_update(msg["text"], label=1)
            self.store.execute("UPDATE messages SET verification='flagged', action='block', layer=4, "
                               "reason='Recipient flagged as abusive' WHERE id=?", (message_id,))
            return {"message_id": message_id, "status": "flagged", "tolerance": 0.0, "dp_update": dp}

        tol = self.graph.reinforce(room, src, dst, msg["score"])
        self.store.execute("UPDATE messages SET verification='approved', action='allow', "
                           "reason='Recipient confirmed banter' WHERE id=?", (message_id,))
        return {"message_id": message_id, "status": "approved", "tolerance": round(tol, 4)}

    def analyze(self, text: str) -> dict:
        score, model_p, scan = self.score_text(text)
        if score > TAU_STRICT:
            verdict = "toxic"
        elif score >= TAU_CLEAN:
            verdict = "borderline"
        else:
            verdict = "clean"
        return {
            "score": round(score, 4), "model_score": round(model_p, 4), "verdict": verdict,
            "threshold": round(self.firewall.threshold, 4), "tau_strict": TAU_STRICT, "tau_clean": TAU_CLEAN,
            "sentinel": {"hits": scan["hits"], "normalized": scan["normalized"], "obfuscated": scan["obfuscated"]},
            "explanation": self.firewall.explain(scan["normalized"] if scan["obfuscated"] else scan["cleaned"]),
            "backend": self.firewall.backend,
        }
