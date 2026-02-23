"""Search companies by NIT or business name from Supersociedades portal."""

from __future__ import annotations

import logging
from typing import List
from urllib.parse import parse_qs, urlparse

import requests
from bs4 import BeautifulSoup

from app.config import HTTP_TIMEOUT_SECONDS, MAX_SEARCH_RESULTS, SUPERWAS_QUERY_URL, USER_AGENT
from app.core.exceptions import CompanyNotFoundError, ConnectivityError, SourceFormatError
from app.models.entities import CompanyRecord
from app.utils.text import normalize_nit

LOGGER = logging.getLogger(__name__)


class SupersocSearchService:
    """Connector for https://superwas.supersociedades.gov.co/ConsultaGeneralSociedadesWeb."""

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    def search(self, query: str, by: str) -> List[CompanyRecord]:
        query = (query or "").strip()
        if not query:
            raise CompanyNotFoundError("Debes ingresar un NIT o una razon social para buscar.")

        if by.lower() == "nit":
            return self.search_by_nit(query)
        return self.search_by_name(query)

    def search_by_nit(self, nit: str) -> List[CompanyRecord]:
        clean_nit = normalize_nit(nit)
        if not clean_nit:
            raise CompanyNotFoundError("El NIT ingresado no tiene un formato valido.")

        try:
            response = self.session.post(
                SUPERWAS_QUERY_URL,
                data={"action": "consultaPorNit", "nit": clean_nit},
                timeout=HTTP_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise ConnectivityError(
                "No fue posible conectar con Supersociedades. Verifica tu conexion e intenta de nuevo."
            ) from exc

        soup = BeautifulSoup(response.text, "html.parser")
        title = (soup.title.string if soup.title else "").strip().lower()

        if "detalle" not in title and "sociedad" not in response.text.lower():
            raise CompanyNotFoundError(
                f"No se encontro una empresa con el NIT {clean_nit} en Supersociedades."
            )

        company = self._parse_detail_page(soup, fallback_nit=clean_nit)
        if not company.razon_social:
            raise SourceFormatError(
                "La estructura de la pagina de detalle cambio y no fue posible leer la empresa."
            )
        return [company]

    def search_by_name(self, name: str) -> List[CompanyRecord]:
        try:
            response = self.session.post(
                SUPERWAS_QUERY_URL,
                data={"action": "consultaPorRazonSocial", "razonSocial": name},
                timeout=HTTP_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise ConnectivityError(
                "No fue posible conectar con Supersociedades. Verifica tu conexion e intenta de nuevo."
            ) from exc

        soup = BeautifulSoup(response.text, "html.parser")
        rows = []
        for tr in soup.select("table tr"):
            cells = tr.find_all("td")
            if len(cells) < 5:
                continue

            anchor = cells[0].find("a")
            nit_text = anchor.get_text(strip=True) if anchor else cells[0].get_text(strip=True)
            nit = normalize_nit(nit_text)

            if not nit and anchor and anchor.has_attr("href"):
                href = anchor["href"]
                parsed = urlparse(href)
                query_args = parse_qs(parsed.query)
                nit = normalize_nit((query_args.get("nit") or [""])[0])

            if not nit:
                continue

            rows.append(
                CompanyRecord(
                    nit=nit,
                    razon_social=cells[1].get_text(" ", strip=True),
                    estado=cells[2].get_text(" ", strip=True),
                    etapa_situacion=cells[3].get_text(" ", strip=True),
                    dependencia=cells[4].get_text(" ", strip=True),
                )
            )

        if not rows:
            raise CompanyNotFoundError(
                f"No se encontraron coincidencias para '{name}' en Supersociedades."
            )

        LOGGER.info("SuperSoc search by name='%s' -> %s results", name, len(rows))
        return rows[:MAX_SEARCH_RESULTS]

    @staticmethod
    def _parse_detail_page(soup: BeautifulSoup, fallback_nit: str) -> CompanyRecord:
        record = {
            "nit": fallback_nit,
            "razon social": "",
            "estado": "",
            "etapa situacion": "",
            "dependencia": "",
            "expediente": "",
        }

        for table in soup.select("table"):
            for row in table.select("tr"):
                header = row.find("th")
                value = row.find("td")
                if not header or not value:
                    continue
                key = header.get_text(" ", strip=True).lower()
                text = value.get_text(" ", strip=True)

                if key.startswith("nit"):
                    record["nit"] = normalize_nit(text) or fallback_nit
                elif "razon social" in key:
                    record["razon social"] = text
                elif key.startswith("estado"):
                    record["estado"] = text
                elif "etapa" in key:
                    record["etapa situacion"] = text
                elif "dependencia" in key:
                    record["dependencia"] = text
                elif "expediente" in key:
                    record["expediente"] = text

        return CompanyRecord(
            nit=record["nit"],
            razon_social=record["razon social"],
            estado=record["estado"],
            etapa_situacion=record["etapa situacion"],
            dependencia=record["dependencia"],
            expediente=record["expediente"],
        )
