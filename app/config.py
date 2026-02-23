"""Application-wide constants and configuration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

APP_NAME = "Analizador de Empresas (Supersociedades)"
APP_FOLDER_NAME = "AnalizadorEmpresasSupersociedades"
APP_VERSION = "1.0.0"

SUPERWAS_BASE_URL = "https://superwas.supersociedades.gov.co/ConsultaGeneralSociedadesWeb"
SUPERWAS_QUERY_URL = f"{SUPERWAS_BASE_URL}/ConsultaGeneral"

SOCRATA_BASE_URL = "https://www.datos.gov.co/resource"
SOCRATA_DATASETS = {
    "balance": "pfdp-zks5",
    "income": "prwj-nzxa",
    "cashflow": "ctcp-462n",
}

HTTP_TIMEOUT_SECONDS = 35
USER_AGENT = "AnalizadorEmpresasSupersociedades/1.0 (+https://www.supersociedades.gov.co/)"

DEFAULT_LOOKBACK_YEARS = 7
MAX_SEARCH_RESULTS = 50

BLUE_THEME = {
    "bg": "#E9F1FF",
    "panel": "#FFFFFF",
    "panel_alt": "#DDEBFF",
    "primary": "#0F4C81",
    "primary_dark": "#083A63",
    "secondary": "#2E7CBF",
    "accent": "#3FA9F5",
    "success": "#2F855A",
    "warning": "#D69E2E",
    "danger": "#C53030",
    "text": "#102A43",
    "text_light": "#486581",
    "grid": "#C3D9F5",
}

METRIC_LABELS = {
    "ingresos": "Ingresos",
    "utilidad_neta": "Utilidad neta",
    "ebitda": "EBITDA",
    "gastos_operacionales": "Gastos operacionales",
    "capital_neto_trabajo": "Capital neto de trabajo",
    "deuda": "Deuda",
    "dias_capital_trabajo": "Dias de capital de trabajo",
    "balance_general": "Balance general (Activos/Pasivos/Patrimonio)",
    "flujo_caja": "Flujo de caja neto",
    "z_altman": "Z-Altman (Zaltam)",
}

DEFAULT_METRICS = [
    "ingresos",
    "utilidad_neta",
    "ebitda",
    "gastos_operacionales",
    "capital_neto_trabajo",
    "deuda",
    "dias_capital_trabajo",
    "flujo_caja",
    "z_altman",
]


@dataclass(frozen=True)
class ConceptPatterns:
    """Keyword patterns used to map NIIF rows into normalized indicators."""

    exact: List[str]
    contains: List[str]


BALANCE_CONCEPT_PATTERNS: Dict[str, ConceptPatterns] = {
    "activos_corrientes": ConceptPatterns(
        exact=["activos corrientes totales", "total activos corrientes"],
        contains=["activos corrientes"],
    ),
    "pasivos_corrientes": ConceptPatterns(
        exact=["pasivos corrientes totales", "total de pasivos corrientes"],
        contains=["pasivos corrientes"],
    ),
    "activos_totales": ConceptPatterns(
        exact=["total de activos", "activos totales"],
        contains=["total de activos"],
    ),
    "pasivos_totales": ConceptPatterns(
        exact=["total pasivos", "pasivos totales"],
        contains=["total pasivos"],
    ),
    "patrimonio_total": ConceptPatterns(
        exact=["patrimonio total", "total patrimonio"],
        contains=["patrimonio total", "total patrimonio"],
    ),
    "ganancias_acumuladas": ConceptPatterns(
        exact=["ganancias acumuladas", "utilidades retenidas"],
        contains=["ganancias acumuladas", "utilidades retenidas", "resultados acumulados"],
    ),
}

INCOME_CONCEPT_PATTERNS: Dict[str, ConceptPatterns] = {
    "ingresos": ConceptPatterns(
        exact=["ingresos de actividades ordinarias", "ingresos operacionales"],
        contains=["ingresos de actividades ordinarias", "ingresos operacionales", "ingresos"],
    ),
    "utilidad_neta": ConceptPatterns(
        exact=["ganancia (perdida)", "utilidad neta"],
        contains=["ganancia (perdida)", "utilidad neta", "resultado del periodo"],
    ),
    "ebit": ConceptPatterns(
        exact=[
            "ganancia (perdida) por actividades de operacion",
            "utilidad operacional",
            "resultado operacional",
        ],
        contains=["actividades de operacion", "utilidad operacional", "resultado operacional"],
    ),
}

CASHFLOW_CONCEPT_PATTERNS: Dict[str, ConceptPatterns] = {
    "flujo_caja": ConceptPatterns(
        exact=[
            "incremento (disminucion) neto en el efectivo y equivalentes al efectivo",
            "flujo de efectivo neto",
        ],
        contains=["neto", "efectivo"],
    )
}

DEP_AMORT_CONTAINS = [
    "depreciacion",
    "amortizacion",
]

OPERATING_EXPENSE_CONTAINS = [
    "gastos de administracion",
    "gastos de ventas",
    "gastos operacionales",
    "gastos de distribucion",
]
