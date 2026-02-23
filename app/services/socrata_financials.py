"""Fetch financial statement rows from official Socrata datasets (datos.gov.co)."""

from __future__ import annotations

import datetime as dt
import logging
from typing import Dict, List

import requests

from app.config import (
    DEFAULT_LOOKBACK_YEARS,
    HTTP_TIMEOUT_SECONDS,
    SOCRATA_BASE_URL,
    SOCRATA_DATASETS,
    USER_AGENT,
)
from app.core.exceptions import ConnectivityError, DataUnavailableError
from app.utils.text import normalize_nit

LOGGER = logging.getLogger(__name__)


class SocrataFinancialService:
    """Adapter for Socrata dataset queries."""

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    def fetch_company_financial_rows(
        self, nit: str, lookback_years: int = DEFAULT_LOOKBACK_YEARS
    ) -> Dict[str, List[dict]]:
        clean_nit = normalize_nit(nit)
        if not clean_nit:
            raise DataUnavailableError("NIT invalido para consultar informacion financiera.")

        current_year = dt.date.today().year
        min_year = current_year - max(lookback_years + 2, 7)
        min_date = f"{min_year}-01-01T00:00:00"

        all_data: Dict[str, List[dict]] = {}
        for key, dataset_id in SOCRATA_DATASETS.items():
            rows = self._fetch_dataset_rows(dataset_id=dataset_id, nit=clean_nit, min_date=min_date)
            all_data[key] = rows
            LOGGER.info("Socrata dataset=%s rows=%s nit=%s", key, len(rows), clean_nit)

        if not any(all_data.values()):
            raise DataUnavailableError(
                "No se encontraron estados financieros para este NIT en los datos abiertos disponibles."
            )
        return all_data

    def _fetch_dataset_rows(self, dataset_id: str, nit: str, min_date: str) -> List[dict]:
        url = f"{SOCRATA_BASE_URL}/{dataset_id}.json"

        limit = 5000
        offset = 0
        rows: List[dict] = []

        where_clause = f"nit={nit} AND fecha_corte >= '{min_date}'"

        while True:
            params = {
                "$select": (
                    "nit,fecha_corte,periodo,concepto,valor,"
                    "numero_radicado,id_punto_entrada,punto_entrada,id_taxonomia,codigo_instancia"
                ),
                "$where": where_clause,
                "$order": "fecha_corte DESC",
                "$limit": limit,
                "$offset": offset,
            }
            try:
                response = self.session.get(url, params=params, timeout=HTTP_TIMEOUT_SECONDS)
                response.raise_for_status()
            except requests.RequestException as exc:
                raise ConnectivityError(
                    "No fue posible conectarse con datos.gov.co para descargar estados financieros."
                ) from exc

            chunk = response.json()
            if not isinstance(chunk, list):
                raise DataUnavailableError(
                    "La respuesta de datos.gov.co no tiene el formato esperado."
                )

            rows.extend(chunk)
            if len(chunk) < limit or offset > 100_000:
                break

            offset += limit

        return rows
