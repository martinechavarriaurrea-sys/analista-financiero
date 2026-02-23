"""Generate user-friendly financial explanations."""

from __future__ import annotations

from typing import Dict, List

from app.finance.indicators import z_altman_zone
from app.models.entities import AnalysisPackage, MetricExplanation
from app.utils.numbers import format_currency, format_number, pct_change


METRIC_CONTEXT = {
    "ingresos": {
        "what": "Los ingresos representan las ventas o entradas de dinero por la actividad principal de la empresa.",
        "good": "crecimiento sostenido",
        "bad": "caida prolongada",
    },
    "utilidad_neta": {
        "what": "La utilidad neta es la ganancia final despues de costos, gastos, intereses e impuestos.",
        "good": "utilidad positiva y creciente",
        "bad": "perdidas recurrentes",
    },
    "ebitda": {
        "what": "El EBITDA aproxima la generacion operativa de caja antes de depreciaciones, amortizaciones, intereses e impuestos.",
        "good": "margen operativo robusto",
        "bad": "EBITDA debil o negativo",
    },
    "gastos_operacionales": {
        "what": "Los gastos operacionales son los costos de administracion, ventas y operacion diaria.",
        "good": "control de gastos frente a ingresos",
        "bad": "gastos creciendo mas rapido que ventas",
    },
    "capital_neto_trabajo": {
        "what": "El capital neto de trabajo mide liquidez de corto plazo: activos corrientes menos pasivos corrientes.",
        "good": "capital de trabajo positivo",
        "bad": "capital de trabajo negativo",
    },
    "deuda": {
        "what": "La deuda refleja obligaciones financieras y de terceros que la empresa debe cubrir.",
        "good": "apalancamiento manejable",
        "bad": "deuda alta sin crecimiento en utilidades",
    },
    "dias_capital_trabajo": {
        "what": "Los dias de capital de trabajo estiman cuantos dias de ventas estan inmovilizados en el ciclo operativo.",
        "good": "menor necesidad de caja por venta",
        "bad": "ciclo de efectivo lento",
    },
    "flujo_caja": {
        "what": "El flujo de caja neto muestra si el efectivo total de la empresa aumenta o disminuye en el periodo.",
        "good": "flujo neto positivo y estable",
        "bad": "consumo de caja persistente",
    },
    "z_altman": {
        "what": "Z-Altman resume riesgo financiero combinando rentabilidad, liquidez, acumulacion de utilidades y apalancamiento.",
        "good": "zona solida",
        "bad": "zona de riesgo",
    },
    "balance_general": {
        "what": "El balance general muestra la estructura de activos, pasivos y patrimonio de la empresa en una fecha de corte.",
        "good": "patrimonio sano y activos suficientes",
        "bad": "pasivos desproporcionados",
    },
}

HIGHER_IS_BETTER = {
    "ingresos": True,
    "utilidad_neta": True,
    "ebitda": True,
    "gastos_operacionales": False,
    "capital_neto_trabajo": True,
    "deuda": False,
    "dias_capital_trabajo": False,
    "flujo_caja": True,
    "z_altman": True,
    "balance_general": True,
}


def _trend_summary(values_by_year: Dict[int, float | None], metric_key: str) -> str:
    years = sorted(values_by_year)
    values = [values_by_year[y] for y in years if values_by_year[y] is not None]

    if len(values) < 2:
        return "No hay suficientes datos para calcular tendencia."

    first = values[0]
    last = values[-1]
    if first is None or last is None:
        return "No hay suficientes datos para calcular tendencia."

    variation = pct_change(last, first)
    if variation is None:
        return "No hay suficientes datos para calcular tendencia."

    desirable_up = HIGHER_IS_BETTER.get(metric_key, True)
    direction_up = variation >= 0

    if direction_up == desirable_up:
        signal = "favorable"
    else:
        signal = "de cuidado"

    return (
        f"Tendencia {signal}: cambio acumulado de {format_number(variation, 1)}% "
        f"entre {years[0]} y {years[-1]}."
    )


def build_metric_explanation(
    metric_key: str,
    values_by_year: Dict[int, float | None],
) -> MetricExplanation:
    context = METRIC_CONTEXT.get(metric_key, METRIC_CONTEXT["ingresos"])
    years = sorted(values_by_year)
    latest_year = years[-1] if years else None
    latest_value = values_by_year.get(latest_year) if latest_year else None

    latest_text = (
        f"Ultimo valor ({latest_year}): {format_currency(latest_value)}"
        if metric_key not in {"dias_capital_trabajo", "z_altman"}
        else f"Ultimo valor ({latest_year}): {format_number(latest_value, 2)}"
    )

    if metric_key == "z_altman":
        zone = z_altman_zone(latest_value)
        interpretation = (
            f"{latest_text}. Zona estimada: {zone}. Valores altos suelen implicar menor riesgo de tension financiera."
        )
    elif metric_key == "dias_capital_trabajo":
        interpretation = (
            f"{latest_text}. Menos dias suele significar un ciclo de caja mas eficiente."
        )
    else:
        interpretation = f"{latest_text}. {_trend_summary(values_by_year, metric_key)}"

    signals = (
        f"Positivo: {context['good']}. Negativo: {context['bad']}."
    )

    questions = {
        "ingresos": "¿El crecimiento proviene de volumen, precio o nuevas lineas de negocio?",
        "utilidad_neta": "¿Que rubros estan presionando el resultado final: costos, gastos o impuestos?",
        "ebitda": "¿La operacion mejora sin depender de efectos no recurrentes?",
        "gastos_operacionales": "¿Que componentes del gasto tienen mayor peso y como se pueden optimizar?",
        "capital_neto_trabajo": "¿La empresa esta financiando capital de trabajo con deuda de corto plazo?",
        "deuda": "¿El nivel de endeudamiento es sostenible con el flujo de caja esperado?",
        "dias_capital_trabajo": "¿Como acelerar cartera e inventarios sin afectar ventas?",
        "flujo_caja": "¿Las utilidades contables se convierten en caja real?",
        "z_altman": "¿Que palancas (rentabilidad, liquidez, patrimonio) pueden mover rapidamente la puntuacion?",
        "balance_general": "¿La estructura de activos y pasivos soporta el plan de crecimiento?",
    }

    return MetricExplanation(
        what_is=context["what"],
        interpretation=interpretation,
        signals=signals,
        business_questions=questions.get(metric_key, "¿Que decisiones estrategicas respalda este indicador?"),
    )


def build_explanations(
    analysis: AnalysisPackage,
    metric_keys: List[str],
) -> Dict[str, MetricExplanation]:
    explanations: Dict[str, MetricExplanation] = {}
    for metric_key in metric_keys:
        values_by_year: Dict[int, float | None] = {}
        for year in sorted(analysis.years):
            values_by_year[year] = analysis.snapshots[year].metrics.get(metric_key)
        explanations[metric_key] = build_metric_explanation(metric_key, values_by_year)
    return explanations
