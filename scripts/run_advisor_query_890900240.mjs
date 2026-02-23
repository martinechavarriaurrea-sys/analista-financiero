import fs from "fs/promises";
import { resolveFinancialDebtFromRows } from "./lib/financial_debt.mjs";

const QUESTION = String(process.env.ADVISOR_QUESTION || "")
  || "Cuales son las mayores falencias y donde se deben revisar los mayores fallos de esta empresa y por que?";
const NIT = "890900240";
const advisorUrl = "http://127.0.0.1:8787/api/advisor";
const SOCRATA_BASE = "https://www.datos.gov.co/resource";
const DATASETS = {
  income: "prwj-nzxa",
  balance: "pfdp-zks5",
  cashflow: "ctcp-462n"
};
const PAGE_SIZE = 5000;
const MAX_OFFSET = 100000;

function normalize(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toNum(v) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function yearFromDate(date) {
  const y = Number(String(date || "").slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function filteredRows(rows, year, periodNeedle = "periodo actual") {
  const p = normalize(periodNeedle);
  return rows.filter((r) => {
    const y = yearFromDate(r.fecha_corte);
    if (y !== year) return false;
    const periodo = normalize(r.periodo);
    return periodo.includes(p);
  });
}

function pickValue(rows, includes = [], excludes = []) {
  const inc = includes.map(normalize);
  const exc = excludes.map(normalize);

  let best = null;
  for (const row of rows) {
    const concept = normalize(row.concepto);
    if (!concept) continue;
    if (!inc.some((x) => concept.includes(x))) continue;
    if (exc.some((x) => concept.includes(x))) continue;
    const value = toNum(row.valor);
    if (!Number.isFinite(value)) continue;
    if (!best || Math.abs(value) > Math.abs(best)) best = value;
  }
  return best;
}

function sumValues(rows, includes = [], excludes = []) {
  const inc = includes.map(normalize);
  const exc = excludes.map(normalize);
  let total = 0;
  let found = false;
  for (const row of rows) {
    const concept = normalize(row.concepto);
    if (!concept) continue;
    if (!inc.some((x) => concept.includes(x))) continue;
    if (exc.some((x) => concept.includes(x))) continue;
    const value = toNum(row.valor);
    if (!Number.isFinite(value)) continue;
    total += value;
    found = true;
  }
  return found ? total : null;
}

function pct(cur, prev) {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function div(num, den) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

async function readJson(path) {
  const rawBuffer = await fs.readFile(path);
  let rawText = rawBuffer.toString("utf8");
  if (rawText.includes("\u0000") || rawText.startsWith("\uFFFD")) {
    rawText = rawBuffer.toString("utf16le");
  }
  rawText = rawText.replace(/^\uFEFF/, "");
  return JSON.parse(rawText);
}

function hasInstanceMetadata(rows) {
  return (rows || []).some((row) => {
    const a = String(row?.numero_radicado || "").trim();
    const b = String(row?.id_punto_entrada || "").trim();
    const c = String(row?.codigo_instancia || "").trim();
    return !!(a || b || c);
  });
}

async function fetchDatasetByNit(datasetId, nit) {
  const rows = [];
  let offset = 0;

  while (offset <= MAX_OFFSET) {
    const params = new URLSearchParams();
    params.set("$limit", String(PAGE_SIZE));
    params.set("$offset", String(offset));
    params.set("$order", "fecha_corte DESC");
    params.set("$where", `nit='${nit}'`);
    params.set(
      "$select",
      "nit,fecha_corte,periodo,concepto,valor,numero_radicado,id_punto_entrada,punto_entrada,id_taxonomia,taxonomia,codigo_instancia"
    );

    const url = `${SOCRATA_BASE}/${datasetId}.json?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No fue posible consultar dataset ${datasetId} para NIT ${nit}: HTTP ${res.status}`);
    const chunk = await res.json();
    if (!Array.isArray(chunk)) throw new Error(`Respuesta invalida en ${datasetId} para NIT ${nit}`);
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function loadRowsWithFallback(localPath, datasetId, nit) {
  let localRows = [];
  try {
    localRows = await readJson(localPath);
  } catch (err) {
    localRows = [];
  }

  if (Array.isArray(localRows) && localRows.length && hasInstanceMetadata(localRows)) {
    return localRows;
  }
  return fetchDatasetByNit(datasetId, nit);
}

function latestYear(rowsA, rowsB, rowsC) {
  const years = [
    ...rowsA.map((r) => yearFromDate(r.fecha_corte)),
    ...rowsB.map((r) => yearFromDate(r.fecha_corte)),
    ...rowsC.map((r) => yearFromDate(r.fecha_corte))
  ].filter(Number.isFinite);
  return Math.max(...years);
}

function buildYearSnapshot(year, incomeRowsAll, balanceRowsAll, cashRowsAll) {
  const incomeRows = filteredRows(incomeRowsAll, year);
  const balanceRows = filteredRows(balanceRowsAll, year);
  const cashRows = filteredRows(cashRowsAll, year);

  const ingresos = pickValue(incomeRows, ["ingresos de actividades ordinarias", "ingresos operacionales", "ingresos"], ["ingresos financieros", "otros ingresos"]);
  const utilidadNeta = pickValue(
    incomeRows,
    [
      "ganancia (perdida), atribuible a los propietarios de la controladora",
      "ganancia (perdida) del periodo",
      "utilidad neta",
      "ganancia (perdida)"
    ],
    ["antes de impuestos", "procedente de operaciones continuadas", "ganancia bruta"]
  );
  const ebit = pickValue(
    incomeRows,
    ["ganancia (perdida) por actividades de operacion", "utilidad operativa", "utilidad operacional"],
    ["antes de impuestos"]
  );
  const depAmort = sumValues(incomeRows, ["depreciacion", "amortizacion"], []);
  const ebitda = pickValue(incomeRows, ["ebitda"], []) ?? (Number.isFinite(ebit) ? ebit + (depAmort || 0) : null);

  const flujoOperativo = pickValue(
    cashRows,
    ["flujos de efectivo netos procedentes de (utilizados en) actividades de operacion", "actividades de operacion"],
    []
  );
  const flujoPeriodo = pickValue(
    cashRows,
    ["incremento (disminucion) neto en el efectivo y equivalentes al efectivo", "flujo de efectivo neto"],
    ["al principio", "al final"]
  );

  const deuda = resolveFinancialDebtFromRows(balanceRows, year).deuda;

  const activosTotales = pickValue(balanceRows, ["total de activos"], []);
  const pasivosTotales = pickValue(balanceRows, ["total pasivos", "pasivos totales"], []);
  const patrimonio = pickValue(balanceRows, ["patrimonio total", "total patrimonio"], []);
  const activosCorrientes = pickValue(balanceRows, ["activos corrientes", "total activos corrientes"], []);
  const pasivosCorrientes = pickValue(balanceRows, ["pasivos corrientes", "total pasivos corrientes"], []);
  const gananciasAcumuladas = pickValue(balanceRows, ["ganancias acumuladas", "utilidades retenidas"], []);

  const deudaEbitda = div(deuda, ebitda);
  const margenEbitda = div(ebitda, ingresos);
  const margenNeto = div(utilidadNeta, ingresos);

  let zAltman = null;
  if (
    Number.isFinite(activosTotales) &&
    activosTotales !== 0 &&
    Number.isFinite(ingresos) &&
    Number.isFinite(ebit) &&
    Number.isFinite(pasivosTotales) &&
    pasivosTotales !== 0
  ) {
    const capitalTrabajoNeto =
      Number.isFinite(activosCorrientes) && Number.isFinite(pasivosCorrientes)
        ? activosCorrientes - pasivosCorrientes
        : null;
    const retained = Number.isFinite(gananciasAcumuladas) ? gananciasAcumuladas : (Number.isFinite(patrimonio) ? patrimonio * 0.25 : null);
    if (Number.isFinite(capitalTrabajoNeto) && Number.isFinite(retained) && Number.isFinite(patrimonio)) {
      zAltman =
        1.2 * (capitalTrabajoNeto / activosTotales) +
        1.4 * (retained / activosTotales) +
        3.3 * (ebit / activosTotales) +
        0.6 * (patrimonio / pasivosTotales) +
        1.0 * (ingresos / activosTotales);
    }
  }

  return {
    anio: year,
    ingresos,
    ebitda,
    utilidad_neta: utilidadNeta,
    flujo_operativo: flujoOperativo,
    flujo_periodo: flujoPeriodo,
    deuda_ebitda: deudaEbitda,
    margen_ebitda_pct: Number.isFinite(margenEbitda) ? margenEbitda * 100 : null,
    margen_neto_pct: Number.isFinite(margenNeto) ? margenNeto * 100 : null,
    z_altman: zAltman
  };
}

function localAnswerFromSnapshot(company, latest, prev) {
  const yoy = prev ? pct(latest.ingresos, prev.ingresos) : null;
  return [
    `Empresa: ${company} (${NIT}).`,
    `Ultimo año analizado: ${latest.anio}.`,
    `Ingresos: ${latest.ingresos ?? "N/D"}${Number.isFinite(yoy) ? ` (YoY ${yoy.toFixed(1)}%)` : ""}.`,
    `EBITDA: ${latest.ebitda ?? "N/D"} | Utilidad neta: ${latest.utilidad_neta ?? "N/D"}.`,
    `Flujo operativo: ${latest.flujo_operativo ?? "N/D"} | Flujo periodo: ${latest.flujo_periodo ?? "N/D"}.`,
    `Deuda/EBITDA: ${Number.isFinite(latest.deuda_ebitda) ? latest.deuda_ebitda.toFixed(2) : "N/D"}x.`,
    `Margen EBITDA: ${Number.isFinite(latest.margen_ebitda_pct) ? latest.margen_ebitda_pct.toFixed(1) : "N/D"}% | Margen neto: ${Number.isFinite(latest.margen_neto_pct) ? latest.margen_neto_pct.toFixed(1) : "N/D"}%.`,
    `Z-Altman: ${Number.isFinite(latest.z_altman) ? latest.z_altman.toFixed(2) : "N/D"}.`
  ].join("\n");
}

async function main() {
  const [income, balance, cash] = await Promise.all([
    loadRowsWithFallback("_tmp_income_890900240.json", DATASETS.income, NIT),
    loadRowsWithFallback("_tmp_balance_890900240.json", DATASETS.balance, NIT),
    loadRowsWithFallback("_tmp_cash_890900240.json", DATASETS.cashflow, NIT)
  ]);

  const latest = latestYear(income, balance, cash);
  const candidateYears = [latest - 6, latest - 5, latest - 4, latest - 3, latest - 2, latest - 1, latest].filter((y) => y > 2000);
  const history = [];
  for (const y of candidateYears) {
    const snap = buildYearSnapshot(y, income, balance, cash);
    if (
      Number.isFinite(snap.ingresos) ||
      Number.isFinite(snap.ebitda) ||
      Number.isFinite(snap.utilidad_neta) ||
      Number.isFinite(snap.flujo_operativo) ||
      Number.isFinite(snap.flujo_periodo)
    ) {
      history.push(snap);
    }
  }
  history.sort((a, b) => a.anio - b.anio);
  const latestSnap = history[history.length - 1];
  const prevSnap = history.length > 1 ? history[history.length - 2] : null;

  const payload = {
    company: {
      nit: NIT,
      razon_social: "CEMENTOS ARGOS S.A.",
      estado: "N/D",
      etapa_situacion: "N/D",
      dependencia: "N/D"
    },
    years_selected: history.map((h) => h.anio),
    latest_year: latestSnap.anio,
    latest_snapshot: {
      ingresos: latestSnap.ingresos,
      ebitda: latestSnap.ebitda,
      utilidad_neta: latestSnap.utilidad_neta,
      flujo_periodo: latestSnap.flujo_periodo,
      flujo_operativo: latestSnap.flujo_operativo,
      deuda_ebitda: latestSnap.deuda_ebitda,
      margen_ebitda_pct: latestSnap.margen_ebitda_pct,
      margen_neto_pct: latestSnap.margen_neto_pct,
      z_altman: latestSnap.z_altman
    },
    history,
    warnings: []
  };

  const body = {
    question: QUESTION,
    payload,
    local_answer: localAnswerFromSnapshot(payload.company.razon_social, latestSnap, prevSnap)
  };

  const response = await fetch(advisorUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    console.error(await response.text());
    process.exit(1);
  }
  const json = await response.json();
  console.log(JSON.stringify(json, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
