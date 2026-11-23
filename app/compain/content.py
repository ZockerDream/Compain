"""Content rules that the code enforces (see concept.md, "Content rules").

The adults-only check is a heuristic. It catches obvious cases such as "15 years old",
"schoolgirl" or "child". It does not replace human review, and the admin still reviews
community characters before they are public.
"""

import re

_AGE_PATTERNS = [
    # "15 years old", "15-year-old", "15 yo", "15 y/o"
    re.compile(r"\b(\d{1,2})\s*(?:years?\s*old|-years?-old|yo\b|y/o\b)", re.IGNORECASE),
    # "aged 15"
    re.compile(r"\baged?\s*(\d{1,2})\b", re.IGNORECASE),
]

_MINOR_WORDS = re.compile(
    r"\b(child|children|kid|kids|minor|minors|underage|under-age|toddler|preteen|pre-teen|"
    r"teen|teens|teenager|teenagers|schoolgirl|schoolboy|middle school|elementary school|"
    r"high school student|highschool student|babysit)\b",
    re.IGNORECASE,
)


def minor_violation(*texts: str) -> str | None:
    """Return a short reason if the text suggests a character under 18, otherwise None."""
    for text in texts:
        if not text:
            continue
        for pattern in _AGE_PATTERNS:
            for match in pattern.finditer(text):
                if int(match.group(1)) < 18:
                    return "Characters must be adults (18+). The text mentions an age under 18."
        word = _MINOR_WORDS.search(text)
        if word:
            return f"Characters must be adults (18+). The text contains '{word.group(0)}'."
    return None
