const INCLUDE_TERMS = [
  "obligaciones financieras",
  "pasivos financieros",
  "deuda financiera",
  "deuda total",
  "prestamos",
  "prestamo"
];

const EXCLUDE_TERMS = [
  "cuentas por pagar comerciales",
  "proveedores",
  "impuestos",
  "beneficios a empleados"
];

const CURRENT_HINTS = ["corriente", "corto plazo"];
const NON_CURRENT_HINTS = ["no corriente", "largo plazo"];
const TOTAL_HINTS = [
  "deuda total",
  "obligaciones financieras totales",
  "pasivos financieros totales",
  "total deuda",
  "total obligaciones financieras",
  "total pasivos financieros"
];

function cleanText(value) {
  return String(value || "").trim();
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

function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && !v.trim()) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function yearFromDate(date) {
  const y = Number(String(date || "").slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function periodScore(periodo, year) {
  const p = normalize(periodo || "");
  if (!p) return 1;
  if (p.includes("actual")) return 3;
  if (p.includes("anterior")) return 0;
  if (Number.isFinite(year) && p.includes(String(year)) && !p.includes("anterior")) return 2;
  return 1;
}

function financialInstanceKey(row) {
  const parts = [
    cleanText(row?.numero_radicado || ""),
    cleanText(row?.id_punto_entrada || ""),
    cleanText(row?.id_taxonomia || ""),
    cleanText(row?.codigo_instancia || "")
  ];
  if (!parts.some(Boolean)) return "";
  return parts.join("|");
}

function isActualPeriod(periodo, year) {
  const p = normalize(periodo || "");
  if (!p) return false;
  if (p.includes("actual")) return true;
  if (Number.isFinite(year) && p.includes(String(year)) && !p.includes("anterior")) return true;
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
    if (!Number.isFinite(year)) continue;
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
        pointEntry: normalize(row?.punto_entrada || "")
      });
    }
    const stat = yearMap.get(instanceKey);
    stat.rowCount += 1;
    if (isActualPeriod(row?.periodo, year)) stat.actualCount += 1;

    const value = toNum(row?.valor);
    if (Number.isFinite(value) && value !== 0) stat.nonZeroCount += 1;

    const concept = normalize(row?.concepto);
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

function includesAny(concept, terms) {
  return terms.some((term) => concept.includes(term));
}

function isDebtCandidate(concept) {
  return includesAny(concept, INCLUDE_TERMS) && !includesAny(concept, EXCLUDE_TERMS);
}

function isCurrentConcept(concept) {
  return !isNonCurrentConcept(concept) && includesAny(concept, CURRENT_HINTS);
}

function isNonCurrentConcept(concept) {
  return includesAny(concept, NON_CURRENT_HINTS);
}

function isTotalConcept(concept) {
  if (isCurrentConcept(concept) || isNonCurrentConcept(concept)) return false;
  return includesAny(concept, TOTAL_HINTS);
}

function debtConceptSegment(concept) {
  if (isTotalConcept(concept)) return "total";
  if (isCurrentConcept(concept)) return "current";
  if (isNonCurrentConcept(concept)) return "non_current";
  return "other";
}

function debtConceptCore(concept) {
  return normalize(concept || "")
    .replace(/\botros?\b/g, " ")
    .replace(/\btotales?\b/g, " ")
    .replace(/\bpasivos?\b/g, " ")
    .replace(/\bobligaciones?\b/g, " ")
    .replace(/\bfinancier[oa]s?\b/g, " ")
    .replace(/\bdeuda\b/g, " ")
    .replace(/\bprestamos?\b/g, " ")
    .replace(/\bno corrientes?\b/g, " ")
    .replace(/\bcorrientes?\b/g, " ")
    .replace(/\bcorto plazo\b/g, " ")
    .replace(/\blargo plazo\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function debtConceptFingerprint(concept) {
  const core = debtConceptCore(concept);
  return `${debtConceptSegment(concept)}|${core || "deuda"}`;
}

function candidateScore(candidate) {
  const concept = candidate.concept;
  let score = 0;
  if (concept.includes("deuda total")) score += 150;
  if (isTotalConcept(concept)) score += 120;
  if (concept.includes("obligaciones financieras")) score += 70;
  if (concept.includes("pasivos financieros")) score += 65;
  if (concept.includes("deuda financiera")) score += 60;
  if (concept.includes("prestamo") || concept.includes("prestamos")) score += 45;
  if (isCurrentConcept(concept) || isNonCurrentConcept(concept)) score += 20;
  score += Math.log10(Math.abs(candidate.value) + 1);
  return score;
}

function pickBest(candidates, predicate) {
  let best = null;
  for (const candidate of candidates) {
    if (typeof predicate === "function" && !predicate(candidate)) continue;
    const score = candidateScore(candidate);
    if (
      !best ||
      score > best.score ||
      (score === best.score && Math.abs(candidate.value) > Math.abs(best.value))
    ) {
      best = { ...candidate, score };
    }
  }
  return best;
}

function uniqueByConcept(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.concept)) continue;
    seen.add(candidate.concept);
    out.push(candidate);
  }
  return out;
}

function dedupeEquivalentCandidates(candidates) {
  const bestByFingerprint = new Map();
  for (const candidate of candidates || []) {
    if (!candidate || !Number.isFinite(candidate.value)) continue;
    const fingerprint = debtConceptFingerprint(candidate.concept);
    const absRounded = Math.round(Math.abs(candidate.value));
    const dedupeKey = `${fingerprint}|${absRounded}`;
    const score = candidateScore(candidate);
    const current = bestByFingerprint.get(dedupeKey);
    if (
      !current ||
      score > current.score ||
      (score === current.score && Math.abs(candidate.value) > Math.abs(current.value))
    ) {
      bestByFingerprint.set(dedupeKey, { ...candidate, score });
    }
  }
  return [...bestByFingerprint.values()].map(({ score, ...candidate }) => candidate);
}

function mergeEquivalentComponentCandidates(candidates) {
  const bestByCore = new Map();
  for (const candidate of candidates || []) {
    if (!candidate || !Number.isFinite(candidate.value)) continue;
    const core = debtConceptCore(candidate.concept);
    const absRounded = Math.round(Math.abs(candidate.value));
    const dedupeKey = `${core || "deuda"}|${absRounded}`;
    const score = candidateScore(candidate);
    const current = bestByCore.get(dedupeKey);
    if (
      !current ||
      score > current.score ||
      (score === current.score && Math.abs(candidate.value) > Math.abs(current.value))
    ) {
      bestByCore.set(dedupeKey, { ...candidate, score });
    }
  }
  return [...bestByCore.values()].map(({ score, ...candidate }) => candidate);
}

function buildCandidatesFromRows(rows, year = null) {
  const availableYears = (rows || [])
    .map((row) => yearFromDate(row?.fecha_corte))
    .filter((value) => Number.isFinite(value));
  const fallbackYear = availableYears.length ? Math.max(...availableYears) : null;
  const targetYear = Number.isFinite(year) ? year : fallbackYear;

  const preferredByYear = selectPreferredInstanceByYear(rows);
  const bestByConcept = new Map();
  for (const row of rows || []) {
    const rowYear = yearFromDate(row?.fecha_corte);
    if (Number.isFinite(targetYear) && rowYear !== targetYear) continue;

    const preferredInstance = preferredByYear.get(rowYear);
    const rowInstance = financialInstanceKey(row);
    if (preferredInstance && rowInstance && preferredInstance !== rowInstance) continue;

    const concept = normalize(row?.concepto);
    const value = toNum(row?.valor);
    if (!concept || !Number.isFinite(value)) continue;

    const score = periodScore(row?.periodo, Number.isFinite(targetYear) ? targetYear : rowYear);
    const existing = bestByConcept.get(concept);
    if (
      !existing ||
      score > existing.periodScore ||
      (score === existing.periodScore && Math.abs(value) > Math.abs(existing.value))
    ) {
      bestByConcept.set(concept, {
        concept,
        value,
        rawConcept: String(row?.concepto || "").trim() || concept,
        periodScore: score
      });
    }
  }

  return [...bestByConcept.values()].filter((candidate) => isDebtCandidate(candidate.concept));
}

export function resolveFinancialDebtFromRows(rows, year = null) {
  const candidates = dedupeEquivalentCandidates(buildCandidatesFromRows(rows, year));
  if (!candidates.length) {
    return {
      deudaSumada: null,
      deudaDirecta: null,
      deuda: null,
      source: "missing",
      componentConcepts: [],
      directConcept: "",
      candidateConcepts: []
    };
  }

  const totalCandidate = pickBest(candidates, (candidate) => isTotalConcept(candidate.concept));
  let componentCandidates = [];
  let deudaSumada = null;
  if (!totalCandidate) {
    const currentCandidate = pickBest(candidates, (candidate) => isCurrentConcept(candidate.concept));
    const nonCurrentCandidate = pickBest(candidates, (candidate) => isNonCurrentConcept(candidate.concept));
    componentCandidates = mergeEquivalentComponentCandidates(uniqueByConcept(
      [currentCandidate, nonCurrentCandidate].filter((candidate) => candidate && Number.isFinite(candidate.value))
    ));
    const componentValues = componentCandidates.map((candidate) => candidate.value);
    deudaSumada = componentValues.length
      ? componentValues.reduce((acc, value) => acc + value, 0)
      : null;
  }

  const directCandidate = totalCandidate || pickBest(candidates, () => true);
  const deudaDirecta = directCandidate && Number.isFinite(directCandidate.value)
    ? directCandidate.value
    : null;

  const deuda = Number.isFinite(deudaSumada) ? deudaSumada : deudaDirecta;
  const source = Number.isFinite(deudaSumada)
    ? "componentes_corriente_no_corriente"
    : (totalCandidate ? "deuda_total" : (Number.isFinite(deudaDirecta) ? "deuda_directa" : "missing"));

  return {
    deudaSumada,
    deudaDirecta,
    deuda,
    source,
    componentConcepts: componentCandidates.map((candidate) => candidate.rawConcept || candidate.concept),
    directConcept: directCandidate ? (directCandidate.rawConcept || directCandidate.concept) : "",
    candidateConcepts: candidates.map((candidate) => candidate.rawConcept || candidate.concept)
  };
}
