"""Unit tests for the CYPHER layers. They use a stub firewall, so no trained model is needed.

    python -m pytest -q
"""

from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from cypher.config import EMA_ALPHA, INITIAL_TOLERANCE, TAU_STRICT
from cypher.layers.relational_graph import RelationalGraph
from cypher.layers.sentinel import Sentinel
from cypher.layers.swarm import dp_sanitize, rdp_epsilon
from cypher.pipeline import CypherPipeline, combine
from cypher.store import Store
from cypher.text import clean, deobfuscate


class StubFirewall:
    """Returns a fixed score per message so routing can be tested deterministically."""
    backend, description, threshold = "stub", "stub", 0.5

    def __init__(self, scores):
        self.scores = scores

    def score(self, texts, batch_size=64):
        return np.array([self.scores.get(t, 0.05) for t in texts])

    def explain(self, text, max_words=48):
        return []


@pytest.fixture
def store():
    return Store(":memory:")


# --- text -------------------------------------------------------------------
def test_clean_strips_urls_and_mentions():
    out = clean("RT @bob check https://x.com/abc soooooo bad &amp; sad")
    assert "http" not in out and "@user" in out and "soo " in out and "&" in out


@pytest.mark.parametrize("raw, expected", [("1d10t", "idiot"), ("ki11", "kill"), ("st00pid", "stoopid")])
def test_deobfuscate_leetspeak(raw, expected):
    assert deobfuscate(raw) == expected


def test_deobfuscate_keeps_plain_numbers():
    assert deobfuscate("meet at 5pm in room 204") == "meet at 5pm in room 204"


# --- layer 1 ----------------------------------------------------------------
def test_sentinel_matches_seed_slang(store):
    s = Sentinel(store)
    hits = {h["term"] for h in s.scan("just kys already")["hits"]}
    assert "kys" in hits


def test_sentinel_ttl_purge(store):
    s = Sentinel(store, ttl_days=60)
    s.observe("zeroday", 0.6)
    future = datetime.now(timezone.utc) + timedelta(days=61)
    assert "zeroday" not in {t["term"] for t in s.active_terms(now=future)}
    assert s.purge(now=future) > 0


def test_combine_high_severity_is_explicit():
    assert combine(0.2, 0.97) == pytest.approx(0.97)
    assert 0.2 < combine(0.2, 0.4) < 0.97


# --- layer 3 ----------------------------------------------------------------
def test_ema_update_matches_equation_6(store):
    g = RelationalGraph(store)
    s1 = g.reinforce("r", "a", "b", 0.6)
    assert s1 == pytest.approx(EMA_ALPHA * INITIAL_TOLERANCE + (1 - EMA_ALPHA) * 0.6)


def test_victim_flag_collapses_edge(store):
    g = RelationalGraph(store)
    g.set_tolerance("r", "a", "b", 0.7)
    g.collapse("r", "a", "b")
    e = g.edge("r", "a", "b")
    assert e["tolerance"] == 0 and e["flags"] == 1


def test_intent_variance_decisions(store):
    g = RelationalGraph(store)
    g.set_tolerance("r", "friend", "me", 0.6)
    assert g.evaluate("r", "friend", "me", 0.65)["decision"] == "allow"
    assert g.evaluate("r", "stranger", "me", 0.45)["decision"] == "verify"
    assert g.evaluate("r", "stranger", "me", 0.80)["decision"] == "block"


# --- layer 5 ----------------------------------------------------------------
def test_dp_clipping_bounds_norm():
    rng = np.random.default_rng(0)
    g = np.full(100, 10.0)
    clipped, raw = dp_sanitize(g, clip=1.0, noise_multiplier=0.0, rng=rng)
    assert raw > 1 and np.linalg.norm(clipped) == pytest.approx(1.0)


def test_epsilon_decreases_with_more_noise():
    assert rdp_epsilon(2.0, 30) < rdp_epsilon(1.0, 30) < rdp_epsilon(0.5, 30)
    assert rdp_epsilon(1.0, 10) < rdp_epsilon(1.0, 30)


# --- full pipeline ----------------------------------------------------------
def make_pipe(store, scores):
    return CypherPipeline(store, firewall=StubFirewall(scores), swarm_seed=0)


def test_explicit_message_blocked_at_layer_2(store):
    p = make_pipe(store, {"you are garbage": 0.97})
    d = p.process("r", "a", "b", "you are garbage")
    assert d.action == "block" and d.layer == 2 and d.score > TAU_STRICT


def test_same_text_differs_by_relationship(store):
    text = "you clown"
    p = make_pipe(store, {text: 0.55})
    p.graph.set_tolerance("r", "friend", "me", 0.6)
    assert p.process("r", "friend", "me", text).action == "allow"
    assert p.process("r", "stranger", "me", text).action == "verify"


def test_flagging_routes_to_layer_5(store):
    text = "nobody wants you here"
    p = make_pipe(store, {text: 0.5})
    d = p.process("r", "x", "y", text)
    assert d.action == "verify"
    out = p.resolve(d.message_id, flagged=True)
    assert out["status"] == "flagged" and out["dp_update"]["pending"] == 1
    assert p.graph.edge("r", "x", "y")["tolerance"] == 0
    # aggregation consumes the pending update
    assert p.swarm.aggregate()["aggregated"] == 1
