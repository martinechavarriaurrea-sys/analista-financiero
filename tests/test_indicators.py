from app.finance.indicators import compute_year_snapshot, z_altman_zone


def test_compute_year_snapshot_basic_metrics():
    income = {
        "ingresos de actividades ordinarias": 1000,
        "ganancia (perdida)": 120,
        "ganancia (perdida) por actividades de operacion": 200,
        "gastos de administracion": 150,
        "gastos de ventas": 50,
        "depreciacion": 30,
        "amortizacion": 20,
    }
    balance = {
        "activos corrientes totales": 600,
        "pasivos corrientes totales": 300,
        "total de activos": 2000,
        "total pasivos": 900,
        "obligaciones financieras corrientes": 250,
        "obligaciones financieras no corrientes": 350,
        "patrimonio total": 1100,
        "ganancias acumuladas": 500,
    }
    cash = {
        "incremento (disminucion) neto en el efectivo y equivalentes al efectivo": 80,
    }

    _, _, _, metrics, warnings = compute_year_snapshot(income, balance, cash)

    assert metrics["ingresos"] == 1000
    assert metrics["utilidad_neta"] == 120
    assert metrics["ebitda"] == 250
    assert metrics["gastos_operacionales"] == 200
    assert metrics["capital_neto_trabajo"] == 300
    assert round(metrics["dias_capital_trabajo"], 2) == 109.5
    assert metrics["deuda"] == 600
    assert metrics["flujo_caja"] == 80
    assert metrics["z_altman"] is not None
    assert warnings == []


def test_compute_year_snapshot_debt_prefers_explicit_total():
    income = {
        "ingresos de actividades ordinarias": 1000,
        "ganancia (perdida)": 120,
        "ganancia (perdida) por actividades de operacion": 200,
        "gastos de administracion": 150,
        "gastos de ventas": 50,
        "depreciacion": 30,
        "amortizacion": 20,
    }
    balance = {
        "activos corrientes totales": 600,
        "pasivos corrientes totales": 300,
        "total de activos": 2000,
        "total pasivos": 900,
        "deuda total": 510,
        "obligaciones financieras corrientes": 250,
        "obligaciones financieras no corrientes": 350,
        "patrimonio total": 1100,
        "ganancias acumuladas": 500,
    }
    cash = {
        "incremento (disminucion) neto en el efectivo y equivalentes al efectivo": 80,
    }

    _, _, _, metrics, warnings = compute_year_snapshot(income, balance, cash)
    assert metrics["deuda"] == 510
    assert warnings == []


def test_z_altman_zone_thresholds():
    assert z_altman_zone(3.1) == "solida"
    assert z_altman_zone(1.5) == "gris"
    assert z_altman_zone(0.9) == "riesgo"
    assert z_altman_zone(None) == "indeterminado"
