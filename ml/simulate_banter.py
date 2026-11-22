"""Ablation study: does relational context reduce false-positive moderation?

Re-creates the experiment of Section VI-B with the *real* trained model:
10,000 chat interactions, 30 % of which are rough banter between friends.

Three moderation policies are compared on exactly the same message stream:
  keyword      - block if any word from a static profanity list appears
  standard_ai  - block if the calibrated model score >= its F1-optimal threshold
  cypher       - the full 5-layer pipeline with simulated recipient feedback

Messages
  banter   (30 %)  friend -> friend, mild insults / trash talk          benign
  harmful  (10 %)  bully -> victim, half real toxic test comments,
                   half covert bullying with no swear words             harmful
  neutral  (60 %)  random pair, real non-toxic test comments            benign

Friend pairs get a short warm-up history (not counted) so that Layer 3 has
something to remember, matching the paper's "historical friends".
"""

import json
import random
import tempfile
from collections import Counter
from pathlib import Path

from cypher.config import RESULTS_DIR
from cypher.layers.firewall import Firewall
from cypher.pipeline import CypherPipeline, combine
from cypher.store import Store
from ml.common import load_splits

BANTER = [
    "shut up you idiot, see you at 5", "bro you're so dumb lol", "you absolute clown 😂", "loser! you owe me a pizza",
    "stfu noob, gg tho", "you played like trash today haha", "idiot you forgot your charger again",
    "you're such a nerd, send the notes", "ugh you're annoying, come online", "dumbass, the match is at 7 not 8",
    "lmao you suck at this game", "you're the worst cook ever, still eating it", "you weirdo, why are you awake",
    "shut up, your jokes are terrible 😂", "you clown, that was my seat", "move your fat head I can't see the screen",
    "you're so useless at fifa bro", "noob alert 🚨 you died first again", "lol you're such a loser, love you man",
    "stupid, you left the tap open", "abe pagal hai kya, call kar", "chup kar bewakoof, match dekh",
    "tu sach mein gadha hai yaar 😂", "saala har baar late aata hai", "kamina, mera samosa kha gaya",
    "oye pagal, kal milte hain", "tu noob hai bhai, accept kar", "bewakoof, assignment kal hai",
    "you're dead meat in the next round", "I'm going to destroy you in chess tonight", "you little rat, you took my fries",
    "omg you're so ugly in this pic 😂 send more", "dude you're hopeless with directions", "you nerd, of course you topped",
    "shut it, you lost the bet", "your taste in music is garbage bro", "lazy bum, get out of bed",
    "you're a menace to this group 😂", "worst teammate ever, same time tomorrow?", "idiot sandwich 🥪",
]

COVERT = [
    "nobody in this group actually likes you", "why do you even bother showing up", "everyone laughs at you behind your back",
    "just leave, no one wants you here", "you're the reason this group is boring", "imagine being this desperate for attention",
    "your parents must be so disappointed in you", "you should stop talking, seriously", "delete your account",
    "no wonder you have no friends", "you'll never be good at anything", "keep your face off the group chat",
    "we all made a new group without you", "go cry about it again", "even your friends feel sorry for you",
    "honestly the world is better without you", "look at yourself before posting anything", "you're such a waste of space",
    "tujhe koi pasand nahi karta", "group chhod de, koi nahi chahta tujhe", "teri aukat nahi hai yahan baat karne ki",
    "shakal dekhi hai apni?", "sab tere upar hanste hain", "tu kisi kaam ka nahi hai",
]

N_INTERACTIONS = 10_000
P_BANTER, P_HARMFUL = 0.30, 0.10
WARMUP_PER_PAIR = 12
P_APPROVE_BANTER = 0.95   # friends confirm "it's fine" when asked
P_FLAG_ATTACK = 0.90      # victims flag real abuse when asked


def build_world(rng):
    rooms = []
    for r in range(4):
        users = [f"r{r}_u{i}" for i in range(10)]
        friends = [(users[0], users[1]), (users[2], users[3]), (users[4], users[5])]
        bully = (users[6], users[7])
        rooms.append({"room": f"room{r}", "users": users, "friends": friends, "bully": bully})
    return rooms


def main(seed: int = 7):
    rng = random.Random(seed)
    _, _, test = load_splits()
    toxic = test[test.label == 1].text.tolist()
    clean = test[test.label == 0].text.tolist()
    toxic = [t for t in toxic if len(t) < 300]
    clean = [t for t in clean if len(t) < 300]

    rooms = build_world(rng)
    stream = []
    for _ in range(N_INTERACTIONS):
        room = rng.choice(rooms)
        u = rng.random()
        if u < P_BANTER:
            a, b = rng.choice(room["friends"])
            if rng.random() < 0.5:
                a, b = b, a
            stream.append((room["room"], a, b, rng.choice(BANTER), "banter"))
        elif u < P_BANTER + P_HARMFUL:
            a, b = room["bully"]
            text = rng.choice(COVERT) if rng.random() < 0.5 else rng.choice(toxic)
            stream.append((room["room"], a, b, text, "harmful"))
        else:
            a, b = rng.sample(room["users"], 2)
            stream.append((room["room"], a, b, rng.choice(clean), "neutral"))

    firewall = Firewall()
    print("firewall backend:", firewall.backend)
    db = Path(tempfile.mkdtemp()) / "sim.db"
    pipe = CypherPipeline(Store(db), firewall=firewall, swarm_seed=seed)

    texts = sorted({s[3] for s in stream} | set(BANTER))
    scans = {t: pipe.sentinel.scan(t) for t in texts}
    model_scores = dict(zip(texts, firewall.score([scans[t]["normalized"] for t in texts])))
    pre = {t: (combine(float(model_scores[t]), scans[t]["max_severity"]), float(model_scores[t]), scans[t])
           for t in texts}

    # warm-up history for friend pairs (not counted)
    for room in rooms:
        for a, b in room["friends"]:
            for src, dst in ((a, b), (b, a)):
                for _ in range(WARMUP_PER_PAIR):
                    t = rng.choice(BANTER)
                    d = pipe.process(room["room"], src, dst, t, precomputed=pre[t])
                    if d.action == "verify":
                        pipe.resolve(d.message_id, flagged=False)
    pipe.store.execute("DELETE FROM messages")

    policies = {k: Counter() for k in ("keyword", "standard_ai", "cypher")}
    cypher_layers = Counter()
    for room, a, b, text, kind in stream:
        harmful = kind == "harmful"
        score, model_p, _ = pre[text]

        blocked_kw = pipe.sentinel.has_profanity(text)
        blocked_ai = model_p >= firewall.threshold

        d = pipe.process(room, a, b, text, precomputed=pre[text])
        blocked_cy, after_delivery = d.action == "block", False
        if d.action == "verify":
            policies["cypher"]["prompts"] += 1
            flag = rng.random() < (P_FLAG_ATTACK if harmful else 1 - P_APPROVE_BANTER)
            pipe.resolve(d.message_id, flagged=flag)
            blocked_cy, after_delivery = flag, flag
        cypher_layers[f"{kind}:L{d.layer}:{d.action}"] += 1

        for name, blocked in (("keyword", blocked_kw), ("standard_ai", blocked_ai), ("cypher", blocked_cy)):
            c = policies[name]
            c[kind] += 1
            if blocked and not harmful:
                c["false_positive_actions"] += 1
                c[f"fp_{kind}"] += 1
            if blocked and harmful:
                c["harmful_caught"] += 1
            if harmful and not blocked:
                c["harmful_missed"] += 1
        if after_delivery and harmful:
            policies["cypher"]["caught_after_delivery"] += 1

    benign = sum(1 for s in stream if s[4] != "harmful")
    harmful_total = N_INTERACTIONS - benign
    out = {"config": {"interactions": N_INTERACTIONS, "banter_share": P_BANTER, "harmful_share": P_HARMFUL,
                      "warmup_per_pair": WARMUP_PER_PAIR, "p_approve_banter": P_APPROVE_BANTER,
                      "p_flag_attack": P_FLAG_ATTACK, "firewall": firewall.backend, "seed": seed},
           "counts": {"benign": benign, "harmful": harmful_total,
                      "banter": sum(1 for s in stream if s[4] == "banter")},
           "policies": {}, "cypher_routing": dict(sorted(cypher_layers.items()))}
    for name, c in policies.items():
        out["policies"][name] = {
            "false_positive_actions": c["false_positive_actions"],
            "fp_banter": c["fp_banter"], "fp_neutral": c["fp_neutral"],
            "fp_rate": round(c["false_positive_actions"] / benign, 4),
            "harmful_caught": c["harmful_caught"], "harmful_missed": c["harmful_missed"],
            "recall": round(c["harmful_caught"] / harmful_total, 4),
            "prompts": c["prompts"], "caught_after_delivery": c["caught_after_delivery"],
        }
    ai_fp = out["policies"]["standard_ai"]["false_positive_actions"]
    cy_fp = out["policies"]["cypher"]["false_positive_actions"]
    out["fp_reduction_vs_ai"] = round(1 - cy_fp / ai_fp, 4) if ai_fp else None
    kw_fp = out["policies"]["keyword"]["false_positive_actions"]
    out["fp_reduction_vs_keyword"] = round(1 - cy_fp / kw_fp, 4) if kw_fp else None

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "ablation.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out["policies"], indent=2))
    print("FP reduction vs standard AI:", out["fp_reduction_vs_ai"], " vs keyword:", out["fp_reduction_vs_keyword"])


if __name__ == "__main__":
    main()
