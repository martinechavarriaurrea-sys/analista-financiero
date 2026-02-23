import fs from "fs/promises";

export const CHAT_RESPONSE_CONTRACT = {
  short_answer: "1-2 lineas maximo",
  formula: "calculo o formula usada",
  data_used: "ano, rubros y fuente interno/portal",
  interpretation: "por que importa para negocio y riesgo",
  action: "recomendacion concreta y priorizada",
  missing_data_policy: "si falta dato interno y portal no lo trae: 'Dato no disponible' + faltante + proxy recomendado"
};

export const CHAT_ANTI_HALLUCINATION_RULE =
  "Si falta dato interno y portal no lo trae, responder: 'Dato no disponible', indicar faltante exacto y proxy recomendado.";

export const CHAT_STRUCTURE_STANDARD = {
  chat_id: "CHAT-XXX",
  context: "empresa + 6 anos + portal",
  turns: ["U1", "B1", "U2", "B2", "U3", "B3"]
};

const CORE_20 = [
  {
    title: "Ventas y crecimiento YoY",
    type: "growth",
    source_expected: "interno",
    u1: "Como crecieron los ingresos en los ultimos 6 anos?",
    b1: "Mostrar crecimiento YoY por ano y CAGR 6 anos con formula y lectura de anos pico/valle.",
    u2: "Ese crecimiento fue por precio o volumen?",
    b2: "Descomponer variacion de ingresos en precio, volumen y mix; si faltan drivers usar proxy de ticket y unidades.",
    u3: "Que accion recomiendas para sostener crecimiento sin destruir margen?",
    b3: "Priorizar disciplina de precios, mix de mayor margen y control de descuentos; KPI objetivo: margen bruto por canal."
  },
  {
    title: "Margen bruto: caida fuerte",
    type: "profitability",
    source_expected: "interno",
    u1: "El margen bruto cayo en 2024, por que?",
    b1: "Comparar margen bruto 2024 vs 2023 y drivers: TRM, fletes, mix, mermas y costo unitario.",
    u2: "Cual driver explica el 80% de la caida?",
    b2: "Construir puente de margen con contribucion porcentual por driver.",
    u3: "Que harias primero en 30 dias?",
    b3: "Quick wins: renegociar proveedores, corregir descuentos y ajustar precios por elasticidad."
  },
  {
    title: "OPEX inflandose",
    type: "profitability",
    source_expected: "interno",
    u1: "Por que los gastos operacionales crecen mas que ventas?",
    b1: "Comparar OPEX/Ingresos por ano y detectar rubros creciendo por encima de ventas.",
    u2: "Que rubros son recortables sin afectar operacion?",
    b2: "Clasificar OPEX en run, growth y compliance con impacto/riesgo.",
    u3: "Dame meta razonable de OPEX/Ingresos.",
    b3: "Definir banda objetivo por historico, comparables del portal y eficiencia incremental anual."
  },
  {
    title: "EBITDA vs caja",
    type: "cashflow_wcm",
    source_expected: "interno",
    u1: "Tenemos EBITDA positivo pero caja cae. Que pasa?",
    b1: "Reconciliar EBITDA a caja operativa: impuestos, capital de trabajo y ajustes.",
    u2: "Que rubro de capital de trabajo se come la caja?",
    b2: "Descomponer en CxC, inventario y CxP con impacto en COP y en dias.",
    u3: "Que plan de choque propones para liberar caja?",
    b3: "Plan 90 dias: bajar DSO/DIH y optimizar DPO, con meta explicita de CCC y caja liberada."
  },
  {
    title: "DSO alto",
    type: "cashflow_wcm",
    source_expected: "interno",
    u1: "Cuales son los dias de cartera y como evolucionaron?",
    b1: "Calcular DSO por ano y alertar cambios bruscos.",
    u2: "Que clientes causan el problema?",
    b2: "Usar aging por vencimientos y ranking por saldo vencido y concentracion.",
    u3: "Bajari as cupo o subirias precio por riesgo?",
    b3: "Aplicar politica por mora y cobertura: cupo/garantias o precio por riesgo segun criticidad."
  },
  {
    title: "Inventario lento",
    type: "cashflow_wcm",
    source_expected: "interno",
    u1: "El inventario esta creciendo demasiado?",
    b1: "Calcular DIH y variacion por ano con alerta de obsolescencia.",
    u2: "Que SKUs son lentos?",
    b2: "Clasificar inventario con ABC/XYZ o aging.",
    u3: "Como bajamos DIH sin romper servicio?",
    b3: "Plan de surtido: liquidar lento, ajustar MOQ y forecast con demanda real."
  },
  {
    title: "Deuda y covenants",
    type: "debt_risk",
    source_expected: "interno",
    u1: "Como esta el apalancamiento?",
    b1: "Evaluar deuda neta/EBITDA y coberturas con tendencia anual.",
    u2: "Estamos cerca de romper covenants?",
    b2: "Comparar metricas con umbrales y simular estres moderado.",
    u3: "Refinanciar o prepagar?",
    b3: "Decidir por costo marginal, liquidez minima y retorno ajustado por riesgo."
  },
  {
    title: "Impacto de tasa",
    type: "debt_risk",
    source_expected: "interno",
    u1: "Si sube IBR 300 bps, que pasa?",
    b1: "Estimar incremento de intereses sobre deuda variable e impacto en utilidad y cobertura.",
    u2: "Como nos protegemos?",
    b2: "Evaluar mezcla tasa fija, derivados, prepago parcial y extension de plazo.",
    u3: "Cual conviene hoy?",
    b3: "Escoger segun vencimientos, costo total y capacidad de caja."
  },
  {
    title: "Riesgo TRM",
    type: "debt_risk",
    source_expected: "interno+portal",
    u1: "Que tan expuestos estamos a devaluacion 15%?",
    b1: "Cuantificar impacto en COGS importado, deuda en USD e ingresos en USD.",
    u2: "Cual es la exposicion neta?",
    b2: "Calcular net exposure: costos USD + deuda USD - ingresos USD.",
    u3: "Que cobertura recomiendas?",
    b3: "Si exposicion neta alta: forwards escalonados, ajuste de precios y renegociacion."
  },
  {
    title: "Normalizacion de EBITDA",
    type: "valuation",
    source_expected: "interno+portal",
    u1: "Quiero EBITDA normalizado para valuacion.",
    b1: "Ajustar EBITDA reportado por one-offs no recurrentes.",
    u2: "Que criterio usas para one-off?",
    b2: "Validar no recurrencia, no operatividad y soporte en notas/portal.",
    u3: "Que multiplo EV/EBITDA usarias?",
    b3: "Usar comparables sectoriales del portal o rango con sensibilidad explicita."
  },
  {
    title: "Decision de credito",
    type: "credit_decision",
    source_expected: "interno",
    u1: "Le doy credito a esta empresa?",
    b1: "Calificar por rentabilidad, caja, leverage y pago; entregar rating interno.",
    u2: "Que condiciones pondrias?",
    b2: "Definir cupo, plazo, garantias y covenants comerciales.",
    u3: "Que senales monitorear mensual?",
    b3: "Monitorear DSO, mora >60, margen bruto, caja minima, deuda/EBITDA y cobertura."
  },
  {
    title: "Gap vs comparables",
    type: "external_benchmark",
    source_expected: "interno+portal",
    u1: "Como estamos vs empresas similares del portal?",
    b1: "Comparar margenes, CCC, leverage y crecimiento con percentiles si aplica.",
    u2: "Donde estamos peor?",
    b2: "Identificar 2-3 brechas con impacto financiero.",
    u3: "Plan para cerrar brechas en 6 meses?",
    b3: "Roadmap mensual con iniciativa, responsable y KPI de cierre."
  },
  {
    title: "Flujo libre FCF",
    type: "cashflow_wcm",
    source_expected: "interno",
    u1: "Cual fue el FCF en los ultimos 6 anos?",
    b1: "Calcular FCF aproximado por ano y tendencia.",
    u2: "Por que fue negativo en un ano?",
    b2: "Separar causa entre CAPEX, capital de trabajo o caida EBITDA.",
    u3: "Eso es malo o crecimiento?",
    b3: "Distinguir FCF negativo saludable (inversion) vs peligroso (descontrol operativo)."
  },
  {
    title: "CAPEX vs OPEX",
    type: "accounting_policy",
    source_expected: "interno",
    u1: "Que gastos deberian ser CAPEX y no OPEX?",
    b1: "Identificar rubros potencialmente capitalizables segun criterio contable.",
    u2: "Que cambia en EBITDA?",
    b2: "Explicar efecto en EBITDA, D&A y caja.",
    u3: "Recomiendas cambiar politica?",
    b3: "Solo con soporte tecnico y consistencia; sino mantener y normalizar para analisis."
  },
  {
    title: "Otros ingresos grandes",
    type: "quality_of_earnings",
    source_expected: "interno+portal",
    u1: "Otros ingresos es gigante, que es?",
    b1: "Desagregar otros y separar recurrente vs no recurrente.",
    u2: "Si lo quito, como queda la operacion?",
    b2: "Presentar estado de resultados core sin partidas no operativas.",
    u3: "Que riesgo concluyes?",
    b3: "Si la utilidad depende de otros, subir cautela por baja calidad de utilidades."
  },
  {
    title: "Impuestos tasa efectiva",
    type: "net_income_tax",
    source_expected: "interno",
    u1: "La tasa efectiva de impuestos es muy baja en un ano. Es raro?",
    b1: "Explicar tasa efectiva y posibles causas: diferidos, beneficios, perdidas fiscales.",
    u2: "Como lo verificas?",
    b2: "Revisar notas y conciliacion fiscal; si falta soporte marcarlo.",
    u3: "Que tasa usarias para proyeccion?",
    b3: "Usar tasa normalizada por regimen y promedio historico ajustado."
  },
  {
    title: "Puente EBITDA",
    type: "profitability",
    source_expected: "interno",
    u1: "Haz un puente EBITDA 2023 a 2024.",
    b1: "Descomponer por precio, volumen, mix, COGS unitario y OPEX.",
    u2: "Que palanca tiene mejor ROI?",
    b2: "Comparar ROI estimado de palancas por impacto/costo.",
    u3: "Prioriza 3 acciones.",
    b3: "Ordenar acciones por ROI y riesgo de ejecucion."
  },
  {
    title: "Stress test de caja",
    type: "scenario",
    source_expected: "interno",
    u1: "Simula ventas -20% y si sobrevivimos 6 meses.",
    b1: "Modelar impacto en EBITDA, CT, servicio de deuda y runway.",
    u2: "Que variable mata primero?",
    b2: "Identificar constraint principal: cobertura, caja minima o DSO.",
    u3: "Plan de contingencia?",
    b3: "Activar plan de defensa: CAPEX, OPEX, deuda y cobranza."
  },
  {
    title: "Pricing",
    type: "growth",
    source_expected: "interno",
    u1: "Podemos subir precios 5% sin perder EBITDA?",
    b1: "Estimar impacto neto considerando elasticidad y volumen.",
    u2: "En que segmentos si y en cuales no?",
    b2: "Segmentar clientes por sensibilidad y valor.",
    u3: "Como implemento?",
    b3: "Plan por SKU, reglas de descuento y comite de precios con seguimiento semanal."
  },
  {
    title: "Confiabilidad interno vs portal",
    type: "external_benchmark",
    source_expected: "interno+portal",
    u1: "El portal me da ingresos distintos a los mios. Cual creo?",
    b1: "Conciliar diferencias por rubro y ano; interno como fuente para decision.",
    u2: "Como se explican diferencias tipicas?",
    b2: "Explicar consolidacion, reclasificacion, corte y redondeo.",
    u3: "Como lo dejamos consistente?",
    b3: "Definir source of truth, mapeo de cuentas y politica de conciliacion."
  }
];

const EXTRA_THEMES = [
  { metric: "Z-Score", type: "debt_risk", source_expected: "interno", formula: "Z-Score de Altman", action: "mejorar solvencia operativa y capital de trabajo" },
  { metric: "DSCR", type: "debt_risk", source_expected: "interno", formula: "DSCR = flujo para deuda / servicio deuda", action: "reperfilar deuda y blindar caja" },
  { metric: "Factoring", type: "cashflow_wcm", source_expected: "interno", formula: "costo efectivo factoring vs tasa deuda", action: "usar factoring solo tactico y con limite" },
  { metric: "Presupuesto vs real", type: "planning", source_expected: "interno", formula: "variacion = real - presupuesto", action: "cerrar brechas con plan por responsables" },
  { metric: "Unit economics", type: "profitability", source_expected: "interno", formula: "margen contribucion por unidad", action: "ajustar mix y pricing por unidad rentable" },
  { metric: "Canales", type: "growth", source_expected: "interno", formula: "margen por canal y crecimiento por canal", action: "mover foco al canal de mayor retorno" },
  { metric: "ROIC vs WACC", type: "valuation", source_expected: "interno+portal", formula: "spread = ROIC - WACC", action: "reasignar capital a proyectos con spread positivo" },
  { metric: "Mora y riesgo cliente", type: "credit_decision", source_expected: "interno", formula: "aging y cobertura de cartera", action: "ajustar cupos y garantias" },
  { metric: "CAPEX de mantenimiento", type: "cashflow_wcm", source_expected: "interno", formula: "FCF despues de CAPEX minimo", action: "priorizar CAPEX critico y diferir no esencial" },
  { metric: "Sensibilidad de utilidad", type: "scenario", source_expected: "interno", formula: "impacto de escenario en EBITDA/utilidad/caja", action: "activar gatillos por escenario" }
];

const EXTRA_VARIANTS = [
  {
    key: "tendencia",
    u1: (m) => `Como evoluciona ${m} en los ultimos 6 anos?`,
    b1: (m, f) => `Mostrar tendencia anual y formula base (${f}) con lectura de senales.`,
    u2: (m) => `Que variable explica mas el cambio de ${m}?`,
    b2: () => "Descomponer drivers y cuantificar contribucion de cada uno.",
    u3: (m) => `Que decision ejecutiva tomarias para mejorar ${m}?`,
    b3: (_m, a) => `Recomendar 3 acciones priorizadas para ${a}.`
  },
  {
    key: "estres",
    u1: (m) => `Si estresamos ${m}, cual es el impacto financiero?`,
    b1: (m, f) => `Aplicar stress moderado y recalcular ${m} usando ${f}.`,
    u2: () => "Que umbral dispara alerta roja?",
    b2: () => "Definir trigger y sensibilidad de KPI criticos.",
    u3: () => "Que mitigantes activas primero?",
    b3: () => "Entregar playbook de mitigacion en 30-90 dias."
  },
  {
    key: "benchmark",
    u1: (m) => `Como estamos en ${m} frente a comparables?`,
    b1: () => "Comparar valor interno vs portal y brecha relativa.",
    u2: () => "Cual es la causa principal de la brecha?",
    b2: () => "Explicar causa operativa/financiera con evidencia disponible.",
    u3: () => "Que plan 6 meses propones para cerrar brecha?",
    b3: () => "Plan con meta mensual, responsable y KPI."
  },
  {
    key: "decision",
    u1: (m) => `Que decision de credito o inversion sugiere ${m}?`,
    b1: () => "Dar recomendacion preliminar con condiciones.",
    u2: () => "Que informacion faltaria para confirmar?",
    b2: () => "Listar faltantes minimos y proxy permitido.",
    u3: () => "Cual seria tu checklist final de aprobacion?",
    b3: () => "Checklist con triggers de rechazo y mitigantes."
  }
];

export const CHAT_TEMPLATE_FAMILIES = [
  {
    id: "metric_causa_accion",
    source_expected: "interno",
    turns: {
      u1: "Cual fue {RUBRO} en {ANO} y como cambio vs ano anterior?",
      b1: "dato + formula + YoY",
      u2: "Que explica el cambio en {RUBRO} para {ANO} en canal {CANAL}?",
      b2: "drivers + puente de variacion",
      u3: "Que recomiendas para mejorar {RUBRO} sin afectar caja bajo escenario {ESCENARIO}?",
      b3: "acciones + KPI objetivo"
    }
  },
  {
    id: "credito",
    source_expected: "interno",
    turns: {
      u1: "Le das credito con plazo {PLAZO} y cupo {CUPO} en {ANO}?",
      b1: "rating + 4 bloques: rentabilidad, caja, leverage y pago",
      u2: "Que condiciones pones para aprobar?",
      b2: "garantias + covenants comerciales + monitoreo",
      u3: "Que gatillos harian rechazo despues de aprobado?",
      b3: "triggers: mora, cobertura, CCC y caja minima"
    }
  },
  {
    id: "portal",
    source_expected: "interno+portal",
    turns: {
      u1: "Compara {RUBRO} interno vs portal en {ANO}.",
      b1: "tabla de diferencias + hipotesis",
      u2: "Cual fuente uso para decision?",
      b2: "criterio source of truth y jerarquia de fuentes",
      u3: "Como lo dejo documentado?",
      b3: "politica, mapeo y trazabilidad"
    }
  }
];

export const CHAT_VARIABLE_SETS = {
  RUBRO: [
    "Ingresos", "COGS", "OPEX", "EBITDA", "EBIT", "Intereses", "Impuestos",
    "Utilidad", "Caja", "CxC", "Inventario", "CxP", "Deuda"
  ],
  CANAL: ["B2B", "Retail", "Mayorista", "E-commerce", "Distribuidores"],
  ESCENARIO: [
    "Base", "-10% ventas", "-20% ventas", "+5% precio", "+10% COGS", "+10% OPEX", "+300 bps", "TRM +15%"
  ],
  PLAZO: ["30 dias", "45 dias", "60 dias", "90 dias", "120 dias"],
  CUPO: ["COP 200 MM", "COP 500 MM", "COP 1.000 MM", "COP 2.000 MM", "COP 5.000 MM"]
};

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalize(text) {
  return clean(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function makeChatRecord({ chat_id, title, type, source_expected, variables = {}, template_family = "core", u1, b1, u2, b2, u3, b3 }) {
  return {
    chat_id,
    title: clean(title),
    context: {
      company_scope: "empresa + 6 anos + portal",
      anti_hallucination_rule: CHAT_ANTI_HALLUCINATION_RULE
    },
    turns: [
      { id: "U1", role: "user", text: clean(u1) },
      { id: "B1", role: "assistant", expected: clean(b1) },
      { id: "U2", role: "user", text: clean(u2) },
      { id: "B2", role: "assistant", expected: clean(b2) },
      { id: "U3", role: "user", text: clean(u3) },
      { id: "B3", role: "assistant", expected: clean(b3) }
    ],
    response_contract: CHAT_RESPONSE_CONTRACT,
    type: clean(type || "general") || "general",
    source_expected: clean(source_expected || "interno") || "interno",
    template_family,
    variables
  };
}

function dedupeChats(chats) {
  const seen = new Set();
  const out = [];
  for (const chat of chats || []) {
    const t = chat?.turns || [];
    const key = normalize(`${t[0]?.text || ""}|${t[2]?.text || ""}|${t[4]?.text || ""}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(chat);
  }
  return out;
}

export function buildCoreChats60() {
  const base20 = CORE_20.map((item, idx) => makeChatRecord({
    chat_id: `CHAT-${String(idx + 1).padStart(3, "0")}`,
    title: item.title,
    type: item.type,
    source_expected: item.source_expected,
    template_family: "core20",
    u1: item.u1,
    b1: item.b1,
    u2: item.u2,
    b2: item.b2,
    u3: item.u3,
    b3: item.b3
  }));

  const extra40 = [];
  let count = 0;
  EXTRA_THEMES.forEach((theme) => {
    EXTRA_VARIANTS.forEach((variant) => {
      count += 1;
      extra40.push(makeChatRecord({
        chat_id: `CHAT-${String(20 + count).padStart(3, "0")}`,
        title: `${theme.metric} - ${variant.key}`,
        type: theme.type,
        source_expected: theme.source_expected,
        template_family: "core_extra40",
        u1: variant.u1(theme.metric),
        b1: variant.b1(theme.metric, theme.formula),
        u2: variant.u2(theme.metric),
        b2: variant.b2(theme.metric),
        u3: variant.u3(theme.metric),
        b3: variant.b3(theme.metric, theme.action)
      }));
    });
  });

  return dedupeChats([...base20, ...extra40]).slice(0, 60);
}

function fill(template, vars) {
  return String(template || "").replace(/\{([A-Z_]+)\}/g, (_m, key) => {
    const val = vars[key];
    return val === undefined || val === null ? `{${key}}` : String(val);
  });
}

function yearsFromOptions(options = {}) {
  if (Array.isArray(options.years) && options.years.length) {
    return options.years.map((y) => Number(y)).filter((y) => Number.isFinite(y));
  }
  return [2020, 2021, 2022, 2023, 2024, 2025];
}

export function expandTemplateChats(options = {}) {
  const years = yearsFromOptions(options);
  const rubros = options.RUBRO || CHAT_VARIABLE_SETS.RUBRO;
  const canales = options.CANAL || CHAT_VARIABLE_SETS.CANAL;
  const escenarios = options.ESCENARIO || CHAT_VARIABLE_SETS.ESCENARIO;
  const plazos = options.PLAZO || CHAT_VARIABLE_SETS.PLAZO;
  const cupos = options.CUPO || CHAT_VARIABLE_SETS.CUPO;
  const max = Number(options.max) > 0 ? Number(options.max) : 5000;

  const out = [];
  let idCounter = 1;

  for (const rubro of rubros) {
    for (const ano of years) {
      for (const canal of canales) {
        for (const escenario of escenarios) {
          if (out.length >= max) break;
          const family = CHAT_TEMPLATE_FAMILIES.find((f) => f.id === "metric_causa_accion");
          const vars = { RUBRO: rubro, ANO: ano, CANAL: canal, ESCENARIO: escenario };
          out.push(makeChatRecord({
            chat_id: `TMP-${String(idCounter).padStart(5, "0")}`,
            title: `Metrica ${rubro} ${ano} ${canal} ${escenario}`,
            type: "metric_causa_accion",
            source_expected: family.source_expected,
            variables: vars,
            template_family: family.id,
            u1: fill(family.turns.u1, vars),
            b1: fill(family.turns.b1, vars),
            u2: fill(family.turns.u2, vars),
            b2: fill(family.turns.b2, vars),
            u3: fill(family.turns.u3, vars),
            b3: fill(family.turns.b3, vars)
          }));
          idCounter += 1;
        }
      }
    }
  }

  const creditFamily = CHAT_TEMPLATE_FAMILIES.find((f) => f.id === "credito");
  for (const ano of years) {
    for (const plazo of plazos) {
      for (const cupo of cupos) {
        if (out.length >= max) break;
        const vars = { ANO: ano, PLAZO: plazo, CUPO: cupo };
        out.push(makeChatRecord({
          chat_id: `TMP-${String(idCounter).padStart(5, "0")}`,
          title: `Credito ${ano} ${plazo} ${cupo}`,
          type: "credit_decision",
          source_expected: creditFamily.source_expected,
          variables: vars,
          template_family: creditFamily.id,
          u1: fill(creditFamily.turns.u1, vars),
          b1: fill(creditFamily.turns.b1, vars),
          u2: fill(creditFamily.turns.u2, vars),
          b2: fill(creditFamily.turns.b2, vars),
          u3: fill(creditFamily.turns.u3, vars),
          b3: fill(creditFamily.turns.b3, vars)
        }));
        idCounter += 1;
      }
    }
  }

  const portalFamily = CHAT_TEMPLATE_FAMILIES.find((f) => f.id === "portal");
  for (const rubro of rubros) {
    for (const ano of years) {
      if (out.length >= max) break;
      const vars = { RUBRO: rubro, ANO: ano };
      out.push(makeChatRecord({
        chat_id: `TMP-${String(idCounter).padStart(5, "0")}`,
        title: `Portal ${rubro} ${ano}`,
        type: "external_benchmark",
        source_expected: portalFamily.source_expected,
        variables: vars,
        template_family: portalFamily.id,
        u1: fill(portalFamily.turns.u1, vars),
        b1: fill(portalFamily.turns.b1, vars),
        u2: fill(portalFamily.turns.u2, vars),
        b2: fill(portalFamily.turns.b2, vars),
        u3: fill(portalFamily.turns.u3, vars),
        b3: fill(portalFamily.turns.b3, vars)
      }));
      idCounter += 1;
    }
  }

  return dedupeChats(out);
}

export function buildChatBank(options = {}) {
  const target = Number(options.target) > 0 ? Number(options.target) : 1000;
  const includeCore = options.include_core !== false;

  const core = includeCore ? buildCoreChats60() : [];
  const expanded = expandTemplateChats({ ...options, max: Math.max(5000, target * 3) });
  let merged = dedupeChats([...core, ...expanded]);

  if (merged.length < target) {
    const extra = [];
    let i = 0;
    while (merged.length + extra.length < target && i < expanded.length * 5) {
      const base = expanded[i % expanded.length];
      const vars = { ...(base.variables || {}), VARIANTE: Math.floor(i / expanded.length) + 1 };
      const t = base.turns || [];
      extra.push({
        ...base,
        chat_id: `${base.chat_id}-R${vars.VARIANTE}`,
        title: `${base.title} variante ${vars.VARIANTE}`,
        variables: vars,
        turns: [
          { ...t[0], text: `${t[0]?.text || ""} (variante ${vars.VARIANTE})` },
          t[1],
          t[2],
          t[3],
          t[4],
          t[5]
        ]
      });
      i += 1;
    }
    merged = dedupeChats([...merged, ...extra]);
  }

  return merged.slice(0, target);
}

export function toJsonl(chats) {
  return (chats || []).map((chat) => JSON.stringify(chat)).join("\n");
}

export async function writeChatBankFiles(options = {}) {
  const outDir = options.output_dir || "bot_training";
  const target = Number(options.target) > 0 ? Number(options.target) : 1000;
  const years = yearsFromOptions(options);

  const core = buildCoreChats60();
  const bank = buildChatBank({ target, years, include_core: true });

  const summary = {
    generated_at: new Date().toISOString(),
    target,
    generated: bank.length,
    core_count: core.length,
    template_family_count: CHAT_TEMPLATE_FAMILIES.length,
    years,
    type_counts: bank.reduce((acc, c) => {
      acc[c.type] = (acc[c.type] || 0) + 1;
      return acc;
    }, {}),
    source_counts: bank.reduce((acc, c) => {
      acc[c.source_expected] = (acc[c.source_expected] || 0) + 1;
      return acc;
    }, {})
  };

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${outDir}/chat_bank_core_60.json`, JSON.stringify(core, null, 2), "utf8");
  await fs.writeFile(`${outDir}/chat_templates_multi_turn.json`, JSON.stringify(CHAT_TEMPLATE_FAMILIES, null, 2), "utf8");
  await fs.writeFile(`${outDir}/chat_bank_${target}.json`, JSON.stringify({ summary, chats: bank }, null, 2), "utf8");
  await fs.writeFile(`${outDir}/chat_bank_${target}.jsonl`, toJsonl(bank), "utf8");

  const md = [
    `# Banco de chats multi-turn ${target}`,
    "",
    `- Generado: ${summary.generated_at}`,
    `- Chats: ${summary.generated}`,
    `- Nucleo completo: ${summary.core_count}`,
    `- Familias de plantilla: ${summary.template_family_count}`,
    `- Anos base: ${years.join(", ")}`,
    "",
    "## Estructura estandar",
    "- ChatID",
    "- Contexto (empresa + 6 anos + portal)",
    "- U1/B1, U2/B2, U3/B3",
    `- Regla anti-alucinacion: ${CHAT_ANTI_HALLUCINATION_RULE}`,
    "",
    "## Distribucion por tipo",
    ...Object.entries(summary.type_counts).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Distribucion por fuente esperada",
    ...Object.entries(summary.source_counts).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Contrato de respuesta",
    "- Respuesta corta (1-2 lineas)",
    "- Calculo/formula usada",
    "- Datos usados (ano, rubros, fuente)",
    "- Interpretacion",
    "- Accion recomendada",
    "- Si falta dato: Dato no disponible + faltante + proxy"
  ].join("\n");

  await fs.writeFile(`${outDir}/reporte_chat_bank_${target}.md`, md, "utf8");

  return {
    summary,
    files: [
      `${outDir}/chat_bank_core_60.json`,
      `${outDir}/chat_templates_multi_turn.json`,
      `${outDir}/chat_bank_${target}.json`,
      `${outDir}/chat_bank_${target}.jsonl`,
      `${outDir}/reporte_chat_bank_${target}.md`
    ]
  };
}
