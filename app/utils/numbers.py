"""Numeric and formatting helpers."""

from __future__ import annotations

import math
import re


def parse_amount(raw: str | int | float | None) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        if isinstance(raw, float) and math.isnan(raw):
            return None
        return float(raw)

    text = str(raw).strip()
    if not text:
        return None

    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1]

    text = text.replace(" ", "")
    text = text.replace("$", "")

    if text.count(",") > 0 and text.count(".") > 0:
        text = text.replace(",", "")
    elif text.count(",") > 0 and text.count(".") == 0:
        text = text.replace(",", ".")

    text = re.sub(r"[^0-9\-.]", "", text)
    if text in {"", "-", ".", "-."}:
        return None

    try:
        value = float(text)
    except ValueError:
        return None

    return -value if negative else value


def format_currency(value: float | None) -> str:
    if value is None:
        return "N/D"
    return f"COP {value:,.0f}"


def format_number(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "N/D"
    return f"{value:,.{decimals}f}"


def pct_change(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return ((current - previous) / abs(previous)) * 100
