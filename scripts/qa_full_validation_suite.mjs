import fs from "fs/promises";
import { createRequire } from "module";
import { resolveFinancialDebtFromRows } from "./lib/financial_debt.mjs";

const require = createRequire(import.meta.url);
const CalcQACore = require("../calc_qa_core.js");

const SOCRATA_BASE = "https://www.datos.gov.co/resource";
const DATASETS = {
  income: "prwj-nzxa",
  balance: "pfdp-zks5",
  cashflow: "ctcp-462n"
};

const SAMPLE_COMPANIES = Number(process.env.QA_REAL_SAMPLE || 120);
const YEARS_PER_COMPANY = Number(process.env.QA_REAL_YEARS || 3);
const CONCURRENCY = Number(process.env.QA_REAL_CONCURRENCY || 6);
const REQUEST_TIMEOUT_MS = Number(process.env.QA_REAL_TIMEOUT_MS || 90000);
const MIN_ROWS_PER_NIT = Number(process.env.QA_REAL_MIN_ROWS || 30);
const DATASET_LIMIT = Number(process.env.QA_REAL_DATASET_LIMIT || 6000);
const TOL = Number(process.env.QA_REAL_TOL || 1);
const OPEX_INCLUDE_TERMS = [
  "gastos de administracion",
  "gasto de administracion",
  "gastos administrativos",
  "gasto administrativo",
  "gastos generales y administrativos",
  "gastos administrativos y generales",
  "gastos generales administrativos",
  "gastos generales de administracion",
  "gastos de ventas",
  "gasto de ventas",
  "gastos de distribucion",
  "costos de distribucion",
  "costo de distribucion",
  "gastos comerciales",
  "gasto comercial",
  "gastos de comercializacion",
  "gasto de comercializacion",
  "gastos de mercadeo",
  "gasto de mercadeo",
  "gastos de publicidad",
  "gasto de publicidad",
  "gastos de promocion",
  "gasto de promocion",
  "gastos de operacion",
  "gasto de operacion",
  "gastos operacionales",
  "gasto operacional",
  "gastos operativos",
  "gasto operativo",
  "gastos, por funcion",
  "gastos por funcion",
  "gastos por naturaleza",
  "gasto por naturaleza",
  "gastos de administracion y ventas",
  "gastos de ventas y distribucion"
];
const OPEX_TOTAL_TERMS = [
  "gastos operacionales",
  "gastos de operacion",
  "gastos operativos",
  "gastos, por funcion",
  "gastos por funcion",
  "gastos por naturaleza",
  "gastos de administracion y ventas",
  "gastos de ventas y distribucion"
];
const OPEX_EXCLUDE_TERMS = [
  "costos financieros",
  "gastos financieros",
  "ingresos financieros",
  "impuestos",
  "de cobertura",
  "no operacionales",
  "depreciacion",
  "amortizacion",
  "deterioro de valor",
  "diferencia en cambio"
];

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalize(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/operacin/g, "operacion")
    .replace(/financiacin/g, "financiacion")
    .replace(/inversin/g, "inversion")
    .replace(/administracin/g, "administracion")
    .replace(/distribucin/g, "distribucion")
    .replace(/comercializacin/g, "comercializacion")
    .replace(/promocin/g, "promocion")
    .replace(/funcin/g, "funcion")
    .replace(/depreciacin/g, "depreciacion")
    .replace(/amortizacin/g, "amortizacion")
    .replace(/disminucin/g, "disminucion")
    .replace(/prdida/g, "perdida")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function finite(v) {
  return Number.isFinite(v);
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && !v.trim()) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return finite(n) ? n : null;
}

function yearFromDate(date) {
  const y = Number(String(date || "").slice(0, 4));
  return finite(y) ? y : null;
}

function rowsForYear(rows, year) {
  const allYear = rows.filter((r) => yearFromDate(r?.fecha_corte) === year);
  if (!allYear.length) return [];
  const actual = allYear.filter((r) => normalize(r?.periodo).includes("actual"));
  if (actual.length) return actual;
  const current = allYear.filter((r) => {
    const p = normalize(r?.periodo);
    return p.includes(String(year)) && !p.includes("anterior");
  });
  if (current.length) return current;
  return allYear;
}

function pickValue(rows, includes = [], excludes = []) {
  const inc = includes.map(normalize);
  const exc = excludes.map(normalize);
  let best = null;
  let bestScore = -Infinity;
  let bestConcept = "";
  for (const row of rows || []) {
    const concept = normalize(row?.concepto);
    if (!concept) continue;
    if (!inc.some((x) => concept.includes(x))) continue;
    if (exc.some((x) => concept.includes(x))) continue;
    const value = toNum(row?.valor);
    if (!finite(value)) continue;
    const score =
      (concept.includes("total") ? 4 : 0) +
      (concept.includes("deuda") ? 4 : 0) +
      (concept.includes("financier") ? 3 : 0) +
      Math.log10(Math.abs(value) + 1);
    if (score > bestScore) {
      bestScore = score;
      best = value;
      bestConcept = row?.concepto || "";
    }
  }
  return { value: best, concept: bestConcept };
}

function sumValues(rows, includes = [], excludes = []) {
  const inc = includes.map(normalize);
  const exc = excludes.map(normalize);
  let total = 0;
  let found = false;
  const concepts = [];
  for (const row of rows || []) {
    const concept = normalize(row?.concepto);
    if (!concept) continue;
    if (!inc.some((x) => concept.includes(x))) continue;
    if (exc.some((x) => concept.includes(x))) continue;
    const value = toNum(row?.valor);
    if (!finite(value)) continue;
    found = true;
    total += value;
    concepts.push(row?.concepto || "");
  }
  return { value: found ? total : null, concepts };
}

async function fetchWithTimeout(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, retries = 3) {
  let lastError = null;
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    }
  }
  throw lastError || new Error("fetch_json_failed");
}

async function getCandidateNits(limit) {
  const p = new URLSearchParams();
  p.set("$select", "nit,count(*) as c");
  p.set("$where", "nit is not null");
  p.set("$group", "nit");
  p.set("$order", "c DESC");
  p.set("$limit", String(Math.max(limit * 3, 90)));
  const url = `${SOCRATA_BASE}/${DATASETS.income}.json?${p.toString()}`;
  const rows = await fetchJson(url);
  return (rows || [])
    .filter((r) => toNum(r?.c) >= MIN_ROWS_PER_NIT)
    .map((r) => clean(r?.nit))
    .filter((n) => /^\d{5,}$/.test(n))
    .slice(0, limit);
}

async function fetchNitRows(datasetId, nit) {
  const p = new URLSearchParams();
  p.set("$limit", String(DATASET_LIMIT));
  p.set("$where", `nit='${nit}'`);
  p.set("$order", "fecha_corte DESC");
  const url = `${SOCRATA_BASE}/${datasetId}.json?${p.toString()}`;
  const rows = await fetchJson(url);
  return Array.isArray(rows) ? rows : [];
}

function baseForYear(year, incomeAll, balanceAll, cashAll) {
  const income = rowsForYear(incomeAll, year);
  const balance = rowsForYear(balanceAll, year);
  const cash = rowsForYear(cashAll, year);
  const warnings = [];

  const ingresos = pickValue(income,
    ["ingresos de actividades ordinarias", "ingresos operacionales", "ingresos"],
    ["ingresos financieros", "otros ingresos"]
  );
  const costos = pickValue(income,
    ["costo de ventas", "costos de ventas", "costo por ventas", "costo de actividades ordinarias"],
    ["costos financieros", "impuestos"]
  );
  const utilidadBruta = pickValue(income, ["ganancia bruta", "utilidad bruta", "resultado bruto"], []);
  const ebit = pickValue(income,
    ["ganancia (perdida) por actividades de operacion", "utilidad operativa", "utilidad operacional", "resultado operativo", "resultado operacional"],
    ["antes de impuestos", "ganancia bruta"]
  );
  const depIncome = sumValues(income, ["depreciacion", "amortizacion"], []);
  const depCash = sumValues(cash, ["depreciacion", "amortizacion"], []);
  const depAmort = finite(depIncome.value) ? depIncome.value : depCash.value;
  const ebitdaDirect = pickValue(income, ["ebitda"], []);
  const ebitda = finite(ebitdaDirect.value)
    ? ebitdaDirect
    : (finite(ebit.value) ? { value: ebit.value + (depAmort || 0), concept: "ebit + da (estimado)" } : { value: null, concept: "" });

  const otrosIngresosOperacionales = pickValue(
    income,
    ["otros ingresos operacionales", "otros ingresos de operacion", "otros ingresos"],
    ["ingresos financieros", "no operacionales", "de cobertura"]
  );

  const opexTotal = pickValue(income, OPEX_TOTAL_TERMS, OPEX_EXCLUDE_TERMS);
  let opex = finite(opexTotal.value)
    ? { value: opexTotal.value, concepts: opexTotal.concept ? [opexTotal.concept] : [] }
    : sumValues(income, OPEX_INCLUDE_TERMS, OPEX_EXCLUDE_TERMS);

  if (!finite(opex.value) && finite(utilidadBruta.value) && finite(ebit.value)) {
    const implied = utilidadBruta.value + (finite(otrosIngresosOperacionales.value) ? otrosIngresosOperacionales.value : 0) - ebit.value;
    if (finite(implied)) {
      opex = { value: implied, concepts: ["utilidad_bruta + otros_ingresos_operacionales - ebit (estimado)"] };
      warnings.push("[opex_estimado] gastos operacionales estimados por puente operativo.");
    }
  }

  const utilidadNeta = pickValue(
    income,
    [
      "ganancia (perdida), atribuible a los propietarios de la controladora",
      "ganancia (perdida) del periodo",
      "utilidad neta",
      "ganancia (perdida)"
    ],
    ["antes de impuestos", "procedente de operaciones continuadas", "ganancia bruta", "por actividades de operacion"]
  );

  const costosFinancieros = pickValue(income, ["costos financieros", "gastos financieros", "gasto financiero"], []);

  const debtResolved = resolveFinancialDebtFromRows(balance, year);
  const deudaSumada = {
    value: debtResolved.deudaSumada,
    concepts: debtResolved.componentConcepts
  };
  const deudaDirecta = {
    value: debtResolved.deudaDirecta,
    concept: debtResolved.directConcept
  };
  const pasivosTotales = pickValue(balance, ["total pasivos", "pasivos totales"], []);
  const activosTotales = pickValue(balance, ["total de activos", "activos totales"], []);
  const patrimonioTotal = pickValue(balance, ["patrimonio total", "total patrimonio"], []);
  const activosCorrientes = pickValue(balance, ["activos corrientes", "total activos corrientes"], []);
  const pasivosCorrientes = pickValue(balance, ["pasivos corrientes", "total pasivos corrientes"], []);
  const capitalNetoTrabajo = {
    value: finite(activosCorrientes.value) && finite(pasivosCorrientes.value)
      ? activosCorrientes.value - pasivosCorrientes.value
      : null,
    concept: "activos_corrientes - pasivos_corrientes"
  };

  const flujoPeriodo = pickValue(
    cash,
    [
      "incremento (disminucion) neto en el efectivo y equivalentes al efectivo",
      "incremento (disminucion) neto de efectivo y equivalentes al efectivo",
      "incremento (disminucion) neto de efectivo",
      "flujo de efectivo neto"
    ],
    ["al principio", "al final"]
  );
  const cajaInicial = pickValue(cash, ["efectivo y equivalentes al efectivo al principio del periodo", "efectivo al inicio del periodo"], []);
  const cajaFinal = pickValue(cash, ["efectivo y equivalentes al efectivo al final del periodo", "efectivo al final del periodo"], []);

  const debtAudit = {};
  const debtResolution = CalcQACore.resolveDebtValue(
    {
      deudaSumada: deudaSumada.value,
      deudaDirecta: deudaDirecta.value,
      pasivosTotales: pasivosTotales.value
    },
    debtAudit,
    warnings
  );

  return {
    year,
    inputs: {
      ingresos,
      costos,
      utilidad_bruta: utilidadBruta,
      ebit,
      dep_amort: { value: depAmort, concept: finite(depIncome.value) ? "income_da" : "cash_da" },
      ebitda,
      gastos_operacionales: opex,
      utilidad_neta: utilidadNeta,
      costos_financieros: costosFinancieros,
      deuda_sumada: deudaSumada,
      deuda_directa: deudaDirecta,
      deuda_resuelta: { value: debtResolution.value, concept: debtResolution.source },
      caja_inicial: cajaInicial,
      caja_final: cajaFinal,
      flujo_periodo: flujoPeriodo,
      activos_totales: activosTotales,
      pasivos_totales: pasivosTotales,
      patrimonio_total: patrimonioTotal,
      activos_corrientes: activosCorrientes,
      pasivos_corrientes: pasivosCorrientes,
      capital_neto_trabajo: capitalNetoTrabajo
    },
    debt_audit: debtAudit,
    warnings
  };
}

function manualRatios(baseNow, basePrev) {
  const ingresos = toNum(baseNow?.inputs?.ingresos?.value);
  const ingresosPrev = toNum(basePrev?.inputs?.ingresos?.value);
  const utilidadBruta = toNum(baseNow?.inputs?.utilidad_bruta?.value);
  const ebitda = toNum(baseNow?.inputs?.ebitda?.value);
  const opex = toNum(baseNow?.inputs?.gastos_operacionales?.value);
  const utilidadNeta = toNum(baseNow?.inputs?.utilidad_neta?.value);
  const deuda = toNum(baseNow?.inputs?.deuda_resuelta?.value);
  const costosFin = toNum(baseNow?.inputs?.costos_financieros?.value);

  const safe = (num, den, scale = 1) => (!finite(num) || !finite(den) || den === 0 ? 0 : (num / den) * scale);

  return {
    crecimiento_ingresos_yoy: safe(finite(ingresos) && finite(ingresosPrev) ? ingresos - ingresosPrev : null, ingresosPrev, 100),
    margen_bruto: safe(utilidadBruta, ingresos, 100),
    margen_ebitda: safe(ebitda, ingresos, 100),
    gastos_operacionales_sobre_ingresos: safe(opex, ingresos, 100),
    margen_neto: safe(utilidadNeta, ingresos, 100),
    deuda_ebitda: safe(deuda, ebitda, 1),
    ebitda_costos_financieros: safe(ebitda, finite(costosFin) ? Math.abs(costosFin) : null, 1)
  };
}

function manualChecks(baseNow) {
  const cajaInicial = toNum(baseNow?.inputs?.caja_inicial?.value);
  const cajaFinal = toNum(baseNow?.inputs?.caja_final?.value);
  const flujoPeriodo = toNum(baseNow?.inputs?.flujo_periodo?.value);
  const activos = toNum(baseNow?.inputs?.activos_totales?.value);
  const pasivos = toNum(baseNow?.inputs?.pasivos_totales?.value);
  const patrimonio = toNum(baseNow?.inputs?.patrimonio_total?.value);
  const ac = toNum(baseNow?.inputs?.activos_corrientes?.value);
  const pc = toNum(baseNow?.inputs?.pasivos_corrientes?.value);
  const knt = toNum(baseNow?.inputs?.capital_neto_trabajo?.value);
  const deuda = toNum(baseNow?.inputs?.deuda_resuelta?.value);
  const deudaBal = toNum(baseNow?.inputs?.deuda_resuelta?.value);

  const diffCaja = finite(cajaInicial) && finite(cajaFinal) && finite(flujoPeriodo) ? cajaFinal - (cajaInicial + flujoPeriodo) : null;
  const diffBalance = finite(activos) && finite(pasivos) && finite(patrimonio) ? activos - (pasivos + patrimonio) : null;
  const diffNwc = finite(ac) && finite(pc) && finite(knt) ? knt - (ac - pc) : null;
  const diffDeuda = finite(deuda) && finite(deudaBal) ? deuda - deudaBal : null;

  return {
    check_caja: { pass: finite(diffCaja) ? Math.abs(diffCaja) <= TOL : false, diff: finite(diffCaja) ? diffCaja : 0, tolerance: TOL },
    check_balance: { pass: finite(diffBalance) ? Math.abs(diffBalance) <= TOL : false, diff: finite(diffBalance) ? diffBalance : 0, tolerance: TOL },
    check_nwc: { pass: finite(diffNwc) ? Math.abs(diffNwc) <= TOL : false, diff: finite(diffNwc) ? diffNwc : 0, tolerance: TOL },
    check_deuda: { pass: finite(diffDeuda) ? Math.abs(diffDeuda) <= TOL : false, diff: finite(diffDeuda) ? diffDeuda : 0, tolerance: TOL }
  };
}

function legacyDebtEbitda(baseNow) {
  const deudaLegacy = toNum(baseNow?.inputs?.pasivos_totales?.value);
  const ebitda = toNum(baseNow?.inputs?.ebitda?.value);
  if (!finite(deudaLegacy) || !finite(ebitda) || ebitda === 0) return 0;
  return deudaLegacy / ebitda;
}

function ratioDelta(a, b) {
  const x = toNum(a);
  const y = toNum(b);
  if (!finite(x) || !finite(y)) return null;
  return x - y;
}

function scenarioEdgeCases() {
  return [
    { name: "ingresos_cero", base: { ingresos: 0, ingresos_prev: 100, utilidad_bruta: 0, ebitda: 50, gastos_operacionales: 30, utilidad_neta: 10, deuda: 80, costos_financieros: 5 } },
    { name: "ebitda_cero", base: { ingresos: 100, ingresos_prev: 90, utilidad_bruta: 40, ebitda: 0, gastos_operacionales: 50, utilidad_neta: -5, deuda: 200, costos_financieros: 20 } },
    { name: "costos_fin_cero", base: { ingresos: 150, ingresos_prev: 140, utilidad_bruta: 55, ebitda: 20, gastos_operacionales: 25, utilidad_neta: 8, deuda: 90, costos_financieros: 0 } },
    { name: "deuda_cero", base: { ingresos: 1000, ingresos_prev: 800, utilidad_bruta: 250, ebitda: 120, gastos_operacionales: 130, utilidad_neta: 60, deuda: 0, costos_financieros: 10 } },
    { name: "ebitda_negativo", base: { ingresos: 400, ingresos_prev: 600, utilidad_bruta: 120, ebitda: -80, gastos_operacionales: 150, utilidad_neta: -95, deuda: 300, costos_financieros: 15 } },
    { name: "faltantes", base: { ingresos: null, ingresos_prev: null, utilidad_bruta: null, ebitda: null, gastos_operacionales: null, utilidad_neta: null, deuda: null, costos_financieros: null } },
    { name: "cambio_yoy_extremo", base: { ingresos: 1000000, ingresos_prev: 10, utilidad_bruta: 800000, ebitda: 300000, gastos_operacionales: 200000, utilidad_neta: 100000, deuda: 10000, costos_financieros: 2000 } },
    { name: "valores_negativos_multiples", base: { ingresos: -100, ingresos_prev: -80, utilidad_bruta: -20, ebitda: -15, gastos_operacionales: -50, utilidad_neta: -30, deuda: -40, costos_financieros: -5 } }
  ];
}

async function runPool(items, concurrency, worker) {
  const out = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
    while (true) {
      const i = idx;
      idx += 1;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function analyzeCompany(nit) {
  const [income, balance, cash] = await Promise.all([
    fetchNitRows(DATASETS.income, nit),
    fetchNitRows(DATASETS.balance, nit),
    fetchNitRows(DATASETS.cashflow, nit)
  ]);

  const years = [...new Set([
    ...income.map((r) => yearFromDate(r?.fecha_corte)),
    ...balance.map((r) => yearFromDate(r?.fecha_corte)),
    ...cash.map((r) => yearFromDate(r?.fecha_corte))
  ])]
    .filter(finite)
    .sort((a, b) => b - a)
    .slice(0, YEARS_PER_COMPANY);

  const entries = [];
  for (const year of years) {
    const baseNow = baseForYear(year, income, balance, cash);
    const prevYear = year - 1;
    const basePrev = years.includes(prevYear) ? baseForYear(prevYear, income, balance, cash) : null;

    const warnings = [...baseNow.warnings];
    const ratioAudit = {};
    const checkAudit = {};
    const coreRatios = CalcQACore.computeRatios(
      {
        ingresos: baseNow.inputs.ingresos.value,
        ingresos_prev: basePrev?.inputs?.ingresos?.value ?? null,
        costos: baseNow.inputs.costos.value,
        utilidad_bruta: baseNow.inputs.utilidad_bruta.value,
        ebitda: baseNow.inputs.ebitda.value,
        gastos_operacionales: baseNow.inputs.gastos_operacionales.value,
        utilidad_neta: baseNow.inputs.utilidad_neta.value,
        deuda: baseNow.inputs.deuda_resuelta.value,
        costos_financieros: baseNow.inputs.costos_financieros.value
      },
      ratioAudit,
      warnings
    );

    const coreChecks = CalcQACore.computeChecks(
      {
        caja_inicial: baseNow.inputs.caja_inicial.value,
        caja_final: baseNow.inputs.caja_final.value,
        flujo_periodo: baseNow.inputs.flujo_periodo.value,
        activos_totales: baseNow.inputs.activos_totales.value,
        pasivos_totales: baseNow.inputs.pasivos_totales.value,
        patrimonio_total: baseNow.inputs.patrimonio_total.value,
        activos_corrientes: baseNow.inputs.activos_corrientes.value,
        pasivos_corrientes: baseNow.inputs.pasivos_corrientes.value,
        capital_neto_trabajo: baseNow.inputs.capital_neto_trabajo.value,
        deuda_ratio: baseNow.inputs.deuda_resuelta.value,
        deuda_balance: baseNow.inputs.deuda_resuelta.value,
        tolerance_abs: TOL
      },
      checkAudit,
      warnings
    );

    const manualR = manualRatios(baseNow, basePrev);
    const manualC = manualChecks(baseNow);
    const deltas = Object.keys(coreRatios).reduce((acc, k) => {
      acc[k] = ratioDelta(coreRatios[k], manualR[k]);
      return acc;
    }, {});

    const legacy = legacyDebtEbitda(baseNow);
    const debtDeltaBeforeAfter = ratioDelta(coreRatios.deuda_ebitda, legacy);

    entries.push({
      nit,
      year,
      inputs: baseNow.inputs,
      core: {
        ratios: coreRatios,
        checks: coreChecks,
        ratio_audit: ratioAudit,
        check_audit: checkAudit,
        debt_audit: baseNow.debt_audit
      },
      manual: {
        ratios: manualR,
        checks: manualC
      },
      delta_ratio_core_vs_manual: deltas,
      legacy_deuda_ebitda: legacy,
      debt_ratio_before_after_delta: debtDeltaBeforeAfter,
      warnings
    });
  }

  return {
    nit,
    years,
    total_income_rows: income.length,
    total_balance_rows: balance.length,
    total_cash_rows: cash.length,
    entries
  };
}

function summarizeReal(realResults) {
  const entries = realResults.flatMap((r) => r.entries);
  const totalCases = entries.length;
  const allRatioKeys = [
    "crecimiento_ingresos_yoy",
    "margen_bruto",
    "margen_ebitda",
    "gastos_operacionales_sobre_ingresos",
    "margen_neto",
    "deuda_ebitda",
    "ebitda_costos_financieros"
  ];

  let nonFinite = 0;
  let ratioMismatch = 0;
  let checkMismatch = 0;
  let debtRegressionCases = 0;
  const warningsCount = entries.reduce((a, e) => a + (e.warnings?.length || 0), 0);

  const debtDiffExamples = [];
  entries.forEach((e) => {
    allRatioKeys.forEach((k) => {
      if (!finite(e.core.ratios[k])) nonFinite += 1;
      if (finite(e.delta_ratio_core_vs_manual[k]) && Math.abs(e.delta_ratio_core_vs_manual[k]) > 1e-9) {
        ratioMismatch += 1;
      }
    });
    ["check_caja", "check_balance", "check_nwc", "check_deuda"].forEach((k) => {
      if ((e.core.checks[k]?.pass || false) !== (e.manual.checks[k]?.pass || false)) checkMismatch += 1;
    });
    if (finite(e.debt_ratio_before_after_delta) && Math.abs(e.debt_ratio_before_after_delta) > 1e-9) {
      debtRegressionCases += 1;
      if (debtDiffExamples.length < 25) {
        debtDiffExamples.push({
          nit: e.nit,
          year: e.year,
          deuda_ebitda_new: e.core.ratios.deuda_ebitda,
          deuda_ebitda_legacy: e.legacy_deuda_ebitda,
          delta: e.debt_ratio_before_after_delta
        });
      }
    }
  });

  return {
    companies: realResults.length,
    real_cases: totalCases,
    non_finite_outputs: nonFinite,
    ratio_core_manual_mismatch: ratioMismatch,
    check_core_manual_mismatch: checkMismatch,
    warnings_total: warningsCount,
    debt_ratio_before_after_changes: debtRegressionCases,
    debt_ratio_diff_examples: debtDiffExamples
  };
}

function runEdgeSuite() {
  const scenarios = scenarioEdgeCases();
  const results = [];
  for (const s of scenarios) {
    const warnings = [];
    const ratioAudit = {};
    const checkAudit = {};
    const ratios = CalcQACore.computeRatios(
      {
        ...s.base
      },
      ratioAudit,
      warnings
    );
    const checks = CalcQACore.computeChecks(
      {
        caja_inicial: 100,
        caja_final: 100,
        flujo_periodo: 0,
        activos_totales: 1000,
        pasivos_totales: 500,
        patrimonio_total: 500,
        activos_corrientes: 300,
        pasivos_corrientes: 200,
        capital_neto_trabajo: 100,
        deuda_ratio: s.base.deuda,
        deuda_balance: s.base.deuda,
        tolerance_abs: TOL
      },
      checkAudit,
      warnings
    );
    const allFinite = Object.values(ratios).every((v) => finite(v));
    results.push({
      name: s.name,
      all_finite: allFinite,
      ratios,
      checks,
      warnings_count: warnings.length
    });
  }
  const nonFiniteCases = results.filter((r) => !r.all_finite).length;
  return {
    total_edge_cases: results.length,
    non_finite_cases: nonFiniteCases,
    results
  };
}

function buildMarkdown(summary) {
  const lines = [];
  lines.push("# QA Full Validation Suite");
  lines.push("");
  lines.push(`- Fecha: ${new Date().toISOString()}`);
  lines.push(`- Empresas reales analizadas: ${summary.real.companies}`);
  lines.push(`- Casos reales (empresa-anio): ${summary.real.real_cases}`);
  lines.push(`- Escenarios borde: ${summary.edge.total_edge_cases}`);
  lines.push("");
  lines.push("## Resultado global");
  lines.push(`- Outputs no finitos (NaN/Inf): ${summary.real.non_finite_outputs}`);
  lines.push(`- Mismatch core vs recomputacion manual (ratios): ${summary.real.ratio_core_manual_mismatch}`);
  lines.push(`- Mismatch core vs recomputacion manual (checks): ${summary.real.check_core_manual_mismatch}`);
  lines.push(`- Cambios before vs after en Deuda/EBITDA: ${summary.real.debt_ratio_before_after_changes}`);
  lines.push(`- Warnings de fallback: ${summary.real.warnings_total}`);
  lines.push("");
  lines.push("## Edge suite");
  lines.push(`- Casos borde sin finitos: ${summary.edge.non_finite_cases}/${summary.edge.total_edge_cases}`);
  summary.edge.results.forEach((r) => {
    lines.push(`- ${r.name}: all_finite=${r.all_finite}, warnings=${r.warnings_count}`);
  });
  lines.push("");
  lines.push("## Muestras before vs after (Deuda/EBITDA)");
  if (summary.real.debt_ratio_diff_examples.length) {
    summary.real.debt_ratio_diff_examples.slice(0, 20).forEach((x) => {
      lines.push(
        `- NIT ${x.nit}, anio ${x.year}: nuevo=${x.deuda_ebitda_new.toFixed(4)} ` +
        `legacy=${x.deuda_ebitda_legacy.toFixed(4)} delta=${x.delta.toFixed(4)}`
      );
    });
  } else {
    lines.push("- Sin diferencias detectadas.");
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  console.log(`[qa-full] buscando NITs reales (${SAMPLE_COMPANIES})...`);
  const nits = await getCandidateNits(SAMPLE_COMPANIES);
  if (!nits.length) throw new Error("No se encontraron NITs.");
  console.log(`[qa-full] NITs cargados: ${nits.length}`);

  let done = 0;
  const realResults = await runPool(nits, CONCURRENCY, async (nit) => {
    const result = await analyzeCompany(nit);
    done += 1;
    if (done % 10 === 0 || done === nits.length) {
      console.log(`[qa-full] progreso ${done}/${nits.length}`);
    }
    return result;
  });

  const realSummary = summarizeReal(realResults);
  const edgeSummary = runEdgeSuite();

  const payload = {
    generated_at: new Date().toISOString(),
    config: {
      sample_companies: SAMPLE_COMPANIES,
      years_per_company: YEARS_PER_COMPANY,
      concurrency: CONCURRENCY,
      timeout_ms: REQUEST_TIMEOUT_MS,
      tolerance_abs: TOL
    },
    real: realSummary,
    edge: edgeSummary,
    real_results: realResults
  };

  await fs.writeFile("_tmp_qa_full_validation.json", JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile("bot_training/reporte_qa_full_validation.md", buildMarkdown(payload), "utf8");

  console.log("[qa-full] listo.");
  console.log(`[qa-full] empresas=${realSummary.companies}, casos_reales=${realSummary.real_cases}, edge=${edgeSummary.total_edge_cases}`);
  console.log(`[qa-full] non_finite=${realSummary.non_finite_outputs}, ratio_mismatch=${realSummary.ratio_core_manual_mismatch}, check_mismatch=${realSummary.check_core_manual_mismatch}`);
  console.log(`[qa-full] deuda_ebitda_before_after_changes=${realSummary.debt_ratio_before_after_changes}`);
  console.log("[qa-full] archivos:");
  console.log("- _tmp_qa_full_validation.json");
  console.log("- bot_training/reporte_qa_full_validation.md");
}

main().catch((err) => {
  console.error(`[qa-full] error: ${clean(err?.message || err)}`);
  process.exit(1);
});

