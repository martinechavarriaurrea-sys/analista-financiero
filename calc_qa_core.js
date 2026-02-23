"use strict";

(function initCalcQACore(rootFactory) {
  if (typeof module === "object" && module.exports) {
    module.exports = rootFactory();
  } else {
    const target = typeof self !== "undefined" ? self : globalThis;
    target.CalcQACore = rootFactory();
  }
})(function createCalcQACore() {
  const FALLBACK_POLICY = Object.freeze({
    missing_input: 0,
    division_by_zero: 0,
    non_finite: 0,
    tolerance_abs: 1
  });

  function finite(v) {
    return Number.isFinite(v);
  }

  function toNum(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && !v.trim()) return null;
    const n = Number(v);
    return finite(n) ? n : null;
  }

  function buildAuditEntry(formula, inputs, transforms, fallback, result, status) {
    return {
      formula,
      inputs: inputs || {},
      transforms: transforms || [],
      fallback: fallback || null,
      result,
      status: status || "OK"
    };
  }

  function pushWarning(warnings, code, message, context) {
    if (!Array.isArray(warnings)) return;
    const payload = context && typeof context === "object" ? ` ${JSON.stringify(context)}` : "";
    warnings.push(`[${code}] ${message}${payload}`);
  }

  function divideWithFallback(meta, numerator, denominator, auditBucket, warnings) {
    const label = String(meta?.label || "ratio");
    const formula = String(meta?.formula || `${label} = num / den`);
    const inputs = {
      numerator: finite(numerator) ? numerator : null,
      denominator: finite(denominator) ? denominator : null
    };
    const transforms = [];

    if (!finite(numerator)) {
      const result = FALLBACK_POLICY.missing_input;
      const fallback = { policy: "missing_input", applied_value: result };
      if (auditBucket) auditBucket[label] = buildAuditEntry(formula, inputs, transforms, fallback, result, "FALLBACK");
      pushWarning(warnings, "fallback_missing_num", `${label}: numerador faltante, se aplico fallback`, inputs);
      return result;
    }
    if (!finite(denominator)) {
      const result = FALLBACK_POLICY.missing_input;
      const fallback = { policy: "missing_input", applied_value: result };
      if (auditBucket) auditBucket[label] = buildAuditEntry(formula, inputs, transforms, fallback, result, "FALLBACK");
      pushWarning(warnings, "fallback_missing_den", `${label}: denominador faltante, se aplico fallback`, inputs);
      return result;
    }
    if (denominator === 0) {
      const result = FALLBACK_POLICY.division_by_zero;
      const fallback = { policy: "division_by_zero", applied_value: result };
      if (auditBucket) auditBucket[label] = buildAuditEntry(formula, inputs, transforms, fallback, result, "FALLBACK");
      pushWarning(warnings, "fallback_div_zero", `${label}: denominador en cero, se aplico fallback`, inputs);
      return result;
    }

    const value = numerator / denominator;
    if (!finite(value)) {
      const result = FALLBACK_POLICY.non_finite;
      const fallback = { policy: "non_finite", applied_value: result };
      if (auditBucket) auditBucket[label] = buildAuditEntry(formula, inputs, transforms, fallback, result, "FALLBACK");
      pushWarning(warnings, "fallback_non_finite", `${label}: resultado no finito, se aplico fallback`, inputs);
      return result;
    }

    if (auditBucket) auditBucket[label] = buildAuditEntry(formula, inputs, transforms, null, value, "OK");
    return value;
  }

  function computeRatios(base, auditBucket, warnings) {
    const ingresos = toNum(base?.ingresos);
    const ingresosPrev = toNum(base?.ingresos_prev);
    const ingresosForGrowth = finite(ingresos) ? ingresos : (finite(ingresosPrev) ? 0 : null);
    let utilidadBruta = toNum(base?.utilidad_bruta);
    const costos = toNum(base?.costos);
    const ebitda = toNum(base?.ebitda);
    const opex = toNum(base?.gastos_operacionales);
    const utilidadNeta = toNum(base?.utilidad_neta);
    const deuda = toNum(base?.deuda);
    const costosFinancieros = toNum(base?.costos_financieros);

    if (!finite(utilidadBruta) && finite(ingresos) && finite(costos)) {
      utilidadBruta = ingresos - costos;
      pushWarning(warnings, "transform_utilidad_bruta", "Utilidad bruta estimada como ingresos - costos.", {
        ingresos,
        costos,
        utilidad_bruta: utilidadBruta
      });
    }

    const crecimientoIngresosYoy = divideWithFallback(
      { label: "crecimiento_ingresos_yoy", formula: "(ingresos_t - ingresos_t_1) / ingresos_t_1 * 100" },
      finite(ingresosForGrowth) && finite(ingresosPrev) ? (ingresosForGrowth - ingresosPrev) * 100 : null,
      ingresosPrev,
      auditBucket,
      warnings
    );

    const margenBruto = divideWithFallback(
      { label: "margen_bruto", formula: "utilidad_bruta / ingresos * 100" },
      finite(utilidadBruta) ? utilidadBruta * 100 : null,
      ingresos,
      auditBucket,
      warnings
    );

    const margenEbitda = divideWithFallback(
      { label: "margen_ebitda", formula: "ebitda / ingresos * 100" },
      finite(ebitda) ? ebitda * 100 : null,
      ingresos,
      auditBucket,
      warnings
    );

    const gastosOperacionalesSobreIngresos = divideWithFallback(
      { label: "gastos_operacionales_sobre_ingresos", formula: "opex / ingresos * 100" },
      finite(opex) ? opex * 100 : null,
      ingresos,
      auditBucket,
      warnings
    );

    const margenNeto = divideWithFallback(
      { label: "margen_neto", formula: "utilidad_neta / ingresos * 100" },
      finite(utilidadNeta) ? utilidadNeta * 100 : null,
      ingresos,
      auditBucket,
      warnings
    );

    const deudaEbitda = divideWithFallback(
      { label: "deuda_ebitda", formula: "deuda / ebitda" },
      deuda,
      ebitda,
      auditBucket,
      warnings
    );

    const ebitdaCostosFinancieros = divideWithFallback(
      { label: "ebitda_costos_financieros", formula: "ebitda / abs(costos_financieros)" },
      ebitda,
      finite(costosFinancieros) ? Math.abs(costosFinancieros) : null,
      auditBucket,
      warnings
    );

    return {
      crecimiento_ingresos_yoy: crecimientoIngresosYoy,
      margen_bruto: margenBruto,
      margen_ebitda: margenEbitda,
      gastos_operacionales_sobre_ingresos: gastosOperacionalesSobreIngresos,
      margen_neto: margenNeto,
      deuda_ebitda: deudaEbitda,
      ebitda_costos_financieros: ebitdaCostosFinancieros
    };
  }

  function computeChecks(base, auditBucket, warnings) {
    const tolerance = finite(base?.tolerance_abs) ? Math.abs(base.tolerance_abs) : FALLBACK_POLICY.tolerance_abs;

    const cajaInicial = toNum(base?.caja_inicial);
    const cajaFinal = toNum(base?.caja_final);
    const flujoPeriodo = toNum(base?.flujo_periodo);
    const activos = toNum(base?.activos_totales);
    const pasivos = toNum(base?.pasivos_totales);
    const patrimonio = toNum(base?.patrimonio_total);
    const ac = toNum(base?.activos_corrientes);
    const pc = toNum(base?.pasivos_corrientes);
    const knt = toNum(base?.capital_neto_trabajo);
    const deudaRatio = toNum(base?.deuda_ratio);
    const deudaBalance = toNum(base?.deuda_balance);

    const checkCajaExpected = finite(cajaInicial) && finite(flujoPeriodo) ? cajaInicial + flujoPeriodo : null;
    const checkCajaDiff = finite(cajaFinal) && finite(checkCajaExpected) ? cajaFinal - checkCajaExpected : null;
    const checkCajaPass = finite(checkCajaDiff) ? Math.abs(checkCajaDiff) <= tolerance : false;
    const checkCaja = {
      pass: checkCajaPass,
      diff: finite(checkCajaDiff) ? checkCajaDiff : FALLBACK_POLICY.missing_input,
      tolerance
    };
    if (auditBucket) {
      auditBucket.check_caja = buildAuditEntry(
        "caja_final = caja_inicial + flujo_periodo",
        { caja_inicial: cajaInicial, flujo_periodo: flujoPeriodo, caja_final: cajaFinal },
        [],
        !finite(checkCajaDiff) ? { policy: "missing_input", applied_value: FALLBACK_POLICY.missing_input } : null,
        checkCaja,
        checkCajaPass ? "PASS" : "FAIL"
      );
    }
    if (!checkCajaPass) pushWarning(warnings, "check_caja_fail", "Check de caja no cuadra.", checkCaja);

    const balanceExpected = finite(pasivos) && finite(patrimonio) ? pasivos + patrimonio : null;
    const balanceDiff = finite(activos) && finite(balanceExpected) ? activos - balanceExpected : null;
    const balancePass = finite(balanceDiff) ? Math.abs(balanceDiff) <= tolerance : false;
    const checkBalance = { pass: balancePass, diff: finite(balanceDiff) ? balanceDiff : FALLBACK_POLICY.missing_input, tolerance };
    if (auditBucket) {
      auditBucket.check_balance = buildAuditEntry(
        "activos_totales = pasivos_totales + patrimonio_total",
        { activos_totales: activos, pasivos_totales: pasivos, patrimonio_total: patrimonio },
        [],
        !finite(balanceDiff) ? { policy: "missing_input", applied_value: FALLBACK_POLICY.missing_input } : null,
        checkBalance,
        balancePass ? "PASS" : "FAIL"
      );
    }
    if (!balancePass) pushWarning(warnings, "check_balance_fail", "Check de balance no cuadra.", checkBalance);

    const nwcExpected = finite(ac) && finite(pc) ? ac - pc : null;
    const nwcDiff = finite(knt) && finite(nwcExpected) ? knt - nwcExpected : null;
    const nwcPass = finite(nwcDiff) ? Math.abs(nwcDiff) <= tolerance : false;
    const checkNwc = { pass: nwcPass, diff: finite(nwcDiff) ? nwcDiff : FALLBACK_POLICY.missing_input, tolerance };
    if (auditBucket) {
      auditBucket.check_nwc = buildAuditEntry(
        "capital_neto_trabajo = activos_corrientes - pasivos_corrientes",
        { activos_corrientes: ac, pasivos_corrientes: pc, capital_neto_trabajo: knt },
        [],
        !finite(nwcDiff) ? { policy: "missing_input", applied_value: FALLBACK_POLICY.missing_input } : null,
        checkNwc,
        nwcPass ? "PASS" : "FAIL"
      );
    }
    if (!nwcPass) pushWarning(warnings, "check_nwc_fail", "Check de capital neto de trabajo no cuadra.", checkNwc);

    const deudaDiff = finite(deudaRatio) && finite(deudaBalance) ? deudaRatio - deudaBalance : null;
    const deudaPass = finite(deudaDiff) ? Math.abs(deudaDiff) <= tolerance : false;
    const checkDeuda = { pass: deudaPass, diff: finite(deudaDiff) ? deudaDiff : FALLBACK_POLICY.missing_input, tolerance };
    if (auditBucket) {
      auditBucket.check_deuda = buildAuditEntry(
        "deuda_ratio = deuda_balance",
        { deuda_ratio: deudaRatio, deuda_balance: deudaBalance },
        [],
        !finite(deudaDiff) ? { policy: "missing_input", applied_value: FALLBACK_POLICY.missing_input } : null,
        checkDeuda,
        deudaPass ? "PASS" : "FAIL"
      );
    }
    if (!deudaPass) pushWarning(warnings, "check_deuda_fail", "Check de deuda de ratios vs balance no cuadra.", checkDeuda);

    return {
      check_caja: checkCaja,
      check_balance: checkBalance,
      check_nwc: checkNwc,
      check_deuda: checkDeuda
    };
  }

  function resolveDebtValue(input, auditBucket, warnings) {
    const deudaSumada = toNum(input?.deudaSumada);
    const deudaDirecta = toNum(input?.deudaDirecta);
    const pasivosTotales = toNum(input?.pasivosTotales);

    let value = null;
    let source = "none";
    const transforms = [];
    let fallback = null;
    if (finite(deudaSumada)) {
      const sumAbs = Math.abs(deudaSumada);
      const directAbs = Math.abs(deudaDirecta || 0);
      const nearDoubleDirect =
        finite(deudaDirecta) &&
        directAbs > 0 &&
        Math.abs(sumAbs - directAbs * 2) <= Math.max(1, directAbs * 0.01);
      const exceedsLiabilities = finite(pasivosTotales) && sumAbs > Math.abs(pasivosTotales) * 1.02;
      if (nearDoubleDirect) {
        value = deudaDirecta;
        source = "deuda_directa_duplicate_guard";
        transforms.push({
          rule: "if deuda_sumada ~= 2 * deuda_directa then use deuda_directa",
          deuda_sumada: deudaSumada,
          deuda_directa: deudaDirecta
        });
        pushWarning(
          warnings,
          "debt_sum_duplicate_guard",
          "Deuda sumada luce duplicada frente a deuda directa; se usa deuda directa para evitar doble conteo.",
          { deuda_sumada: deudaSumada, deuda_directa: deudaDirecta }
        );
      } else if (exceedsLiabilities && finite(deudaDirecta)) {
        value = deudaDirecta;
        source = "deuda_directa_sanity_pasivos";
        transforms.push({
          rule: "if deuda_sumada > pasivos_totales then use deuda_directa",
          deuda_sumada: deudaSumada,
          pasivos_totales: pasivosTotales,
          deuda_directa: deudaDirecta
        });
        pushWarning(
          warnings,
          "debt_sum_exceeds_liabilities",
          "Deuda sumada supera pasivos totales; se usa deuda directa para evitar sobreestimacion.",
          { deuda_sumada: deudaSumada, pasivos_totales: pasivosTotales, deuda_directa: deudaDirecta }
        );
      } else {
        value = deudaSumada;
        source = "deuda_sumada_financiera";
      }
    } else if (finite(deudaDirecta)) {
      value = deudaDirecta;
      source = "deuda_directa";
    } else {
      value = FALLBACK_POLICY.missing_input;
      source = "fallback_zero";
      fallback = {
        policy: "missing_debt_financial",
        applied_value: value,
        pasivos_totales_detectados: finite(pasivosTotales) ? pasivosTotales : null
      };
      pushWarning(
        warnings,
        "debt_fallback_zero",
        "Deuda financiera faltante; se usa 0 para no confundir deuda con pasivos totales.",
        { pasivos_totales: finite(pasivosTotales) ? pasivosTotales : null }
      );
    }

    const result = { value, source };
    if (auditBucket) {
      auditBucket.debt_resolution = buildAuditEntry(
        "deuda = deuda_sumada_financiera || deuda_directa || 0",
        { deuda_sumada: deudaSumada, deuda_directa: deudaDirecta, pasivos_totales: pasivosTotales },
        transforms,
        fallback,
        result,
        fallback ? "FALLBACK" : "OK"
      );
    }
    return result;
  }

  return {
    FALLBACK_POLICY,
    computeRatios,
    computeChecks,
    resolveDebtValue
  };
});
