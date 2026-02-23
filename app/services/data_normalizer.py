"""Normalize raw rows into consistent year-by-concept maps."""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, Iterable, Tuple

from app.config import DEFAULT_LOOKBACK_YEARS
from app.utils.numbers import parse_amount
from app.utils.text import normalize_text


def _extract_year(fecha_corte: str | None) -> int | None:
    if not fecha_corte:
        return None
    try:
        return int(str(fecha_corte)[:4])
    except ValueError:
        return None


def _period_score(periodo: str | None, year: int) -> int:
    p = normalize_text(periodo or "")
    if not p:
        return 1
    if "actual" in p:
        return 3
    if "anterior" in p:
        return 0
    if str(year) in p:
        return 2
    return 1


def _clean_text(value: str | None) -> str:
    return str(value or "").strip()


def _financial_instance_key(row: dict) -> str:
    parts = [
        _clean_text(row.get("numero_radicado")),
        _clean_text(row.get("id_punto_entrada")),
        _clean_text(row.get("id_taxonomia")),
        _clean_text(row.get("codigo_instancia")),
    ]
    if not any(parts):
        return ""
    return "|".join(parts)


def _is_actual_period(periodo: str | None, year: int) -> bool:
    p = normalize_text(periodo or "")
    if not p:
        return False
    if "actual" in p:
        return True
    if str(year) in p and "anterior" not in p:
        return True
    return False


def _instance_preference_bonus(point_entry: str | None) -> int:
    p = normalize_text(point_entry or "")
    if not p:
        return 0
    if "separado" in p or "individual" in p:
        return 1000
    if "consolidado" in p:
        return -150
    return 80


def _select_preferred_instance_by_year(rows: Iterable[dict]) -> Dict[int, str]:
    by_year: Dict[int, Dict[str, dict]] = {}

    for row in rows:
        year = _extract_year(row.get("fecha_corte"))
        if year is None:
            continue

        instance_key = _financial_instance_key(row)
        if not instance_key:
            continue

        year_map = by_year.setdefault(year, {})
        stat = year_map.setdefault(
            instance_key,
            {
                "row_count": 0,
                "actual_count": 0,
                "non_zero_count": 0,
                "concepts": set(),
                "point_entry": normalize_text(row.get("punto_entrada") or ""),
            },
        )
        stat["row_count"] += 1
        if _is_actual_period(row.get("periodo"), year):
            stat["actual_count"] += 1
        value = parse_amount(row.get("valor"))
        if value is not None and value != 0:
            stat["non_zero_count"] += 1
        concept = normalize_text(row.get("concepto"))
        if concept:
            stat["concepts"].add(concept)

    preferred: Dict[int, str] = {}
    for year, instance_map in by_year.items():
        best_key = ""
        best_score = None
        for instance_key, stat in instance_map.items():
            score = (
                len(stat["concepts"]) * 6
                + stat["actual_count"] * 4
                + stat["non_zero_count"] * 2
                + stat["row_count"]
                + _instance_preference_bonus(stat["point_entry"])
            )
            if (
                best_score is None
                or score > best_score
                or (score == best_score and instance_key > best_key)
            ):
                best_score = score
                best_key = instance_key
        if best_key:
            preferred[year] = best_key

    return preferred


def normalize_statement_rows(rows: Iterable[dict]) -> Dict[int, Dict[str, float]]:
    """Return {year: {normalized_concept: numeric_value}} with duplicate resolution."""
    candidates: Dict[Tuple[int, str], Tuple[int, float, float]] = {}
    row_list = list(rows)
    preferred_by_year = _select_preferred_instance_by_year(row_list)

    for row in row_list:
        year = _extract_year(row.get("fecha_corte"))
        if year is None:
            continue

        preferred_instance = preferred_by_year.get(year)
        row_instance = _financial_instance_key(row)
        if preferred_instance and row_instance and preferred_instance != row_instance:
            continue

        concept = normalize_text(row.get("concepto"))
        if not concept:
            continue

        value = parse_amount(row.get("valor"))
        if value is None:
            continue

        score = _period_score(row.get("periodo"), year)
        key = (year, concept)
        current = candidates.get(key)

        if current is None:
            candidates[key] = (score, abs(value), value)
            continue

        current_score, current_abs, _ = current
        if score > current_score or (score == current_score and abs(value) > current_abs):
            candidates[key] = (score, abs(value), value)

    result: Dict[int, Dict[str, float]] = defaultdict(dict)
    for (year, concept), (_, _, value) in candidates.items():
        result[year][concept] = value

    return dict(result)


def select_recent_years(
    income_map: Dict[int, Dict[str, float]],
    balance_map: Dict[int, Dict[str, float]],
    cashflow_map: Dict[int, Dict[str, float]],
    lookback_years: int = DEFAULT_LOOKBACK_YEARS,
) -> list[int]:
    years = set(income_map.keys()) | set(balance_map.keys()) | set(cashflow_map.keys())
    if not years:
        return []
    return sorted(years, reverse=True)[:lookback_years]
