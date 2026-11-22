"""Layer 1 - Web Sentinel.

Keeps a cache of emerging / coded abuse terms. Every term carries the timestamp
it was last observed in the wild; terms not seen within the TTL window are
evicted (Eq. 1):   C_active = { w_i | (t_now - t_i) <= TTL }
"""

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cypher.config import SLANG_TTL_DAYS
from cypher.store import Store, now_iso
from cypher.text import clean, deobfuscate

LEXICON_PATH = Path(__file__).resolve().parent.parent / "resources" / "lexicon.json"


def _pattern(term: str) -> re.Pattern:
    return re.compile(r"(?<!\w)" + re.escape(term.lower()) + r"(?!\w)")


class Sentinel:
    def __init__(self, store: Store, ttl_days: int = SLANG_TTL_DAYS):
        self.store = store
        self.ttl = timedelta(days=ttl_days)
        lex = json.loads(LEXICON_PATH.read_text(encoding="utf-8"))
        self.profanity = [_pattern(w) for w in lex["profanity"]]
        if not self.store.one("SELECT term FROM slang LIMIT 1"):
            for item in lex["slang"]:
                self.observe(item["term"], item["severity"], source="seed")
        self._cache = None

    # cache management -------------------------------------------------
    def observe(self, term: str, severity: float, source: str = "manual"):
        ts = now_iso()
        self.store.execute(
            """INSERT INTO slang(term, severity, source, first_seen, last_seen) VALUES (?,?,?,?,?)
               ON CONFLICT(term) DO UPDATE SET last_seen=excluded.last_seen, severity=excluded.severity""",
            (term.lower().strip(), float(severity), source, ts, ts),
        )
        self._cache = None

    def active_terms(self, now: datetime | None = None) -> list[dict]:
        now = now or datetime.now(timezone.utc)
        rows = self.store.query("SELECT * FROM slang ORDER BY severity DESC")
        return [r for r in rows if now - datetime.fromisoformat(r["last_seen"]) <= self.ttl]

    def purge(self, now: datetime | None = None) -> int:
        """Evict terms outside the TTL window. Returns the number removed."""
        now = now or datetime.now(timezone.utc)
        cutoff = (now - self.ttl).isoformat(timespec="seconds")
        n = self.store.execute("DELETE FROM slang WHERE last_seen < ?", (cutoff,)).rowcount
        self._cache = None
        return n

    def _compiled(self):
        if self._cache is None:
            self._cache = [(t["term"], t["severity"], _pattern(t["term"])) for t in self.active_terms()]
        return self._cache

    # scanning ----------------------------------------------------------
    def scan(self, text: str) -> dict:
        cleaned = clean(text)
        normalized = deobfuscate(cleaned)
        lowered = normalized.lower()
        hits = [{"term": term, "severity": sev} for term, sev, pat in self._compiled() if pat.search(lowered)]
        return {
            "cleaned": cleaned,
            "normalized": normalized,
            "obfuscated": normalized != cleaned,
            "hits": hits,
            "max_severity": max((h["severity"] for h in hits), default=0.0),
        }

    def has_profanity(self, text: str) -> bool:
        """Static keyword filter used as the 'dictionary' baseline in the evaluation."""
        lowered = deobfuscate(clean(text)).lower()
        return any(p.search(lowered) for p in self.profanity) or bool(self.scan(text)["hits"])
