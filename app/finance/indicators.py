"""Financial indicator calculations and NIIF concept mapping."""

from __future__ import annotations

import re
from typing import Callable, Dict, Iterable

from app.config import (
    BALANCE_CONCEPT_PATTERNS,
    CASHFLOW_CONCEPT_PATTERNS,
    DEP_AMORT_CONTAINS,
    INCOME_CONCEPT_PATTERNS,
    OPERATING_EXPENSE_CONTAINS,
)
from app.utils.text import normalize_text

DEBT_INCLUDE_TERMS = [
    "obligaciones financieras",
    "pasivos financieros",
    "deuda financiera",
    "deuda total",
    "prestamos",
    "prestamo",
]

DEBT_EXCLUDE_TERMS = [
    "cuentas por pagar comerciales",
    "proveedores",
    "impuestos",
    "beneficios a empleados",
]

DEBT_CURRENT_HINTS = ["corriente", "corto plazo"]
DEBT_NON_CURRENT_HINTS = ["no corriente", "largo plazo"]
DEBT_TOTAL_HINTS = [
    "deuda total",
    "obligaciones financieras totales",
    "pasivos financieros totales",
    "total deuda",
    "total obligaciones financieras",
    "total pasivos financieros",
]


def _find_value(concepts: Dict[str, float], exact: Iterable[str], contains: Iterable[str]) -> float | None:
    for candidate in exact:
        key = normalize_text(candidate)
        if key in concepts:
            return concepts[key]

    for needle in contains:
        target = normalize_text(needle)
        for concept_key, value in concepts.items():
            if target in concept_key:
                return value

    return None


def _sum_if_contains(concepts: Dict[str, float], needles: Iterable[str]) -> float | None:
    matches = []
    normalized_needles = [normalize_text(n) for n in needles]
    for concept_key, value in concepts.items():
        for needle in normalized_needles:
            if needle in concept_key:
                matches.append(value)
                break

    if not matches:
        return None
    return float(sum(matches))


def _safe_div(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def _contains_any(text: str, terms: Iterable[str]) -> bool:
    return any(term in text for term in terms)


def _debt_candidate_score(concept: str, value: float) -> float:
    score = 0.0
    if "deuda total" in concept:
        score += 150
    if _contains_any(concept, DEBT_TOTAL_HINTS):
        score += 120
    if "obligaciones financieras" in concept:
        score += 70
    if "pasivos financieros" in concept:
        score += 65
    if "deuda financiera" in concept:
        score += 60
    if "prestamo" in concept or "prestamos" in concept:
        score += 45
    if _contains_any(concept, DEBT_CURRENT_HINTS) or _contains_any(concept, DEBT_NON_CURRENT_HINTS):
        score += 20
    score += abs(value) ** 0.1
    return score


def _pick_best_debt_candidate(
    candidates: Iterable[tuple[str, float]],
    predicate: Callable[[str], bool] | None = None,
) -> tuple[str, float] | None:
    best: tuple[str, float, float] | None = None
    for concept, value in candidates:
        if predicate and not predicate(concept):
            continue
        score = _debt_candidate_score(concept, value)
        if (
            best is None
            or score > best[2]
            or (score == best[2] and abs(value) > abs(best[1]))
        ):
            best = (concept, value, score)
    if best is None:
        return None
    return best[0], best[1]


def _resolve_financial_debt(balance_concepts: Dict[str, float]) -> float | None:
    candidates: list[tuple[str, float]] = []
    for raw_concept, value in balance_concepts.items():
        if value is None:
            continue
        concept = normalize_text(raw_concept)
        if not _contains_any(concept, DEBT_INCLUDE_TERMS):
            continue
        if _contains_any(concept, DEBT_EXCLUDE_TERMS):
            continue
        candidates.append((concept, float(value)))

    if not candidates:
        return None

    def is_current(concept: str) -> bool:
        return (not is_non_current(concept)) and _contains_any(concept, DEBT_CURRENT_HINTS)

    def is_non_current(concept: str) -> bool:
        return _contains_any(concept, DEBT_NON_CURRENT_HINTS)

    def is_total(concept: str) -> bool:
        if is_current(concept) or is_non_current(concept):
            return False
        return _contains_any(concept, DEBT_TOTAL_HINTS)

    def concept_segment(concept: str) -> str:
        if is_total(concept):
            return "total"
        if is_current(concept):
            return "current"
        if is_non_current(concept):
            return "non_current"
        return "other"

    def concept_fingerprint(concept: str) -> str:
        base = normalize_text(concept)
        base = re.sub(r"\botros?\b", " ", base)
        base = re.sub(r"\btotales?\b", " ", base)
        base = re.sub(r"\bpasivos?\b", " ", base)
        base = re.sub(r"\bobligaciones?\b", " ", base)
        base = re.sub(r"\bfinancier[oa]s?\b", " ", base)
        base = re.sub(r"\bdeuda\b", " ", base)
        base = re.sub(r"\bprestamos?\b", " ", base)
        base = re.sub(r"\bno corrientes?\b", " ", base)
        base = re.sub(r"\bcorrientes?\b", " ", base)
        base = re.sub(r"\bcorto plazo\b", " ", base)
        base = re.sub(r"\blargo plazo\b", " ", base)
        base = re.sub(r"\s+", " ", base).strip()
        return f"{concept_segment(concept)}|{base or 'deuda'}"

    def concept_core(concept: str) -> str:
        base = normalize_text(concept)
        base = re.sub(r"\botros?\b", " ", base)
        base = re.sub(r"\btotales?\b", " ", base)
        base = re.sub(r"\bpasivos?\b", " ", base)
        base = re.sub(r"\bobligaciones?\b", " ", base)
        base = re.sub(r"\bfinancier[oa]s?\b", " ", base)
        base = re.sub(r"\bdeuda\b", " ", base)
        base = re.sub(r"\bprestamos?\b", " ", base)
        base = re.sub(r"\bno corrientes?\b", " ", base)
        base = re.sub(r"\bcorrientes?\b", " ", base)
        base = re.sub(r"\bcorto plazo\b", " ", base)
        base = re.sub(r"\blargo plazo\b", " ", base)
        return re.sub(r"\s+", " ", base).strip()

    deduped: dict[str, tuple[str, float, float]] = {}
    for concept, value in candidates:
        fingerprint = concept_fingerprint(concept)
        abs_rounded = round(abs(value))
        dedupe_key = f"{fingerprint}|{abs_rounded}"
        score = _debt_candidate_score(concept, value)
        current = deduped.get(dedupe_key)
        if (
            current is None
            or score > current[2]
            or (score == current[2] and abs(value) > abs(current[1]))
        ):
            deduped[dedupe_key] = (concept, value, score)
    candidates = [(concept, value) for concept, value, _ in deduped.values()]

    total_candidate = _pick_best_debt_candidate(candidates, is_total)
    if total_candidate is not None:
        return total_candidate[1]

    current_candidate = _pick_best_debt_candidate(candidates, is_current)
    non_current_candidate = _pick_best_debt_candidate(candidates, is_non_current)
    components = [c for c in [current_candidate, non_current_candidate] if c is not None]
    unique_components: dict[str, tuple[float, float]] = {}
    for concept, value in components:
        core = concept_core(concept)
        dedupe_key = f"{core or 'deuda'}|{round(abs(value))}"
        score = _debt_candidate_score(concept, value)
        current = unique_components.get(dedupe_key)
        if current is None or score > current[1] or (score == current[1] and abs(value) > abs(current[0])):
            unique_components[dedupe_key] = (value, score)
    if unique_components:
        return float(sum(value for value, _ in unique_components.values()))

    direct_candidate = _pick_best_debt_candidate(candidates)
    return direct_candidate[1] if direct_candidate is not None else None


def compute_year_snapshot(
    income_concepts: Dict[str, float],
    balance_concepts: Dict[str, float],
    cashflow_concepts: Dict[str, float],
) -> tuple[dict, dict, dict, dict, list[str]]:
    """Build normalized statements + requested metrics for one year."""
    warnings: list[str] = []

    ingresos = _find_value(
        income_concepts,
        INCOME_CONCEPT_PATTERNS["ingresos"].exact,
        INCOME_CONCEPT_PATTERNS["ingresos"].contains,
    )
    utilidad_neta = _find_value(
        income_concepts,
        INCOME_CONCEPT_PATTERNS["utilidad_neta"].exact,
        INCOME_CONCEPT_PATTERNS["utilidad_neta"].contains,
    )
    ebit = _find_value(
        income_concepts,
        INCOME_CONCEPT_PATTERNS["ebit"].exact,
        INCOME_CONCEPT_PATTERNS["ebit"].contains,
    )

    dep_amort = _sum_if_contains(income_concepts, DEP_AMORT_CONTAINS)
    ebitda = income_concepts.get("ebitda")
    if ebitda is None and ebit is not None:
        ebitda = ebit + (dep_amort or 0.0)

    gastos_operacionales = _sum_if_contains(income_concepts, OPERATING_EXPENSE_CONTAINS)
    if gastos_operacionales is None:
        gastos_operacionales = _find_value(
            income_concepts,
            ["gastos operacionales"],
            ["gastos operacionales"],
        )

    activos_corrientes = _find_value(
        balance_concepts,
        BALANCE_CONCEPT_PATTERNS["activos_corrientes"].exact,
        BALANCE_CONCEPT_PATTERNS["activos_corrientes"].contains,
    )
    pasivos_corrientes = _find_value(
        balance_concepts,
        BALANCE_CONCEPT_PATTERNS["pasivos_corrientes"].exact,
        BALANCE_CONCEPT_PATTERNS["pasivos_corrientes"].contains,
    )
    activos_totales = _find_value(
        balance_concepts,
        BALANCE_CONCEPT_PATTERNS["activos_totales"].exact,
        BALANCE_CONCEPT_PATTERNS["activos_totales"].contains,
    )
    pasivos_totales = _find_value(
        balance_concepts,
        BALANCE_CONCEPT_PATTERNS["pasivos_totales"].exact,
        BALANCE_CONCEPT_PATTERNS["pasivos_totales"].contains,
    )
    patrimonio_total = _find_value(
        balance_concepts,
        BALANCE_CONCEPT_PATTERNS["patrimonio_total"].exact,
        BALANCE_CONCEPT_PATTERNS["patrimonio_total"].contains,
    )
    ganancias_acumuladas = _find_value(
        balance_concepts,
        BALANCE_CONCEPT_PATTERNS["ganancias_acumuladas"].exact,
        BALANCE_CONCEPT_PATTERNS["ganancias_acumuladas"].contains,
    )

    flujo_caja = _find_value(
        cashflow_concepts,
        CASHFLOW_CONCEPT_PATTERNS["flujo_caja"].exact,
        CASHFLOW_CONCEPT_PATTERNS["flujo_caja"].contains,
    )

    capital_neto_trabajo = None
    if activos_corrientes is not None and pasivos_corrientes is not None:
        capital_neto_trabajo = activos_corrientes - pasivos_corrientes

    dias_capital_trabajo = None
    if capital_neto_trabajo is not None and ingresos not in (None, 0):
        dias_capital_trabajo = (capital_neto_trabajo / ingresos) * 365

    deuda = _resolve_financial_debt(balance_concepts)

    # Z-Altman (version para emisores no manufactureros / mercados emergentes):
    # Z'' = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
    # X1 = Capital de trabajo / Activos totales
    # X2 = Ganancias acumuladas / Activos totales
    # X3 = EBIT / Activos totales
    # X4 = Patrimonio / Pasivos totales
    x1 = _safe_div(capital_neto_trabajo, activos_totales)
    x2 = _safe_div(ganancias_acumuladas, activos_totales)
    x3 = _safe_div(ebit, activos_totales)
    x4 = _safe_div(patrimonio_total, pasivos_totales)
    z_altman = None
    if None not in (x1, x2, x3, x4):
        z_altman = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4

    required = {
        "ingresos": ingresos,
        "utilidad_neta": utilidad_neta,
        "ebitda": ebitda,
        "gastos_operacionales": gastos_operacionales,
        "capital_neto_trabajo": capital_neto_trabajo,
        "deuda": deuda,
        "dias_capital_trabajo": dias_capital_trabajo,
        "flujo_caja": flujo_caja,
        "z_altman": z_altman,
    }

    missing_required = [k for k, v in required.items() if v is None]
    if missing_required:
        warnings.append(
            "Datos incompletos para: " + ", ".join(sorted(missing_required))
        )

    income_statement = {
        "ingresos": ingresos,
        "utilidad_neta": utilidad_neta,
        "ebit": ebit,
        "ebitda": ebitda,
        "gastos_operacionales": gastos_operacionales,
    }
    balance_sheet = {
        "activos_corrientes": activos_corrientes,
        "pasivos_corrientes": pasivos_corrientes,
        "activos_totales": activos_totales,
        "pasivos_totales": pasivos_totales,
        "patrimonio_total": patrimonio_total,
        "ganancias_acumuladas": ganancias_acumuladas,
    }
    cash_flow = {
        "flujo_caja": flujo_caja,
    }
    metrics = {
        **required,
        "balance_general": activos_totales,
    }

    return income_statement, balance_sheet, cash_flow, metrics, warnings


def z_altman_zone(z_value: float | None) -> str:
    if z_value is None:
        return "indeterminado"
    if z_value > 2.6:
        return "solida"
    if z_value >= 1.1:
        return "gris"
    return "riesgo"
