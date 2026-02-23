"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const CalcQACore = require("../calc_qa_core.js");

test("computeRatios: caso base con datos completos", () => {
  const warnings = [];
  const audit = {};
  const ratios = CalcQACore.computeRatios(
    {
      ingresos: 1000,
      ingresos_prev: 900,
      costos: 600,
      utilidad_bruta: 400,
      ebitda: 200,
      gastos_operacionales: 180,
      utilidad_neta: 80,
      deuda: 500,
      costos_financieros: 50
    },
    audit,
    warnings
  );

  assert.equal(ratios.crecimiento_ingresos_yoy, (1000 - 900) * 100 / 900);
  assert.equal(ratios.margen_bruto, 40);
  assert.equal(ratios.margen_ebitda, 20);
  assert.equal(ratios.gastos_operacionales_sobre_ingresos, 18);
  assert.equal(ratios.margen_neto, 8);
  assert.equal(ratios.deuda_ebitda, 2.5);
  assert.equal(ratios.ebitda_costos_financieros, 4);
  assert.equal(warnings.length, 0);
  assert.equal(audit.deuda_ebitda.status, "OK");
});

test("computeRatios: fallback determinista en división por cero y faltantes", () => {
  const warnings = [];
  const audit = {};
  const ratios = CalcQACore.computeRatios(
    {
      ingresos: 0,
      ingresos_prev: 0,
      costos: null,
      utilidad_bruta: null,
      ebitda: 0,
      gastos_operacionales: 50,
      utilidad_neta: null,
      deuda: null,
      costos_financieros: 0
    },
    audit,
    warnings
  );

  Object.values(ratios).forEach((v) => assert.ok(Number.isFinite(v)));
  assert.equal(ratios.crecimiento_ingresos_yoy, 0);
  assert.equal(ratios.margen_bruto, 0);
  assert.equal(ratios.deuda_ebitda, 0);
  assert.equal(ratios.ebitda_costos_financieros, 0);
  assert.ok(warnings.length >= 5);
  assert.equal(audit.margen_bruto.status, "FALLBACK");
});

test("computeRatios: EBITDA negativo no rompe la métrica", () => {
  const warnings = [];
  const audit = {};
  const ratios = CalcQACore.computeRatios(
    {
      ingresos: 1200,
      ingresos_prev: 1000,
      utilidad_bruta: 300,
      ebitda: -150,
      gastos_operacionales: 240,
      utilidad_neta: -50,
      deuda: 600,
      costos_financieros: 40
    },
    audit,
    warnings
  );

  assert.equal(ratios.deuda_ebitda, -4);
  assert.equal(ratios.ebitda_costos_financieros, -3.75);
  assert.ok(Number.isFinite(ratios.deuda_ebitda));
});

test("computeRatios: crecimiento YoY es -100 cuando ingresos actual faltan y el previo es positivo", () => {
  const warnings = [];
  const audit = {};
  const ratios = CalcQACore.computeRatios(
    {
      ingresos: null,
      ingresos_prev: 500,
      utilidad_bruta: null,
      ebitda: null,
      gastos_operacionales: null,
      utilidad_neta: null,
      deuda: null,
      costos_financieros: null
    },
    audit,
    warnings
  );

  assert.equal(ratios.crecimiento_ingresos_yoy, -100);
  assert.ok(Number.isFinite(ratios.crecimiento_ingresos_yoy));
});

test("computeChecks: caja, balance, nwc, deuda", () => {
  const warnings = [];
  const audit = {};
  const checks = CalcQACore.computeChecks(
    {
      caja_inicial: 100,
      flujo_periodo: 50,
      caja_final: 150,
      activos_totales: 1000,
      pasivos_totales: 400,
      patrimonio_total: 600,
      activos_corrientes: 300,
      pasivos_corrientes: 100,
      capital_neto_trabajo: 200,
      deuda_ratio: 250,
      deuda_balance: 250,
      tolerance_abs: 0.5
    },
    audit,
    warnings
  );

  assert.equal(checks.check_caja.pass, true);
  assert.equal(checks.check_balance.pass, true);
  assert.equal(checks.check_nwc.pass, true);
  assert.equal(checks.check_deuda.pass, true);
  assert.equal(warnings.length, 0);
});

test("computeChecks: detecta inconsistencias", () => {
  const warnings = [];
  const audit = {};
  const checks = CalcQACore.computeChecks(
    {
      caja_inicial: 100,
      flujo_periodo: 50,
      caja_final: 130,
      activos_totales: 1000,
      pasivos_totales: 450,
      patrimonio_total: 500,
      activos_corrientes: 300,
      pasivos_corrientes: 100,
      capital_neto_trabajo: 150,
      deuda_ratio: 300,
      deuda_balance: 220,
      tolerance_abs: 1
    },
    audit,
    warnings
  );

  assert.equal(checks.check_caja.pass, false);
  assert.equal(checks.check_balance.pass, false);
  assert.equal(checks.check_nwc.pass, false);
  assert.equal(checks.check_deuda.pass, false);
  assert.ok(warnings.length >= 4);
});

test("resolveDebtValue: prioriza deuda financiera y evita pasivos totales como deuda", () => {
  const warnings = [];
  const audit = {};
  const a = CalcQACore.resolveDebtValue(
    { deudaSumada: 500, deudaDirecta: 650, pasivosTotales: 2200 },
    audit,
    warnings
  );
  assert.equal(a.value, 500);
  assert.equal(a.source, "deuda_sumada_financiera");

  const b = CalcQACore.resolveDebtValue(
    { deudaSumada: null, deudaDirecta: 650, pasivosTotales: 2200 },
    audit,
    warnings
  );
  assert.equal(b.value, 650);
  assert.equal(b.source, "deuda_directa");

  const c = CalcQACore.resolveDebtValue(
    { deudaSumada: null, deudaDirecta: null, pasivosTotales: 2200 },
    audit,
    warnings
  );
  assert.equal(c.value, 0);
  assert.equal(c.source, "fallback_zero");
  assert.ok(warnings.some((w) => w.includes("debt_fallback_zero")));
});

test("resolveDebtValue: aplica sanity check cuando deuda sumada supera pasivos totales", () => {
  const warnings = [];
  const audit = {};
  const result = CalcQACore.resolveDebtValue(
    { deudaSumada: 1800, deudaDirecta: 600, pasivosTotales: 1000 },
    audit,
    warnings
  );
  assert.equal(result.value, 600);
  assert.equal(result.source, "deuda_directa_sanity_pasivos");
  assert.ok(warnings.some((w) => w.includes("debt_sum_exceeds_liabilities")));
});

test("resolveDebtValue: aplica guardrail cuando deuda sumada es duplicado de deuda directa", () => {
  const warnings = [];
  const audit = {};
  const result = CalcQACore.resolveDebtValue(
    { deudaSumada: 11597384, deudaDirecta: 5798692, pasivosTotales: 30000000 },
    audit,
    warnings
  );
  assert.equal(result.value, 5798692);
  assert.equal(result.source, "deuda_directa_duplicate_guard");
  assert.ok(warnings.some((w) => w.includes("debt_sum_duplicate_guard")));
});

test("fuzz: 500 escenarios borde sin NaN ni Infinity", () => {
  const random = (min, max) => Math.random() * (max - min) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  for (let i = 0; i < 500; i += 1) {
    const warnings = [];
    const audit = {};
    const base = {
      ingresos: pick([null, 0, random(-1e9, 1e9)]),
      ingresos_prev: pick([null, 0, random(-1e9, 1e9)]),
      costos: pick([null, random(-1e9, 1e9)]),
      utilidad_bruta: pick([null, random(-1e9, 1e9)]),
      ebitda: pick([null, 0, random(-1e9, 1e9)]),
      gastos_operacionales: pick([null, random(-1e9, 1e9)]),
      utilidad_neta: pick([null, random(-1e9, 1e9)]),
      deuda: pick([null, random(-1e9, 1e9)]),
      costos_financieros: pick([null, 0, random(-1e9, 1e9)])
    };
    const ratios = CalcQACore.computeRatios(base, audit, warnings);
    Object.entries(ratios).forEach(([key, value]) => {
      assert.ok(Number.isFinite(value), `ratio no finito en ${key}: ${value}`);
    });
  }
});


test("computeChecks: faltante en flujo de caja no pasa check_caja", () => {
  const warnings = [];
  const audit = {};
  const checks = CalcQACore.computeChecks(
    {
      caja_inicial: 5947417,
      caja_final: 6349522,
      flujo_periodo: null,
      activos_totales: 37073480,
      pasivos_totales: 14569363,
      patrimonio_total: 22504117,
      activos_corrientes: 11437080,
      pasivos_corrientes: 4896261,
      capital_neto_trabajo: 6540819,
      deuda_ratio: 1170132,
      deuda_balance: 1170132,
      tolerance_abs: 1
    },
    audit,
    warnings
  );

  assert.equal(checks.check_caja.pass, false);
  assert.equal(checks.check_caja.diff, 0);
  assert.equal(checks.check_balance.pass, true);
  assert.equal(checks.check_nwc.pass, true);
  assert.equal(checks.check_deuda.pass, true);
  assert.ok(warnings.some((w) => w.includes("check_caja_fail")));
});
