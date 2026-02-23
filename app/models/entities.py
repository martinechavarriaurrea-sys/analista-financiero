"""Application data models."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

import pandas as pd


@dataclass
class CompanyRecord:
    nit: str
    razon_social: str
    estado: str = ""
    etapa_situacion: str = ""
    dependencia: str = ""
    expediente: str = ""

    def display_label(self) -> str:
        return f"{self.razon_social} (NIT {self.nit})"


@dataclass
class MetricExplanation:
    what_is: str
    interpretation: str
    signals: str
    business_questions: str


@dataclass
class YearFinancialSnapshot:
    year: int
    income_statement: Dict[str, float | None] = field(default_factory=dict)
    balance_sheet: Dict[str, float | None] = field(default_factory=dict)
    cash_flow: Dict[str, float | None] = field(default_factory=dict)
    metrics: Dict[str, float | None] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)


@dataclass
class AnalysisPackage:
    company: CompanyRecord
    years: List[int]
    snapshots: Dict[int, YearFinancialSnapshot]

    def metrics_dataframe(self, metric_keys: List[str]) -> pd.DataFrame:
        rows = []
        for year in sorted(self.years):
            snapshot = self.snapshots[year]
            row = {"anio": year}
            for metric_key in metric_keys:
                row[metric_key] = snapshot.metrics.get(metric_key)
            rows.append(row)

        return pd.DataFrame(rows)

    def warnings(self) -> List[str]:
        warnings: List[str] = []
        for year in sorted(self.years):
            for warning in self.snapshots[year].warnings:
                warnings.append(f"{year}: {warning}")
        return warnings
