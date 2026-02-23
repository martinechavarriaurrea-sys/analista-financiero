import fs from "fs/promises";
import { resolveFinancialDebtFromRows } from "./lib/financial_debt.mjs";
import { buildChatBank } from "./lib/bot_chat_bank.mjs";

const ADVISOR_URL = process.env.ADVISOR_URL || "http://127.0.0.1:8787/api/advisor";
const HEALTH_URL = process.env.ADVISOR_HEALTH_URL || "http://127.0.0.1:8787/health";
const TOTAL_CHATS = Number(process.env.BOT_STRESS_CHATS || process.env.BOT_STRESS_QUESTIONS || 1000);
const STRESS_FAST = String(process.env.BOT_STRESS_FAST || "1").toLowerCase() === "1";
const PAGE_SIZE = 5000;
const MAX_OFFSET = 100000;
const SOCRATA_BASE = "https://www.datos.gov.co/resource";
const DATASETS = {
  income: "prwj-nzxa",
  balance: "pfdp-zks5",
  cashflow: "ctcp-462n"
};

const DEFAULT_COMPANIES = [
  { nit: "890900240", razon_social: "CEMENTOS ARGOS S.A." },
  { nit: "860002523", razon_social: "EMPRESA NIT 860002523" },
  { nit: "900328533", razon_social: "EMPRESA NIT 900328533" },
  { nit: "890304403", razon_social: "EMPRESA NIT 890304403" },
  { nit: "860054073", razon_social: "EMPRESA NIT 860054073" }
];

const COMPANIES = parseCompanies(process.env.BOT_STRESS_COMPANIES) || DEFAULT_COMPANIES;
const RUN_TAG = `${TOTAL_CHATS}chatx${COMPANIES.length}`;

function parseCompanies(raw) {
  const text = clean(raw || "");
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length) {
      const out = parsed
        .map((item) => ({
          nit: clean(item?.nit || ""),
          razon_social: clean(item?.razon_social || item?.razonSocial || "") || `EMPRESA NIT ${clean(item?.nit || "")}`
        }))
        .filter((c) => c.nit);
      return out.length ? out : null;
    }
  } catch {}

  const out = text
    .split(/[;,]+/g)
    .map((token) => clean(token))
    .filter(Boolean)
    .map((nit) => ({ nit, razon_social: `EMPRESA NIT ${nit}` }));
  return out.length ? out : null;
}

function normalize(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ï¿½/g, "")
    .replace(/prdida/g, "perdida")
    .replace(/operacin/g, "operacion")
    .replace(/disminucin/g, "disminucion")
    .replace(/financiacin/g, "financiacion")
    .replace(/inversin/g, "inversion")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
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
  const allYear = rows.filter((r) => {
    const y = yearFromDate(r.fecha_corte);
    return y === year;
  });
  if (!allYear.length) return [];

  const actual = allYear.filter((r) => normalize(r.periodo).includes("actual"));
  if (actual.length) return actual;

  const current = allYear.filter((r) => {
    const p = normalize(r.periodo);
    return p.includes(String(year)) && !p.includes("anterior");
  });
  if (current.length) return current;

  return allYear;
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

function uniq(arr) {
  return [...new Set(arr)];
}

async function fetchDatasetByNit(datasetId, nit) {
  const rows = [];
  let offset = 0;

  while (offset <= MAX_OFFSET) {
    const where = `nit='${nit}'`;
    const params = new URLSearchParams();
    params.set("$limit", String(PAGE_SIZE));
    params.set("$offset", String(offset));
    params.set("$order", "fecha_corte DESC");
    params.set("$where", where);

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

async function fetchCompanyFinancialRows(nit) {
  const [income, balance, cashflow] = await Promise.all([
    fetchDatasetByNit(DATASETS.income, nit),
    fetchDatasetByNit(DATASETS.balance, nit),
    fetchDatasetByNit(DATASETS.cashflow, nit)
  ]);
  return { income, balance, cashflow };
}

function latestYear(rowsA, rowsB, rowsC) {
  const years = [
    ...rowsA.map((r) => yearFromDate(r.fecha_corte)),
    ...rowsB.map((r) => yearFromDate(r.fecha_corte)),
    ...rowsC.map((r) => yearFromDate(r.fecha_corte))
  ].filter(Number.isFinite);
  return years.length ? Math.max(...years) : null;
}

function buildYearSnapshot(year, incomeRowsAll, balanceRowsAll, cashRowsAll) {
  const incomeRows = rowsForYear(incomeRowsAll, year);
  const balanceRows = rowsForYear(balanceRowsAll, year);
  const cashRows = rowsForYear(cashRowsAll, year);

  const ingresos = pickValue(incomeRows, ["ingresos de actividades ordinarias", "ingresos operacionales", "ingresos"], ["ingresos financieros", "otros ingresos"]);
  const utilidadNeta = pickValue(
    incomeRows,
    [
      "ganancia (perdida), atribuible a los propietarios de la controladora",
      "ganancia (perdida) del periodo",
      "utilidad neta",
      "ganancia (perdida)"
    ],
    ["antes de impuestos", "procedente de operaciones continuadas", "ganancia bruta", "por actividades de operacion"]
  );
  const ebit = pickValue(
    incomeRows,
    ["ganancia (perdida) por actividades de operacion", "utilidad operativa", "utilidad operacional"],
    ["antes de impuestos"]
  );
  const depAmortIncome = sumValues(incomeRows, ["depreciacion", "amortizacion"], []);
  const depAmortCash = sumValues(cashRows, ["depreciacion", "amortizacion"], []);
  const depAmort = Number.isFinite(depAmortIncome) ? depAmortIncome : depAmortCash;
  const ebitda = pickValue(incomeRows, ["ebitda"], []) ?? (Number.isFinite(ebit) ? ebit + (depAmort || 0) : null);

  const flujoOperativo = pickValue(
    cashRows,
    ["flujos de efectivo netos procedentes de (utilizados en) actividades de operacion", "actividades de operacion"],
    []
  );
  const flujoPeriodo = pickValue(
    cashRows,
    [
      "incremento (disminucion) neto en el efectivo y equivalentes al efectivo",
      "incremento (disminucion) neto de efectivo y equivalentes al efectivo",
      "incremento (disminucion) neto de efectivo",
      "flujo de efectivo neto"
    ],
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

function buildPayload(company, rows) {
  const latest = latestYear(rows.income, rows.balance, rows.cashflow);
  if (!Number.isFinite(latest)) throw new Error(`No hay aÃ±os validos para ${company.nit}`);

  const candidateYears = [latest - 6, latest - 5, latest - 4, latest - 3, latest - 2, latest - 1, latest].filter((y) => y > 2000);
  const history = [];
  for (const y of candidateYears) {
    const snap = buildYearSnapshot(y, rows.income, rows.balance, rows.cashflow);
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
  if (!history.length) throw new Error(`Sin historia util para ${company.nit}`);

  const latestSnap = chooseLatestSnapshot(history);
  return {
    company: {
      nit: company.nit,
      razon_social: company.razon_social,
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
    warnings: [],
    chat_history: []
  };
}

function chooseLatestSnapshot(history) {
  const scored = history.map((h) => ({ ...h, _score: snapshotCompletenessScore(h) }));
  const byRecency = [...scored].sort((a, b) => b.anio - a.anio);
  const strong = byRecency.find((h) => h._score >= 3);
  if (strong) return stripScore(strong);
  const medium = byRecency.find((h) => h._score >= 2);
  if (medium) return stripScore(medium);
  return stripScore(byRecency[0]);
}

function stripScore(snap) {
  const { _score, ...cleanSnap } = snap;
  return cleanSnap;
}

function snapshotCompletenessScore(s) {
  const fields = [
    s.ingresos,
    s.ebitda,
    s.utilidad_neta,
    s.flujo_operativo,
    s.flujo_periodo,
    s.deuda_ebitda,
    s.margen_ebitda_pct,
    s.margen_neto_pct,
    s.z_altman
  ];
  return fields.filter(Number.isFinite).length;
}

function localAnswerFromPayload(payload) {
  const latest = payload.latest_snapshot || {};
  const years = payload.history || [];
  const prev = years.length > 1 ? years[years.length - 2] : null;
  const yoy = prev ? pct(latest.ingresos, prev.ingresos) : null;
  return [
    `Empresa: ${payload.company.razon_social} (${payload.company.nit}).`,
    `Ultimo aÃ±o analizado: ${payload.latest_year}.`,
    `Ingresos: ${Number.isFinite(latest.ingresos) ? latest.ingresos : "N/D"}${Number.isFinite(yoy) ? ` (YoY ${yoy.toFixed(1)}%)` : ""}.`,
    `EBITDA: ${Number.isFinite(latest.ebitda) ? latest.ebitda : "N/D"} | Utilidad neta: ${Number.isFinite(latest.utilidad_neta) ? latest.utilidad_neta : "N/D"}.`,
    `Flujo operativo: ${Number.isFinite(latest.flujo_operativo) ? latest.flujo_operativo : "N/D"} | Flujo periodo: ${Number.isFinite(latest.flujo_periodo) ? latest.flujo_periodo : "N/D"}.`,
    `Deuda/EBITDA: ${Number.isFinite(latest.deuda_ebitda) ? latest.deuda_ebitda.toFixed(2) : "N/D"}x.`,
    `Margen EBITDA: ${Number.isFinite(latest.margen_ebitda_pct) ? latest.margen_ebitda_pct.toFixed(1) : "N/D"}% | Margen neto: ${Number.isFinite(latest.margen_neto_pct) ? latest.margen_neto_pct.toFixed(1) : "N/D"}%.`,
    `Z-Altman: ${Number.isFinite(latest.z_altman) ? latest.z_altman.toFixed(2) : "N/D"}.`
  ].join("\n");
}

function buildChatList(total, payload) {
  const years = Array.isArray(payload?.years_selected) && payload.years_selected.length
    ? payload.years_selected
    : [2019, 2020, 2021, 2022, 2023, 2024];
  const generated = buildChatBank({
    target: total,
    years,
    include_core: true
  });
  return generated.slice(0, total);
}

function evaluateAnswer(answer) {
  const text = clean(answer || "");
  const badPatterns = [
    /error del asesor oculto/i,
    /ruta no encontrada/i,
    /pregunta es obligatoria/i,
    /no entendi esa pregunta/i,
    /stack/i
  ];
  const hasBad = badPatterns.some((rx) => rx.test(text));
  const ok = text.length >= 80 && !hasBad;
  return { ok, len: text.length, hasBad };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function callAdvisor(question, payload, localAnswer, chatHistory) {
  const body = {
    question,
    payload: { ...payload, chat_history: chatHistory },
    local_answer: localAnswer,
    options: {
      skip_web: STRESS_FAST,
      skip_llm: STRESS_FAST
    }
  };
  const res = await fetch(ADVISOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status} en asesor: ${txt}`);
  }
  const json = await res.json();
  return clean(json?.answer || "");
}

async function runCompanyTest(company, totalChats) {
  console.log(`\n[stress] preparando datos de ${company.razon_social} (${company.nit})...`);
  const rows = await fetchCompanyFinancialRows(company.nit);
  const payload = buildPayload(company, rows);
  const localAnswer = localAnswerFromPayload(payload);
  const chats = buildChatList(totalChats, payload);

  const latencies = [];
  const failures = [];
  const examples = [];
  let okTurnCount = 0;
  let okChatCount = 0;
  let turnCounter = 0;

  for (let i = 0; i < chats.length; i += 1) {
    const chat = chats[i] || {};
    const chatTurns = Array.isArray(chat.turns) ? chat.turns : [];
    const userTurns = [chatTurns[0], chatTurns[2], chatTurns[4]]
      .map((t, idx) => ({ turn: `U${idx + 1}`, text: clean(t?.text || "") }))
      .filter((t) => t.text);

    const chatHistory = [];
    let chatOk = true;

    for (const userTurn of userTurns) {
      const t0 = Date.now();
      let answer = "";
      let error = "";
      try {
        answer = await callAdvisor(userTurn.text, payload, localAnswer, chatHistory.slice(-16));
      } catch (e) {
        error = clean(e?.message || e);
        answer = "";
      }

      const dt = Date.now() - t0;
      latencies.push(dt);
      turnCounter += 1;

      const check = evaluateAnswer(answer);
      if (!error && check.ok) {
        okTurnCount += 1;
      } else {
        chatOk = false;
        failures.push({
          i: i + 1,
          chat_id: clean(chat.chat_id || ""),
          turn: userTurn.turn,
          question: userTurn.text,
          error: error || null,
          answer: answer.slice(0, 500),
          len: check.len
        });
      }

      if (examples.length < 12 || turnCounter % 400 === 0) {
        examples.push({
          i: i + 1,
          chat_id: clean(chat.chat_id || ""),
          turn: userTurn.turn,
          q: userTurn.text,
          a: answer.slice(0, 320),
          ok: !error && check.ok
        });
      }

      chatHistory.push({ role: "user", text: userTurn.text, at: new Date().toISOString() });
      chatHistory.push({ role: "assistant", text: answer || (error ? `ERROR: ${error}` : "Sin respuesta"), at: new Date().toISOString() });
      if (chatHistory.length > 60) chatHistory.splice(0, chatHistory.length - 60);
    }

    if (chatOk) okChatCount += 1;
    if ((i + 1) % 100 === 0) {
      console.log(`[stress] ${company.nit}: ${i + 1}/${chats.length} chats completados...`);
    }
  }

  const totalTurns = turnCounter;
  const failTurnCount = totalTurns - okTurnCount;
  const okTurnRate = totalTurns ? (okTurnCount / totalTurns) * 100 : 0;
  const failChatCount = chats.length - okChatCount;
  const okChatRate = chats.length ? (okChatCount / chats.length) * 100 : 0;
  return {
    company,
    years: payload.years_selected,
    latest_snapshot: payload.latest_snapshot,
    total_chats: chats.length,
    total_turns: totalTurns,
    ok_chat_count: okChatCount,
    fail_chat_count: failChatCount,
    ok_chat_rate_pct: Number(okChatRate.toFixed(2)),
    ok_turn_count: okTurnCount,
    fail_turn_count: failTurnCount,
    ok_turn_rate_pct: Number(okTurnRate.toFixed(2)),
    latency_ms: {
      avg: Number((latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length)).toFixed(2)),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: Math.max(...latencies, 0)
    },
    failure_samples: failures.slice(0, 20),
    answer_examples: examples
  };
}

async function ensureAdvisorUp() {
  const res = await fetch(HEALTH_URL);
  if (!res.ok) throw new Error(`Asesor no disponible: HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.ok) throw new Error("Asesor no reporta estado OK.");
  return json;
}

function buildMarkdownReport(results) {
  const lines = [];
  lines.push(`# Prueba masiva del bot multi-turn (${TOTAL_CHATS} chats x ${results.length} empresas)`);
  lines.push("");
  lines.push(`- Fecha: ${new Date().toISOString()}`);
  lines.push(`- Tag ejecucion: ${RUN_TAG}`);
  lines.push(`- Total chats ejecutados: ${results.reduce((a, r) => a + r.total_chats, 0)}`);
  lines.push(`- Total turnos ejecutados: ${results.reduce((a, r) => a + r.total_turns, 0)}`);
  lines.push("");

  results.forEach((r, idx) => {
    lines.push(`## Empresa ${idx + 1}: ${r.company.razon_social} (${r.company.nit})`);
    lines.push(`- Anos usados: ${r.years.join(", ")}`);
    lines.push(`- Chats: ${r.total_chats}`);
    lines.push(`- Turnos: ${r.total_turns}`);
    lines.push(`- Chats OK: ${r.ok_chat_count}`);
    lines.push(`- Chats con fallo: ${r.fail_chat_count}`);
    lines.push(`- Tasa OK chats: ${r.ok_chat_rate_pct}%`);
    lines.push(`- Turnos OK: ${r.ok_turn_count}`);
    lines.push(`- Turnos con fallo: ${r.fail_turn_count}`);
    lines.push(`- Tasa OK turnos: ${r.ok_turn_rate_pct}%`);
    lines.push(`- Latencia ms: avg ${r.latency_ms.avg}, p50 ${r.latency_ms.p50}, p95 ${r.latency_ms.p95}, max ${r.latency_ms.max}`);
    lines.push("");
    lines.push("### Muestras");
    r.answer_examples.slice(0, 6).forEach((e) => {
      lines.push(`- Chat ${e.i} (${e.chat_id || "N/D"}) ${e.turn}: ${e.q}`);
      lines.push(`- Resp: ${e.a}`);
      lines.push("");
    });
    if (r.failure_samples.length) {
      lines.push("### Fallos detectados");
      r.failure_samples.slice(0, 8).forEach((f) => {
        lines.push(`- Caso ${f.i} (${f.chat_id || "N/D"}) ${f.turn}: ${f.question}`);
        lines.push(`- Error: ${f.error || "N/A"}`);
        lines.push(`- Respuesta: ${f.answer || "N/A"}`);
        lines.push("");
      });
    }
  });

  return lines.join("\n");
}

async function main() {
  const health = await ensureAdvisorUp();
  console.log(`[stress] asesor listo: modelo=${health.model || "N/D"} base=${health.ollama_base || "N/D"}`);

  const results = [];
  for (const company of COMPANIES) {
    const r = await runCompanyTest(company, TOTAL_CHATS);
    results.push(r);
    await fs.writeFile(`_tmp_bot_stress_${company.nit}.json`, JSON.stringify(r, null, 2), "utf8");
  }

  const summary = {
    generated_at: new Date().toISOString(),
    advisor_url: ADVISOR_URL,
    total_chats_each: TOTAL_CHATS,
    run_tag: RUN_TAG,
    companies: COMPANIES,
    results
  };

  await fs.writeFile(`_tmp_bot_stress_summary_${RUN_TAG}.json`, JSON.stringify(summary, null, 2), "utf8");
  const md = buildMarkdownReport(results);
  await fs.writeFile(`bot_training/reporte_prueba_${RUN_TAG}.md`, md, "utf8");

  console.log("\n[stress] prueba finalizada.");
  results.forEach((r) => {
    console.log(`[stress] ${r.company.nit} -> chats OK ${r.ok_chat_count}/${r.total_chats} (${r.ok_chat_rate_pct}%), turnos OK ${r.ok_turn_count}/${r.total_turns} (${r.ok_turn_rate_pct}%), p95 ${r.latency_ms.p95}ms`);
  });
  console.log("[stress] reportes:");
  console.log(`- _tmp_bot_stress_summary_${RUN_TAG}.json`);
  console.log("- _tmp_bot_stress_<nit>.json");
  console.log(`- bot_training/reporte_prueba_${RUN_TAG}.md`);
}

main().catch((err) => {
  console.error(`[stress] error: ${clean(err?.message || err)}`);
  process.exit(1);
});


