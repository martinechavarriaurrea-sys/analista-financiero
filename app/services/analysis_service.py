"""Application orchestration layer: search + fetch + normalize + calculate."""

from __future__ import annotations

import logging
from typing import List

from app.config import DEFAULT_LOOKBACK_YEARS
from app.core.exceptions import DataUnavailableError
from app.finance.indicators import compute_year_snapshot
from app.models.entities import AnalysisPackage, CompanyRecord, YearFinancialSnapshot
from app.services.data_normalizer import normalize_statement_rows, select_recent_years
from app.services.socrata_financials import SocrataFinancialService
from app.services.supersoc_search import SupersocSearchService

LOGGER = logging.getLogger(__name__)


class AnalysisService:
    def __init__(self) -> None:
        self.search_service = SupersocSearchService()
        self.financial_service = SocrataFinancialService()

    def search_companies(self, query: str, by: str) -> List[CompanyRecord]:
        return self.search_service.search(query=query, by=by)

    def analyze_company(
        self,
        company: CompanyRecord,
        selected_years: List[int] | None = None,
        lookback_years: int = DEFAULT_LOOKBACK_YEARS,
    ) -> AnalysisPackage:
        rows = self.financial_service.fetch_company_financial_rows(
            nit=company.nit,
            lookback_years=lookback_years,
        )

        income_map = normalize_statement_rows(rows.get("income", []))
        balance_map = normalize_statement_rows(rows.get("balance", []))
        cashflow_map = normalize_statement_rows(rows.get("cashflow", []))

        recent_years = select_recent_years(
            income_map=income_map,
            balance_map=balance_map,
            cashflow_map=cashflow_map,
            lookback_years=lookback_years,
        )

        if not recent_years:
            raise DataUnavailableError(
                "La empresa fue encontrada, pero no hay datos financieros recientes para analizar."
            )

        if selected_years:
            years = [y for y in sorted(set(selected_years), reverse=True) if y in recent_years]
            if not years:
                years = recent_years
        else:
            years = recent_years

        snapshots: dict[int, YearFinancialSnapshot] = {}
        for year in years:
            income = income_map.get(year, {})
            balance = balance_map.get(year, {})
            cashflow = cashflow_map.get(year, {})

            income_statement, balance_sheet, cash_flow, metrics, warnings = compute_year_snapshot(
                income_concepts=income,
                balance_concepts=balance,
                cashflow_concepts=cashflow,
            )

            if not income:
                warnings.append("No se encontro informacion del estado de resultados para este ano.")
            if not balance:
                warnings.append("No se encontro informacion de balance general para este ano.")
            if not cashflow:
                warnings.append("No se encontro informacion de flujo de caja para este ano.")

            snapshots[year] = YearFinancialSnapshot(
                year=year,
                income_statement=income_statement,
                balance_sheet=balance_sheet,
                cash_flow=cash_flow,
                metrics=metrics,
                warnings=warnings,
            )

        LOGGER.info(
            "Analysis complete nit=%s years=%s",
            company.nit,
            ",".join(str(y) for y in years),
        )
        return AnalysisPackage(company=company, years=sorted(years), snapshots=snapshots)
