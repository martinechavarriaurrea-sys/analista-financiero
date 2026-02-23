import fs from "fs/promises";
import { resolveFinancialDebtFromRows } from "./lib/financial_debt.mjs";

const SOCRATA_BASE = "https://www.datos.gov.co/resource";
const DATASETS = {
  income: "prwj-nzxa",
  balance: "pfdp-zks5",
  cashflow: "ctcp-462n"
};

const SAMPLE_SIZE = Number(process.env.DEUDA_EBITDA_SAMPLE || 120);
const CONCURRENCY = Number(process.env.DEUDA_EBITDA_CONCURRENCY || 6);
const MIN_ROWS_PER_NIT = Number(process.env.DEUDA_EBITDA_MIN_ROWS || 30);
const MAX_ROWS_PER_DATASET = Number(process.env.DEUDA_EBITDA_MAX_ROWS || 3000);
const REQUEST_TIMEOUT_MS = Number(process.env.DEUDA_EBITDA_TIMEOUT_MS || 90000);

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalize(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/�/g, "")
    .replace(/prdida/g, "perdida")
    .replace(/operacin/g, "operacion")
    .replace(/disminucin/g, "disminucion")
    .replace(/financiacin/g, "financiacion")
    .replace(/inversin/g, "inversion")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function yearFromDate(date) {
  const y = Number(String(date || "").slice(0, 4));
  return Number.isFinite(y) ? y : null;
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

  for (const row of rows || []) {
    const concept = normalize(row?.concepto);
    if (!concept) continue;
    if (!inc.some((x) => concept.includes(x))) continue;
    if (exc.some((x) => concept.includes(x))) continue;

    const value = toNum(row?.valor);
    if (!Number.isFinite(value)) continue;

    const score =
      (concept.includes("total") ? 3 : 0) +
      (concept.includes("deuda") ? 3 : 0) +
      (concept.includes("financier") ? 2 : 0) +
      Math.log10(Math.abs(value) + 1);
    if (score > bestScore) {
      bestScore = score;
      best = value;
    }
  }
  return best;
}

function sumValues(rows, includes = [], excludes = []) {
  const inc = includes.map(normalize);
  const exc = excludes.map(normalize);
  let total = 0;
  let found = false;

  for (const row of rows || []) {
    const concept = normalize(row?.concepto);
    if (!concept) continue;
    if (!inc.some((x) => concept.includes(x))) continue;
    if (exc.some((x) => concept.includes(x))) continue;
    const value = toNum(row?.valor);
    if (!Number.isFinite(value)) continue;
    total += value;
    found = true;
  }
  return found ? total : null;
}

function computeDebtEbitda(incomeRows, balanceRows, cashRows) {
  const ebitdaDirect = pickValue(incomeRows, ["ebitda"], []);
  const ebit = pickValue(
    incomeRows,
    [
      "ganancia (perdida) por actividades de operacion",
      "utilidad operativa",
      "utilidad operacional",
      "resultado operativo",
      "resultado operacional"
    ],
    ["antes de impuestos"]
  );
  const depAmort = sumValues(incomeRows, ["depreciacion", "amortizacion"], []);
  const depAmortCash = sumValues(cashRows, ["depreciacion", "amortizacion"], []);
  const depAmortBest = Number.isFinite(depAmort) ? depAmort : depAmortCash;

  let ebitda = ebitdaDirect;
  let ebitdaSource = "direct";
  if (!Number.isFinite(ebitda)) {
    if (Number.isFinite(ebit) && Number.isFinite(depAmortBest)) {
      ebitda = ebit + depAmortBest;
      ebitdaSource = "ebit_plus_da";
    } else if (Number.isFinite(ebit)) {
      ebitda = ebit;
      ebitdaSource = "ebit_only";
    }
  }

  const debtResolved = resolveFinancialDebtFromRows(balanceRows);
  const deuda = debtResolved.deuda;

  if (!Number.isFinite(deuda)) {
    return { status: "nd", reason: "missing_deuda", deuda: null, ebitda, ratio: null, ebitda_source: ebitdaSource };
  }
  if (!Number.isFinite(ebitda)) {
    return { status: "nd", reason: "missing_ebitda", deuda, ebitda: null, ratio: null, ebitda_source: ebitdaSource };
  }
  if (ebitda === 0) {
    return { status: "nd", reason: "ebitda_zero", deuda, ebitda, ratio: null, ebitda_source: ebitdaSource };
  }

  const ratio = deuda / ebitda;
  if (!Number.isFinite(ratio)) {
    return { status: "nd", reason: "invalid_ratio", deuda, ebitda, ratio: null, ebitda_source: ebitdaSource };
  }

  return { status: "ok", reason: "", deuda, ebitda, ratio, ebitda_source: ebitdaSource };
}

function escCsv(v) {
  if (v === null || v === undefined) return "";
  const t = String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
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
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastError || new Error("Error de red.");
}

async function getCandidateNits(limit) {
  const p = new URLSearchParams();
  p.set("$select", "nit,count(*) as c");
  p.set("$where", "nit is not null");
  p.set("$group", "nit");
  p.set("$order", "c DESC");
  p.set("$limit", String(Math.max(limit * 3, 60)));
  const url = `${SOCRATA_BASE}/${DATASETS.income}.json?${p.toString()}`;
  const rows = await fetchJson(url);
  return (rows || [])
    .filter((r) => Number(toNum(r?.c)) >= Math.max(1, MIN_ROWS_PER_NIT))
    .map((r) => clean(r?.nit))
    .filter((n) => /^\d{5,}$/.test(n))
    .slice(0, limit);
}

async function fetchNitRows(datasetId, nit) {
  const p = new URLSearchParams();
  p.set("$limit", String(MAX_ROWS_PER_DATASET));
  p.set("$where", `nit='${nit}'`);
  p.set("$order", "fecha_corte DESC");
  const url = `${SOCRATA_BASE}/${datasetId}.json?${p.toString()}`;
  const rows = await fetchJson(url);
  return Array.isArray(rows) ? rows : [];
}

async function analyzeNit(nit) {
  const [incomeRows, balanceRows, cashRows] = await Promise.all([
    fetchNitRows(DATASETS.income, nit),
    fetchNitRows(DATASETS.balance, nit),
    fetchNitRows(DATASETS.cashflow, nit)
  ]);

  if (!incomeRows.length && !balanceRows.length && !cashRows.length) {
    return {
      nit,
      year: null,
      status: "nd",
      reason: "no_data",
      deuda: null,
      ebitda: null,
      ratio: null,
      ebitda_source: "",
      income_rows: 0,
      balance_rows: 0,
      cash_rows: 0
    };
  }

  const years = [...new Set([
    ...incomeRows.map((r) => yearFromDate(r?.fecha_corte)),
    ...balanceRows.map((r) => yearFromDate(r?.fecha_corte)),
    ...cashRows.map((r) => yearFromDate(r?.fecha_corte))
  ])]
    .filter(Number.isFinite)
    .sort((a, b) => b - a);

  let fallback = null;
  for (const year of years) {
    const incomeY = rowsForYear(incomeRows, year);
    const balanceY = rowsForYear(balanceRows, year);
    const cashY = rowsForYear(cashRows, year);
    const metric = computeDebtEbitda(incomeY, balanceY, cashY);
    const row = {
      nit,
      year,
      ...metric,
      income_rows: incomeY.length,
      balance_rows: balanceY.length,
      cash_rows: cashY.length
    };
    if (metric.status === "ok") return row;
    if (!fallback) fallback = row;
  }

  return fallback || {
    nit,
    year: years[0] || null,
    status: "nd",
    reason: "cannot_compute",
    deuda: null,
    ebitda: null,
    ratio: null,
    ebitda_source: "",
    income_rows: incomeRows.length,
    balance_rows: balanceRows.length,
    cash_rows: cashRows.length
  };
}

async function runPool(items, concurrency, worker) {
  const out = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= items.length) return;
      out[current] = await worker(items[current], current);
    }
  });
  await Promise.all(workers);
  return out;
}

function summarize(results) {
  const total = results.length;
  const ok = results.filter((r) => r.status === "ok").length;
  const nd = total - ok;
  const reasonCounts = {};
  for (const r of results.filter((x) => x.status !== "ok")) {
    reasonCounts[r.reason || "unknown"] = (reasonCounts[r.reason || "unknown"] || 0) + 1;
  }
  const ratios = results.filter((r) => Number.isFinite(r.ratio)).map((r) => r.ratio);
  const positives = ratios.filter((v) => v > 0).length;
  const negatives = ratios.filter((v) => v < 0).length;
  const zeros = ratios.filter((v) => v === 0).length;

  return {
    total_companies: total,
    ok_count: ok,
    nd_count: nd,
    ok_rate_pct: total ? Number(((ok / total) * 100).toFixed(2)) : 0,
    reason_counts: reasonCounts,
    ratio_distribution: {
      total_with_ratio: ratios.length,
      positive: positives,
      negative: negatives,
      zero: zeros
    }
  };
}

function buildMarkdown(summary, results) {
  const topHigh = results
    .filter((r) => Number.isFinite(r.ratio))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 15);

  const topLow = results
    .filter((r) => Number.isFinite(r.ratio))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 15);

  const ndSamples = results.filter((r) => r.status !== "ok").slice(0, 20);

  const lines = [];
  lines.push("# QA métrica Deuda / EBITDA (x)");
  lines.push("");
  lines.push(`- Fecha: ${new Date().toISOString()}`);
  lines.push(`- Empresas revisadas: ${summary.total_companies}`);
  lines.push(`- Métrica calculada OK: ${summary.ok_count}`);
  lines.push(`- N/D: ${summary.nd_count}`);
  lines.push(`- Tasa de cálculo OK: ${summary.ok_rate_pct}%`);
  lines.push("");
  lines.push("## Causas de N/D");
  Object.entries(summary.reason_counts).forEach(([k, v]) => lines.push(`- ${k}: ${v}`));
  if (!Object.keys(summary.reason_counts).length) lines.push("- Sin causas de N/D.");
  lines.push("");
  lines.push("## Distribución del ratio");
  lines.push(`- Con ratio calculado: ${summary.ratio_distribution.total_with_ratio}`);
  lines.push(`- Positivo: ${summary.ratio_distribution.positive}`);
  lines.push(`- Negativo: ${summary.ratio_distribution.negative}`);
  lines.push(`- Cero: ${summary.ratio_distribution.zero}`);
  lines.push("");
  lines.push("## Ratios más altos (top 15)");
  topHigh.forEach((r) => lines.push(`- NIT ${r.nit} | año ${r.year} | deuda/EBITDA ${r.ratio.toFixed(2)}x`));
  lines.push("");
  lines.push("## Ratios más bajos (top 15)");
  topLow.forEach((r) => lines.push(`- NIT ${r.nit} | año ${r.year} | deuda/EBITDA ${r.ratio.toFixed(2)}x`));
  lines.push("");
  lines.push("## Muestras N/D");
  ndSamples.forEach((r) => lines.push(`- NIT ${r.nit} | año ${r.year ?? "N/D"} | razón ${r.reason}`));
  if (!ndSamples.length) lines.push("- Sin casos N/D en esta muestra.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  console.log(`[deuda-ebitda] buscando candidatos (${SAMPLE_SIZE})...`);
  const nits = await getCandidateNits(SAMPLE_SIZE);
  if (!nits.length) throw new Error("No se encontraron NIT candidatos.");
  console.log(`[deuda-ebitda] candidatos listos: ${nits.length}`);

  let done = 0;
  const results = await runPool(nits, CONCURRENCY, async (nit) => {
    const r = await analyzeNit(nit);
    done += 1;
    if (done % 10 === 0 || done === nits.length) {
      console.log(`[deuda-ebitda] progreso ${done}/${nits.length}`);
    }
    return r;
  });

  const summary = summarize(results);
  const payload = {
    generated_at: new Date().toISOString(),
    sample_size: SAMPLE_SIZE,
    concurrency: CONCURRENCY,
    min_rows_per_nit: MIN_ROWS_PER_NIT,
    summary,
    results
  };

  const csvCols = [
    "nit", "year", "status", "reason", "deuda", "ebitda", "ratio",
    "ebitda_source", "income_rows", "balance_rows", "cash_rows"
  ];
  const csvLines = [csvCols.join(",")];
  results.forEach((r) => {
    csvLines.push(csvCols.map((c) => escCsv(r[c])).join(","));
  });

  await fs.writeFile("_tmp_deuda_ebitda_many.json", JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile("_tmp_deuda_ebitda_many.csv", csvLines.join("\n"), "utf8");
  await fs.writeFile("bot_training/reporte_deuda_ebitda_many.md", buildMarkdown(summary, results), "utf8");

  console.log("[deuda-ebitda] listo.");
  console.log(`[deuda-ebitda] OK ${summary.ok_count}/${summary.total_companies} (${summary.ok_rate_pct}%).`);
  console.log("[deuda-ebitda] archivos:");
  console.log("- _tmp_deuda_ebitda_many.json");
  console.log("- _tmp_deuda_ebitda_many.csv");
  console.log("- bot_training/reporte_deuda_ebitda_many.md");
}

main().catch((err) => {
  console.error(`[deuda-ebitda] error: ${clean(err?.message || err)}`);
  process.exit(1);
});
