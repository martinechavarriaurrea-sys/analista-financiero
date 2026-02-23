from app.services.data_normalizer import normalize_statement_rows


def test_normalize_statement_rows_prefers_separated_instance():
    rows = [
        {
            "nit": "890900240",
            "fecha_corte": "2024-12-31T00:00:00.000",
            "periodo": "Periodo Actual",
            "concepto": "Otros pasivos financieros no corrientes",
            "valor": "5968003",
            "numero_radicado": "2025-01-419403",
            "id_punto_entrada": "423",
            "punto_entrada": "60 NIIF Pymes - Consolidado Grupo 2",
            "id_taxonomia": "411",
            "codigo_instancia": "490036",
        },
        {
            "nit": "890900240",
            "fecha_corte": "2024-12-31T00:00:00.000",
            "periodo": "Periodo Actual",
            "concepto": "Otros pasivos financieros no corrientes",
            "valor": "5798692",
            "numero_radicado": "2025-01-248320",
            "id_punto_entrada": "422",
            "punto_entrada": "50 NIIF Pymes - Separado Grupo 2",
            "id_taxonomia": "411",
            "codigo_instancia": "467989",
        },
    ]

    normalized = normalize_statement_rows(rows)
    assert normalized[2024]["otros pasivos financieros no corrientes"] == 5798692
