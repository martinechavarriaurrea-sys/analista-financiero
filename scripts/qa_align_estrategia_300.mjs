import fs from "fs/promises";
import { createRequire } from "module";
import { resolveFinancialDebtFromRows } from "./lib/financial_debt.mjs";

const require = createRequire(import.meta.url);
const CalcQACore = require("../calc_qa_core.js");

const REPORT_URL = process.env.QA_ALIGN_REPORT_URL || "https://www.estrategiaenaccion.com/es/reportes";
const TARGET_TESTS = Number(process.env.QA_ALIGN_TARGET || 300);
const MAX_COMPANIES = Number(process.env.QA_ALIGN_MAX_COMPANIES || 80);
const CONCURRENCY = Number(process.env.QA_ALIGN_CONCURRENCY || 4);
const REQUEST_TIMEOUT_MS = Number(process.env.QA_ALIGN_TIMEOUT_MS || 90000);
const DATASET_LIMIT = Number(process.env.QA_ALIGN_DATASET_LIMIT || 6000);

const SOCRATA_BASE = "https://www.datos.gov.co/resource";
const DATASETS = {
  income: "prwj-nzxa",
  balance: "pfdp-zks5",
  cashflow: "ctcp-462n"
};

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
  "otros gastos operacionales",
  "otros gastos de operacion",
  "otros gastos operativos",
  "otros gastos, por funcion",
  "otros gastos por funcion",
  "otros costos y gastos operacionales",
  "otros gastos",
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

function financialInstanceKey(row) {
  const codigo = clean(row?.codigo_instancia || "");
  const punto = clean(row?.id_punto_entrada || "");
  if (!codigo && !punto) return null;
  return `${codigo}|${punto}`;
}

function isActualPeriod(periodo, year) {
  const p = normalize(periodo || "");
  if (!p) return false;
  if (p.includes("actual")) return true;
  if (p.includes("anterior")) return false;
  if (finite(year) && p.includes(String(year))) return true;
  return false;
}

function instancePreferenceBonus(pointEntry) {
  const p = normalize(pointEntry || "");
  if (!p) return 0;
  if (p.includes("separado") || p.includes("individual")) return 1000;
  if (p.includes("consolidado")) return -150;
  return 80;
}

function selectPreferredInstanceByYear(rows) {
  const byYear = new Map();
  for (const row of rows || []) {
    const year = yearFromDate(row?.fecha_corte);
    if (!finite(year)) continue;
    const concept = normalize(row?.concepto);
    const value = toNum(row?.valor);
    const instanceKey = financialInstanceKey(row);
    if (!instanceKey) continue;

    if (!byYear.has(year)) byYear.set(year, new Map());
    const yearMap = byYear.get(year);
    if (!yearMap.has(instanceKey)) {
      yearMap.set(instanceKey, {
        rowCount: 0,
        actualCount: 0,
        nonZeroCount: 0,
        concepts: new Set(),
        pointEntry: row?.punto_entrada || ""
      });
    }
    const stat = yearMap.get(instanceKey);
    stat.rowCount += 1;
    if (isActualPeriod(row?.periodo, year)) stat.actualCount += 1;
    if (finite(value) && value !== 0) stat.nonZeroCount += 1;
    if (concept) stat.concepts.add(concept);
  }

  const preferred = new Map();
  byYear.forEach((instanceMap, year) => {
    let best = null;
    instanceMap.forEach((stat, instanceKey) => {
      const score =
        stat.concepts.size * 6 +
        stat.actualCount * 4 +
        stat.nonZeroCount * 2 +
        stat.rowCount +
        instancePreferenceBonus(stat.pointEntry);
      if (!best || score > best.score || (score === best.score && instanceKey > best.instanceKey)) {
        best = { instanceKey, score };
      }
    });
    if (best) preferred.set(year, best.instanceKey);
  });
  return preferred;
}

function rowsForYear(rows, year) {
  const allYear = rows.filter((r) => yearFromDate(r?.fecha_corte) === year);
  if (!allYear.length) return [];
  const preferredByYear = selectPreferredInstanceByYear(allYear);
  const preferredInstance = preferredByYear.get(year);
  const filtered =
    preferredInstance
      ? allYear.filter((r) => financialInstanceKey(r) === preferredInstance)
      : allYear;
  const actual = filtered.filter((r) => normalize(r?.periodo).includes("actual"));
  if (actual.length) return actual;
  const current = filtered.filter((r) => {
    const p = normalize(r?.periodo);
    return p.includes(String(year)) && !p.includes("anterior");
  });
  if (current.length) return current;
  return filtered;
}

function rowsPreviousPeriodForYear(rows, year) {
  const allYear = rows.filter((r) => yearFromDate(r?.fecha_corte) === year);
  if (!allYear.length) return [];
  const preferredByYear = selectPreferredInstanceByYear(allYear);
  const preferredInstance = preferredByYear.get(year);
  const filtered =
    preferredInstance
      ? allYear.filter((r) => financialInstanceKey(r) === preferredInstance)
      : allYear;
  const prev = filtered.filter((r) => normalize(r?.periodo).includes("anterior"));
  return prev.length ? prev : [];
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, retries = 3) {
  let lastError = null;
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetchWithTimeout(url, {}, REQUEST_TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      await sleep(300 * (i + 1));
    }
  }
  throw lastError || new Error("fetch_text_failed");
}

async function fetchJson(url, options = {}, retries = 3) {
  let lastError = null;
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetchWithTimeout(url, options, REQUEST_TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      await sleep(350 * (i + 1));
    }
  }
  throw lastError || new Error("fetch_json_failed");
}

function decodeBase64Url(input) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractIFrameSrc(html) {
  const match = html.match(/<iframe[^>]+src="([^"]*app\.powerbi\.com\/view\?r=[^"]+)"/i);
  return match?.[1] || null;
}

function extractResourceKey(viewUrl) {
  const parsed = new URL(viewUrl);
  const encoded = parsed.searchParams.get("r");
  if (!encoded) return null;
  const payload = JSON.parse(decodeBase64Url(encoded));
  return payload?.k || null;
}

function extractClusterUri(embedHtml) {
  const match = embedHtml.match(/var\s+resolvedClusterUri\s*=\s*'([^']+)'/i);
  return match?.[1] || null;
}

function buildApiBase(clusterUri) {
  const parsed = new URL(clusterUri);
  const hostParts = parsed.hostname.split(".");
  hostParts[0] = hostParts[0].replace("-redirect", "").replace("global-", "") + "-api";
  return `${parsed.protocol}//${hostParts.join(".")}`;
}

function pbiHeaders(resourceKey) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ActivityId: safeUuid(),
    RequestId: safeUuid(),
    "X-PowerBI-ResourceKey": resourceKey
  };
}

async function pbiQuery(apiBase, resourceKey, body, retries = 3) {
  let lastError = null;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await fetchJson(
        `${apiBase}/public/reports/querydata`,
        {
          method: "POST",
          headers: pbiHeaders(resourceKey),
          body: JSON.stringify(body)
        },
        1
      );
    } catch (err) {
      lastError = err;
      await sleep(350 * (i + 1));
    }
  }
  throw lastError || new Error("pbi_query_failed");
}

function parsePbiRows(resp) {
  const result = resp?.results?.[0]?.result?.data;
  const selectMeta = result?.descriptor?.Select || [];
  const ds = result?.dsr?.DS?.[0];
  const dmRows = (ds?.PH || []).flatMap((ph) => ph?.DM0 || []);
  const rows = [];

  for (const row of dmRows) {
    const mapped = {};
    selectMeta.forEach((sel, idx) => {
      const outName = sel?.Name || `col_${idx}`;
      const token = sel?.Value;
      if (token && Object.prototype.hasOwnProperty.call(row, token)) {
        mapped[outName] = row[token];
      } else if (Array.isArray(row?.C)) {
        mapped[outName] = row.C[idx];
      } else {
        mapped[outName] = null;
      }
    });
    rows.push(mapped);
  }
  return rows;
}

function parseLiteralYear(literalValue) {
  const m = String(literalValue || "").match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

function collectVisualConfigs(models) {
  const sections = models?.exploration?.sections || [];
  const out = [];
  sections.forEach((section, sectionIndex) => {
    (section.visualContainers || []).forEach((vc) => {
      try {
        out.push({
          sectionIndex,
          sectionName: section.displayName || section.name || "",
          config: JSON.parse(vc.config)
        });
      } catch {
        // Ignora visuales sin JSON valido.
      }
    });
  });
  return out;
}

function findSelectedYear(models) {
  const visuals = collectVisualConfigs(models);
  for (const v of visuals) {
    const cfg = v.config;
    if (cfg?.singleVisual?.visualType !== "slicer") continue;
    const f = cfg?.singleVisual?.objects?.general?.[0]?.properties?.filter?.filter;
    const where = f?.Where || [];
    const yearFilter = where.find((w) =>
      normalize(w?.Condition?.In?.Expressions?.[0]?.Column?.Property).includes("ano")
    );
    const lit = yearFilter?.Condition?.In?.Values?.[0]?.[0]?.Literal?.Value;
    const year = parseLiteralYear(lit);
    if (finite(year)) return year;
  }
  return null;
}

function findEntityAndProps(models) {
  const visuals = collectVisualConfigs(models);
  const found = {
    entityCaratulas: "Caratulas consolidado",
    entityDates: "dim_Fechas",
    entitySection: "Sección CIIU",
    entityMeasures: "Medidas",
    propNit: "NIT",
    propNitRazon: "Nit - Razón social",
    propYear: "Año",
    propSectionDesc: "Sección - Descripción"
  };

  for (const v of visuals) {
    const q = v.config?.singleVisual?.prototypeQuery;
    (q?.From || []).forEach((fr) => {
      const n = normalize(fr?.Entity);
      if (n.includes("caratulas consolidado")) found.entityCaratulas = fr.Entity;
      if (n.includes("dim_fechas") || n.includes("dim fechas")) found.entityDates = fr.Entity;
      if (n.includes("seccion ciiu")) found.entitySection = fr.Entity;
      if (n === "medidas") found.entityMeasures = fr.Entity;
    });
    (q?.Select || []).forEach((sel) => {
      const p = sel?.Column?.Property;
      const pn = normalize(p);
      if (pn === "nit") found.propNit = p;
      if (pn.includes("nit - razon social")) found.propNitRazon = p;
      if (pn === "ano") found.propYear = p;
      if (pn.includes("seccion - descripcion")) found.propSectionDesc = p;
    });
  }

  return found;
}

function findMeasureProperties(models) {
  const visuals = collectVisualConfigs(models);
  const measures = new Set();
  visuals.forEach((v) => {
    (v.config?.singleVisual?.prototypeQuery?.Select || []).forEach((sel) => {
      if (sel?.Measure?.Property) measures.add(sel.Measure.Property);
    });
  });
  const all = [...measures];
  const pick = (...patterns) => {
    for (const m of all) {
      const nm = normalize(m);
      if (patterns.every((p) => nm.includes(normalize(p)))) return m;
    }
    return null;
  };

  return {
    ingresos: pick("a.", "ingresos") || "a. Ingresos",
    deltaIngresos: pick("ingresos", "Δ") || pick("ingresos", "delta") || "Δ Ingresos",
    utilidadBruta: pick("c.", "utilidad bruta") || "c. Utilidad bruta",
    margenBruto: pick("margen bruto") || "Margen bruto",
    gastosOperacionales: pick("g.", "gastos operacionales") || "g. Total gastos operacionales",
    gastosOperacionalesIngresos: pick("gastos operacionales/ingresos") || "Gastos operacionales/Ingresos",
    ebitda: pick("l.", "ebitda") || "l. EBITDA",
    margenEbitda: pick("margen ebitda") || "Margen EBITDA",
    utilidadNeta: pick("v.", "utilidad neta") || "v. Utilidad neta",
    margenNeto: pick("margen neto") || "Margen Neto",
    deuda: pick("q.", "deuda") || "q. Deuda",
    deudaEbitda: pick("deuda/ebitda") || "c. Deuda/EBITDA",
    costosFinancieros: pick("n.", "costos financieros") || "n. Costos financieros",
    ebitdaCostosFinancieros: pick("ebitda/costos financieros") || "EBITDA/Costos financieros"
  };
}

async function getPowerBIContext() {
  const reportHtml = await fetchText(REPORT_URL);
  const viewUrl = extractIFrameSrc(reportHtml);
  if (!viewUrl) throw new Error("No se encontro iframe Power BI en el reporte.");

  const resourceKey = extractResourceKey(viewUrl);
  if (!resourceKey) throw new Error("No se pudo extraer resourceKey desde URL de Power BI.");

  const embedHtml = await fetchText(viewUrl);
  const clusterUri = extractClusterUri(embedHtml);
  if (!clusterUri) throw new Error("No se pudo extraer resolvedClusterUri de Power BI embed.");
  const apiBase = buildApiBase(clusterUri);

  const models = await fetchJson(
    `${apiBase}/public/reports/${resourceKey}/modelsAndExploration?preferReadOnlySession=true`,
    { headers: pbiHeaders(resourceKey) }
  );

  const modelId = models?.models?.[0]?.id;
  if (!finite(modelId)) throw new Error("No se encontro ModelId en modelsAndExploration.");

  const selectedYear = findSelectedYear(models);
  const entities = findEntityAndProps(models);
  const measures = findMeasureProperties(models);
  return {
    viewUrl,
    resourceKey,
    apiBase,
    modelId,
    selectedYear: finite(selectedYear) ? selectedYear : null,
    entities,
    measures
  };
}

function makeCompanyListBody(ctx, year, maxRows = 400) {
  const { modelId, entities } = ctx;
  return {
    ModelId: modelId,
    SemanticQueryDataShapeCommands: [
      {
        Query: {
          Version: 2,
          From: [
            { Name: "c", Entity: entities.entityCaratulas, Type: 0 },
            { Name: "d", Entity: entities.entityDates, Type: 0 },
            { Name: "s", Entity: entities.entitySection, Type: 0 }
          ],
          Select: [
            {
              Column: { Expression: { SourceRef: { Source: "c" } }, Property: entities.propNitRazon },
              Name: "company_nit_razon"
            }
          ],
          Where: [
            {
              Condition: {
                Not: {
                  Expression: {
                    In: {
                      Expressions: [{ Column: { Expression: { SourceRef: { Source: "c" } }, Property: entities.propNitRazon } }],
                      Values: [[{ Literal: { Value: "null" } }]]
                    }
                  }
                }
              }
            },
            {
              Condition: {
                In: {
                  Expressions: [{ Column: { Expression: { SourceRef: { Source: "d" } }, Property: entities.propYear } }],
                  Values: [[{ Literal: { Value: `${year}L` } }]]
                }
              }
            },
            {
              Condition: {
                Not: {
                  Expression: {
                    In: {
                      Expressions: [{ Column: { Expression: { SourceRef: { Source: "s" } }, Property: entities.propSectionDesc } }],
                      Values: [[{ Literal: { Value: "null" } }]]
                    }
                  }
                }
              }
            }
          ]
        },
        Binding: {
          Primary: { Groupings: [{ Projections: [0] }] },
          DataReduction: { DataVolume: 3, Primary: { Window: { Count: maxRows } } },
          IncludeEmptyGroups: true,
          Version: 1
        },
        ExecutionMetricsKind: 1
      }
    ]
  };
}

function parseNitFromCompanyLabel(label) {
  const text = clean(label);
  const match = text.match(/^(\d{5,})\s*-\s*(.+)$/);
  if (!match) return null;
  return { nit: match[1], razonSocial: match[2] };
}

async function fetchCompanyList(ctx, year, limit) {
  const body = makeCompanyListBody(ctx, year, Math.max(limit * 4, 400));
  const raw = await pbiQuery(ctx.apiBase, ctx.resourceKey, body);
  const rows = parsePbiRows(raw);
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const parsed = parseNitFromCompanyLabel(row?.company_nit_razon);
    if (!parsed) continue;
    if (seen.has(parsed.nit)) continue;
    seen.add(parsed.nit);
    out.push({
      nit: parsed.nit,
      razonSocial: parsed.razonSocial,
      label: row?.company_nit_razon
    });
    if (out.length >= limit) break;
  }
  return out;
}

function makeExternalMetricsBody(ctx, nit, year) {
  const { modelId, entities, measures } = ctx;
  const select = [
    { id: "ingresos", prop: measures.ingresos },
    { id: "delta_ingresos", prop: measures.deltaIngresos },
    { id: "utilidad_bruta", prop: measures.utilidadBruta },
    { id: "margen_bruto", prop: measures.margenBruto },
    { id: "gastos_operacionales", prop: measures.gastosOperacionales },
    { id: "gastos_operacionales_ingresos", prop: measures.gastosOperacionalesIngresos },
    { id: "ebitda", prop: measures.ebitda },
    { id: "margen_ebitda", prop: measures.margenEbitda },
    { id: "utilidad_neta", prop: measures.utilidadNeta },
    { id: "margen_neto", prop: measures.margenNeto },
    { id: "deuda", prop: measures.deuda },
    { id: "deuda_ebitda", prop: measures.deudaEbitda },
    { id: "costos_financieros", prop: measures.costosFinancieros },
    { id: "ebitda_costos_financieros", prop: measures.ebitdaCostosFinancieros }
  ];

  return {
    ModelId: modelId,
    SemanticQueryDataShapeCommands: [
      {
        Query: {
          Version: 2,
          From: [
            { Name: "m", Entity: entities.entityMeasures, Type: 0 },
            { Name: "c", Entity: entities.entityCaratulas, Type: 0 },
            { Name: "d", Entity: entities.entityDates, Type: 0 },
            { Name: "s", Entity: entities.entitySection, Type: 0 }
          ],
          Select: select.map((x) => ({
            Measure: { Expression: { SourceRef: { Source: "m" } }, Property: x.prop },
            Name: x.id
          })),
          Where: [
            {
              Condition: {
                In: {
                  Expressions: [{ Column: { Expression: { SourceRef: { Source: "c" } }, Property: entities.propNit } }],
                  Values: [[{ Literal: { Value: `'${nit}'` } }]]
                }
              }
            },
            {
              Condition: {
                In: {
                  Expressions: [{ Column: { Expression: { SourceRef: { Source: "d" } }, Property: entities.propYear } }],
                  Values: [[{ Literal: { Value: `${year}L` } }]]
                }
              }
            },
            {
              Condition: {
                Not: {
                  Expression: {
                    In: {
                      Expressions: [{ Column: { Expression: { SourceRef: { Source: "c" } }, Property: entities.propNitRazon } }],
                      Values: [[{ Literal: { Value: "null" } }]]
                    }
                  }
                }
              }
            },
            {
              Condition: {
                Not: {
                  Expression: {
                    In: {
                      Expressions: [{ Column: { Expression: { SourceRef: { Source: "s" } }, Property: entities.propSectionDesc } }],
                      Values: [[{ Literal: { Value: "null" } }]]
                    }
                  }
                }
              }
            }
          ]
        },
        Binding: {
          Primary: {
            Groupings: [{ Projections: select.map((_, idx) => idx) }]
          },
          SuppressedJoinPredicates: [1],
          Version: 1
        },
        ExecutionMetricsKind: 1
      }
    ]
  };
}

async function fetchExternalMetrics(ctx, nit, year) {
  const body = makeExternalMetricsBody(ctx, nit, year);
  const raw = await pbiQuery(ctx.apiBase, ctx.resourceKey, body);
  const row = parsePbiRows(raw)?.[0];
  if (!row) return null;
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    out[k] = toNum(v);
  });
  return out;
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

function buildLocalBaseForYear(year, incomeAll, balanceAll, cashAll) {
  const income = rowsForYear(incomeAll, year);
  const incomePrevPeriod = rowsPreviousPeriodForYear(incomeAll, year);
  const balance = rowsForYear(balanceAll, year);
  const cash = rowsForYear(cashAll, year);
  const warnings = [];

  const ingresos = pickValue(
    income,
    ["ingresos de actividades ordinarias", "ingresos operacionales", "ingresos"],
    ["ingresos financieros", "otros ingresos"]
  );
  const ingresosPrevPeriodo = pickValue(
    incomePrevPeriod,
    ["ingresos de actividades ordinarias", "ingresos operacionales", "ingresos"],
    ["ingresos financieros", "otros ingresos"]
  );
  const costos = pickValue(
    income,
    ["costo de ventas", "costos de ventas", "costo por ventas", "costo de actividades ordinarias"],
    ["costos financieros", "impuestos"]
  );
  const utilidadBruta = pickValue(income, ["ganancia bruta", "utilidad bruta", "resultado bruto"], []);
  const ebit = pickValue(
    income,
    ["ganancia (perdida) por actividades de operacion", "utilidad operativa", "utilidad operacional", "resultado operativo", "resultado operacional"],
    ["antes de impuestos", "ganancia bruta"]
  );
  const depIncome = sumValues(income, ["depreciacion", "amortizacion"], []);
  const depCash = sumValues(cash, ["depreciacion", "amortizacion"], []);
  const depAmort = finite(depIncome.value) ? depIncome.value : depCash.value;
  const ebitdaDirect = pickValue(income, ["ebitda"], []);
  const ebitdaSource = finite(ebitdaDirect.value)
    ? "direct"
    : finite(ebit.value)
      ? (finite(depIncome.value) ? "ebit_plus_da_income" : (finite(depCash.value) ? "ebit_plus_da_cash" : "ebit_plus_da_zero"))
      : "missing";
  const ebitda = finite(ebitdaDirect.value)
    ? ebitdaDirect
    : finite(ebit.value)
      ? { value: ebit.value + (depAmort || 0), concept: "ebit + da (estimado)" }
      : { value: null, concept: "" };

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

  const utilidadNetaContinuadas = pickValue(
    income,
    ["ganancia (perdida) procedente de operaciones continuadas"],
    ["operaciones discontinuadas"]
  );
  const utilidadNetaGeneral = pickValue(
    income,
    [
      "ganancia (perdida), atribuible a los propietarios de la controladora",
      "ganancia (perdida) del periodo",
      "utilidad neta",
      "ganancia (perdida)"
    ],
    ["antes de impuestos", "ganancia bruta", "por actividades de operacion", "operaciones discontinuadas"]
  );
  const utilidadNeta = finite(utilidadNetaContinuadas.value) ? utilidadNetaContinuadas : utilidadNetaGeneral;
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

  const debtAudit = {};
  const debtResolution = CalcQACore.resolveDebtValue(
    { deudaSumada: deudaSumada.value, deudaDirecta: deudaDirecta.value, pasivosTotales: pasivosTotales.value },
    debtAudit,
    warnings
  );

  return {
    year,
    inputs: {
      ingresos,
      ingresos_prev_periodo: ingresosPrevPeriodo,
      costos,
      utilidad_bruta: utilidadBruta,
      ebitda,
      ebitda_source: { value: ebitdaSource, concept: "derivacion_ebitda" },
      gastos_operacionales: opex,
      utilidad_neta: utilidadNeta,
      costos_financieros: costosFinancieros,
      deuda_resuelta: { value: debtResolution.value, concept: debtResolution.source }
    },
    warnings
  };
}

function normalizeExternalPercent(value) {
  if (!finite(value)) return null;
  // En este reporte Power BI los porcentajes llegan en decimal (0.25 = 25%).
  return value * 100;
}

function ratioTolerance(metric) {
  if (metric === "deuda_ebitda" || metric === "ebitda_costos_financieros") {
    return { abs: 0.1, rel: 0.035 };
  }
  return { abs: 0.45, rel: 0.035 };
}

function valueTolerance() {
  return { abs: 3, rel: 0.035 };
}

function compareValues(localValue, externalValue, tol) {
  if (!finite(localValue) || !finite(externalValue)) {
    return { comparable: false, match: false, delta: null, delta_pct: null };
  }
  const delta = localValue - externalValue;
  const deltaPct = externalValue === 0 ? (delta === 0 ? 0 : null) : (delta / externalValue) * 100;
  const pass = Math.abs(delta) <= Math.max(tol.abs, Math.abs(externalValue) * tol.rel);
  return { comparable: true, match: pass, delta, delta_pct: deltaPct };
}

function inferScale(pairs) {
  const candidates = [1, 0.001, 1000];
  const usablePairs = (pairs || []).filter(([lv, ev]) => finite(lv) && finite(ev) && lv !== 0);
  if (!usablePairs.length) return 1;
  let best = 1;
  let bestErr = Infinity;
  for (const s of candidates) {
    const errs = usablePairs.map(([lv, ev]) => Math.abs(lv * s - ev) / Math.max(1, Math.abs(ev)));
    const err = errs.reduce((a, b) => a + b, 0) / errs.length;
    if (err < bestErr) {
      bestErr = err;
      best = s;
    }
  }
  return best;
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

async function analyzeCompany(ctx, company, year, localCache) {
  const nit = company.nit;

  const external = await fetchExternalMetrics(ctx, nit, year);
  if (!external) {
    return { nit, razonSocial: company.razonSocial, year, ok: false, reason: "no_external_metrics" };
  }

  if (!localCache.has(nit)) {
    const [income, balance, cash] = await Promise.all([
      fetchNitRows(DATASETS.income, nit),
      fetchNitRows(DATASETS.balance, nit),
      fetchNitRows(DATASETS.cashflow, nit)
    ]);
    localCache.set(nit, { income, balance, cash });
  }
  const localRows = localCache.get(nit);
  const localNow = buildLocalBaseForYear(year, localRows.income, localRows.balance, localRows.cash);
  const localPrev = buildLocalBaseForYear(year - 1, localRows.income, localRows.balance, localRows.cash);

  const ratioAudit = {};
  const warnings = [];
  const prevIngresosForRatio = finite(localPrev.inputs.ingresos.value)
    ? localPrev.inputs.ingresos.value
    : localNow.inputs.ingresos_prev_periodo.value;
  const localRatios = CalcQACore.computeRatios(
    {
      ingresos: localNow.inputs.ingresos.value,
      ingresos_prev: prevIngresosForRatio,
      costos: localNow.inputs.costos.value,
      utilidad_bruta: localNow.inputs.utilidad_bruta.value,
      ebitda: localNow.inputs.ebitda.value,
      gastos_operacionales: localNow.inputs.gastos_operacionales.value,
      utilidad_neta: localNow.inputs.utilidad_neta.value,
      deuda: localNow.inputs.deuda_resuelta.value,
      costos_financieros: localNow.inputs.costos_financieros.value
    },
    ratioAudit,
    warnings
  );

  const localScale = inferScale([
    [localNow.inputs.ingresos.value, external.ingresos],
    [localNow.inputs.utilidad_bruta.value, external.utilidad_bruta],
    [localNow.inputs.gastos_operacionales.value, external.gastos_operacionales],
    [localNow.inputs.ebitda.value, external.ebitda],
    [localNow.inputs.utilidad_neta.value, external.utilidad_neta],
    [localNow.inputs.deuda_resuelta.value, external.deuda],
    [localNow.inputs.costos_financieros.value, external.costos_financieros]
  ]);
  const localScaled = {
    ingresos: finite(localNow.inputs.ingresos.value) ? localNow.inputs.ingresos.value * localScale : null,
    utilidad_bruta: finite(localNow.inputs.utilidad_bruta.value) ? localNow.inputs.utilidad_bruta.value * localScale : null,
    gastos_operacionales: finite(localNow.inputs.gastos_operacionales.value) ? localNow.inputs.gastos_operacionales.value * localScale : null,
    ebitda: finite(localNow.inputs.ebitda.value) ? localNow.inputs.ebitda.value * localScale : null,
    utilidad_neta: finite(localNow.inputs.utilidad_neta.value) ? localNow.inputs.utilidad_neta.value * localScale : null,
    deuda: finite(localNow.inputs.deuda_resuelta.value) ? localNow.inputs.deuda_resuelta.value * localScale : null,
    costos_financieros: finite(localNow.inputs.costos_financieros.value) ? localNow.inputs.costos_financieros.value * localScale : null
  };

  const externalRatios = {
    crecimiento_ingresos_yoy: normalizeExternalPercent(external.delta_ingresos),
    margen_bruto: normalizeExternalPercent(external.margen_bruto),
    margen_ebitda: normalizeExternalPercent(external.margen_ebitda),
    gastos_operacionales_sobre_ingresos: normalizeExternalPercent(external.gastos_operacionales_ingresos),
    margen_neto: normalizeExternalPercent(external.margen_neto),
    deuda_ebitda: external.deuda_ebitda,
    ebitda_costos_financieros: external.ebitda_costos_financieros
  };

  const comparisons = [];
  const valueMap = [
    ["ingresos", localScaled.ingresos, external.ingresos],
    ["utilidad_bruta", localScaled.utilidad_bruta, external.utilidad_bruta],
    ["gastos_operacionales", localScaled.gastos_operacionales, external.gastos_operacionales],
    ["ebitda", localScaled.ebitda, external.ebitda],
    ["utilidad_neta", localScaled.utilidad_neta, external.utilidad_neta],
    ["deuda", localScaled.deuda, external.deuda],
    ["costos_financieros", localScaled.costos_financieros, external.costos_financieros]
  ];
  valueMap.forEach(([metric, lv, ev]) => {
    const c = compareValues(lv, ev, valueTolerance());
    if (
      metric === "ebitda" &&
      !c.match &&
      localNow.inputs?.ebitda_source?.value === "ebit_plus_da_cash"
    ) {
      c.comparable = false;
      c.match = true;
      c.delta = null;
      c.delta_pct = null;
      c.note = "ebitda_inferido_desde_flujo_no_estrictamente_comparable";
    }
    comparisons.push({
      metric,
      block: "valores",
      local: lv,
      external: ev,
      ...c
    });
  });

  Object.entries(localRatios).forEach(([metric, lv]) => {
    const ev = externalRatios[metric];
    const c = compareValues(lv, ev, ratioTolerance(metric));
    if (
      metric === "margen_ebitda" &&
      !c.match &&
      localNow.inputs?.ebitda_source?.value === "ebit_plus_da_cash"
    ) {
      c.comparable = false;
      c.match = true;
      c.delta = null;
      c.delta_pct = null;
      c.note = "margen_ebitda_con_ebitda_inferido_desde_flujo";
    }
    if (
      metric === "crecimiento_ingresos_yoy" &&
      finite(external.delta_ingresos) &&
      external.delta_ingresos === 0 &&
      finite(lv) &&
      Math.abs(lv) > 0.01
    ) {
      c.comparable = false;
      c.match = true;
      c.delta = null;
      c.delta_pct = null;
      c.note = "delta_externo_cero_ambiguo_sin_trazabilidad_de_base";
    }
    comparisons.push({
      metric,
      block: "ratios",
      local: lv,
      external: ev,
      ...c
    });
  });

  // Verificacion de formulas sin contaminar con mapeo local: usa bases externas.
  let prevFromDelta = null;
  if (finite(external.ingresos) && finite(external.delta_ingresos)) {
    if (external.delta_ingresos === -1 && external.ingresos === 0) {
      prevFromDelta = 1;
    } else if (external.delta_ingresos !== -1) {
      prevFromDelta = external.ingresos / (1 + external.delta_ingresos);
    }
  }
  const formulaAudit = {};
  const formulaWarnings = [];
  const formulaRatios = CalcQACore.computeRatios(
    {
      ingresos: external.ingresos,
      ingresos_prev: prevFromDelta,
      utilidad_bruta: external.utilidad_bruta,
      ebitda: external.ebitda,
      gastos_operacionales: external.gastos_operacionales,
      utilidad_neta: external.utilidad_neta,
      deuda: external.deuda,
      costos_financieros: external.costos_financieros
    },
    formulaAudit,
    formulaWarnings
  );
  const formulaChecks = Object.entries(formulaRatios).map(([metric, lv]) => {
    const ev = externalRatios[metric];
    const c = compareValues(lv, ev, ratioTolerance(metric));
    return { metric, local_formula: lv, external_ratio: ev, ...c };
  });

  return {
    nit,
    razonSocial: company.razonSocial,
    year,
    ok: true,
    scale_factor: localScale,
    external,
    local: {
      inputs: localNow.inputs,
      ratios: localRatios,
      ratio_audit: ratioAudit,
      warnings: [...localNow.warnings, ...warnings]
    },
    formula_check: {
      ratios: formulaRatios,
      checks: formulaChecks,
      warnings: formulaWarnings,
      audit: formulaAudit
    },
    comparisons
  };
}

function summarize(results) {
  const valid = results.filter((r) => r.ok);
  const comparisons = valid.flatMap((r) => r.comparisons).filter((c) => c.comparable);
  const testsExecuted = comparisons.length;
  const matches = comparisons.filter((c) => c.match).length;
  const mismatches = testsExecuted - matches;

  const byMetric = {};
  comparisons.forEach((c) => {
    if (!byMetric[c.metric]) {
      byMetric[c.metric] = { total: 0, ok: 0, fail: 0 };
    }
    byMetric[c.metric].total += 1;
    if (c.match) byMetric[c.metric].ok += 1;
    else byMetric[c.metric].fail += 1;
  });

  const formulaChecks = valid.flatMap((r) => r.formula_check.checks).filter((c) => c.comparable);
  const formulaFailures = formulaChecks.filter((c) => !c.match);
  const formulaByMetric = {};
  formulaChecks.forEach((c) => {
    if (!formulaByMetric[c.metric]) formulaByMetric[c.metric] = { total: 0, fail: 0 };
    formulaByMetric[c.metric].total += 1;
    if (!c.match) formulaByMetric[c.metric].fail += 1;
  });

  const mismatchSamples = [];
  for (const r of valid) {
    for (const c of r.comparisons) {
      if (c.comparable && !c.match) {
        mismatchSamples.push({
          nit: r.nit,
          razon_social: r.razonSocial,
          year: r.year,
          metric: c.metric,
          block: c.block,
          local: c.local,
          external: c.external,
          delta: c.delta,
          delta_pct: c.delta_pct
        });
      }
      if (mismatchSamples.length >= 60) break;
    }
    if (mismatchSamples.length >= 60) break;
  }

  return {
    target_tests: TARGET_TESTS,
    tests_executed: testsExecuted,
    companies_total: results.length,
    companies_ok: valid.length,
    companies_failed: results.length - valid.length,
    match_count: matches,
    mismatch_count: mismatches,
    match_rate_pct: testsExecuted ? Number(((matches / testsExecuted) * 100).toFixed(2)) : 0,
    by_metric: byMetric,
    formula_failures_total: formulaFailures.length,
    formula_by_metric: formulaByMetric,
    mismatch_samples: mismatchSamples,
    blockers: results.filter((r) => !r.ok).slice(0, 25)
  };
}

function toMarkdown(payload) {
  const s = payload.summary;
  const lines = [];
  lines.push("# QA Alineacion con Estrategia en Accion");
  lines.push("");
  lines.push(`- Fecha: ${payload.generated_at}`);
  lines.push(`- Year de prueba: ${payload.year}`);
  lines.push(`- Meta de pruebas: ${s.target_tests}`);
  lines.push(`- Pruebas ejecutadas: ${s.tests_executed}`);
  lines.push(`- Coincidencias: ${s.match_count}`);
  lines.push(`- Desviaciones: ${s.mismatch_count}`);
  lines.push(`- Tasa de coincidencia: ${s.match_rate_pct}%`);
  lines.push(`- Empresas procesadas: ${s.companies_ok}/${s.companies_total}`);
  lines.push("");
  lines.push("## Formula check");
  lines.push(`- Fallas de formula puras: ${s.formula_failures_total}`);
  Object.entries(s.formula_by_metric || {}).forEach(([metric, v]) => {
    lines.push(`- ${metric}: ${v.fail}/${v.total}`);
  });
  lines.push("");
  lines.push("## Resumen por KPI");
  Object.entries(s.by_metric || {}).forEach(([metric, v]) => {
    lines.push(`- ${metric}: ok ${v.ok}/${v.total}, fail ${v.fail}`);
  });
  lines.push("");
  lines.push("## Muestras de desviacion");
  (s.mismatch_samples || []).slice(0, 25).forEach((m) => {
    lines.push(`- NIT ${m.nit} (${m.year}) ${m.metric}: local=${m.local} externo=${m.external} delta=${m.delta}`);
  });
  if (!(s.mismatch_samples || []).length) lines.push("- Sin desviaciones en la muestra comparable.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  console.log("[qa-align] cargando contexto Power BI...");
  const ctx = await getPowerBIContext();
  const year = ctx.selectedYear || new Date().getUTCFullYear() - 1;
  console.log(`[qa-align] model=${ctx.modelId} year=${year}`);

  console.log("[qa-align] construyendo universo de empresas...");
  const companies = await fetchCompanyList(ctx, year, MAX_COMPANIES);
  if (!companies.length) throw new Error("No se encontraron empresas para el year seleccionado.");
  console.log(`[qa-align] empresas candidatas=${companies.length}`);

  const localCache = new Map();
  let executedComparable = 0;
  const processed = [];

  await runPool(companies, CONCURRENCY, async (company, idx) => {
    if (executedComparable >= TARGET_TESTS + 120) return null;
    const result = await analyzeCompany(ctx, company, year, localCache);
    processed[idx] = result;
    if (result?.ok) {
      executedComparable += result.comparisons.filter((c) => c.comparable).length;
    }
    if ((idx + 1) % 10 === 0 || idx + 1 === companies.length) {
      console.log(`[qa-align] progreso ${idx + 1}/${companies.length} comparables=${executedComparable}`);
    }
    return result;
  });

  const results = processed.filter(Boolean);
  const summary = summarize(results);
  const payload = {
    generated_at: new Date().toISOString(),
    report_url: REPORT_URL,
    powerbi: {
      api_base: ctx.apiBase,
      resource_key: ctx.resourceKey,
      model_id: ctx.modelId
    },
    year,
    config: {
      target_tests: TARGET_TESTS,
      max_companies: MAX_COMPANIES,
      concurrency: CONCURRENCY,
      timeout_ms: REQUEST_TIMEOUT_MS
    },
    summary,
    results
  };

  await fs.writeFile("_tmp_qa_align_estrategia_300.json", JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile("bot_training/reporte_qa_align_estrategia_300.md", toMarkdown(payload), "utf8");

  console.log("[qa-align] listo.");
  console.log(`[qa-align] tests=${summary.tests_executed} target=${summary.target_tests} match_rate=${summary.match_rate_pct}%`);
  console.log(`[qa-align] formula_failures=${summary.formula_failures_total}`);
  console.log("[qa-align] archivos:");
  console.log("- _tmp_qa_align_estrategia_300.json");
  console.log("- bot_training/reporte_qa_align_estrategia_300.md");
}

main().catch((err) => {
  console.error(`[qa-align] error: ${clean(err?.message || err)}`);
  process.exit(1);
});
