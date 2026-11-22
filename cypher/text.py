"""Text cleaning shared by training and inference so both see identical input."""

import html
import re

import emoji

_URL = re.compile(r"(https?://\S+|www\.\S+)")
_MENTION = re.compile(r"@\w+")
_RT = re.compile(r"^\s*RT\s+", re.IGNORECASE)
_REPEAT = re.compile(r"(.)\1{3,}")
_SPACE = re.compile(r"\s+")
_WORD = re.compile(r"\w+|[^\w\s]", re.UNICODE)

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})


def clean(text: str) -> str:
    """Normalise a raw message: urls, mentions, emojis, html entities, stretched letters."""
    if not isinstance(text, str):
        return ""
    t = html.unescape(text)
    t = _RT.sub("", t)
    t = _URL.sub(" ", t)
    t = _MENTION.sub("@user", t)
    t = emoji.demojize(t, delimiters=(" :", ": "))
    t = _REPEAT.sub(r"\1\1", t)
    t = t.replace("\n", " ")
    return _SPACE.sub(" ", t).strip()


def deobfuscate(text: str) -> str:
    """Undo common leetspeak inside words (1d10t -> idiot, ki11 -> kill).

    Only tokens that mix letters with digits/symbols are touched, so numbers
    like "2024" or "5pm" stay as they are.
    """
    out = []
    for tok in text.split():
        has_alpha = any(c.isalpha() for c in tok)
        has_sub = any(c in "013457@$!" for c in tok)
        core = tok.strip(".,?;:")
        if has_alpha and has_sub and not core.isdigit() and not re.fullmatch(r"\d+(am|pm|k|s|th|st|nd|rd)", core.lower()):
            # a doubled "1" is almost always "ll" (ki11, ki11ed); a single one is "i" (1d10t)
            out.append(tok.replace("11", "ll").translate(_LEET))
        else:
            out.append(tok)
    return " ".join(out)


def words(text: str) -> list[str]:
    return _WORD.findall(text)
