"""Text normalization helpers."""

from __future__ import annotations

import re
import unicodedata


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    without_accents = "".join(c for c in normalized if not unicodedata.combining(c))
    lowered = without_accents.lower()
    lowered = lowered.replace("\u2019", "'")
    lowered = lowered.replace("\u2018", "'")
    lowered = lowered.replace("\u2013", "-")
    lowered = lowered.replace("\u2014", "-")
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def normalize_nit(raw_nit: str) -> str:
    cleaned = re.sub(r"\D", "", raw_nit or "")
    if len(cleaned) >= 9:
        return cleaned[:9]
    return cleaned
