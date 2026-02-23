"use strict";
/* global Chart */

// ===================== Config =====================
const CONFIG = {
  superwas: "https://superwas.supersociedades.gov.co/ConsultaGeneralSociedadesWeb/ConsultaGeneral",
  proxyRaw: "https://api.allorigins.win/raw?url=",
  proxyJson: "https://api.allorigins.win/get?url=",
  proxyBackup: "https://api.codetabs.com/v1/proxy/?quest=",
  socrataBase: "https://www.datos.gov.co/resource",
  datasets: { income: "prwj-nzxa", balance: "pfdp-zks5", cashflow: "ctcp-462n" },
  lookbackYears: 7,
  supersocTimeoutMs: 12000,
  timeoutMs: 35000,
  pageSize: 5000,
  maxOffset: 100000,
  maxCompanies: 150
};

const EXTERNAL_INCOME_CONFIG = {
  reportUrl: "https://www.estrategiaenaccion.com/es/reportes",
  timeoutMs: 45000,
  retries: 3,
  maxMeasures: 80
};
let externalIncomeContextPromise = null;
const externalIncomeYearCache = new Map();

const METRIC_LABELS = {
  estado_resultados: "Estado de resultados",
  ingresos: "Ingresos",
  utilidad_neta: "Utilidad neta",
  ebitda: "EBITDA",
  ebitda_vs_flujo_operativo: "EBITDA vs Flujo operativo",
  gastos_operacionales: "Gastos operacionales",
  capital_neto_trabajo: "Capital neto de trabajo",
  deuda: "Deuda",
  dias_capital_trabajo: "Dias de capital de trabajo",
  balance_general: "Balance general",
  flujo_caja: "Flujo de caja neto",
  z_altman: "Z-Altman"
};

const CHART_ORDER = [
  "estado_resultados", "ingresos", "utilidad_neta", "ebitda", "ebitda_vs_flujo_operativo", "gastos_operacionales",
  "capital_neto_trabajo", "deuda", "dias_capital_trabajo", "balance_general", "flujo_caja", "z_altman"
];
const SUMMARY_ORDER = [
  "ingresos", "utilidad_neta", "ebitda", "gastos_operacionales", "capital_neto_trabajo",
  "deuda", "dias_capital_trabajo", "balance_general", "flujo_caja", "z_altman"
];

const RATIO_LABELS = {
  crecimiento_ingresos_yoy: "Crecimiento ingresos YoY (%)",
  margen_bruto: "Margen bruto (%)",
  margen_ebitda: "Margen EBITDA (%)",
  gastos_operacionales_sobre_ingresos: "Gastos operacionales / ingresos (%)",
  margen_neto: "Margen neto (%)",
  deuda_ebitda: "Deuda / EBITDA (x)",
  ebitda_costos_financieros: "EBITDA / costos financieros (x)"
};

const RATIO_ORDER = [
  "crecimiento_ingresos_yoy",
  "margen_bruto",
  "margen_ebitda",
  "gastos_operacionales_sobre_ingresos",
  "margen_neto",
  "deuda_ebitda",
  "ebitda_costos_financieros"
];

const PATTERNS = {
  income: {
    ingresos: {
      exact: ["ingresos de actividades ordinarias", "ingresos operacionales", "ingresos"],
      contains: ["ingresos de actividades ordinarias", "ingresos operacionales", "ingresos por operaciones", "ingresos"],
      exclude: ["ingresos financieros", "otros ingresos"]
    },
    ingresos_brutos: {
      exact: ["ingresos brutos", "ventas brutas"],
      contains: [
        "ingresos brutos",
        "ventas brutas",
        "ingresos de actividades ordinarias brutos",
        "ventas"
      ],
      exclude: ["ingresos financieros", "otros ingresos", "costo de ventas", "costo por ventas"]
    },
    descuentos_ventas: {
      exact: [
        "descuentos sobre ventas",
        "devoluciones en ventas",
        "rebajas y descuentos",
        "devoluciones rebajas y descuentos"
      ],
      contains: [
        "descuentos sobre ventas",
        "devoluciones en ventas",
        "devoluciones",
        "rebajas",
        "bonificaciones sobre ventas",
        "descuentos comerciales"
      ],
      exclude: ["descuento financiero", "costos financieros", "gastos financieros", "ingresos financieros"]
    },
    costos: {
      exact: [
        "costo de ventas",
        "costos de ventas",
        "costo por ventas",
        "costo de ventas y de prestacion de servicios",
        "costo de actividades ordinarias"
      ],
      contains: [
        "costo de ventas",
        "costos de ventas",
        "costo por ventas",
        "costos por ventas",
        "costo de actividades ordinarias",
        "costo de prestacion de servicios",
        "costo de bienes vendidos"
      ],
      exclude: ["costos financieros", "gastos financieros", "impuestos"]
    },
    utilidad_bruta: {
      exact: ["ganancia bruta", "utilidad bruta", "resultado bruto"],
      contains: ["ganancia bruta", "utilidad bruta", "resultado bruto"]
    },
    gastos_administrativos: {
      exact: [
        "gastos de administracion",
        "gasto de administracion",
        "gastos administrativos",
        "gasto administrativo",
        "gastos generales y administrativos",
        "gastos administrativos y generales",
        "gastos generales administrativos",
        "gastos generales de administracion"
      ],
      contains: [
        "gastos de administracion",
        "gastos administrativos",
        "gasto administrativo",
        "gastos generales y administrativos",
        "gastos administrativos y generales",
        "gastos generales administrativos",
        "gastos generales de administracion"
      ],
      exclude: [
        "costos de distribucion",
        "gastos de distribucion",
        "gastos de ventas",
        "gastos comerciales",
        "gastos de mercadeo",
        "gastos de comercializacion"
      ]
    },
    gastos_venta: {
      exact: [
        "gastos de ventas",
        "gasto de ventas",
        "gastos de distribucion",
        "costos de distribucion",
        "costo de distribucion",
        "gastos de comercializacion",
        "gasto de comercializacion",
        "gastos comerciales",
        "gasto comercial",
        "gastos de mercadeo",
        "gasto de mercadeo",
        "gastos de publicidad",
        "gasto de publicidad",
        "gastos de promocion",
        "gasto de promocion"
      ],
      contains: [
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
        "gasto de promocion"
      ],
      exclude: [
        "gastos de administracion",
        "gastos administrativos",
        "gastos generales y administrativos"
      ]
    },
    otros_gastos_operacionales: {
      exact: [
        "otros gastos operacionales",
        "otros gastos de operacion",
        "otros gastos operativos",
        "otros gastos, por funcion",
        "otros gastos por funcion",
        "otros costos y gastos operacionales"
      ],
      contains: [
        "otros gastos operacionales",
        "otros gastos de operacion",
        "otros gastos operativos",
        "otros gastos, por funcion",
        "otros gastos por funcion",
        "otros costos y gastos operacionales",
        "otros gastos"
      ],
      exclude: ["no operacionales", "costos financieros", "gastos financieros", "impuestos", "de cobertura"]
    },
    otros_ingresos_operacionales: {
      exact: ["otros ingresos operacionales", "otros ingresos de operacion"],
      contains: ["otros ingresos operacionales", "otros ingresos de operacion", "otros ingresos"],
      exclude: ["ingresos financieros", "no operacionales", "de cobertura"]
    },
    utilidad_neta: {
      exact: [
        "ganancia (perdida) procedente de operaciones continuadas",
        "utilidad neta",
        "utilidad (perdida) neta",
        "ganancia (perdida) del periodo",
        "resultado neto del periodo",
        "ganancia (perdida), atribuible a los propietarios de la controladora",
        "ganancia (perdida), atribuible a propietarios de la controladora"
      ],
      contains: [
        "ganancia (perdida) procedente de operaciones continuadas",
        "utilidad neta",
        "utilidad (perdida) neta",
        "ganancia (perdida) del periodo",
        "ganancia (perdida), atribuible a los propietarios de la controladora",
        "ganancia (perdida), atribuible a propietarios de la controladora",
        "resultado neto",
        "resultado del periodo",
        "resultado del ejercicio",
        "utilidad del ejercicio",
        "ganancia (perdida)"
      ],
      exclude: [
        "antes de impuestos",
        "por actividades de operacion",
        "ganancia bruta",
        "bruta",
        "operaciones discontinuadas",
        "acumulada anteriormente",
        "otro resultado integral",
        "participaciones no controladoras",
        "de cobertura",
        "deterioro de valor"
      ]
    },
    ebit: {
      exact: [
        "ganancia (perdida) por actividades de operacion",
        "ganancia (perdida) operacional",
        "utilidad operacional",
        "resultado operacional",
        "utilidad de operacion",
        "resultado de operacion",
        "utilidad operativa",
        "resultado operativo"
      ],
      contains: [
        "por actividades de operacion",
        "utilidad operacional",
        "resultado operacional",
        "utilidad de operacion",
        "resultado de operacion",
        "utilidad operativa",
        "resultado operativo",
        "ganancia operativa"
      ],
      exclude: ["antes de impuestos", "resultado del periodo", "utilidad neta", "ganancia (perdida) procedente de operaciones continuadas"]
    },
    impuestos: {
      exact: ["ingreso (gasto) por impuestos", "gasto (ingreso) por impuestos, operaciones continuadas"],
      contains: ["impuesto a las ganancias", "gasto por impuestos", "ingreso (gasto) por impuestos", "impuestos"]
    },
    gastos_financieros: {
      exact: ["costos financieros", "gastos financieros"],
      contains: ["costos financieros", "gastos financieros", "gasto financiero"]
    },
    ingresos_financieros: {
      exact: ["ingresos financieros"],
      contains: ["ingresos financieros", "ingreso financiero"]
    },
    ebitda: {
      exact: ["ebitda"],
      contains: ["ebitda"]
    },
    coberturas: {
      exact: ["ganancias (perdidas) de cobertura por cobertura de un grupo de partidas con posiciones de riesgo compensadoras"],
      contains: ["de cobertura", "cobertura"]
    },
    utilidad_subsidiaria: {
      exact: [
        "participacion en las ganancias (perdidas) de subsidiarias, asociadas y negocios conjuntos que se contabilicen utilizando el metodo de la participacion"
      ],
      contains: [
        "participacion en las ganancias",
        "participacion en las perdidas",
        "metodo de la participacion",
        "subsidiarias",
        "asociadas"
      ]
    },
    otros_ingresos_no_operacionales: {
      exact: ["otros ingresos no operacionales", "ingresos no operacionales"],
      contains: ["otros ingresos no operacionales", "ingresos no operacionales", "otras ganancias"],
      exclude: ["ingresos financieros", "operacionales", "de operacion", "de cobertura"]
    },
    otros_egresos_no_operacionales: {
      exact: ["otros gastos no operacionales", "egresos no operacionales"],
      contains: ["otros gastos no operacionales", "egresos no operacionales", "otras perdidas", "otros gastos"],
      exclude: ["costos financieros", "gastos financieros", "operacionales", "de operacion", "impuestos", "de cobertura", "por funcion"]
    }
  },
  balance: {
    activos_corrientes: { exact: ["activos corrientes totales", "total activos corrientes"], contains: ["activos corrientes"] },
    pasivos_corrientes: { exact: ["pasivos corrientes totales", "total de pasivos corrientes"], contains: ["pasivos corrientes"] },
    activos_totales: { exact: ["total de activos", "activos totales"], contains: ["total de activos"] },
    pasivos_totales: { exact: ["total pasivos", "pasivos totales"], contains: ["total pasivos"] },
    patrimonio_total: { exact: ["patrimonio total", "total patrimonio"], contains: ["patrimonio total", "total patrimonio"] },
    ganancias_acumuladas: { exact: ["ganancias acumuladas", "utilidades retenidas"], contains: ["ganancias acumuladas", "utilidades retenidas", "resultados acumulados"] },
    capital_neto_trabajo: { exact: ["capital neto de trabajo"], contains: ["capital neto de trabajo"] },
    deuda_total: {
      exact: ["deuda total", "obligaciones financieras", "pasivos financieros"],
      contains: ["deuda total", "obligaciones financieras", "pasivos financieros", "deuda financiera"]
    }
  },
  cashflow: {
    flujo_caja: {
      exact: ["incremento (disminucion) neto en el efectivo y equivalentes al efectivo", "flujo de efectivo neto"],
      contains: ["incremento", "disminucion", "neto de efectivo", "neto en el efectivo", "flujo de efectivo neto"],
      exclude: [
        "efectivo y equivalentes al efectivo al principio del periodo",
        "efectivo y equivalentes al efectivo al final del periodo",
        "al principio del periodo",
        "al final del periodo",
        "actividades de operacion",
        "actividades de financiacion",
        "actividades de inversion"
      ]
    },
    caja_inicial: {
      exact: ["efectivo y equivalentes al efectivo al principio del periodo", "efectivo al inicio del periodo"],
      contains: ["efectivo y equivalentes al efectivo al principio", "efectivo al principio", "al inicio del periodo"]
    },
    caja_final: {
      exact: ["efectivo y equivalentes al efectivo al final del periodo", "efectivo al final del periodo"],
      contains: ["efectivo y equivalentes al efectivo al final", "efectivo al final del periodo"]
    },
    flujo_operativo: {
      exact: ["flujos de efectivo netos procedentes de (utilizados en) actividades de operacion"],
      contains: ["flujos de efectivo netos", "actividades de operacion"]
    },
    flujo_financiacion: {
      exact: ["flujos de efectivo netos procedentes de (utilizados en) actividades de financiacion"],
      contains: ["flujos de efectivo netos", "actividades de financiacion", "actividades de financiacion"]
    },
    capex_contains: [
      "compras de propiedades, planta y equipo",
      "compras de activos intangibles",
      "compras de otros activos a largo plazo",
      "adquisicion de propiedades, planta y equipo",
      "adquisicion de propiedades planta y equipo",
      "compras de activos no corrientes",
      "compras de propiedades de inversion"
    ],
    capex_exclude: [
      "flujos de efectivo netos",
      "incremento (disminucion) neto",
      "efectivo y equivalentes",
      "actividades de inversion"
    ]
  },
  depAmort: ["depreciacion", "depreciaciones", "amortizacion", "amortizaciones"],
  opEx: [
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
    "costos de distribucion",
    "costo de distribucion",
    "gastos de operacion",
    "gasto de operacion",
    "gastos operacionales",
    "gasto operacional",
    "gastos operativos",
    "gasto operativo",
    "gastos de distribucion",
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
    "gastos, por funcion",
    "gastos por funcion",
    "gastos por naturaleza",
    "gasto por naturaleza",
    "gastos de administracion y ventas",
    "gastos de ventas y distribucion"
  ],
  opExExclude: [
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
  ]
};

const METRIC_CONTEXT = {
  estado_resultados: { what: "Resume ingresos, gastos operacionales y utilidad neta para ver desempeño del periodo.", good: "ingresos creciendo con utilidad positiva", bad: "gastos y perdidas recurrentes" },
  ingresos: { what: "Representa las ventas o entradas de la actividad principal.", good: "crecimiento sostenido", bad: "caida prolongada" },
  utilidad_neta: { what: "Ganancia final despues de costos, gastos, intereses e impuestos.", good: "utilidad positiva y creciente", bad: "perdidas recurrentes" },
  ebitda: { what: "Aproxima caja operativa antes de depreciaciones, intereses e impuestos.", good: "margen operativo robusto", bad: "EBITDA debil o negativo" },
  ebitda_vs_flujo_operativo: {
    what: "Compara la utilidad operativa antes de depreciaciones (EBITDA) contra la caja operativa real despues de impuestos, capital de trabajo y capex.",
    good: "flujo operativo cercano o superior al EBITDA",
    bad: "brecha grande y sostenida entre EBITDA y flujo operativo"
  },
  gastos_operacionales: { what: "Incluye gastos de administracion, ventas y operacion diaria.", good: "control de gastos frente a ventas", bad: "gastos creciendo mas rapido que ingresos" },
  capital_neto_trabajo: { what: "Liquidez de corto plazo: activos corrientes menos pasivos corrientes.", good: "capital de trabajo positivo", bad: "capital de trabajo negativo" },
  deuda: { what: "Obligaciones con terceros que la empresa debe cubrir.", good: "apalancamiento manejable", bad: "deuda alta sin mejora de utilidad o caja" },
  dias_capital_trabajo: { what: "Dias de ventas inmovilizados en el ciclo operativo.", good: "menos dias de caja atrapada", bad: "ciclo de efectivo lento" },
  balance_general: { what: "Muestra activos, pasivos y patrimonio en fecha de corte.", good: "patrimonio sano y activos suficientes", bad: "pasivos desproporcionados" },
  flujo_caja: { what: "Indica si el efectivo total aumenta o disminuye.", good: "flujo positivo y estable", bad: "consumo de caja persistente" },
  z_altman: { what: "Indice de riesgo financiero que combina liquidez, rentabilidad y apalancamiento.", good: "zona solida", bad: "zona de riesgo" }
};

const HIGHER_IS_BETTER = {
  ingresos: true, utilidad_neta: true, ebitda: true, gastos_operacionales: false, capital_neto_trabajo: true,
  deuda: false, dias_capital_trabajo: false, flujo_caja: true, z_altman: true, balance_general: true, estado_resultados: true, ebitda_vs_flujo_operativo: true
};

const DEEP_LINE_CONTEXT = {
  ingresos: {
    meaning: "Mide la capacidad comercial de la empresa y su posicion competitiva en el mercado.",
    improve: "Revisar mezcla de productos, politica de precios y crecimiento de canales con mejor margen.",
    betterHigh: true
  },
  costos: {
    meaning: "Representa el costo directo para producir o entregar lo vendido.",
    improve: "Optimizar compras, productividad y control de desperdicios para proteger el margen.",
    betterHigh: false
  },
  utilidad_bruta: {
    meaning: "Es el excedente despues de cubrir costos directos; refleja la calidad economica del negocio base.",
    improve: "Subir ticket promedio y renegociar costos variables para ampliar el margen bruto.",
    betterHigh: true
  },
  gastos_administrativos: {
    meaning: "Son gastos de estructura y soporte (administracion, direccion, back-office).",
    improve: "Priorizar eficiencia operativa, automatizacion y control de gastos fijos.",
    betterHigh: false
  },
  gastos_venta: {
    meaning: "Incluye comercializacion, mercadeo y distribucion ligados a la venta.",
    improve: "Evaluar ROI comercial por canal y ajustar gastos de venta con baja conversion.",
    betterHigh: false
  },
  otros_gastos_operacionales: {
    meaning: "Son cargos operativos no recurrentes o de soporte que afectan la utilidad operativa.",
    improve: "Depurar rubros no recurrentes y fortalecer control presupuestal operativo.",
    betterHigh: false
  },
  otros_ingresos: {
    meaning: "Ingresos adicionales que complementan la operacion principal.",
    improve: "Asegurar que sean sostenibles y no oculten debilidad del negocio principal.",
    betterHigh: true
  },
  utilidad_operativa: {
    meaning: "Mide la rentabilidad del negocio antes de estructura financiera e impuestos.",
    improve: "Mejorar productividad comercial y operativa para fortalecer el resultado central.",
    betterHigh: true
  },
  ebitda: {
    meaning: "Aproxima la generacion operativa antes de depreciaciones y financiamiento.",
    improve: "Aumentar margen operativo y disciplina de gastos para mejorar caja operativa.",
    betterHigh: true
  },
  ingresos_financieros: {
    meaning: "Rendimientos por inversiones, diferencia en cambio u otros activos financieros.",
    improve: "Gestionar excedentes de caja sin depender excesivamente de ingresos no operativos.",
    betterHigh: true
  },
  costos_financieros: {
    meaning: "Costo de la deuda y del financiamiento; impacta directamente la utilidad neta.",
    improve: "Renegociar deuda, mejorar perfil de plazos y reducir apalancamiento caro.",
    betterHigh: false
  },
  coberturas: {
    meaning: "Resultado de instrumentos de cobertura para riesgos financieros o de mercado.",
    improve: "Alinear coberturas con exposicion real y politicas de riesgo bien definidas.",
    betterHigh: true
  },
  utilidad_subsidiaria: {
    meaning: "Aporte de subsidiarias/asociadas via metodo de participacion.",
    improve: "Evaluar desempeño por filial y concentrar capital en unidades mas rentables.",
    betterHigh: true
  },
  otros_ingresos_no_operacionales: {
    meaning: "Ingresos no ligados al core del negocio (eventuales o financieros no recurrentes).",
    improve: "No depender de partidas extraordinarias para sostener utilidad final.",
    betterHigh: true
  },
  otros_egresos_no_operacionales: {
    meaning: "Cargos extraordinarios o no operativos que deterioran el resultado final.",
    improve: "Reducir eventos no recurrentes y fortalecer gobierno de riesgos.",
    betterHigh: false
  },
  impuestos: {
    meaning: "Carga tributaria neta del periodo, afecta el paso de utilidad antes de impuestos a utilidad neta.",
    improve: "Optimizar planeacion tributaria dentro del marco legal y mejorar eficiencia fiscal.",
    betterHigh: false
  },
  utilidad_neta: {
    meaning: "Resultado final para accionistas tras costos, gastos, financiamiento e impuestos.",
    improve: "Balancear crecimiento, eficiencia y estructura de capital para sostener rentabilidad.",
    betterHigh: true
  }
};

const DEEP_RATIO_CONTEXT = {
  crecimiento_ingresos_yoy: { meaning: "Variacion anual de ingresos; indica traccion comercial.", improve: "Consolidar crecimiento rentable, no solo volumen.", betterHigh: true },
  margen_bruto: { meaning: "Utilidad bruta / ingresos; muestra cuanto queda tras costos directos.", improve: "Mejor mezcla y control de costos de venta.", betterHigh: true },
  margen_ebitda: { meaning: "EBITDA / ingresos; eficiencia operativa antes de depreciaciones.", improve: "Reducir fuga de margen en gastos operativos.", betterHigh: true },
  gastos_operacionales_sobre_ingresos: { meaning: "Peso de gastos operacionales sobre ventas.", improve: "Ajustar estructura de gasto y productividad comercial.", betterHigh: false },
  margen_neto: { meaning: "Utilidad neta / ingresos; rentabilidad final de cada peso vendido.", improve: "Mejorar operacion y costo financiero/tributario.", betterHigh: true },
  deuda_ebitda: { meaning: "Años aproximados de EBITDA para cubrir deuda; mide apalancamiento.", improve: "Reducir deuda o elevar EBITDA sostenible.", betterHigh: false },
  ebitda_costos_financieros: { meaning: "Cobertura de costos financieros con EBITDA.", improve: "Reperfilamiento de deuda y mayor caja operativa.", betterHigh: true }
};

const BOT_TRAINING_SOURCE = "Curso_Inteligencia_Financiera_Bot_Valoracion_COP_Node.pdf (17-Feb-2026)";
const BOT_STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "y", "o", "u", "a", "al",
  "en", "con", "sin", "por", "para", "que", "como", "cual", "cuanto", "cuando", "donde", "porque",
  "es", "son", "se", "me", "mi", "tu", "su", "sus", "lo", "le", "les", "ya", "si", "no", "mas",
  "menos", "sobre", "entre", "este", "esta", "estos", "estas", "esa", "ese", "eso", "fue", "sera",
  "puede", "puedo", "quiero", "quieres", "explica", "explicame", "sirve", "dato", "datos", "empresa"
]);

const BOT_DOC_KNOWLEDGE = [
  {
    id: "arquitectura_4_bloques",
    title: "Arquitectura recomendada del bot financiero",
    page: 3,
    keywords: ["arquitectura", "rag", "motor deterministico", "auditor", "normalizador", "redactor", "alucinaciones"],
    explain: "La guia separa el bot en 4 bloques: normalizador, motor de calculo, base RAG y auditor de calidad.",
    useful: "Sirve para evitar errores: el codigo calcula y el bot explica. Asi no inventa cifras.",
    ask: ["Estados financieros normalizados por año", "Supuestos claros de WACC, crecimiento e impuestos"]
  },
  {
    id: "reglas_oro",
    title: "Reglas de oro para respuestas confiables",
    page: 3,
    keywords: ["reglas de oro", "no inventar", "supuesto", "trazabilidad", "due diligence"],
    explain: "Si falta informacion, el bot debe pedirla o marcar SUPUESTO de forma visible.",
    useful: "Sirve para tomar decisiones con transparencia, sin confundir estimado con cifra oficial.",
    ask: ["Dato faltante exacto", "Fuente o nota donde se respalda el supuesto"]
  },
  {
    id: "modulo_estados",
    title: "Lectura de estados financieros y notas",
    page: 4,
    keywords: ["balance", "resultados", "flujo de caja", "notas", "ifrs 16", "provisiones", "contingencias"],
    explain: "Primero se lee balance, resultados, flujo y notas para separar lo operativo de lo financiero.",
    useful: "Sirve para no mezclar utilidades contables con caja real y para detectar riesgos escondidos en notas."
  },
  {
    id: "modulo_kpis",
    title: "Motor de KPIs",
    page: 4,
    keywords: ["kpi", "margen bruto", "margen ebitda", "roe", "roic", "dso", "dio", "dpo", "ccc", "solvencia", "cobertura"],
    explain: "La guia propone medir rentabilidad, eficiencia y solvencia en forma consistente por año.",
    useful: "Sirve para detectar si una empresa crece sano o si crece con riesgo de caja y deuda."
  },
  {
    id: "modulo_dcf",
    title: "Valoracion DCF (FCFF)",
    page: 4,
    keywords: ["dcf", "fcff", "nopat", "wacc", "valor terminal", "ev", "equity", "sensibilidad"],
    explain: "En DCF se proyecta FCFF, se descuenta a WACC y se llega de EV a Equity con ajustes.",
    useful: "Sirve para valorar una empresa por su capacidad futura de generar caja."
  },
  {
    id: "supuestos_escenarios",
    title: "Supuestos, drivers y escenarios",
    page: 4,
    keywords: ["drivers", "escenarios", "base", "downside", "upside", "sensibilidad 2d", "wacc vs g", "reinvestment"],
    explain: "Los supuestos deben estar conectados con precio, volumen, costos, capex y capital de trabajo.",
    useful: "Sirve para ver que tanto cambia la valoracion cuando cambian supuestos clave."
  },
  {
    id: "comparables",
    title: "Comparables y sanity checks",
    page: 4,
    keywords: ["comparables", "ev ebitda", "ev sales", "p e", "pares", "sanity check"],
    explain: "La guia pide reconciliar DCF con multiplos y justificar prima o descuento.",
    useful: "Sirve para validar si el valor obtenido tiene sentido frente al mercado."
  },
  {
    id: "qoe",
    title: "Calidad de earnings (QoE)",
    page: 5,
    keywords: ["qoe", "calidad de earnings", "one offs", "reestructuraciones", "factoring", "estacionalidad"],
    explain: "QoE limpia partidas no recurrentes para saber la utilidad realmente sostenible.",
    useful: "Sirve para no sobrevalorar utilidades infladas por eventos puntuales."
  },
  {
    id: "dataset_jsonl",
    title: "Dataset de entrenamiento JSONL",
    page: 6,
    keywords: ["jsonl", "dataset", "1500", "q&a", "train", "eval", "rubrica", "auditor"],
    explain: "El documento recomienda entrenar comportamiento con Q&A en JSONL, no las cuentas.",
    useful: "Sirve para que el bot explique mejor, pida datos faltantes y evite errores comunes.",
    ask: ["Archivo train.jsonl", "Archivo eval.jsonl con casos de prueba"]
  },
  {
    id: "cop_nominal",
    title: "Regla COP nominal",
    page: 7,
    keywords: ["cop nominal", "inflacion", "trm", "moneda", "consistencia nominal real"],
    explain: "Si valoras en COP nominal, flujos y tasa de descuento deben estar en COP nominal.",
    useful: "Sirve para evitar errores graves por mezclar flujos reales con tasas nominales."
  },
  {
    id: "capm_wacc",
    title: "CAPM extendido y WACC",
    page: 7,
    keywords: ["capm", "wacc", "ke", "kd", "rf", "erp", "crp", "impuestos"],
    explain: "Ke se arma con Rf, beta, ERP y riesgo pais; WACC mezcla costo de equity y deuda post-impuestos.",
    useful: "Sirve para tener una tasa de descuento defendible y trazable por fecha.",
    ask: ["Rf y CRP con fuente y fecha", "Tasa efectiva de impuestos", "Estructura objetivo de capital"]
  },
  {
    id: "multi_industria",
    title: "Reglas por arquetipo de industria",
    page: 8,
    keywords: ["multi industria", "arquetipo", "saas", "banca", "utilities", "holding", "startup", "residual income", "ddm"],
    explain: "No todas las empresas se valoran igual. El bot debe clasificar arquetipo antes de valorar.",
    useful: "Sirve para elegir metodo correcto y evitar modelos mal aplicados."
  },
  {
    id: "guardrails_industria",
    title: "Guardrails obligatorios",
    page: 8,
    keywords: ["guardrails", "financials", "fcff", "ev ebitda", "inventarios", "ccc", "commodity", "regulacion"],
    explain: "Ejemplo: en financieras no usar FCFF industrial por defecto; en startups con perdida evitar EV/EBITDA.",
    useful: "Sirve para reducir errores metodologicos antes de recomendar una valoracion."
  },
  {
    id: "fuentes_confiables",
    title: "Fuentes recomendadas para RAG",
    page: 9,
    keywords: ["fuentes", "ifrs", "dian", "damodaran", "cfa", "ivsc", "datos.gov.co", "sirfin", "sec edgar"],
    explain: "La guia lista fuentes tecnicas para descargar, indexar y citar en cada respuesta.",
    useful: "Sirve para trazabilidad: toda afirmacion normativa debe tener fuente y fecha."
  },
  {
    id: "blueprint_node",
    title: "Blueprint Node/TypeScript",
    page: 10,
    keywords: ["node", "typescript", "express", "endpoints", "chat", "valuation", "retriever", "index", "pgvector"],
    explain: "El backend recomendado separa endpoint de chat (RAG) y endpoint de valoracion deterministica.",
    useful: "Sirve para escalar el bot sin quedar amarrado a un solo proveedor de IA."
  },
  {
    id: "checklist_produccion",
    title: "Checklist de produccion",
    page: 11,
    keywords: ["checklist", "produccion", "tests", "signos", "activos pasivos patrimonio", "g menor wacc", "roic vs wacc", "seguridad"],
    explain: "Antes de producir, hay que validar identidades contables, sensibilidad y seguridad de credenciales.",
    useful: "Sirve para que el bot sea rapido, confiable y auditable en uso real."
  }
];

const BOT_DOC_SOURCES = [
  "https://www.ifrs.org/issued-standards/ifrs-taxonomy/",
  "https://www.datos.gov.co/Econom-a-y-Finanzas/Estados-Financieros-NIIF-Estado-de-Situaci-n-Finan/pfdp-zks5",
  "https://www.datos.gov.co/Econom-a-y-Finanzas/Estados-Financieros-NIIF-Estado-de-Resultado-Integ/prwj-nzxa",
  "https://www.supersociedades.gov.co/web/asuntos-economicos-societarios/sirfin",
  "https://normograma.dian.gov.co/",
  "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
  "https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/free-cash-flow-valuation",
  "https://ivsc.org/"
];

const BOT_AI_ASSIST_LINKS = [
  "https://www.perplexity.ai/",
  "https://chatgpt.com/",
  "https://copilot.microsoft.com/",
  "https://www.humata.ai/",
  "https://notebooklm.google/"
];

const BOT_EXTERNAL_PROVIDERS = [
  { id: "perplexity", name: "Perplexity", url: "https://www.perplexity.ai/" },
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "copilot", name: "Copilot", url: "https://copilot.microsoft.com/" },
  { id: "humata", name: "Humata", url: "https://www.humata.ai/" },
  { id: "notebooklm", name: "NotebookLM", url: "https://notebooklm.google/" }
];
const BOT_EXTERNAL_PROVIDER_MAP = BOT_EXTERNAL_PROVIDERS.reduce((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {});
const EXTERNAL_CONFIG_STORAGE_KEY = "analizador_supersoc_ext_config_v3";
const BOT_MEMORY_STORAGE_KEY = "analizador_supersoc_bot_memory_v1";
const ADVISOR_BASE_STORAGE_KEY = "analizador_supersoc_advisor_base_v1";
const BOT_SERVER_SESSION_STORAGE_KEY = "analizador_supersoc_bot_server_session_v1";
const EXTERNAL_TIMEOUT_MS = 45000;
const HIDDEN_ADVISOR_TIMEOUT_MS = 25000;
const EXTERNAL_SYSTEM_PROMPT =
  "Eres un CFO virtual. Usa rigor tecnico, separa dato observado/supuesto/conclusion, no inventes cifras y cita fuentes cuando corresponda.";

const BOT_TERMS = [
  { id: "ingresos", label: "Ingresos", aliases: ["ingresos", "ventas"], kind: "money", getter: (s) => s?.income?.ingresos, explain: "Sirve para ver cuanto vende la empresa y si el negocio esta creciendo." },
  { id: "costos", label: "Costos", aliases: ["costos", "costo de ventas"], kind: "money", getter: (s) => s?.income?.costos, explain: "Sirve para saber cuanto cuesta producir o prestar el servicio que se vende." },
  { id: "utilidad_bruta", label: "Utilidad bruta", aliases: ["utilidad bruta", "margen bruto"], kind: "money", getter: (s) => s?.income?.utilidad_bruta, explain: "Sirve para medir si el producto deja ganancia despues de costos directos." },
  { id: "utilidad_operativa", label: "Utilidad operativa", aliases: ["utilidad operativa", "ebit", "resultado operativo"], kind: "money", getter: (s) => s?.income?.utilidad_operativa, explain: "Sirve para evaluar si el negocio principal gana dinero antes de deuda e impuestos." },
  { id: "ebitda", label: "EBITDA", aliases: ["ebitda"], kind: "money", getter: (s) => s?.income?.ebitda, explain: "Sirve para medir la fuerza operativa de caja, antes de deuda e impuestos." },
  { id: "utilidad_neta", label: "Utilidad neta", aliases: ["utilidad neta", "ganancia neta"], kind: "money", getter: (s) => s?.income?.utilidad_neta, explain: "Sirve para ver cuanto realmente gana la empresa al final del periodo." },
  { id: "deuda", label: "Deuda", aliases: ["deuda", "pasivos"], kind: "money", getter: (s) => s?.metrics?.deuda, explain: "Sirve para entender la carga financiera que tiene la empresa." },
  { id: "flujo_caja", label: "Flujo de caja", aliases: ["flujo", "flujo de caja", "efectivo"], kind: "money", getter: (s) => s?.cash?.flujo_caja, explain: "Sirve para saber si entra o sale caja real, no solo utilidad contable." },
  { id: "margen_bruto", label: "Margen bruto", aliases: ["margen bruto"], kind: "pct", getter: (s) => s?.ratios?.margen_bruto, explain: "Sirve para ver cuanta ganancia bruta queda por cada 100 pesos vendidos." },
  { id: "margen_ebitda", label: "Margen EBITDA", aliases: ["margen ebitda"], kind: "pct", getter: (s) => s?.ratios?.margen_ebitda, explain: "Sirve para medir eficiencia operativa de la empresa." },
  { id: "margen_neto", label: "Margen neto", aliases: ["margen neto"], kind: "pct", getter: (s) => s?.ratios?.margen_neto, explain: "Sirve para ver cuanto gana la empresa al final por cada 100 vendidos." },
  { id: "deuda_ebitda", label: "Deuda / EBITDA", aliases: ["deuda ebitda", "deuda/ebitda"], kind: "ratio", getter: (s) => s?.ratios?.deuda_ebitda, explain: "Sirve para estimar cuantos años de EBITDA tomaria pagar la deuda." },
  { id: "ebitda_costos_financieros", label: "EBITDA / costos financieros", aliases: ["ebitda costos financieros", "cobertura financiera"], kind: "ratio", getter: (s) => s?.ratios?.ebitda_costos_financieros, explain: "Sirve para ver si la empresa cubre bien los intereses con su operacion." },
  { id: "wacc", label: "WACC", aliases: ["wacc", "costo promedio de capital"], kind: "ratio", getter: () => null, explain: "Es la tasa para descontar flujos. Mezcla costo de deuda y costo de patrimonio." },
  { id: "dcf", label: "DCF", aliases: ["dcf", "flujo descontado"], kind: "ratio", getter: () => null, explain: "Es un metodo para valorar la empresa con sus flujos de caja futuros descontados." },
  { id: "fcff", label: "FCFF", aliases: ["fcff", "free cash flow to firm", "flujo libre de la firma"], kind: "money", getter: () => null, explain: "Es la caja operativa disponible para todos los financiadores, antes de deuda neta." },
  { id: "nopat", label: "NOPAT", aliases: ["nopat"], kind: "money", getter: () => null, explain: "Es la utilidad operativa despues de impuestos, base para construir FCFF." },
  { id: "capm", label: "CAPM", aliases: ["capm", "costo de equity"], kind: "ratio", getter: () => null, explain: "Modelo para estimar costo de patrimonio con riesgo de mercado y riesgo pais." },
  { id: "valor_terminal", label: "Valor terminal", aliases: ["valor terminal", "terminal value"], kind: "money", getter: () => null, explain: "Representa el valor de la empresa despues del periodo explicito de proyeccion." },
  { id: "ev_equity", label: "EV a Equity", aliases: ["ev a equity", "equity value", "enterprise value", "valor empresa"], kind: "money", getter: () => null, explain: "Puente de valor empresa a valor accionista ajustando deuda neta y partidas no operativas." },
  { id: "qoe", label: "Calidad de earnings", aliases: ["qoe", "calidad de earnings", "calidad de utilidades"], kind: "ratio", getter: () => null, explain: "Revision para separar utilidad recurrente de partidas extraordinarias." },
  { id: "ccc", label: "Ciclo de caja (CCC)", aliases: ["ccc", "ciclo de caja", "capital de trabajo"], kind: "ratio", getter: () => null, explain: "Mide cuantos dias tarda el efectivo en volver a caja via operacion." },
  { id: "roic", label: "ROIC", aliases: ["roic"], kind: "pct", getter: () => null, explain: "Mide retorno sobre capital invertido y se compara contra WACC." },
  { id: "riesgo_pais", label: "Riesgo pais (CRP)", aliases: ["riesgo pais", "crp"], kind: "pct", getter: () => null, explain: "Prima adicional por riesgo de invertir en un pais especifico." },
  { id: "trm", label: "TRM", aliases: ["trm", "tipo de cambio"], kind: "ratio", getter: () => null, explain: "Tasa de cambio COP/USD que afecta deuda y flujos expuestos a dolares." },
  { id: "inflacion", label: "Inflacion", aliases: ["inflacion", "modelo nominal", "tasa real"], kind: "pct", getter: () => null, explain: "Debe ser consistente con el modelo: si flujos son nominales, la tasa tambien." }
];
const BOT_CONCEPT_TERM_IDS = new Set([
  "wacc", "dcf", "fcff", "nopat", "capm", "valor_terminal", "ev_equity", "qoe",
  "ccc", "roic", "riesgo_pais", "trm", "inflacion"
]);

function initialExternalIncomeState() {
  return {
    loading: false,
    error: "",
    nit: "",
    measures: [],
    byYear: {},
    fetchedAt: null,
    context: null
  };
}

const state = {
  busy: false,
  botBusy: false,
  companies: [],
  selectedCompany: null,
  normalized: null,
  years: [],
  snapshots: {},
  charts: [],
  auditLog: {},
  externalIncome: initialExternalIncomeState(),
  externalIncomeRequestId: 0,
  botHistory: [],
  botThinkingTurns: [],
  botServerSessionId: "",
  botContext: {
    lastTermId: "",
    lastIntent: ""
  }
};
const dom = {};

function getCalcQACore() {
  if (typeof globalThis !== "undefined" && globalThis.CalcQACore) return globalThis.CalcQACore;
  return null;
}

function inferDefaultAdvisorBaseUrl() {
  try {
    if (typeof window !== "undefined" && /^https?:$/i.test(window.location?.protocol || "")) {
      return normalizeAdvisorBaseUrl(window.location.origin) || "http://127.0.0.1:8787";
    }
  } catch {}
  return "http://127.0.0.1:8787";
}

function normalizeAdvisorBaseUrl(rawValue) {
  const raw = cleanText(rawValue || "");
  if (!raw) return "";
  try {
    const base = (typeof window !== "undefined" && /^https?:$/i.test(window.location?.protocol || ""))
      ? window.location.origin
      : "http://127.0.0.1:8787";
    const parsed = new URL(raw, base);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    const path = `${parsed.pathname || ""}`.replace(/\/+$/, "");
    return `${parsed.origin}${path}`;
  } catch {
    return "";
  }
}

function currentAdvisorBaseUrl() {
  try {
    const stored = normalizeAdvisorBaseUrl(window.localStorage.getItem(ADVISOR_BASE_STORAGE_KEY) || "");
    if (stored) return stored;
    const injectedMeta = normalizeAdvisorBaseUrl(document.querySelector('meta[name="advisor-base-url"]')?.content || "");
    if (injectedMeta) return injectedMeta;
    const injectedGlobal = normalizeAdvisorBaseUrl(globalThis?.__ADVISOR_BASE_URL || "");
    if (injectedGlobal) return injectedGlobal;
  } catch {}
  return inferDefaultAdvisorBaseUrl();
}

function setAdvisorBaseUrl(nextBase) {
  const normalized = normalizeAdvisorBaseUrl(nextBase);
  if (!normalized) return "";
  try {
    window.localStorage.setItem(ADVISOR_BASE_STORAGE_KEY, normalized);
  } catch {}
  return normalized;
}

function advisorApiUrl(pathname) {
  const base = currentAdvisorBaseUrl();
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}

function normalizeBotServerSessionId(rawValue) {
  const raw = cleanText(rawValue || "");
  if (!raw) return "";
  const normalized = raw.replace(/[^a-zA-Z0-9_:.\\-]/g, "");
  if (!normalized) return "";
  return normalized.slice(0, 120);
}

function createLocalBotServerSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function readStoredBotServerSessionId() {
  try {
    return normalizeBotServerSessionId(window.localStorage.getItem(BOT_SERVER_SESSION_STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

function saveBotServerSessionIdToStorage(sessionId) {
  const normalized = normalizeBotServerSessionId(sessionId);
  if (!normalized) return;
  try { window.localStorage.setItem(BOT_SERVER_SESSION_STORAGE_KEY, normalized); } catch {}
}

function clearBotServerSessionStorage() {
  try { window.localStorage.removeItem(BOT_SERVER_SESSION_STORAGE_KEY); } catch {}
}

async function ensureBotServerSessionId(forceNew = false) {
  if (!forceNew) {
    const existing = normalizeBotServerSessionId(state.botServerSessionId || readStoredBotServerSessionId());
    if (existing) {
      state.botServerSessionId = existing;
      saveBotServerSessionIdToStorage(existing);
      return existing;
    }
  }

  let sessionId = createLocalBotServerSessionId();
  try {
    const response = await fetchWithTimeout(
      advisorApiUrl("/api/advisor/session/new"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      },
      HIDDEN_ADVISOR_TIMEOUT_MS + 2000
    );
    if (response.ok) {
      const data = await response.json().catch(() => null);
      const serverSessionId = normalizeBotServerSessionId(data?.session_id || "");
      if (serverSessionId) sessionId = serverSessionId;
    }
  } catch {}

  state.botServerSessionId = sessionId;
  saveBotServerSessionIdToStorage(sessionId);
  return sessionId;
}

async function clearRemoteBotServerSession(sessionId) {
  const id = normalizeBotServerSessionId(sessionId);
  if (!id) return;
  try {
    await fetchWithTimeout(
      advisorApiUrl("/api/advisor/session/clear"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: id })
      },
      HIDDEN_ADVISOR_TIMEOUT_MS + 1500
    );
  } catch {}
}

window.addEventListener("DOMContentLoaded", () => {
  bindDom();
  bindEvents();
  loadExternalConfigFromStorage();
  resetUi({ clearStored: false, trackWelcome: false });
  restoreBotMemoryFromStorage();
  ensureBotServerSessionId().catch(() => {});
  refreshExternalConfigStatus();
});

function bindDom() {
  [
    "searchType", "searchInput", "searchBtn", "clearBtn", "messageBox", "companyResultsBlock", "companySelect", "loadCompanyBtn",
    "selectedCompanyCard", "companyName", "companyNit", "companyStatus", "companyStage", "companyDependency",
    "selectAllYearsBtn", "clearYearsBtn", "analyzeBtn", "yearsHelp", "yearsContainer",
    "exportCsvBtn", "exportJsonBtn", "exportPdfBtn", "kpiCards", "incomeTable", "extIncomeStatus", "extIncomeTable", "balanceTable", "cashTable", "metricsTable", "deepIncomeAnalysis",
    "balanceSummaryCard", "cashflowSummaryCard", "chartsContainer",
    "botQuickQuestions", "botChatLog", "botQuestionInput", "botSendBtn", "botClearBtn",
    "botThinkingPanel", "botThinkingLog", "botThinkingRefreshBtn", "botThinkingClearBtn", "botThinkingStatus",
    "extModeToggle", "extContextInput", "extProviderList", "extBuildPromptBtn", "extCopyPromptBtn", "extDownloadContextBtn", "extOpenLinksBtn", "extPromptOutput",
    "extOpenAiKey", "extOpenAiModel", "extPerplexityKey", "extPerplexityModel", "extHumataKey", "extHumataModel", "extHumataEndpoint", "extHumataDocIds",
    "extCopilotEndpoint", "extCopilotToken", "extNotebookEndpoint", "extNotebookToken",
    "extSaveConfigBtn", "extClearConfigBtn", "extConfigStatus"
  ].forEach((id) => { dom[id] = document.getElementById(id); });
}

function bindEvents() {
  dom.searchBtn.addEventListener("click", handleSearch);
  dom.clearBtn.addEventListener("click", () => resetUi({ clearStored: true }));
  dom.loadCompanyBtn.addEventListener("click", handleLoadCompany);
  dom.analyzeBtn.addEventListener("click", runAnalysis);
  dom.selectAllYearsBtn.addEventListener("click", () => setAllYears(true));
  dom.clearYearsBtn.addEventListener("click", () => setAllYears(false));
  dom.exportCsvBtn.addEventListener("click", exportCsv);
  dom.exportJsonBtn.addEventListener("click", exportJson);
  dom.exportPdfBtn?.addEventListener("click", exportPdf);
  dom.searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleSearch(); });
  dom.botSendBtn.addEventListener("click", handleBotSend);
  dom.botClearBtn.addEventListener("click", () => initBotChat({ clearStored: true }));
  dom.botQuestionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleBotSend();
    }
  });
  dom.botQuickQuestions.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-q]");
    if (!btn) return;
    dom.botQuestionInput.value = btn.getAttribute("data-q") || "";
    handleBotSend();
  });
  dom.botThinkingRefreshBtn?.addEventListener("click", refreshBotThinkingFromServer);
  dom.botThinkingClearBtn?.addEventListener("click", clearBotThinkingLog);
  dom.extBuildPromptBtn.addEventListener("click", generateExternalPromptFromCurrentInput);
  dom.extCopyPromptBtn.addEventListener("click", copyExternalPromptToClipboard);
  dom.extDownloadContextBtn.addEventListener("click", downloadExternalContextJson);
  dom.extOpenLinksBtn.addEventListener("click", openSelectedExternalLinks);
  dom.extSaveConfigBtn?.addEventListener("click", saveExternalConfigToStorage);
  dom.extClearConfigBtn?.addEventListener("click", clearExternalConfigFromStorage);
  dom.extModeToggle?.addEventListener("change", refreshExternalConfigStatus);
  dom.extProviderList?.addEventListener("change", refreshExternalConfigStatus);
}

function resetUi(options = {}) {
  const clearStored = options?.clearStored !== false;
  const trackWelcome = options?.trackWelcome !== false;
  state.busy = false;
  state.botBusy = false;
  state.companies = [];
  state.selectedCompany = null;
  state.normalized = null;
  state.years = [];
  state.snapshots = {};
  state.auditLog = {};
  state.externalIncome = initialExternalIncomeState();
  state.externalIncomeRequestId += 1;
  state.botHistory = [];
  state.botThinkingTurns = [];
  state.botServerSessionId = clearStored ? "" : normalizeBotServerSessionId(state.botServerSessionId || readStoredBotServerSessionId());
  state.botContext = { lastTermId: "", lastIntent: "" };
  destroyCharts();

  dom.searchInput.value = "";
  dom.companySelect.innerHTML = "";
  dom.companyResultsBlock.classList.add("hidden");
  dom.selectedCompanyCard.classList.add("hidden");
  dom.yearsContainer.innerHTML = "";
  dom.yearsHelp.textContent = "Primero busca y carga una empresa para habilitar años.";
  dom.analyzeBtn.disabled = true;
  dom.exportCsvBtn.disabled = true;
  dom.exportJsonBtn.disabled = true;
  dom.exportPdfBtn.disabled = true;
  dom.kpiCards.innerHTML = "";
  dom.incomeTable.innerHTML = "";
  if (dom.extIncomeTable) dom.extIncomeTable.innerHTML = "";
  if (dom.extIncomeStatus) {
    dom.extIncomeStatus.className = "hint ext-income-status";
    dom.extIncomeStatus.textContent = "Se cargara al analizar la empresa.";
  }
  dom.balanceTable.innerHTML = "";
  dom.cashTable.innerHTML = "";
  dom.metricsTable.innerHTML = "";
  dom.deepIncomeAnalysis.innerHTML = "";
  dom.balanceSummaryCard.innerHTML = "";
  dom.cashflowSummaryCard.innerHTML = "";
  dom.chartsContainer.innerHTML = "";
  if (dom.extPromptOutput) dom.extPromptOutput.value = "";
  if (dom.extModeToggle) dom.extModeToggle.checked = true;
  if (dom.botSendBtn) {
    dom.botSendBtn.disabled = false;
    dom.botSendBtn.textContent = "Preguntar";
  }
  initBotChat({ clearStored, trackWelcome });
  renderBotThinkingLog();
  refreshExternalConfigStatus();
  hideMessage();
}

async function handleSearch() {
  const query = (dom.searchInput.value || "").trim();
  const by = dom.searchType.value;
  if (!query) return showMessage("warning", "Ingresa un NIT o un nombre para iniciar la busqueda.");
  if (state.busy) return;

  clearAnalysisUi();
  setBusy(true, "Buscando empresa en Supersociedades...");

  try {
    let companies = await searchCompanies(query, by);
    if (by === "name" && companies.length > 1) {
      showMessage("info", "Validando cuales empresas tienen estados financieros disponibles...");
      companies = await enrichCompaniesWithDataAvailability(companies);
      companies = companies.sort((a, b) => Number(b.hasOfficialData) - Number(a.hasOfficialData));
    }
    state.companies = companies;
    if (!companies.length) throw new Error("No se encontraron coincidencias en Supersociedades.");

    renderCompanyOptions(companies);
    if (by === "nit" || companies.length === 1) {
      dom.companySelect.value = "0";
      await loadCompany(companies[0]);
    } else {
      const withData = companies.filter((c) => c.hasOfficialData).length;
      const msg = withData
        ? `Se encontraron ${companies.length} empresas. ${withData} tienen datos financieros en datos abiertos.`
        : `Se encontraron ${companies.length} empresas. Selecciona una y pulsa "Cargar empresa".`;
      showMessage("success", msg);
    }
  } catch (error) {
    showMessage("error", toUserError(error));
  } finally {
    setBusy(false);
  }
}

async function handleLoadCompany() {
  const idx = Number(dom.companySelect.value);
  if (!Number.isFinite(idx) || !state.companies[idx]) return showMessage("warning", "Selecciona una empresa valida.");
  const selected = state.companies[idx];
  if (selected.hasOfficialData === false) {
    const alt = state.companies.find((c) => c.hasOfficialData);
    if (alt) {
      const altIdx = state.companies.indexOf(alt);
      dom.companySelect.value = String(altIdx);
      return showMessage(
        "warning",
        `La empresa seleccionada no tiene estados financieros en datos abiertos. Te movi a "${alt.razon_social}" que si tiene datos para analizar.`
      );
    }
  }
  if (state.busy) return;
  setBusy(true, "Cargando empresa y estados financieros...");
  try {
    await loadCompany(state.companies[Number(dom.companySelect.value)]);
  } catch (error) {
    showMessage("error", toUserError(error));
  } finally {
    setBusy(false);
  }
}

function setBusy(flag, infoMsg) {
  state.busy = flag;
  dom.searchBtn.disabled = flag;
  dom.clearBtn.disabled = flag;
  dom.loadCompanyBtn.disabled = flag;
  dom.analyzeBtn.disabled = flag || !state.years.length;
  dom.searchBtn.textContent = flag ? "Buscando..." : "Buscar";
  if (infoMsg) showMessage("info", infoMsg);
}

function clearAnalysisUi() {
  state.normalized = null;
  state.years = [];
  state.snapshots = {};
  state.auditLog = {};
  state.externalIncome = initialExternalIncomeState();
  state.externalIncomeRequestId += 1;
  destroyCharts();
  dom.yearsContainer.innerHTML = "";
  dom.analyzeBtn.disabled = true;
  dom.exportCsvBtn.disabled = true;
  dom.exportJsonBtn.disabled = true;
  dom.exportPdfBtn.disabled = true;
  dom.kpiCards.innerHTML = "";
  dom.incomeTable.innerHTML = "";
  if (dom.extIncomeTable) dom.extIncomeTable.innerHTML = "";
  if (dom.extIncomeStatus) {
    dom.extIncomeStatus.className = "hint ext-income-status";
    dom.extIncomeStatus.textContent = "Se cargara al analizar la empresa.";
  }
  dom.balanceTable.innerHTML = "";
  dom.cashTable.innerHTML = "";
  dom.metricsTable.innerHTML = "";
  dom.deepIncomeAnalysis.innerHTML = "";
  dom.balanceSummaryCard.innerHTML = "";
  dom.cashflowSummaryCard.innerHTML = "";
  dom.chartsContainer.innerHTML = "";
  if (dom.extPromptOutput) dom.extPromptOutput.value = "";
  initBotChat();
}

async function searchCompanies(query, by) {
  if (by === "nit") {
    const nit = normalizeNit(query);
    if (!nit) throw new Error("El NIT ingresado no tiene un formato valido.");
    try {
      const html = await fetchSupersocHtml(`${CONFIG.superwas}?action=consultaPorNit&nit=${encodeURIComponent(nit)}`);
      return parseNitSearch(html, nit);
    } catch (error) {
      // Modo de respaldo: permite analizar por NIT aunque falle la consulta del portal.
      if (isConnectivityLikeError(error) || isLikelyParserError(error)) {
        return [{
          nit,
          razon_social: `Empresa NIT ${nit}`,
          estado: "N/D (fallback)",
          etapa_situacion: "N/D (fallback)",
          dependencia: "N/D (fallback)",
          expediente: ""
        }];
      }
      throw error;
    }
  }
  try {
    const html = await fetchSupersocHtml(`${CONFIG.superwas}?action=consultaPorRazonSocial&razonSocial=${encodeURIComponent(query)}`);
    return parseNameSearch(html, query);
  } catch (error) {
    if (isConnectivityLikeError(error)) {
      throw new Error(
        "No pudimos consultar Supersociedades por nombre en este momento. " +
        "Intenta con el NIT para continuar con el analisis financiero."
      );
    }
    throw error;
  }
}
async function fetchSupersocHtml(targetUrl) {
  const encoded = encodeURIComponent(targetUrl);
  const candidates = [
    { type: "html", url: `${CONFIG.proxyBackup}${encoded}`, source: "codetabs-backup" },
    { type: "html", url: `${CONFIG.proxyRaw}${encoded}`, source: "allorigins-raw" },
    { type: "json", url: `${CONFIG.proxyJson}${encoded}`, source: "allorigins-json" }
  ];

  const attempts = candidates.map((candidate) => fetchSupersocViaCandidate(candidate));
  try {
    return await Promise.any(attempts);
  } catch {
    const reasons = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          await fetchSupersocViaCandidate(candidate);
          return null;
        } catch (err) {
          return `${candidate.source}: ${err?.message || err}`;
        }
      })
    );
    const errors = reasons.filter(Boolean);
    throw new Error(
      "No fue posible conectar con Supersociedades en este momento. " +
      "Intentamos varios canales de conexion y todos fallaron. " +
      "Detalle tecnico: " + errors.join(" | ")
    );
  }
}

async function fetchSupersocViaCandidate(candidate) {
  const response = await fetchWithTimeout(
    candidate.url,
    { method: "GET", headers: { Accept: "*/*" } },
    CONFIG.supersocTimeoutMs
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  let html = "";
  if (candidate.type === "json") {
    const payload = await response.json();
    html = typeof payload?.contents === "string" ? payload.contents : "";
  } else {
    html = await response.text();
  }

  if (!html || html.length < 60) throw new Error("respuesta vacia");
  if (html.includes("Attention Required") || html.includes("Cloudflare")) {
    throw new Error("bloqueo de Cloudflare");
  }
  return html;
}

// Parsea respuesta de busqueda por NIT (detalle unico).
function parseNitSearch(html, fallbackNit) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (normalizeText(doc.body?.textContent || "").includes("no se encontraron resultados")) {
    throw new Error(`No se encontro una empresa con el NIT ${fallbackNit}.`);
  }
  const record = { nit: fallbackNit, razon_social: "", estado: "", etapa_situacion: "", dependencia: "", expediente: "" };
  doc.querySelectorAll("table tr").forEach((row) => {
    const th = row.querySelector("th");
    const td = row.querySelector("td");
    if (!th || !td) return;
    const key = normalizeText(th.textContent);
    const keyLoose = normalizeLooseKey(th.textContent);
    const value = cleanText(td.textContent);
    if (key.startsWith("nit") || keyLoose === "nit") record.nit = normalizeNit(value) || fallbackNit;
    else if (key.includes("razon social") || (keyLoose.includes("raz") && keyLoose.includes("social"))) record.razon_social = value;
    else if (key === "estado" || keyLoose === "estado") record.estado = value;
    else if (key.includes("etapa") || keyLoose.includes("etapa")) record.etapa_situacion = value;
    else if (key.includes("dependencia") || keyLoose.includes("dependencia")) record.dependencia = value;
    else if (key.includes("expediente") || keyLoose.includes("expediente")) record.expediente = value;
  });
  if (!record.razon_social) throw new Error(`No se encontro una empresa con el NIT ${fallbackNit} en Supersociedades.`);
  return [record];
}

// Parsea respuesta de busqueda por nombre (listado de empresas).
function parseNameSearch(html, queryName) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [];
  doc.querySelectorAll("table tr").forEach((tr) => {
    const cells = [...tr.querySelectorAll("td")];
    if (cells.length < 5) return;
    const anchor = cells[0].querySelector("a");
    let nit = normalizeNit(anchor ? anchor.textContent : cells[0].textContent);
    if (!nit && anchor?.getAttribute("href")) {
      const qs = (anchor.getAttribute("href").split("?")[1] || "");
      nit = normalizeNit(new URLSearchParams(qs).get("nit") || "");
    }
    if (!nit) return;
    rows.push({
      nit,
      razon_social: cleanText(cells[1].textContent),
      estado: cleanText(cells[2].textContent),
      etapa_situacion: cleanText(cells[3].textContent),
      dependencia: cleanText(cells[4].textContent),
      expediente: ""
    });
  });
  if (!rows.length) {
    // Fallback de parsing para HTML con codificacion irregular.
    const regexRows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    regexRows.forEach((match) => {
      const rowHtml = match[1] || "";
      const nitHref = rowHtml.match(/consultaPorNit&nit=(\d{6,12})/i);
      const cellMatches = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => htmlToText(m[1]));
      const nit = normalizeNit(nitHref?.[1] || cellMatches[0] || "");
      if (!nit) return;
      rows.push({
        nit,
        razon_social: cleanText(cellMatches[1] || `Empresa NIT ${nit}`),
        estado: cleanText(cellMatches[2] || ""),
        etapa_situacion: cleanText(cellMatches[3] || ""),
        dependencia: cleanText(cellMatches[4] || ""),
        expediente: ""
      });
    });
  }

  if (!rows.length) throw new Error(`No se encontraron coincidencias para "${queryName}" en Supersociedades.`);
  const unique = [];
  const seen = new Set();
  rows.forEach((row) => {
    if (seen.has(row.nit)) return;
    seen.add(row.nit);
    unique.push(row);
  });
  return unique.slice(0, CONFIG.maxCompanies);
}

function renderCompanyOptions(companies) {
  dom.companySelect.innerHTML = "";
  companies.forEach((c, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    const dataBadge = c.hasOfficialData === true ? " | con datos" : (c.hasOfficialData === false ? " | sin datos" : "");
    opt.textContent = `${c.razon_social} (NIT ${c.nit})${dataBadge}`;
    dom.companySelect.appendChild(opt);
  });
  dom.companyResultsBlock.classList.remove("hidden");
}

function renderSelectedCompany(company) {
  dom.companyName.textContent = company.razon_social || "N/D";
  dom.companyNit.textContent = company.nit || "N/D";
  dom.companyStatus.textContent = company.estado || "N/D";
  dom.companyStage.textContent = company.etapa_situacion || "N/D";
  dom.companyDependency.textContent = company.dependencia || "N/D";
  dom.selectedCompanyCard.classList.remove("hidden");
}

async function loadCompany(company) {
  clearAnalysisUi();
  state.selectedCompany = company;
  renderSelectedCompany(company);

  if (String(company.estado || "").includes("fallback")) {
    showMessage(
      "warning",
      "No se pudo leer datos basicos de Supersociedades. Se continuo con analisis por NIT usando datos financieros oficiales."
    );
  }

  const rows = await fetchFinancialRows(company.nit);
  state.normalized = {
    income: normalizeRows(rows.income),
    balance: normalizeRows(rows.balance),
    cashflow: normalizeRows(rows.cashflow)
  };

  const years = selectRecentYears(state.normalized, CONFIG.lookbackYears);
  if (!years.length) throw new Error("La empresa fue encontrada, pero no hay datos financieros recientes para analizar.");
  state.years = years;

  renderYears(years);
  dom.analyzeBtn.disabled = false;
  dom.yearsHelp.textContent = "Puedes activar o quitar años y luego pulsar \"Actualizar analisis\".";
  runAnalysis();
  showMessage("success", `Analisis listo para ${company.razon_social} (NIT ${company.nit}).`);
}

// Descarga en paralelo ingresos, balance y flujo de caja desde datos.gov.co.
async function fetchFinancialRows(nitRaw) {
  const nit = normalizeNit(nitRaw);
  if (!nit) throw new Error("NIT invalido para consultar informacion financiera.");
  const nitCandidates = buildNitCandidates(nitRaw);
  if (!nitCandidates.length) throw new Error("No fue posible construir un NIT valido para consulta financiera.");

  const minYear = new Date().getFullYear() - Math.max(CONFIG.lookbackYears + 2, 7);
  const minDate = `${minYear}-01-01T00:00:00`;

  let [income, balance, cashflow] = await Promise.all([
    fetchDataset(CONFIG.datasets.income, nitCandidates, minDate),
    fetchDataset(CONFIG.datasets.balance, nitCandidates, minDate),
    fetchDataset(CONFIG.datasets.cashflow, nitCandidates, minDate)
  ]);

  let fallbackMode = "";
  if (!income.length && !balance.length && !cashflow.length) {
    // Fallback: hay empresas con data util fuera de la ventana reciente.
    [income, balance, cashflow] = await Promise.all([
      fetchDataset(CONFIG.datasets.income, nitCandidates, null),
      fetchDataset(CONFIG.datasets.balance, nitCandidates, null),
      fetchDataset(CONFIG.datasets.cashflow, nitCandidates, null)
    ]);
    fallbackMode = "all_years";
  }

  const matchedNit = chooseDominantNit(income, balance, cashflow, nitCandidates);
  const matchBase = matchedNit ? normalizeNit(matchedNit) : null;
  const isMatchedRow = (row) => {
    if (!matchedNit) return true;
    const rowNit = nitDigits(row?.nit);
    return rowNit === matchedNit || (!!matchBase && rowNit === matchBase);
  };
  let incomeRows = income.filter(isMatchedRow);
  let balanceRows = balance.filter(isMatchedRow);
  let cashflowRows = cashflow.filter(isMatchedRow);

  // Fallback de seguridad: si hubo filas pero no coincidio filtro estricto por NIT dominante,
  // se usa el crudo para evitar falsos negativos por formatos atipicos de NIT.
  if (!incomeRows.length && !balanceRows.length && !cashflowRows.length && (income.length || balance.length || cashflow.length)) {
    incomeRows = income;
    balanceRows = balance;
    cashflowRows = cashflow;
    fallbackMode = fallbackMode || "relaxed_match";
  }

  if (!incomeRows.length && !balanceRows.length && !cashflowRows.length) {
    throw new Error("No se encontraron estados financieros para este NIT en datos abiertos oficiales.");
  }
  if (fallbackMode) {
    console.info(`[fetchFinancialRows] Fallback aplicado (${fallbackMode}) para NIT ${nitCandidates.join(",")}`);
  }
  return { income: incomeRows, balance: balanceRows, cashflow: cashflowRows };
}

async function fetchDataset(datasetId, nitCandidates, minDate) {
  if (!Array.isArray(nitCandidates) || !nitCandidates.length) return [];
  const rows = [];
  let offset = 0;
  const nitClause = buildNitWhereClause(nitCandidates);
  const dateClause = minDate ? ` AND fecha_corte >= '${minDate}'` : "";

  while (true) {
    const p = new URLSearchParams();
    p.set("$select", "nit,fecha_corte,periodo,concepto,valor,numero_radicado,id_punto_entrada,punto_entrada,id_taxonomia,taxonomia,codigo_instancia");
    p.set("$where", `(${nitClause})${dateClause}`);
    p.set("$order", "fecha_corte DESC");
    p.set("$limit", String(CONFIG.pageSize));
    p.set("$offset", String(offset));

    const url = `${CONFIG.socrataBase}/${datasetId}.json?${p.toString()}`;
    const chunk = await fetchJsonWithRetry(url);
    if (!Array.isArray(chunk)) throw new Error("La respuesta de datos.gov.co no tiene el formato esperado.");

    rows.push(...chunk);
    if (chunk.length < CONFIG.pageSize || offset > CONFIG.maxOffset) break;
    offset += CONFIG.pageSize;
  }
  return rows;
}

function buildNitWhereClause(nitCandidates) {
  const clauses = [];
  const seen = new Set();
  const seenNumeric = new Set();
  nitCandidates.forEach((raw) => {
    const n = nitDigits(raw);
    if (!n || seen.has(n)) return;
    seen.add(n);
    clauses.push(`nit='${n}'`);
    // Soporta datasets donde nit se trate como columna numerica.
    const numeric = Number(n);
    if (Number.isFinite(numeric) && !seenNumeric.has(numeric)) {
      seenNumeric.add(numeric);
      clauses.push(`nit=${numeric}`);
    }
  });
  return clauses.length ? clauses.join(" OR ") : "1=0";
}

async function enrichCompaniesWithDataAvailability(companies) {
  if (!Array.isArray(companies) || !companies.length) return companies || [];
  const nitList = [...new Set(companies.map((c) => normalizeNit(c.nit)).filter(Boolean))];
  if (!nitList.length) return companies.map((c) => ({ ...c, hasOfficialData: null, lastDataYear: null }));

  const availability = await fetchAvailabilityByNit(nitList);
  return companies.map((company) => {
    const baseNit = normalizeNit(company.nit);
    const info = availability.get(baseNit);
    return {
      ...company,
      hasOfficialData: !!info,
      lastDataYear: info?.lastYear ?? null
    };
  });
}

async function fetchAvailabilityByNit(nitList) {
  const out = new Map();
  const chunks = chunkArray(nitList, 60);
  const datasets = [CONFIG.datasets.income, CONFIG.datasets.balance, CONFIG.datasets.cashflow];

  for (const datasetId of datasets) {
    for (const chunk of chunks) {
      const where = buildNitWhereClause(chunk);
      const p = new URLSearchParams();
      p.set("$select", "nit,max(fecha_corte) as ultima_fecha");
      p.set("$where", `(${where})`);
      p.set("$group", "nit");
      p.set("$limit", "5000");
      const url = `${CONFIG.socrataBase}/${datasetId}.json?${p.toString()}`;
      const rows = await fetchJsonWithRetry(url);
      if (!Array.isArray(rows)) continue;

      rows.forEach((row) => {
        const nit = normalizeNit(row?.nit);
        if (!nit) return;
        const year = extractYear(row?.ultima_fecha || row?.fecha_corte || "");
        const prev = out.get(nit);
        if (!prev || (Number.isFinite(year) && year > prev.lastYear)) {
          out.set(nit, { lastYear: Number.isFinite(year) ? year : prev?.lastYear || null });
        }
      });
    }
  }
  return out;
}

async function fetchJsonWithRetry(url, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const r = await fetchWithTimeout(url, { method: "GET" });
      if (!r.ok) {
        const retriable = r.status === 429 || r.status >= 500;
        if (retriable && attempt < maxAttempts) {
          await sleep(250 * attempt);
          continue;
        }
        throw new Error("No fue posible conectarse con datos.gov.co para descargar estados financieros.");
      }
      return await r.json();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(250 * attempt);
        continue;
      }
    }
  }
  throw lastError || new Error("No fue posible conectarse con datos.gov.co para descargar estados financieros.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = CONFIG.timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("La solicitud demoro demasiado. Verifica tu conexion e intenta de nuevo.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshExternalIncomeStatement() {
  if (!state.selectedCompany || !state.years.length) return;
  if (!dom.extIncomeTable || !dom.extIncomeStatus) return;
  const nit = normalizeNit(state.selectedCompany.nit);
  if (!nit) return;

  const requestId = state.externalIncomeRequestId + 1;
  state.externalIncomeRequestId = requestId;
  state.externalIncome = {
    ...(state.externalIncome || initialExternalIncomeState()),
    loading: true,
    error: "",
    nit
  };
  renderExternalIncomeTable();

  try {
    const ctx = await getExternalIncomePowerBiContext();
    if (requestId !== state.externalIncomeRequestId) return;

    const years = [...state.years].sort((a, b) => b - a);
    const byYear = {};
    for (const year of years) {
      try {
        byYear[year] = await fetchExternalIncomeMetricsByYear(ctx, nit, year);
      } catch (err) {
        byYear[year] = { __error: cleanText(err?.message || err || "error_externo") };
      }
    }
    if (requestId !== state.externalIncomeRequestId) return;

    const hasData = years.some((year) => {
      const row = byYear[year] || {};
      return Object.keys(row).some((k) => k !== "__error" && Number.isFinite(row[k]));
    });

    state.externalIncome = {
      loading: false,
      error: hasData ? "" : "No se encontraron datos externos comparables para este NIT.",
      nit,
      measures: ctx.incomeMeasures,
      byYear,
      fetchedAt: new Date().toISOString(),
      context: {
        reportUrl: ctx.reportUrl,
        viewUrl: ctx.viewUrl,
        selectedYear: ctx.selectedYear
      }
    };
  } catch (error) {
    if (requestId !== state.externalIncomeRequestId) return;
    state.externalIncome = {
      ...initialExternalIncomeState(),
      nit,
      error: `No se pudo cargar estado de resultados externo: ${cleanText(error?.message || error)}`
    };
  }

  renderExternalIncomeTable();
}

function externalIncomeMetricKind(property) {
  const p = normalizeText(property || "");
  if (!p) return "num";
  if (
    p.startsWith("%") ||
    p.includes("margen") ||
    p.includes("gastos operacionales/ingresos") ||
    p.includes("delta ingresos") ||
    p.includes("δ ingresos")
  ) return "pct";
  if (p.includes("deuda/ebitda") || p.includes("ebitda/costos financieros")) return "ratio";
  if (p.includes("/")) return "ratio";
  return "money";
}

function createExternalPowerBiUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function decodeExternalBase64UrlJson(input) {
  const base64 = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const text = typeof TextDecoder !== "undefined"
    ? new TextDecoder("utf-8").decode(bytes)
    : decodeURIComponent(escape(binary));
  return JSON.parse(text);
}

function extractExternalPowerBiIframeSrc(html) {
  const match = String(html || "").match(/<iframe[^>]+src="([^"]*app\.powerbi\.com\/view\?r=[^"]+)"/i);
  return match?.[1] || "";
}

function extractExternalPowerBiResourceKey(viewUrl) {
  if (!viewUrl) return "";
  const parsed = new URL(viewUrl);
  const encoded = parsed.searchParams.get("r");
  if (!encoded) return "";
  const payload = decodeExternalBase64UrlJson(encoded);
  return String(payload?.k || "");
}

function extractExternalPowerBiClusterUri(embedHtml) {
  const match = String(embedHtml || "").match(/var\s+resolvedClusterUri\s*=\s*'([^']+)'/i);
  return match?.[1] || "";
}

function buildExternalPowerBiApiBase(clusterUri) {
  const parsed = new URL(clusterUri);
  const hostParts = parsed.hostname.split(".");
  hostParts[0] = hostParts[0].replace("-redirect", "").replace("global-", "") + "-api";
  return `${parsed.protocol}//${hostParts.join(".")}`;
}

function externalPowerBiHeaders(resourceKey) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ActivityId: createExternalPowerBiUuid(),
    RequestId: createExternalPowerBiUuid(),
    "X-PowerBI-ResourceKey": resourceKey
  };
}

async function fetchExternalTextWithRetry(url, maxAttempts = EXTERNAL_INCOME_CONFIG.retries) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, { method: "GET" }, EXTERNAL_INCOME_CONFIG.timeoutMs);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await sleep(250 * attempt);
    }
  }
  throw lastError || new Error("No fue posible leer el reporte externo.");
}

async function fetchExternalJsonWithRetry(url, options = {}, maxAttempts = EXTERNAL_INCOME_CONFIG.retries) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, EXTERNAL_INCOME_CONFIG.timeoutMs);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await sleep(300 * attempt);
    }
  }
  throw lastError || new Error("No fue posible consultar el origen externo.");
}

async function externalPowerBiQuery(apiBase, resourceKey, body, maxAttempts = EXTERNAL_INCOME_CONFIG.retries) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchExternalJsonWithRetry(
        `${apiBase}/public/reports/querydata`,
        {
          method: "POST",
          headers: externalPowerBiHeaders(resourceKey),
          body: JSON.stringify(body)
        },
        1
      );
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await sleep(300 * attempt);
    }
  }
  throw lastError || new Error("No fue posible ejecutar consulta externa.");
}

function parseExternalPowerBiRows(response) {
  const result = response?.results?.[0]?.result?.data;
  const selectMeta = result?.descriptor?.Select || [];
  const ds = result?.dsr?.DS?.[0];
  const dmRows = (ds?.PH || []).flatMap((ph) => ph?.DM0 || []);
  const rows = [];

  dmRows.forEach((row) => {
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
  });

  return rows;
}

function parseExternalPowerBiLiteralYear(literalValue) {
  const match = String(literalValue || "").match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

function collectExternalPowerBiVisualConfigs(models) {
  const sections = models?.exploration?.sections || [];
  const visuals = [];
  sections.forEach((section) => {
    (section.visualContainers || []).forEach((container) => {
      try {
        const config = JSON.parse(container.config);
        const query = config?.singleVisual?.prototypeQuery || null;
        const select = query?.Select || [];
        const measureProps = select.map((sel) => sel?.Measure?.Property).filter(Boolean);
        visuals.push({
          sectionName: cleanText(section.displayName || section.name || ""),
          visualType: cleanText(config?.singleVisual?.visualType || ""),
          query,
          measureProps
        });
      } catch {
        // Ignora visuales con JSON invalido.
      }
    });
  });
  return visuals;
}

function findExternalPowerBiSelectedYear(models) {
  const sections = models?.exploration?.sections || [];
  for (const section of sections) {
    for (const container of section.visualContainers || []) {
      try {
        const config = JSON.parse(container.config);
        if (normalizeText(config?.singleVisual?.visualType) !== "slicer") continue;
        const filter = config?.singleVisual?.objects?.general?.[0]?.properties?.filter?.filter;
        const where = filter?.Where || [];
        const yearFilter = where.find((w) =>
          normalizeText(w?.Condition?.In?.Expressions?.[0]?.Column?.Property).includes("ano")
        );
        const literal = yearFilter?.Condition?.In?.Values?.[0]?.[0]?.Literal?.Value;
        const year = parseExternalPowerBiLiteralYear(literal);
        if (Number.isFinite(year)) return year;
      } catch {
        // sigue buscando
      }
    }
  }
  return null;
}

function findExternalPowerBiEntities(models) {
  const found = {
    entityCaratulas: "Caratulas consolidado",
    entityDates: "dim_Fechas",
    entitySection: "Seccion CIIU",
    entityMeasures: "Medidas",
    propNit: "NIT",
    propNitRazon: "Nit - Razon social",
    propYear: "Ano",
    propSectionDesc: "Seccion - Descripcion"
  };

  const visuals = collectExternalPowerBiVisualConfigs(models);
  visuals.forEach((visual) => {
    (visual?.query?.From || []).forEach((source) => {
      const entity = cleanText(source?.Entity);
      const normalized = normalizeText(entity);
      if (normalized.includes("caratulas consolidado")) found.entityCaratulas = entity;
      if (normalized.includes("dim_fechas") || normalized.includes("dim fechas")) found.entityDates = entity;
      if (normalized.includes("seccion ciiu")) found.entitySection = entity;
      if (normalized === "medidas") found.entityMeasures = entity;
    });
    (visual?.query?.Select || []).forEach((sel) => {
      const property = cleanText(sel?.Column?.Property);
      const normalized = normalizeText(property);
      if (normalized === "nit") found.propNit = property;
      if (normalized.includes("nit - razon social")) found.propNitRazon = property;
      if (normalized === "ano") found.propYear = property;
      if (normalized.includes("seccion - descripcion")) found.propSectionDesc = property;
    });
  });

  return found;
}

function dedupeExternalMeasureProperties(props) {
  const seen = new Set();
  const out = [];
  (props || []).forEach((prop) => {
    const normalized = normalizeLooseKey(prop);
    if (!normalized || normalized === "blank") return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(prop);
  });
  return out;
}

function findExternalIncomeMeasures(models) {
  const visuals = collectExternalPowerBiVisualConfigs(models);
  const incomeSection = visuals.filter((visual) =>
    normalizeText(visual.sectionName).includes("estado de resultados")
  );

  const prioritized = incomeSection.filter((visual) => {
    const type = normalizeText(visual.visualType);
    return type === "pivottable" || type === "tableex";
  });

  let measureProps = [];
  prioritized.forEach((visual) => {
    measureProps.push(...(visual.measureProps || []));
  });
  if (!measureProps.length) {
    incomeSection.forEach((visual) => {
      measureProps.push(...(visual.measureProps || []));
    });
  }

  if (!measureProps.length) {
    const fallbackKeywords = [
      "ingresos", "costos", "utilidad", "ebitda", "gastos", "impuestos",
      "financier", "margen", "coberturas", "deuda/ebitda", "ebitda/costos financieros"
    ];
    const fallbackProps = [];
    visuals.forEach((visual) => {
      (visual.measureProps || []).forEach((prop) => {
        const normalized = normalizeText(prop);
        if (fallbackKeywords.some((kw) => normalized.includes(kw))) fallbackProps.push(prop);
      });
    });
    measureProps = fallbackProps;
  }

  const uniqueProps = dedupeExternalMeasureProperties(measureProps).slice(0, EXTERNAL_INCOME_CONFIG.maxMeasures);
  return uniqueProps.map((property) => ({
    property,
    label: property,
    kind: externalIncomeMetricKind(property)
  }));
}

async function getExternalIncomePowerBiContext() {
  if (externalIncomeContextPromise) return externalIncomeContextPromise;

  externalIncomeContextPromise = (async () => {
    const reportHtml = await fetchExternalTextWithRetry(EXTERNAL_INCOME_CONFIG.reportUrl);
    const viewUrl = extractExternalPowerBiIframeSrc(reportHtml);
    if (!viewUrl) throw new Error("No se encontro iframe Power BI del reporte externo.");

    const resourceKey = extractExternalPowerBiResourceKey(viewUrl);
    if (!resourceKey) throw new Error("No se pudo extraer resource key del reporte externo.");

    const embedHtml = await fetchExternalTextWithRetry(viewUrl);
    const clusterUri = extractExternalPowerBiClusterUri(embedHtml);
    if (!clusterUri) throw new Error("No se pudo resolver cluster de Power BI.");
    const apiBase = buildExternalPowerBiApiBase(clusterUri);

    const models = await fetchExternalJsonWithRetry(
      `${apiBase}/public/reports/${resourceKey}/modelsAndExploration?preferReadOnlySession=true`,
      { method: "GET", headers: externalPowerBiHeaders(resourceKey) }
    );

    const modelId = Number(models?.models?.[0]?.id);
    if (!Number.isFinite(modelId)) throw new Error("No se encontro model id del reporte externo.");

    const incomeMeasures = findExternalIncomeMeasures(models);
    if (!incomeMeasures.length) throw new Error("No se encontraron variables de estado de resultados en el reporte externo.");

    return {
      reportUrl: EXTERNAL_INCOME_CONFIG.reportUrl,
      viewUrl,
      resourceKey,
      apiBase,
      modelId,
      selectedYear: findExternalPowerBiSelectedYear(models),
      entities: findExternalPowerBiEntities(models),
      incomeMeasures
    };
  })();

  try {
    return await externalIncomeContextPromise;
  } catch (error) {
    externalIncomeContextPromise = null;
    throw error;
  }
}

function buildExternalIncomeQueryBody(ctx, nit, year) {
  const select = ctx.incomeMeasures.map((measure, idx) => ({
    id: `metric_${idx}`,
    property: measure.property
  }));

  return {
    ModelId: ctx.modelId,
    SemanticQueryDataShapeCommands: [
      {
        Query: {
          Version: 2,
          From: [
            { Name: "m", Entity: ctx.entities.entityMeasures, Type: 0 },
            { Name: "c", Entity: ctx.entities.entityCaratulas, Type: 0 },
            { Name: "d", Entity: ctx.entities.entityDates, Type: 0 },
            { Name: "s", Entity: ctx.entities.entitySection, Type: 0 }
          ],
          Select: select.map((entry) => ({
            Measure: { Expression: { SourceRef: { Source: "m" } }, Property: entry.property },
            Name: entry.id
          })),
          Where: [
            {
              Condition: {
                In: {
                  Expressions: [{ Column: { Expression: { SourceRef: { Source: "c" } }, Property: ctx.entities.propNit } }],
                  Values: [[{ Literal: { Value: `'${nit}'` } }]]
                }
              }
            },
            {
              Condition: {
                In: {
                  Expressions: [{ Column: { Expression: { SourceRef: { Source: "d" } }, Property: ctx.entities.propYear } }],
                  Values: [[{ Literal: { Value: `${year}L` } }]]
                }
              }
            },
            {
              Condition: {
                Not: {
                  Expression: {
                    In: {
                      Expressions: [{ Column: { Expression: { SourceRef: { Source: "c" } }, Property: ctx.entities.propNitRazon } }],
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
                      Expressions: [{ Column: { Expression: { SourceRef: { Source: "s" } }, Property: ctx.entities.propSectionDesc } }],
                      Values: [[{ Literal: { Value: "null" } }]]
                    }
                  }
                }
              }
            }
          ]
        },
        Binding: {
          Primary: { Groupings: [{ Projections: select.map((_, idx) => idx) }] },
          SuppressedJoinPredicates: [1],
          Version: 1
        },
        ExecutionMetricsKind: 1
      }
    ]
  };
}

async function fetchExternalIncomeMetricsByYear(ctx, nit, year) {
  const cacheKey = `${ctx.resourceKey}|${nit}|${year}`;
  if (externalIncomeYearCache.has(cacheKey)) return externalIncomeYearCache.get(cacheKey);

  const body = buildExternalIncomeQueryBody(ctx, nit, year);
  const raw = await externalPowerBiQuery(ctx.apiBase, ctx.resourceKey, body);
  const row = parseExternalPowerBiRows(raw)?.[0];
  const out = {};
  ctx.incomeMeasures.forEach((measure, idx) => {
    out[measure.property] = parseAmount(row?.[`metric_${idx}`]);
  });
  externalIncomeYearCache.set(cacheKey, out);
  return out;
}

function renderYears(years) {
  dom.yearsContainer.innerHTML = "";
  years.forEach((year) => {
    const label = document.createElement("label");
    label.className = "year-option";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(year);
    cb.checked = true;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(String(year)));
    dom.yearsContainer.appendChild(label);
  });
}

function setAllYears(checked) {
  dom.yearsContainer.querySelectorAll("input[type='checkbox']").forEach((cb) => { cb.checked = checked; });
}

function selectedYears() {
  return [...dom.yearsContainer.querySelectorAll("input[type='checkbox']:checked")]
    .map((cb) => Number(cb.value))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
}

function normalizeRows(rows) {
  const preferredByYear = selectPreferredInstanceByYear(rows);
  const candidates = new Map();

  rows.forEach((row) => {
    const year = extractYear(row.fecha_corte);
    const concept = normalizeText(row.concepto);
    const value = parseAmount(row.valor);
    if (year === null || !concept || value === null) return;

    const preferredInstance = preferredByYear.get(year);
    const rowInstance = financialInstanceKey(row);
    if (preferredInstance && rowInstance && preferredInstance !== rowInstance) return;

    const score = periodScore(row.periodo, year);
    const key = `${year}|${concept}`;
    const current = candidates.get(key);
    const betterPeriod = !current || score > current.score;
    const samePeriodBetterValue =
      current &&
      score === current.score &&
      ((current.value === 0 && value !== 0) || Math.abs(value) > current.abs);

    if (betterPeriod || samePeriodBetterValue) {
      candidates.set(key, { score, abs: Math.abs(value), value });
    }
  });

  const out = {};
  candidates.forEach((v, k) => {
    const [y, c] = k.split("|");
    const year = Number(y);
    out[year] = out[year] || {};
    out[year][c] = v.value;
  });
  return out;
}

function selectPreferredInstanceByYear(rows) {
  const byYear = new Map();
  rows.forEach((row) => {
    const year = extractYear(row.fecha_corte);
    if (year === null) return;
    const concept = normalizeText(row.concepto);
    const value = parseAmount(row.valor);
    const instanceKey = financialInstanceKey(row);
    if (!instanceKey) return;

    if (!byYear.has(year)) byYear.set(year, new Map());
    const yearMap = byYear.get(year);
    if (!yearMap.has(instanceKey)) {
      yearMap.set(instanceKey, {
        rowCount: 0,
        actualCount: 0,
        nonZeroCount: 0,
        concepts: new Set(),
        pointEntry: normalizeText(row.punto_entrada || "")
      });
    }
    const stat = yearMap.get(instanceKey);
    stat.rowCount += 1;
    if (isActualPeriod(row.periodo, year)) stat.actualCount += 1;
    if (Number.isFinite(value) && value !== 0) stat.nonZeroCount += 1;
    if (concept) stat.concepts.add(concept);
  });

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

function instancePreferenceBonus(pointEntry) {
  const p = normalizeText(pointEntry || "");
  if (!p) return 0;
  if (p.includes("separado") || p.includes("individual")) return 1000;
  if (p.includes("consolidado")) return -150;
  return 80;
}

function isActualPeriod(periodo, year) {
  const p = normalizeText(periodo || "");
  if (!p) return false;
  if (p.includes("actual")) return true;
  if (p.includes(String(year)) && !p.includes("anterior")) return true;
  return false;
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

function selectRecentYears(normalized, lookback) {
  const years = new Set([
    ...Object.keys(normalized.income).map(Number),
    ...Object.keys(normalized.balance).map(Number),
    ...Object.keys(normalized.cashflow).map(Number)
  ]);
  return [...years].filter(Number.isFinite).sort((a, b) => b - a).slice(0, lookback);
}

function extractYear(fecha) {
  if (!fecha) return null;
  const y = Number(String(fecha).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function periodScore(periodo, year) {
  const p = normalizeText(periodo || "");
  if (!p) return 1;
  if (p.includes("actual")) return 3;
  if (p.includes("anterior")) return 0;
  if (p.includes(String(year))) return 2;
  return 1;
}
function runAnalysis() {
  if (!state.selectedCompany || !state.normalized) return showMessage("warning", "Primero busca y carga una empresa.");
  const years = selectedYears();
  if (!years.length) return showMessage("warning", "Selecciona al menos un año para continuar.");

  const snapshots = {};
  years.forEach((year) => {
    const income = state.normalized.income[year] || {};
    const balance = state.normalized.balance[year] || {};
    const cashflow = state.normalized.cashflow[year] || {};
    const snap = computeSnapshot(income, balance, cashflow);
    if (!Object.keys(income).length) snap.warnings.push("No se encontro informacion del estado de resultados para este año.");
    if (!Object.keys(balance).length) snap.warnings.push("No se encontro informacion de balance general para este año.");
    if (!Object.keys(cashflow).length) snap.warnings.push("No se encontro informacion de flujo de caja para este año.");
    snapshots[year] = snap;
  });
  attachIncomeRatios(snapshots);

  state.snapshots = snapshots;
  state.years = years;
  state.auditLog = years.reduce((acc, y) => {
    acc[y] = snapshots[y]?.audit || {};
    return acc;
  }, {});

  renderKpis();
  renderStatementTables();
  renderMetricTable();
  renderDeepIncomeAnalysis();
  renderFinancialSummaries();
  renderCharts();
  notifyBotDataReady();

  dom.exportCsvBtn.disabled = false;
  dom.exportJsonBtn.disabled = false;
  dom.exportPdfBtn.disabled = false;
}

function attachIncomeRatios(snapshots) {
  const calcCore = getCalcQACore();
  const years = Object.keys(snapshots).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  years.forEach((year) => {
    const current = snapshots[year];
    const previous = snapshots[year - 1] || null;
    const ingresos = current?.income?.ingresos;
    const utilidadBruta = current?.income?.utilidad_bruta;
    const ebitda = current?.income?.ebitda;
    const gastosOperacionales = current?.income?.gastos_operacionales;
    const utilidadNeta = current?.income?.utilidad_neta;
    const deuda = current?.metrics?.deuda;
    const costosFinancieros = current?.income?.costos_financieros;
    const audit = current.audit || (current.audit = { policy: calcCore?.FALLBACK_POLICY || null, ratios: {}, checks: {}, resolutions: {} });

    if (calcCore && typeof calcCore.computeRatios === "function") {
      current.ratios = calcCore.computeRatios(
        {
          ingresos,
          ingresos_prev: previous?.income?.ingresos,
          costos: current?.income?.costos,
          utilidad_bruta: utilidadBruta,
          ebitda,
          gastos_operacionales: gastosOperacionales,
          utilidad_neta: utilidadNeta,
          deuda,
          costos_financieros: costosFinancieros
        },
        audit.ratios,
        current.warnings
      );
    } else {
      current.ratios = {
        crecimiento_ingresos_yoy: previous ? pct(ingresos, previous?.income?.ingresos) : 0,
        margen_bruto: percentOf(utilidadBruta, ingresos) ?? 0,
        margen_ebitda: percentOf(ebitda, ingresos) ?? 0,
        gastos_operacionales_sobre_ingresos: percentOf(gastosOperacionales, ingresos) ?? 0,
        margen_neto: percentOf(utilidadNeta, ingresos) ?? 0,
        deuda_ebitda: divSafe(deuda, ebitda) ?? 0,
        ebitda_costos_financieros: divSafe(ebitda, Math.abs(costosFinancieros || 0)) ?? 0
      };
      current.warnings.push("[fallback_local_ratios] Se aplico motor local de ratios sin trazabilidad avanzada.");
    }

    const deudaBalance = Number.isFinite(current?.audit?.resolutions?.debt_resolution?.result?.value)
      ? current.audit.resolutions.debt_resolution.result.value
      : current?.metrics?.deuda;

    if (calcCore && typeof calcCore.computeChecks === "function") {
      current.checks = calcCore.computeChecks(
        {
          caja_inicial: current?.cash?.caja_inicial,
          caja_final: current?.cash?.caja_final,
          flujo_periodo: current?.cash?.flujo_caja,
          activos_totales: current?.balance?.activos_totales,
          pasivos_totales: current?.balance?.pasivos_totales,
          patrimonio_total: current?.balance?.patrimonio_total,
          activos_corrientes: current?.balance?.activos_corrientes,
          pasivos_corrientes: current?.balance?.pasivos_corrientes,
          capital_neto_trabajo: current?.metrics?.capital_neto_trabajo,
          deuda_ratio: current?.metrics?.deuda,
          deuda_balance: deudaBalance,
          tolerance_abs: 1
        },
        audit.checks,
        current.warnings
      );
    } else {
      current.checks = {};
    }
  });
}

// Calcula indicadores financieros, incluyendo Z-Altman.
function computeSnapshot(income, balance, cashflow) {
  const warnings = [];
  const calcCore = getCalcQACore();
  const audit = {
    policy: calcCore?.FALLBACK_POLICY || null,
    ratios: {},
    checks: {},
    resolutions: {}
  };

  let ingresos = findValue(income, PATTERNS.income.ingresos);
  const ingresosBrutos = findValue(income, PATTERNS.income.ingresos_brutos);
  const descuentosVentas = sumContainsFiltered(
    income,
    PATTERNS.income.descuentos_ventas.contains,
    PATTERNS.income.descuentos_ventas.exclude
  );

  if (ingresos === null && ingresosBrutos !== null && descuentosVentas !== null) {
    ingresos = applySalesDeductions(ingresosBrutos, descuentosVentas);
    warnings.push("Ingresos netos estimados desde ingresos brutos ajustados por descuentos/devoluciones/rebajas.");
  } else if (ingresos === null && ingresosBrutos !== null) {
    ingresos = ingresosBrutos;
    warnings.push("Ingresos tomados como brutos por ausencia de rubro neto y de descuentos/devoluciones.");
  }

  if (ingresos !== null && ingresosBrutos !== null && descuentosVentas !== null) {
    const ingresosEsperados = applySalesDeductions(ingresosBrutos, descuentosVentas);
    const diffRel = Math.abs(ingresos - ingresosEsperados) / Math.max(1, Math.abs(ingresos));
    if (diffRel > 0.25) {
      warnings.push("Los ingresos reportados difieren materialmente del ajuste bruto-descuentos; revisa politicas contables de reconocimiento.");
    }
  }

  let costos = findValue(income, PATTERNS.income.costos);
  let utilidadBruta = findValue(income, PATTERNS.income.utilidad_bruta);
  let gastosAdministrativos = findValue(income, PATTERNS.income.gastos_administrativos);
  let gastosVenta = findValue(income, PATTERNS.income.gastos_venta);
  let otrosGastosOperacionales = findValue(income, PATTERNS.income.otros_gastos_operacionales);
  let otrosIngresos = findValue(income, PATTERNS.income.otros_ingresos_operacionales);
  let utilidadOperativa = findValue(income, PATTERNS.income.ebit);

  const impuestos = findValue(income, PATTERNS.income.impuestos);
  let costosFinancieros = findValue(income, PATTERNS.income.gastos_financieros);
  let ingresosFinancieros = findValue(income, PATTERNS.income.ingresos_financieros);
  let coberturas = findValue(income, PATTERNS.income.coberturas);
  let utilidadSubsidiaria = findValue(income, PATTERNS.income.utilidad_subsidiaria);
  let otrosIngresosNoOperacionales = findValue(income, PATTERNS.income.otros_ingresos_no_operacionales);
  let otrosEgresosNoOperacionales = findValue(income, PATTERNS.income.otros_egresos_no_operacionales);
  let utilidad = findValue(income, PATTERNS.income.utilidad_neta);

  if (utilidadBruta === null && ingresos !== null && costos !== null) {
    utilidadBruta = ingresos - costos;
    warnings.push("Utilidad bruta estimada desde ingresos - costos.");
  }
  if (costos === null && ingresos !== null && utilidadBruta !== null) {
    costos = ingresos - utilidadBruta;
    warnings.push("Costos estimados desde ingresos - utilidad bruta.");
  }

  if (otrosGastosOperacionales === null) {
    const altOtrosGastosOp = sumContainsFiltered(
      income,
      ["otros gastos operacionales", "otros gastos de operacion", "otros gastos, por funcion", "otros gastos por funcion"],
      ["no operacionales", "financieros", "impuestos", "de cobertura"]
    );
    if (altOtrosGastosOp !== null) otrosGastosOperacionales = altOtrosGastosOp;
  }

  let gastosOp = findValue(income, {
    exact: [
      "gastos operacionales",
      "gastos de operacion",
      "gastos operativos",
      "gastos, por funcion",
      "gastos por funcion",
      "gastos por naturaleza",
      "gastos de administracion y ventas",
      "gastos de ventas y distribucion"
    ],
    contains: [
      "gastos operacionales",
      "gastos de operacion",
      "gastos operativos",
      "gastos, por funcion",
      "gastos por funcion",
      "gastos por naturaleza",
      "gastos de administracion y ventas",
      "gastos de ventas y distribucion"
    ],
    exclude: PATTERNS.opExExclude
  });
  if (gastosOp === null) gastosOp = sumContainsFiltered(income, PATTERNS.opEx, PATTERNS.opExExclude);
  if (gastosOp === null) gastosOp = sumFinite([gastosAdministrativos, gastosVenta, otrosGastosOperacionales]);

  if (utilidadOperativa === null && utilidadBruta !== null) {
    const utilOpEstimada =
      utilidadBruta -
      (gastosAdministrativos || 0) -
      (gastosVenta || 0) -
      (otrosGastosOperacionales || 0) +
      (otrosIngresos || 0);
    if (Number.isFinite(utilOpEstimada)) {
      utilidadOperativa = utilOpEstimada;
      warnings.push("Utilidad operativa estimada desde utilidad bruta y gastos operacionales.");
    }
  }

  if (gastosOp === null && utilidadBruta !== null && utilidadOperativa !== null) {
    const gastosOpImplicitos = utilidadBruta + (otrosIngresos || 0) - utilidadOperativa;
    if (Number.isFinite(gastosOpImplicitos)) {
      gastosOp = gastosOpImplicitos;
      warnings.push("Gastos operacionales estimados desde utilidad bruta, otros ingresos operacionales y utilidad operativa.");
    }
  }

  if (otrosIngresosNoOperacionales === null) {
    otrosIngresosNoOperacionales = findValue(income, {
      exact: ["otros ingresos"],
      contains: ["otros ingresos", "otras ganancias"],
      exclude: ["operacionales", "de operacion", "ingresos financieros", "de cobertura"]
    });
  }
  if (otrosEgresosNoOperacionales === null) {
    otrosEgresosNoOperacionales = findValue(income, {
      exact: ["otros gastos", "otros gastos, por funcion"],
      contains: ["otros gastos", "otras perdidas"],
      exclude: ["operacionales", "de operacion", "costos financieros", "gastos financieros", "impuestos", "de cobertura"]
    });
  }

  const assumedZero = [];
  gastosAdministrativos = assumeZero(gastosAdministrativos, "gastos administrativos", assumedZero);
  gastosVenta = assumeZero(gastosVenta, "gastos de venta", assumedZero);
  otrosGastosOperacionales = assumeZero(otrosGastosOperacionales, "otros gastos operacionales", assumedZero);
  otrosIngresos = assumeZero(otrosIngresos, "otros ingresos operacionales", assumedZero);
  ingresosFinancieros = assumeZero(ingresosFinancieros, "ingresos financieros", assumedZero);
  costosFinancieros = assumeZero(costosFinancieros, "costos financieros", assumedZero);
  coberturas = assumeZero(coberturas, "coberturas", assumedZero);
  utilidadSubsidiaria = assumeZero(utilidadSubsidiaria, "utilidad subsidiaria", assumedZero);
  otrosIngresosNoOperacionales = assumeZero(otrosIngresosNoOperacionales, "otros ingresos no operacionales", assumedZero);
  otrosEgresosNoOperacionales = assumeZero(otrosEgresosNoOperacionales, "otros egresos no operacionales", assumedZero);
  if (assumedZero.length) warnings.push(`Rubros no reportados por la fuente asumidos en 0: ${assumedZero.join(", ")}.`);

  // Fallback: estima utilidad operativa cuando no hay rubro operativo explicito.
  if (utilidadOperativa === null && utilidad !== null && (impuestos !== null || costosFinancieros !== null || ingresosFinancieros !== null)) {
    const netoFinanciero = (costosFinancieros || 0) - (ingresosFinancieros || 0);
    utilidadOperativa = utilidad + (impuestos || 0) + netoFinanciero;
    warnings.push("Utilidad operativa estimada por ausencia de rubro operativo explicito.");
  }

  // Fallback inverso: estima utilidad neta desde utilidad operativa cuando no hay rubro neto explicito.
  if (utilidad === null && utilidadOperativa !== null) {
    utilidad =
      utilidadOperativa +
      (ingresosFinancieros || 0) -
      (costosFinancieros || 0) +
      (coberturas || 0) +
      (utilidadSubsidiaria || 0) +
      (otrosIngresosNoOperacionales || 0) -
      (otrosEgresosNoOperacionales || 0) -
      (impuestos || 0);
    warnings.push("Utilidad neta estimada por ausencia de rubro neto explicito.");
  }

  const depAmortIncome = sumContains(income, PATTERNS.depAmort);
  const depAmortCashflow = sumContains(cashflow, PATTERNS.depAmort);
  const depAmort = depAmortIncome !== null ? depAmortIncome : depAmortCashflow;

  let ebitda = findValue(income, PATTERNS.income.ebitda);
  if (ebitda === null && utilidadOperativa !== null) {
    ebitda = utilidadOperativa + (depAmort || 0);
    if (depAmort === null) warnings.push("EBITDA estimado usando utilidad operativa por ausencia de depreciaciones/amortizaciones.");
    else if (depAmortIncome === null && depAmortCashflow !== null) warnings.push("EBITDA estimado con depreciaciones/amortizaciones tomadas del flujo de caja.");
  }
  if (ebitda === null && utilidad !== null && depAmort !== null) {
    ebitda = utilidad + depAmort;
    warnings.push("EBITDA estimado por ausencia de rubro explicito.");
  }

  const ebitdaValue = ebitda === undefined ? null : ebitda;
  const ac = findValue(balance, PATTERNS.balance.activos_corrientes);
  const pc = findValue(balance, PATTERNS.balance.pasivos_corrientes);
  let at = findValue(balance, PATTERNS.balance.activos_totales);
  let pt = findValue(balance, PATTERNS.balance.pasivos_totales);
  let patr = findValue(balance, PATTERNS.balance.patrimonio_total);
  let ga = findValue(balance, PATTERNS.balance.ganancias_acumuladas);

  let flujo = findValue(cashflow, PATTERNS.cashflow.flujo_caja);
  let cajaInicial = findValue(cashflow, PATTERNS.cashflow.caja_inicial);
  let cajaFinal = findValue(cashflow, PATTERNS.cashflow.caja_final);
  const capexRaw = sumContainsFiltered(cashflow, PATTERNS.cashflow.capex_contains, PATTERNS.cashflow.capex_exclude);
  const capex = Number.isFinite(capexRaw) ? Math.abs(capexRaw) : null;
  const flujoOperativoReportado = findValue(cashflow, PATTERNS.cashflow.flujo_operativo);
  const flujoFinanciacionReportado = findValue(cashflow, PATTERNS.cashflow.flujo_financiacion);

  if (!Number.isFinite(flujo) && Number.isFinite(cajaInicial) && Number.isFinite(cajaFinal)) {
    flujo = cajaFinal - cajaInicial;
    warnings.push("Flujo de caja neto estimado como caja final - caja inicial.");
  }
  if (!Number.isFinite(cajaInicial) && Number.isFinite(cajaFinal) && Number.isFinite(flujo)) {
    cajaInicial = cajaFinal - flujo;
    warnings.push("Caja inicial estimada desde caja final - flujo del periodo.");
  }
  if (!Number.isFinite(cajaFinal) && Number.isFinite(cajaInicial) && Number.isFinite(flujo)) {
    cajaFinal = cajaInicial + flujo;
    warnings.push("Caja final estimada desde caja inicial + flujo del periodo.");
  }
  if (at === null && pt !== null && patr !== null) {
    at = pt + patr;
    warnings.push("Activos totales estimados a partir de pasivos + patrimonio.");
  }
  if (pt === null && at !== null && patr !== null) {
    pt = at - patr;
    warnings.push("Pasivos totales estimados a partir de activos - patrimonio.");
  }
  if (patr === null && at !== null && pt !== null) {
    patr = at - pt;
    warnings.push("Patrimonio total estimado a partir de activos - pasivos.");
  }
  if (ga === null && at !== null) {
    ga = 0;
    warnings.push("Ganancias acumuladas no reportadas: se asumio 0 para estimar Z-Altman.");
  }

  let knt = ac !== null && pc !== null ? ac - pc : findValue(balance, PATTERNS.balance.capital_neto_trabajo);
  if (knt !== null && (ac === null || pc === null)) {
    warnings.push("Capital neto de trabajo tomado desde rubro directo por ausencia de activos/pasivos corrientes.");
  }
  const diasKnt = knt !== null && ingresos !== null && ingresos !== 0 ? (knt / ingresos) * 365 : null;
  const debtInputs = resolveFinancialDebtFromConcepts(balance);
  const deudaSumada = debtInputs.deudaSumada;
  const deudaDirecta = debtInputs.deudaDirecta;
  let deuda = null;
  if (calcCore && typeof calcCore.resolveDebtValue === "function") {
    const debtResolution = calcCore.resolveDebtValue(
      {
        deudaSumada,
        deudaDirecta,
        pasivosTotales: pt
      },
      audit.resolutions,
      warnings
    );
    deuda = debtResolution?.value;
  } else {
    deuda = Number.isFinite(deudaSumada) ? deudaSumada : deudaDirecta;
    if (!Number.isFinite(deuda)) {
      deuda = 0;
      warnings.push("Deuda financiera no reportada: se asigno 0 para no confundir deuda con pasivos totales.");
    }
  }

  const x1 = divSafe(knt, at);
  const x2 = divSafe(ga, at);
  const x3 = divSafe(utilidadOperativa, at);
  const x4 = divSafe(patr, pt);
  const z = [x1, x2, x3, x4].every((v) => v !== null) ? 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4 : null;

  const metrics = {
    ingresos,
    utilidad_neta: utilidad,
    ebitda: ebitdaValue,
    gastos_operacionales: gastosOp,
    capital_neto_trabajo: knt,
    deuda,
    dias_capital_trabajo: diasKnt,
    balance_general: at,
    flujo_caja: flujo,
    z_altman: z
  };

  const missing = Object.keys(metrics).filter((k) => metrics[k] === null || metrics[k] === undefined);
  if (missing.length) warnings.push(`Datos incompletos para: ${missing.sort().join(", ")}`);

  return {
    income: {
      ingresos,
      costos,
      utilidad_bruta: utilidadBruta,
      gastos_administrativos: gastosAdministrativos,
      gastos_venta: gastosVenta,
      otros_gastos_operacionales: otrosGastosOperacionales,
      otros_ingresos: otrosIngresos,
      utilidad_operativa: utilidadOperativa,
      ebit: utilidadOperativa,
      ebitda: ebitdaValue,
      ingresos_financieros: ingresosFinancieros,
      costos_financieros: costosFinancieros,
      coberturas,
      utilidad_subsidiaria: utilidadSubsidiaria,
      otros_ingresos_no_operacionales: otrosIngresosNoOperacionales,
      otros_egresos_no_operacionales: otrosEgresosNoOperacionales,
      impuestos,
      utilidad_neta: utilidad,
      gastos_operacionales: gastosOp
    },
    balance: { activos_corrientes: ac, pasivos_corrientes: pc, activos_totales: at, pasivos_totales: pt, patrimonio_total: patr, ganancias_acumuladas: ga },
    cash: {
      flujo_caja: flujo,
      caja_inicial: cajaInicial,
      caja_final: cajaFinal,
      capex,
      flujo_operativo_reportado: flujoOperativoReportado,
      flujo_financiacion_reportado: flujoFinanciacionReportado
    },
    metrics,
    warnings,
    audit
  };
}

function renderKpis() {
  dom.kpiCards.innerHTML = "";
  if (!state.years.length) return;
  const yearsDesc = [...state.years].sort((a, b) => b - a);
  const cards = [
    ["ingresos", (s) => s.metrics.ingresos, true],
    ["utilidad_neta", (s) => s.metrics.utilidad_neta, true],
    ["ebitda", (s) => s.metrics.ebitda, true],
    ["deuda", (s) => s.metrics.deuda, true],
    ["flujo_caja", (s) => s.metrics.flujo_caja, true],
    ["z_altman", (s) => s.metrics.z_altman, false]
  ];

  cards.forEach(([key, getter, money]) => {
    const latest = latestYearWithValue(yearsDesc, (year) => getter(state.snapshots[year]));
    const value = latest !== null ? getter(state.snapshots[latest]) : null;
    const card = document.createElement("article");
    card.className = "kpi-card";
    card.innerHTML = `<h4>${METRIC_LABELS[key]} (${latest !== null ? latest : "N/D"})</h4><div class="value">${money ? fmtMoney(value) : fmtNum(value, 2)}</div>`;
    if (key === "z_altman") {
      const zone = zZone(value);
      const badge = document.createElement("span");
      badge.className = zone === "solida" ? "badge-good" : zone === "gris" ? "badge-caution" : "badge-risk";
      badge.textContent = `Zona: ${zone}`;
      card.appendChild(badge);
    }
    dom.kpiCards.appendChild(card);
  });
}

function latestYearWithValue(yearsDesc, getter) {
  for (const year of yearsDesc) {
    const value = getter(year);
    if (Number.isFinite(value)) return year;
  }
  return null;
}

function renderStatementTables() {
  const years = [...state.years].sort((a, b) => b - a);
  buildTable(dom.incomeTable, "Concepto", years, [
    ["Ingresos", (s) => s.income.ingresos, true],
    ["Costos", (s) => s.income.costos, true],
    ["Utilidad bruta", (s) => s.income.utilidad_bruta, true],
    ["Gastos administrativos", (s) => s.income.gastos_administrativos, true],
    ["Gastos de venta", (s) => s.income.gastos_venta, true],
    ["Otros gastos operacionales", (s) => s.income.otros_gastos_operacionales, true],
    ["Otros ingresos", (s) => s.income.otros_ingresos, true],
    ["Utilidad operativa", (s) => s.income.utilidad_operativa, true],
    ["EBITDA", (s) => s.income.ebitda, true],
    ["Ingresos financieros", (s) => s.income.ingresos_financieros, true],
    ["Costos financieros", (s) => s.income.costos_financieros, true],
    ["Coberturas", (s) => s.income.coberturas, true],
    ["Utilidad subsidiaria", (s) => s.income.utilidad_subsidiaria, true],
    ["Otros ingresos no operacionales", (s) => s.income.otros_ingresos_no_operacionales, true],
    ["Otros egresos no operacionales", (s) => s.income.otros_egresos_no_operacionales, true],
    ["Impuestos", (s) => s.income.impuestos, true],
    ["Utilidad neta", (s) => s.income.utilidad_neta, true]
  ]);

  buildTable(dom.balanceTable, "Concepto", years, [
    ["Activos corrientes", (s) => s.balance.activos_corrientes, true],
    ["Pasivos corrientes", (s) => s.balance.pasivos_corrientes, true],
    ["Activos totales", (s) => s.balance.activos_totales, true],
    ["Pasivos totales", (s) => s.balance.pasivos_totales, true],
    ["Patrimonio total", (s) => s.balance.patrimonio_total, true],
    ["Ganancias acumuladas", (s) => s.balance.ganancias_acumuladas, true]
  ]);

  buildCashflowBridgeTable(years);
}

function renderExternalIncomeTable() {
  if (!dom.extIncomeTable || !dom.extIncomeStatus) return;
  const years = [...state.years].sort((a, b) => b - a);
  const ext = state.externalIncome || initialExternalIncomeState();

  if (!years.length) {
    dom.extIncomeStatus.className = "hint ext-income-status";
    dom.extIncomeStatus.textContent = "Se cargara al analizar la empresa.";
    dom.extIncomeTable.innerHTML = "";
    return;
  }

  const measures = Array.isArray(ext.measures) ? ext.measures : [];
  const byYear = ext.byYear || {};
  const rowsWithData = years.filter((year) => {
    const row = byYear[year];
    return row && Object.keys(row).some((k) => k !== "__error" && Number.isFinite(row[k]));
  });
  const yearErrors = years.filter((year) => cleanText(byYear?.[year]?.__error));

  if (ext.loading) {
    dom.extIncomeStatus.className = "hint ext-income-status loading";
    dom.extIncomeStatus.textContent = "Cargando variables externas de Estrategia en Accion...";
  } else if (ext.error) {
    dom.extIncomeStatus.className = "hint ext-income-status warn";
    dom.extIncomeStatus.textContent = ext.error;
  } else if (rowsWithData.length) {
    const fetched = ext.fetchedAt ? ` Ultima actualizacion: ${new Date(ext.fetchedAt).toLocaleString("es-CO")}.` : "";
    const errMsg = yearErrors.length ? ` Hubo ${yearErrors.length} año(s) sin respuesta externa.` : "";
    dom.extIncomeStatus.className = "hint ext-income-status ok";
    dom.extIncomeStatus.textContent =
      `Variables externas cargadas (${measures.length}) para ${rowsWithData.length}/${years.length} año(s).${errMsg}${fetched}`;
  } else {
    dom.extIncomeStatus.className = "hint ext-income-status warn";
    dom.extIncomeStatus.textContent = "No se encontraron variables externas para este NIT/años.";
  }

  const thead = `<thead><tr><th>Variable externa</th>${years.map((y) => `<th>${y}</th>`).join("")}</tr></thead>`;
  if (!measures.length) {
    const emptyCols = years.map(() => "<td>N/D</td>").join("");
    dom.extIncomeTable.innerHTML = `${thead}<tbody><tr><td>Sin variables disponibles</td>${emptyCols}</tr></tbody>`;
    return;
  }

  const bodyRows = measures.map((measure) => {
    const cols = years.map((year) => {
      const row = byYear?.[year] || {};
      const value = row[measure.property];
      return `<td>${formatExternalIncomeValue(value, measure.kind)}</td>`;
    }).join("");
    return `<tr><td>${measure.label}</td>${cols}</tr>`;
  }).join("");

  dom.extIncomeTable.innerHTML = `${thead}<tbody>${bodyRows}</tbody>`;
}

function formatExternalIncomeValue(value, kind) {
  if (!Number.isFinite(value)) return "N/D";
  if (kind === "pct") return `${fmtNum(value * 100, 2)}%`;
  if (kind === "ratio") return `${fmtNum(value, 2)}x`;
  return fmtNum(value, 3);
}

function renderMetricTable() {
  const years = [...state.years].sort((a, b) => b - a);
  const rows = RATIO_ORDER.map((key) => {
    const kind = ["deuda_ebitda", "ebitda_costos_financieros"].includes(key) ? "ratio" : "pct";
    return [RATIO_LABELS[key], (s) => s.ratios?.[key], false, kind];
  });
  buildTable(dom.metricsTable, "Metrica", years, rows);
}

function buildCashflowBridgeTable(years) {
  const byYear = new Map(years.map((year) => [year, cashBridgeForYear(year)]));
  const rowDefs = [
    ["(+) EBITDA", (d) => d.ebitda],
    ["(-) Impuestos", (d) => d.impuestos],
    ["(-) A Capital de trabajo neto", (d) => d.deltaCapitalTrabajo],
    ["(-) A Capex", (d) => d.capex],
    ["(1) Flujo de caja operativo", (d) => d.flujoOperativo],
    ["(+) & Deuda", (d) => d.deltaDeuda],
    ["(-) Costos financieros", (d) => d.costosFinancieros],
    ["(2) Flujo financiero", (d) => d.flujoFinanciero],
    ["(-) A OAOP, neto", (d) => d.oaopNeto],
    ["(+) & Patrimonio", (d) => d.deltaPatrimonio],
    ["(+) Ingresos financieros", (d) => d.ingresosFinancieros],
    ["(+) Otros Ingresos/Egresos no operacionales", (d) => d.otrosNoOperacionales],
    ["(3) Flujo no operativo", (d) => d.flujoNoOperativo],
    ["[1+2+3] Flujo del periodo", (d) => d.flujoPeriodo],
    ["Caja inicial", (d) => d.cajaInicial],
    ["Caja final", (d) => d.cajaFinal],
    ["Check caja", (d) => d.checkCaja]
  ];

  const thead = `<thead><tr><th>Concepto</th>${years.map((y) => `<th>${y}</th>`).join("")}</tr></thead>`;
  const bodyRows = rowDefs.map(([label, getter]) => {
    const cols = years.map((year) => `<td>${fmtMoney(getter(byYear.get(year)))}</td>`).join("");
    return `<tr><td>${label}</td>${cols}</tr>`;
  }).join("");
  dom.cashTable.innerHTML = `${thead}<tbody>${bodyRows}</tbody>`;
}

function cashBridgeForYear(year) {
  const current = state.snapshots[year] || {};
  const prev = previousSnapshotForYear(year);

  const ebitda = num0(current?.income?.ebitda);
  const impuestos = Math.abs(num0(current?.income?.impuestos));
  const deltaCapitalTrabajo = prev
    ? num0(current?.metrics?.capital_neto_trabajo) - num0(prev?.metrics?.capital_neto_trabajo)
    : 0;
  const capex = Math.abs(num0(current?.cash?.capex));
  const flujoOperativo = ebitda - impuestos - deltaCapitalTrabajo - capex;

  const deltaDeuda = prev ? num0(current?.metrics?.deuda) - num0(prev?.metrics?.deuda) : 0;
  const costosFinancieros = Math.abs(num0(current?.income?.costos_financieros));
  const flujoFinanciero = deltaDeuda - costosFinancieros;

  const deltaPatrimonio = prev ? num0(current?.balance?.patrimonio_total) - num0(prev?.balance?.patrimonio_total) : 0;
  const ingresosFinancieros = num0(current?.income?.ingresos_financieros);
  const otrosNoOperacionales = num0(current?.income?.otros_ingresos_no_operacionales) - num0(current?.income?.otros_egresos_no_operacionales);

  const flujoPeriodo = num0(current?.cash?.flujo_caja);
  const flujoNoOperativo = flujoPeriodo - flujoOperativo - flujoFinanciero;
  const oaopNeto = deltaPatrimonio + ingresosFinancieros + otrosNoOperacionales - flujoNoOperativo;

  const cajaInicial = Number.isFinite(current?.cash?.caja_inicial)
    ? current.cash.caja_inicial
    : (Number.isFinite(current?.cash?.caja_final) ? current.cash.caja_final - flujoPeriodo : 0);
  const cajaFinal = Number.isFinite(current?.cash?.caja_final) ? current.cash.caja_final : (cajaInicial + flujoPeriodo);
  const checkCaja = cajaInicial + flujoPeriodo - cajaFinal;

  return {
    ebitda,
    impuestos,
    deltaCapitalTrabajo,
    capex,
    flujoOperativo,
    deltaDeuda,
    costosFinancieros,
    flujoFinanciero,
    oaopNeto,
    deltaPatrimonio,
    ingresosFinancieros,
    otrosNoOperacionales,
    flujoNoOperativo,
    flujoPeriodo,
    cajaInicial,
    cajaFinal,
    checkCaja
  };
}

function previousSnapshotForYear(year) {
  const previousYears = Object.keys(state.snapshots)
    .map(Number)
    .filter((y) => Number.isFinite(y) && y < year)
    .sort((a, b) => b - a);
  return previousYears.length ? state.snapshots[previousYears[0]] : null;
}

function buildTable(table, header, years, rows) {
  const thead = `<thead><tr><th>${header}</th>${years.map((y) => `<th>${y}</th>`).join("")}</tr></thead>`;
  const bodyRows = rows.map(([label, getter, money, formatType]) => {
    const cols = years.map((y) => {
      const val = getter(state.snapshots[y]);
      return `<td>${formatCellValue(val, money, formatType)}</td>`;
    }).join("");
    return `<tr><td>${label}</td>${cols}</tr>`;
  }).join("");
  table.innerHTML = `${thead}<tbody>${bodyRows}</tbody>`;
}

function formatCellValue(value, money, formatType) {
  if (money) return fmtMoney(value);
  if (!Number.isFinite(value)) {
    if (formatType === "pct") return "0,00%";
    if (formatType === "ratio") return "0,00x";
    return "0,00";
  }
  if (formatType === "pct") return `${fmtNum(value, 2)}%`;
  if (formatType === "ratio") return `${fmtNum(value, 2)}x`;
  return fmtNum(value, 2);
}

function renderDeepIncomeAnalysis() {
  dom.deepIncomeAnalysis.innerHTML = "";
  if (!state.years.length) return;

  const years = [...state.years].sort((a, b) => a - b);
  const lineDefs = [
    ["ingresos", "Ingresos", (s) => s.income.ingresos, "money"],
    ["costos", "Costos", (s) => s.income.costos, "money"],
    ["utilidad_bruta", "Utilidad bruta", (s) => s.income.utilidad_bruta, "money"],
    ["gastos_administrativos", "Gastos administrativos", (s) => s.income.gastos_administrativos, "money"],
    ["gastos_venta", "Gastos de venta", (s) => s.income.gastos_venta, "money"],
    ["otros_gastos_operacionales", "Otros gastos operacionales", (s) => s.income.otros_gastos_operacionales, "money"],
    ["otros_ingresos", "Otros ingresos", (s) => s.income.otros_ingresos, "money"],
    ["utilidad_operativa", "Utilidad operativa", (s) => s.income.utilidad_operativa, "money"],
    ["ebitda", "EBITDA", (s) => s.income.ebitda, "money"],
    ["ingresos_financieros", "Ingresos financieros", (s) => s.income.ingresos_financieros, "money"],
    ["costos_financieros", "Costos financieros", (s) => s.income.costos_financieros, "money"],
    ["coberturas", "Coberturas", (s) => s.income.coberturas, "money"],
    ["utilidad_subsidiaria", "Utilidad subsidiaria", (s) => s.income.utilidad_subsidiaria, "money"],
    ["otros_ingresos_no_operacionales", "Otros ingresos no operacionales", (s) => s.income.otros_ingresos_no_operacionales, "money"],
    ["otros_egresos_no_operacionales", "Otros egresos no operacionales", (s) => s.income.otros_egresos_no_operacionales, "money"],
    ["impuestos", "Impuestos", (s) => s.income.impuestos, "money"],
    ["utilidad_neta", "Utilidad neta", (s) => s.income.utilidad_neta, "money"]
  ];
  const ratioDefs = RATIO_ORDER.map((key) => [key, RATIO_LABELS[key], (s) => s.ratios?.[key], ["deuda_ebitda", "ebitda_costos_financieros"].includes(key) ? "ratio" : "pct"]);

  const cards = [];
  cards.push(buildOverallIncomeCard(years));
  lineDefs.forEach(([key, label, getter, kind]) => cards.push(buildDeepCard(key, label, getter, years, kind, false)));
  ratioDefs.forEach(([key, label, getter, kind]) => cards.push(buildDeepCard(key, label, getter, years, kind, true)));

  dom.deepIncomeAnalysis.innerHTML = cards.join("");
}

function renderFinancialSummaries() {
  renderBalanceSummary();
  renderCashflowSummary();
}

function renderBalanceSummary() {
  if (!state.years.length) {
    dom.balanceSummaryCard.innerHTML = "";
    return;
  }

  const yearsAsc = [...state.years].sort((a, b) => a - b);
  const yearsDesc = [...yearsAsc].sort((a, b) => b - a);
  const latestYear = latestYearWithValue(yearsDesc, (y) => {
    const b = state.snapshots[y]?.balance || {};
    return [b.activos_totales, b.pasivos_totales, b.patrimonio_total].find((v) => Number.isFinite(v));
  });

  if (latestYear === null) {
    dom.balanceSummaryCard.innerHTML = `
      <h4>Resumen del balance general</h4>
      <p><strong>En palabras simples:</strong> El balance es una foto de la empresa: lo que tiene, lo que debe y lo que realmente le queda.</p>
      <p><strong>Lo que vemos:</strong> No hay datos suficientes en los años elegidos.</p>
      <p><strong>Que puedes hacer:</strong> Cargar mas años o validar si la empresa reporto balance en ese periodo.</p>
    `;
    return;
  }

  const b = state.snapshots[latestYear].balance;
  const ac = b.activos_corrientes;
  const pc = b.pasivos_corrientes;
  const at = b.activos_totales;
  const pt = b.pasivos_totales;
  const patr = b.patrimonio_total;

  const liquidez = divSafe(ac, pc);
  const apalancamiento = divSafe(pt, patr);
  const patrimonioSobreActivos = percentOf(patr, at);
  const activosTrend = trend(yearsAsc, (y) => state.snapshots[y]?.balance?.activos_totales, "balance_general");

  const mejoras = [];
  if (Number.isFinite(liquidez) && liquidez < 1) mejoras.push("subir liquidez de corto plazo (mas caja/cartera de calidad o menos pasivo corriente)");
  if (Number.isFinite(apalancamiento) && apalancamiento > 2.5) mejoras.push("reducir dependencia de deuda y fortalecer patrimonio");
  if (Number.isFinite(patrimonioSobreActivos) && patrimonioSobreActivos < 30) mejoras.push("mejorar capitalizacion para ganar resiliencia financiera");
  if (!mejoras.length) mejoras.push("mantener disciplina de deuda y capital de trabajo para sostener la solidez actual");

  dom.balanceSummaryCard.innerHTML = `
    <h4>Resumen del balance general</h4>
    <p><strong>En palabras simples:</strong> El balance te dice si la empresa esta fuerte o esta muy endeudada.</p>
    <p><strong>Lectura facil (${latestYear}):</strong> Tiene ${fmtMoney(at)} en activos, debe ${fmtMoney(pt)} y le quedan ${fmtMoney(patr)} como patrimonio. Liquidez: ${fmtNum(liquidez, 2)}x. Deuda frente al patrimonio: ${fmtNum(apalancamiento, 2)}x. Patrimonio sobre activos: ${fmtNum(patrimonioSobreActivos, 1)}%.</p>
    <p><strong>Como va en el tiempo:</strong> ${activosTrend}</p>
    <p><strong>Que puede mejorar esta empresa:</strong> ${mejoras.join("; ")}.</p>
  `;
}

function renderCashflowSummary() {
  if (!state.years.length) {
    dom.cashflowSummaryCard.innerHTML = "";
    return;
  }

  const yearsAsc = [...state.years].sort((a, b) => a - b);
  const yearsDesc = [...yearsAsc].sort((a, b) => b - a);
  const latestYear = latestYearWithValue(yearsDesc, (y) => state.snapshots[y]?.cash?.flujo_caja);

  if (latestYear === null) {
    dom.cashflowSummaryCard.innerHTML = `
      <h4>Resumen del flujo de efectivo</h4>
      <p><strong>En palabras simples:</strong> El flujo de efectivo muestra si entra o sale dinero real de caja.</p>
      <p><strong>Lo que vemos:</strong> No hay datos suficientes en los años elegidos.</p>
      <p><strong>Que puedes hacer:</strong> Revisar años con informacion para entender si la caja mejora o empeora.</p>
    `;
    return;
  }

  const flows = yearsAsc
    .map((y) => ({ y, v: state.snapshots[y]?.cash?.flujo_caja }))
    .filter((p) => Number.isFinite(p.v));
  const latestValue = state.snapshots[latestYear]?.cash?.flujo_caja;
  const positivos = flows.filter((p) => p.v > 0).length;
  const negativos = flows.filter((p) => p.v < 0).length;
  const promedio = flows.length ? flows.reduce((a, b) => a + b.v, 0) / flows.length : null;
  const volatilidad = flows.length >= 2 ? stdDev(flows.map((p) => p.v)) : null;
  const flujoTrend = trend(yearsAsc, (y) => state.snapshots[y]?.cash?.flujo_caja, "flujo_caja");

  const mejoras = [];
  if (Number.isFinite(latestValue) && latestValue < 0) mejoras.push("recuperar caja operativa y priorizar conversion de utilidad en efectivo");
  if (negativos > positivos) mejoras.push("estabilizar flujo anual para reducir dependencia de financiamiento externo");
  if (Number.isFinite(volatilidad) && Number.isFinite(promedio) && Math.abs(promedio) > 0 && (volatilidad / Math.abs(promedio)) > 1.2) {
    mejoras.push("reducir volatilidad de caja con mejor planeacion de cobros, pagos e inversion");
  }
  if (!mejoras.length) mejoras.push("mantener politica de caja prudente y seguimiento de capital de trabajo");

  dom.cashflowSummaryCard.innerHTML = `
    <h4>Resumen del flujo de efectivo</h4>
    <p><strong>En palabras simples:</strong> El flujo de efectivo te muestra si la empresa genera caja de verdad para pagar deudas y crecer.</p>
    <p><strong>Lectura facil (${latestYear}):</strong> Flujo neto ${fmtMoney(latestValue)}. Años con caja positiva: ${positivos}. Años con caja negativa: ${negativos}. Promedio del periodo: ${fmtMoney(promedio)}.</p>
    <p><strong>Como va en el tiempo:</strong> ${flujoTrend}</p>
    <p><strong>Que puede mejorar esta empresa:</strong> ${mejoras.join("; ")}.</p>
  `;
}

function stdDev(values) {
  const nums = (values || []).filter((v) => Number.isFinite(v));
  if (nums.length < 2) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + ((b - mean) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
}

function buildOverallIncomeCard(years) {
  const latest = Math.max(...years);
  const s = state.snapshots[latest];
  const r = s?.ratios || {};
  const fortalezas = [];
  const mejoras = [];

  if (Number.isFinite(r.margen_ebitda) && r.margen_ebitda >= 15) fortalezas.push("margen EBITDA saludable para absorber choques operativos");
  if (Number.isFinite(r.margen_neto) && r.margen_neto > 0) fortalezas.push("rentabilidad neta positiva");
  if (Number.isFinite(r.deuda_ebitda) && r.deuda_ebitda < 3) fortalezas.push("apalancamiento manejable frente a la caja operativa");
  if (Number.isFinite(r.ebitda_costos_financieros) && r.ebitda_costos_financieros > 3) fortalezas.push("buena cobertura de costos financieros");

  if (Number.isFinite(r.crecimiento_ingresos_yoy) && r.crecimiento_ingresos_yoy < 0) mejoras.push("recuperar crecimiento de ingresos con foco en segmentos rentables");
  if (Number.isFinite(r.gastos_operacionales_sobre_ingresos) && r.gastos_operacionales_sobre_ingresos > 35) mejoras.push("bajar peso de gastos operacionales sobre ventas");
  if (Number.isFinite(r.deuda_ebitda) && r.deuda_ebitda > 4) mejoras.push("reducir deuda o subir EBITDA para aliviar presion financiera");
  if (Number.isFinite(r.margen_bruto) && r.margen_bruto < 20) mejoras.push("mejorar margen bruto via costos directos, mezcla y precios");
  if (Number.isFinite(r.margen_neto) && r.margen_neto <= 0) mejoras.push("corregir perdida neta con disciplina en gastos y financiamiento");

  const fortalezasTxt = fortalezas.length ? fortalezas.join("; ") : "no se observan fortalezas estructurales claras en todos los frentes del estado de resultados.";
  const mejorasTxt = mejoras.length ? mejoras.join("; ") : "mantener disciplina en costos y estructura financiera para sostener la trayectoria positiva.";

  return `
    <article class="analysis-card">
      <h4>Lectura profunda integral</h4>
      <p><strong>Version facil (${latest}):</strong> Esta es una vista rapida para entender si la empresa crece, gana plata y controla su deuda.</p>
      <p><strong>Puntos fuertes:</strong> ${fortalezasTxt}</p>
      <p><strong>Que puede mejorar:</strong> ${mejorasTxt}</p>
    </article>
  `;
}

function buildDeepCard(key, label, getter, years, kind, isRatio) {
  const yearsDesc = [...years].sort((a, b) => b - a);
  const latestYear = latestYearWithValue(yearsDesc, (year) => getter(state.snapshots[year]));
  const ctx = isRatio ? (DEEP_RATIO_CONTEXT[key] || {}) : (DEEP_LINE_CONTEXT[key] || {});
  const meaning = ctx.meaning || "Indicador financiero para evaluar desempeño y riesgos.";
  const improve = ctx.improve || "Profundizar en causas operativas y definir plan de mejora por unidad.";
  const betterHigh = ctx.betterHigh !== false;

  if (latestYear === null) {
    return `
      <article class="analysis-card">
        <h4>${label}</h4>
        <p><strong>En palabras simples:</strong> ${meaning}</p>
        <p><strong>Lo que vemos:</strong> No hay datos suficientes en los años seleccionados.</p>
        <p><strong>Que hacer:</strong> ${improve}</p>
      </article>
    `;
  }

  const latestValue = getter(state.snapshots[latestYear]);
  const valueText = kind === "pct" ? `${fmtNum(latestValue, 2)}%` : kind === "ratio" ? `${fmtNum(latestValue, 2)}x` : fmtMoney(latestValue);
  const trendText = deepTrendNarrative(years, (y) => getter(state.snapshots[y]), betterHigh, kind);
  const healthText = isRatio ? ratioHealthNarrative(key, latestValue) : lineHealthNarrative(key, latestValue);

  return `
    <article class="analysis-card">
      <h4>${label}</h4>
      <p><strong>En palabras simples:</strong> ${meaning}</p>
      <p><strong>Lectura facil (${latestYear}):</strong> ${valueText}. ${healthText}</p>
      <p><strong>Como va en el tiempo:</strong> ${trendText}</p>
      <p><strong>Que puede mejorar:</strong> ${improve}</p>
    </article>
  `;
}

function deepTrendNarrative(years, getter, betterHigh, kind) {
  const pts = years.map((y) => ({ y, v: getter(y) })).filter((p) => Number.isFinite(p.v));
  if (pts.length < 2) return "No hay historia suficiente para evaluar evolucion.";

  const first = pts[0];
  const last = pts[pts.length - 1];
  const varPct = pct(last.v, first.v);
  if (varPct === null) return "La variacion no se puede calcular por base insuficiente.";

  const favorable = betterHigh ? varPct >= 0 : varPct <= 0;
  const direction = varPct >= 0 ? "subio" : "bajo";
  const amplitude = `${fmtNum(Math.abs(varPct), 1)}%`;
  const nuance = kind === "pct" || kind === "ratio" ? "en terminos de eficiencia" : "en terminos monetarios";
  return `Entre ${first.y} y ${last.y} ${direction} ${amplitude} ${nuance}; la lectura es ${favorable ? "favorable" : "de cuidado"} para la compañía.`;
}

function ratioHealthNarrative(key, value) {
  if (!Number.isFinite(value)) return "No hay valor disponible para evaluar salud financiera en este indicador.";
  if (key === "crecimiento_ingresos_yoy") return value > 5 ? "La compañía crece por encima de una referencia conservadora." : (value >= 0 ? "El crecimiento es positivo pero moderado." : "Hay contraccion de ingresos frente al año previo.");
  if (key === "margen_bruto") return value >= 30 ? "El margen bruto luce robusto para absorber variaciones de costos." : (value >= 15 ? "El margen bruto es intermedio y requiere seguimiento." : "El margen bruto es estrecho y expone rentabilidad.");
  if (key === "margen_ebitda") return value >= 15 ? "La eficiencia operativa es favorable." : (value >= 8 ? "La eficiencia operativa es aceptable pero ajustada." : "El margen EBITDA es bajo para sostener crecimiento.");
  if (key === "gastos_operacionales_sobre_ingresos") return value <= 25 ? "La carga operacional sobre ventas esta controlada." : (value <= 40 ? "La carga operacional es media y debe vigilarse." : "La carga operacional es alta y erosiona margen.");
  if (key === "margen_neto") return value >= 8 ? "La rentabilidad final es saludable." : (value > 0 ? "La utilidad neta es positiva pero delgada." : "La rentabilidad neta es negativa.");
  if (key === "deuda_ebitda") return value < 3 ? "El apalancamiento es manejable frente a la caja operativa." : (value <= 5 ? "El apalancamiento es exigente y requiere disciplina financiera." : "El apalancamiento es alto y aumenta vulnerabilidad.");
  if (key === "ebitda_costos_financieros") return value > 3 ? "La cobertura financiera es holgada." : (value >= 1.5 ? "La cobertura financiera es justa y sensible a choques." : "La cobertura financiera es debil.");
  return "Indicador calculado correctamente.";
}

function lineHealthNarrative(key, value) {
  if (!Number.isFinite(value)) return "No hay valor disponible para una lectura concluyente.";
  if (key === "utilidad_neta" || key === "utilidad_operativa" || key === "utilidad_bruta" || key === "ebitda") {
    return value >= 0 ? "El valor es positivo y aporta a sostenibilidad financiera." : "El valor es negativo y presiona liquidez y patrimonio.";
  }
  if (key === "costos" || key === "gastos_administrativos" || key === "gastos_venta" || key === "otros_gastos_operacionales" || key === "costos_financieros" || key === "otros_egresos_no_operacionales") {
    return "Es un rubro de salida de recursos; su control impacta directamente la utilidad.";
  }
  return "Su comportamiento debe analizarse junto con margen y tendencia para leer calidad de resultados.";
}

function initBotChat(options = {}) {
  const clearStored = options?.clearStored !== false;
  const trackWelcome = options?.trackWelcome !== false;
  if (!dom.botChatLog) return;
  const previousSessionId = normalizeBotServerSessionId(state.botServerSessionId || readStoredBotServerSessionId());
  state.botHistory = [];
  state.botThinkingTurns = [];
  state.botServerSessionId = clearStored ? "" : normalizeBotServerSessionId(state.botServerSessionId || readStoredBotServerSessionId());
  state.botContext = { lastTermId: "", lastIntent: "" };
  dom.botChatLog.innerHTML = "";
  if (dom.botQuestionInput) dom.botQuestionInput.value = "";
  if (clearStored) {
    clearBotMemoryFromStorage();
    clearBotServerSessionStorage();
    if (previousSessionId) clearRemoteBotServerSession(previousSessionId).catch(() => {});
    ensureBotServerSessionId(true).catch(() => {});
  } else if (!state.botServerSessionId) {
    ensureBotServerSessionId(false).catch(() => {});
  }
  renderBotThinkingLog();
  addBotMessage("bot", botWelcomeText(), { track: trackWelcome });
}

function botWelcomeText() {
  if (state.selectedCompany && state.years.length) {
    const latest = Math.max(...state.years);
    return (
      `Hola, soy tu bot financiero en modo facil.\n` +
      `Ya tengo cargada la empresa ${state.selectedCompany.razon_social} (corte mas reciente: ${latest}).\n` +
      `Estoy entrenado con la guia ${BOT_TRAINING_SOURCE}.\n` +
      `Tambien puedo explicarte mi metodo A/F/A (Accion, Formato, Antecedentes).\n` +
      `Preguntame cosas como: "para que sirve el EBITDA", "que es WACC", "como va la utilidad neta" o "como haces la recopilación de datos".`
    );
  }
  return (
    "Hola, soy tu bot financiero en modo facil.\n" +
    `Estoy entrenado con la guia ${BOT_TRAINING_SOURCE}.\n` +
    "Primero carga una empresa y luego preguntame en lenguaje simple.\n" +
    "Ejemplo: para que sirve el margen bruto, que es DCF, explicame FCFF o muestrame el esquema A/F/A."
  );
}

function notifyBotDataReady() {
  if (!dom.botChatLog || !state.selectedCompany || !state.years.length) return;
  if (dom.botChatLog.children.length > 1) return;
  const latest = Math.max(...state.years);
  addBotMessage(
    "bot",
    `Datos listos para ${state.selectedCompany.razon_social}. Puedes empezar con: ` +
    `"dame un resumen rapido", "como va la deuda ebitda" o "explicame para que sirve el flujo de caja".`
  );
}

async function handleBotSend() {
  const question = cleanText(dom.botQuestionInput?.value || "");
  if (!question || state.botBusy) return;
  addBotMessage("user", question);
  dom.botQuestionInput.value = "";

  const commandResponse = runChatCommand(question);
  if (commandResponse) {
    addBotMessage("bot", commandResponse);
    dom.botQuestionInput.focus();
    return;
  }

  const localAnswer = generateBotAnswer(question);
  addBotMessage("bot", localAnswer);

  const useHiddenAdvisor = shouldUseHiddenAdvisor(question);
  const useExternal = shouldUseExternalEnrichment(question);
  if (!useHiddenAdvisor && !useExternal) {
    dom.botQuestionInput.focus();
    return;
  }

  setBotBusy(true);
  try {
    const payload = buildExternalContextPayload(question);
    let baselineAnswer = localAnswer;

    if (useHiddenAdvisor) {
      const hiddenAdvisor = await queryHiddenAdvisor(
        question,
        payload,
        localAnswer,
        hiddenAdvisorOptionsForQuestion(question)
      );
      if (hiddenAdvisor?.answer) {
        const enriched = buildExternalFollowupMessage(localAnswer, hiddenAdvisor.answer);
        if (enriched) addBotMessage("bot", enriched);
        if (hiddenAdvisor.traceId) {
          registerBotThinkingTrace(hiddenAdvisor.traceId, question, hiddenAdvisor.thinkingSummary);
        }
        baselineAnswer = hiddenAdvisor.answer;
      }
    }

    if (useExternal) {
      const prompt = buildExternalPromptText(payload);
      if (dom.extPromptOutput) dom.extPromptOutput.value = prompt;
      const externalResult = await queryExternalProviders(payload, prompt);
      const unified = buildUnifiedBotAnswer(baselineAnswer, externalResult);
      const enriched = buildExternalFollowupMessage(baselineAnswer, unified);
      if (enriched) addBotMessage("bot", enriched);
    }
  } catch (error) {
    console.error("[ExternalBot] Error consultando APIs externas", error);
    addBotMessage("bot", "No pude completar la ampliacion externa en este intento. La respuesta local ya quedo lista.");
  } finally {
    setBotBusy(false);
    refreshExternalConfigStatus();
    dom.botQuestionInput.focus();
  }
}

async function queryHiddenAdvisor(question, payload, localAnswer, options = {}) {
  try {
    const sessionId = await ensureBotServerSessionId();
    const response = await fetchWithTimeout(
      advisorApiUrl("/api/advisor"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          question,
          payload,
          local_answer: localAnswer,
          options
        })
      },
      HIDDEN_ADVISOR_TIMEOUT_MS
    );
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    const answer = cleanText(data?.answer || "");
    const serverSessionId = normalizeBotServerSessionId(data?.session_id || "");
    if (serverSessionId) {
      state.botServerSessionId = serverSessionId;
      saveBotServerSessionIdToStorage(serverSessionId);
    }
    const traceId = cleanText(data?.trace_id || "");
    const thinkingSummary = data?.thinking && typeof data.thinking === "object" ? data.thinking : null;
    if (!answer) return null;
    const sources = Array.isArray(data?.sources) ? data.sources.map((s) => cleanText(s)).filter(Boolean) : [];
    if (!sources.length) return { answer, traceId, thinkingSummary };
    const block = `\n\nFuentes consultadas:\n${sources.slice(0, 8).map((s, i) => `${i + 1}) ${s}`).join("\n")}`;
    return { answer: `${answer}${block}`, traceId, thinkingSummary };
  } catch (error) {
    console.warn("[HiddenAdvisor] no disponible, usando respuesta local", error?.message || error);
    return null;
  }
}

function addBotMessage(role, text, options = {}) {
  const track = options?.track !== false;
  if (!dom.botChatLog) return;
  const item = document.createElement("article");
  item.className = `bot-msg ${role === "user" ? "user" : "bot"}`;
  item.innerHTML = `<p>${escapeHtml(String(text || "")).replace(/\n/g, "<br>")}</p>`;
  dom.botChatLog.appendChild(item);
  dom.botChatLog.scrollTop = dom.botChatLog.scrollHeight;
  if (track) trackBotTurn(role, text);
}

function trackBotTurn(role, text) {
  const safeRole = role === "user" ? "user" : "assistant";
  const safeText = cleanText(text || "");
  if (!safeText) return;
  state.botHistory.push({
    role: safeRole,
    text: safeText,
    at: new Date().toISOString()
  });
  if (state.botHistory.length > 60) {
    state.botHistory = state.botHistory.slice(-60);
  }
  saveBotMemoryToStorage();
}

function recentBotHistory(limit = 16) {
  return (state.botHistory || [])
    .slice(-Math.max(1, Number(limit) || 16))
    .map((m) => ({ role: m.role, text: m.text, at: m.at }));
}

function setBotBusy(flag) {
  state.botBusy = !!flag;
  if (!dom.botSendBtn) return;
  dom.botSendBtn.disabled = !!flag;
  dom.botSendBtn.textContent = flag ? "Consultando..." : "Preguntar";
}

function shouldUseHiddenAdvisor(questionRaw) {
  if (!state.selectedCompany || !state.years.length) return false;
  const q = normalizeText(questionRaw);
  if (!q) return false;
  if (q.startsWith("/")) return false;
  if (
    q.includes("hola") ||
    q.includes("buenas") ||
    q.includes("ayuda") ||
    q.includes("que puedo preguntar") ||
    q.includes("como te pregunto")
  ) {
    return false;
  }
  return true;
}

function hiddenAdvisorOptionsForQuestion(questionRaw) {
  const qNorm = normalizeText(questionRaw);
  const needsWeb = isLikelyExternalQuestion(qNorm) || qNorm.includes("portal") || qNorm.includes("fuente");
  return {
    precision_mode: "high",
    interpretation_level: 3,
    temperature: 0.2,
    enforce_year_isolation: true,
    debug_trace: true,
    skip_web: !needsWeb,
    skip_llm: false
  };
}

function shouldUseExternalEnrichment(questionRaw) {
  if (!dom.extModeToggle?.checked) return false;
  if (!hasExternalProviderConfigured()) return false;
  const q = normalizeText(questionRaw);
  if (!q) return false;
  return isLikelyExternalQuestion(q);
}

function hasExternalProviderConfigured() {
  const cfg = readExternalConfigFromDom();
  return configuredProviderIdSet(cfg).size > 0;
}

function isLikelyExternalQuestion(qNorm) {
  if (!qNorm) return false;
  if (qNorm.includes("fuente")) return true;
  if (qNorm.includes("extern")) return true;
  if (qNorm.includes("internet")) return true;
  if (qNorm.includes("estrategia en accion")) return true;
  if (qNorm.includes("perplexity") || qNorm.includes("chatgpt") || qNorm.includes("copilot") || qNorm.includes("humata") || qNorm.includes("notebook")) return true;
  if ((qNorm.includes("compara") || qNorm.includes("contrasta")) && (qNorm.includes("sector") || qNorm.includes("mercado") || qNorm.includes("fuera"))) return true;
  return false;
}

function buildExternalFollowupMessage(localAnswer, externalAnswer) {
  const localNorm = normalizeText(localAnswer || "");
  const externalRaw = cleanText(externalAnswer || "");
  const externalNorm = normalizeText(externalRaw);
  if (!externalNorm || externalNorm === localNorm) return "";
  if (localNorm && textSimilarity(localNorm, externalNorm) >= 0.9) return "";

  if (localNorm && externalNorm.startsWith(localNorm)) {
    const suffix = cleanText(externalRaw.slice(localAnswer.length));
    if (!suffix) return "";
    return `Ampliacion externa:\n${suffix}`;
  }
  return `Ampliacion externa:\n${externalRaw}`;
}

function textSimilarity(aNorm, bNorm) {
  const a = new Set(String(aNorm || "").split(/\s+/g).filter((t) => t.length >= 3));
  const b = new Set(String(bNorm || "").split(/\s+/g).filter((t) => t.length >= 3));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  a.forEach((t) => {
    if (b.has(t)) intersection += 1;
  });
  const union = a.size + b.size - intersection;
  if (!union) return 0;
  return intersection / union;
}

async function registerBotThinkingTrace(traceId, question, thinkingSummary = null) {
  const id = cleanText(traceId || "");
  if (!id) return;

  let trace = null;
  try {
    trace = await fetchBotThinkingTraceById(id);
  } catch (error) {
    console.warn("[ThinkingTrace] no fue posible leer traza por id", error?.message || error);
  }

  if (!trace && thinkingSummary) {
    trace = {
      id,
      created_at: new Date().toISOString(),
      question,
      intent: thinkingSummary.intent || null,
      focus: thinkingSummary.focus || null,
      data_profile: thinkingSummary.data_profile || null,
      priorities: thinkingSummary.priorities || [],
      top_signals: thinkingSummary.top_signals || []
    };
  }

  if (!trace) return;
  const idx = state.botThinkingTurns.findIndex((t) => cleanText(t?.id || "") === id);
  if (idx >= 0) state.botThinkingTurns[idx] = trace;
  else state.botThinkingTurns.push(trace);
  if (state.botThinkingTurns.length > 40) {
    state.botThinkingTurns = state.botThinkingTurns.slice(-40);
  }
  saveBotMemoryToStorage();
  renderBotThinkingLog();
}

async function fetchBotThinkingTraceById(traceId) {
  const id = cleanText(traceId || "");
  if (!id) return null;
  const url = `${advisorApiUrl("/api/advisor/debug")}?id=${encodeURIComponent(id)}`;
  const response = await fetchWithTimeout(url, { method: "GET" }, HIDDEN_ADVISOR_TIMEOUT_MS + 2000);
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  if (!data?.ok) return null;
  return data.trace || null;
}

async function refreshBotThinkingFromServer() {
  if (!dom.botThinkingStatus) return;
  dom.botThinkingStatus.textContent = "Actualizando trazas...";
  try {
    const url = `${advisorApiUrl("/api/advisor/debug")}?limit=20&full=1`;
    const response = await fetchWithTimeout(url, { method: "GET" }, HIDDEN_ADVISOR_TIMEOUT_MS + 4000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json().catch(() => null);
    const traces = Array.isArray(data?.traces) ? data.traces : [];
    state.botThinkingTurns = traces.slice().reverse();
    renderBotThinkingLog();
    dom.botThinkingStatus.textContent = traces.length
      ? `Trazas cargadas: ${traces.length}.`
      : "No hay trazas disponibles todavía.";
  } catch (error) {
    dom.botThinkingStatus.textContent = "No fue posible actualizar trazas (asesor no disponible).";
  }
}

async function clearBotThinkingLog() {
  state.botThinkingTurns = [];
  saveBotMemoryToStorage();
  renderBotThinkingLog();
  if (dom.botThinkingStatus) dom.botThinkingStatus.textContent = "Trazas locales limpiadas.";
  try {
    await fetchWithTimeout(
      advisorApiUrl("/api/advisor/debug/clear"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      },
      HIDDEN_ADVISOR_TIMEOUT_MS + 1500
    );
    if (dom.botThinkingStatus) dom.botThinkingStatus.textContent = "Trazas limpiadas (local y servidor).";
  } catch {}
}

function renderBotThinkingLog() {
  if (!dom.botThinkingLog) return;
  const traces = Array.isArray(state.botThinkingTurns) ? state.botThinkingTurns : [];
  if (!traces.length) {
    dom.botThinkingLog.innerHTML = "<p class=\"thinking-empty\">Aun no hay trazas. Haz una pregunta para registrar el turno.</p>";
    return;
  }

  const items = traces
    .slice()
    .reverse()
    .map((trace, idx) => renderThinkingItem(trace, idx + 1))
    .join("");
  dom.botThinkingLog.innerHTML = items;
}

function renderThinkingItem(trace, rank) {
  const id = cleanText(trace?.id || `turn_${rank}`);
  const created = cleanText(trace?.created_at || "");
  const createdText = created ? new Date(created).toLocaleString("es-CO") : "N/D";
  const question = cleanText(trace?.question || "");
  const intent = cleanText(trace?.intent?.type || "");
  const objective = cleanText(trace?.intent?.objective || "");
  const year = trace?.focus?.year ?? trace?.latest_year ?? "N/D";
  const coverage = Number.isFinite(Number(trace?.data_profile?.coverage_pct)) ? `${Number(trace.data_profile.coverage_pct)}%` : "N/D";
  const priorities = Array.isArray(trace?.priorities) ? trace.priorities.slice(0, 3) : [];
  const plan = Array.isArray(trace?.plan) ? trace.plan.slice(0, 4) : [];
  const signals = Array.isArray(trace?.signals) ? trace.signals.slice(0, 3) : (Array.isArray(trace?.top_signals) ? trace.top_signals.slice(0, 3) : []);
  const signalText = signals.map((s) => cleanText(s?.statement || "")).filter(Boolean).join(" | ");
  const priorityText = priorities.map((p) => `P${p.rank}: ${cleanText(p.theme || p.cause || "")}`).filter(Boolean).join(" | ");
  const planText = plan.map((p) => cleanText(p?.step || "")).filter(Boolean).join(" -> ");

  return [
    "<article class=\"thinking-item\">",
    `  <h4>Turno ${rank} · ${escapeHtml(id)}</h4>`,
    `  <p><strong>Fecha:</strong> ${escapeHtml(createdText)}</p>`,
    `  <p><strong>Pregunta:</strong> ${escapeHtml(question || "N/D")}</p>`,
    `  <p><strong>Intencion:</strong> ${escapeHtml(intent || "N/D")} · ${escapeHtml(objective || "N/D")}</p>`,
    `  <p><strong>Foco anual:</strong> ${escapeHtml(String(year))} · <strong>Cobertura datos:</strong> ${escapeHtml(coverage)}</p>`,
    `  <p><strong>Senales:</strong> ${escapeHtml(signalText || "N/D")}</p>`,
    `  <p><strong>Prioridades:</strong> ${escapeHtml(priorityText || "N/D")}</p>`,
    `  <p><strong>Plan:</strong> ${escapeHtml(planText || "N/D")}</p>`,
    "</article>"
  ].join("\n");
}

function runChatCommand(questionRaw) {
  const text = cleanText(questionRaw || "");
  if (!text.startsWith("/")) return "";
  const parts = text.split(/\s+/);
  const cmd = normalizeText(parts[0] || "");
  if (cmd !== "/config" && cmd !== "/status" && cmd !== "/advisor") {
    return "Comando no reconocido. Usa /config, /status o /advisor.";
  }

  if (cmd === "/status") {
    refreshExternalConfigStatus();
    const cfg = readExternalConfigFromDom();
    const configured = configuredProviderIdSet(cfg);
    const extStatus = configured.size
      ? `APIs listas en chat: ${[...configured].map((id) => BOT_EXTERNAL_PROVIDER_MAP[id]?.name || id).join(", ")}.`
      : "No hay APIs configuradas. Ejemplo: /config openai sk-xxxx";
    const advisorBase = currentAdvisorBaseUrl();
    const sessionId = normalizeBotServerSessionId(state.botServerSessionId || readStoredBotServerSessionId()) || "N/D";
    return `${extStatus}\nAsesor backend: ${advisorBase}\nSesion servidor: ${sessionId}`;
  }

  if (cmd === "/advisor") {
    const action = normalizeText(parts[1] || "status");
    const value = cleanText(parts.slice(2).join(" "));

    if (action === "status") {
      const advisorBase = currentAdvisorBaseUrl();
      const sessionId = normalizeBotServerSessionId(state.botServerSessionId || readStoredBotServerSessionId()) || "N/D";
      return `Backend asesor: ${advisorBase}\nSesion servidor: ${sessionId}\nUso: /advisor base https://tu-backend ; /advisor reset_session`;
    }
    if (action === "base") {
      if (!value) return "Uso: /advisor base https://tu-backend-publico";
      const normalized = setAdvisorBaseUrl(value);
      if (!normalized) return "URL invalida. Usa un endpoint http/https valido.";
      return `Backend asesor actualizado a ${normalized}. Ya quedo guardado para este navegador.`;
    }
    if (action === "reset_session") {
      const previous = normalizeBotServerSessionId(state.botServerSessionId || readStoredBotServerSessionId());
      if (previous) clearRemoteBotServerSession(previous).catch(() => {});
      clearBotServerSessionStorage();
      state.botServerSessionId = "";
      ensureBotServerSessionId(true).catch(() => {});
      return "Sesion de memoria del servidor reiniciada.";
    }
    return "Comando /advisor no reconocido. Usa: status, base, reset_session.";
  }

  const action = normalizeText(parts[1] || "");
  const value = cleanText(parts.slice(2).join(" "));
  if (action === "status") {
    refreshExternalConfigStatus();
    return dom.extConfigStatus?.textContent || "Estado no disponible.";
  }
  if (action === "clear") {
    clearExternalConfigFromStorage();
    return "Configuracion de APIs eliminada.";
  }

  if (!value) {
    return (
      "Uso de comandos:\n" +
      "1) /config openai sk-xxxx\n" +
      "2) /config perplexity pplx-xxxx\n" +
      "3) /config humata token\n" +
      "4) /config copilot_endpoint https://tu-endpoint\n" +
      "5) /config copilot_token token\n" +
      "6) /config notebook_endpoint https://tu-endpoint\n" +
      "7) /config notebook_token token\n" +
      "8) /config status\n" +
      "9) /config clear"
    );
  }

  if (action === "openai") {
    if (dom.extOpenAiKey) dom.extOpenAiKey.value = value;
  } else if (action === "perplexity") {
    if (dom.extPerplexityKey) dom.extPerplexityKey.value = value;
  } else if (action === "humata") {
    if (dom.extHumataKey) dom.extHumataKey.value = value;
  } else if (action === "copilot_endpoint") {
    if (dom.extCopilotEndpoint) dom.extCopilotEndpoint.value = value;
  } else if (action === "copilot_token") {
    if (dom.extCopilotToken) dom.extCopilotToken.value = value;
  } else if (action === "notebook_endpoint") {
    if (dom.extNotebookEndpoint) dom.extNotebookEndpoint.value = value;
  } else if (action === "notebook_token") {
    if (dom.extNotebookToken) dom.extNotebookToken.value = value;
  } else if (action === "openai_model") {
    if (dom.extOpenAiModel) dom.extOpenAiModel.value = value;
  } else if (action === "perplexity_model") {
    if (dom.extPerplexityModel) dom.extPerplexityModel.value = value;
  } else if (action === "humata_model") {
    if (dom.extHumataModel) dom.extHumataModel.value = value;
  } else {
    return "Proveedor no reconocido. Usa: openai, perplexity, humata, copilot_endpoint, copilot_token, notebook_endpoint, notebook_token.";
  }

  saveExternalConfigToStorage();
  refreshExternalConfigStatus();
  return `Configuracion guardada para: ${action}.`;
}

function readExternalConfigFromDom() {
  return {
    openai: {
      key: cleanText(dom.extOpenAiKey?.value || ""),
      model: cleanText(dom.extOpenAiModel?.value || "") || "gpt-5.1-chat-latest"
    },
    perplexity: {
      key: cleanText(dom.extPerplexityKey?.value || ""),
      model: cleanText(dom.extPerplexityModel?.value || "") || "sonar-pro"
    },
    humata: {
      key: cleanText(dom.extHumataKey?.value || ""),
      model: cleanText(dom.extHumataModel?.value || "") || "gpt-5-mini",
      endpoint: cleanText(dom.extHumataEndpoint?.value || ""),
      docIds: parseDocIds(dom.extHumataDocIds?.value || "")
    },
    copilot: {
      endpoint: cleanText(dom.extCopilotEndpoint?.value || ""),
      token: cleanText(dom.extCopilotToken?.value || "")
    },
    notebooklm: {
      endpoint: cleanText(dom.extNotebookEndpoint?.value || ""),
      token: cleanText(dom.extNotebookToken?.value || "")
    }
  };
}

function applyExternalConfigToDom(cfg) {
  const safeCfg = cfg || {};
  if (dom.extOpenAiKey) dom.extOpenAiKey.value = safeCfg.openai?.key || "";
  if (dom.extOpenAiModel) dom.extOpenAiModel.value = safeCfg.openai?.model || "gpt-5.1-chat-latest";
  if (dom.extPerplexityKey) dom.extPerplexityKey.value = safeCfg.perplexity?.key || "";
  if (dom.extPerplexityModel) dom.extPerplexityModel.value = safeCfg.perplexity?.model || "sonar-pro";
  if (dom.extHumataKey) dom.extHumataKey.value = safeCfg.humata?.key || "";
  if (dom.extHumataModel) dom.extHumataModel.value = safeCfg.humata?.model || "gpt-5-mini";
  if (dom.extHumataEndpoint) dom.extHumataEndpoint.value = safeCfg.humata?.endpoint || "";
  if (dom.extHumataDocIds) dom.extHumataDocIds.value = (safeCfg.humata?.docIds || []).join("\n");
  if (dom.extCopilotEndpoint) dom.extCopilotEndpoint.value = safeCfg.copilot?.endpoint || "";
  if (dom.extCopilotToken) dom.extCopilotToken.value = safeCfg.copilot?.token || "";
  if (dom.extNotebookEndpoint) dom.extNotebookEndpoint.value = safeCfg.notebooklm?.endpoint || "";
  if (dom.extNotebookToken) dom.extNotebookToken.value = safeCfg.notebooklm?.token || "";
}

function saveExternalConfigToStorage() {
  try {
    const cfg = readExternalConfigFromDom();
    window.localStorage.setItem(EXTERNAL_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
    refreshExternalConfigStatus();
    showMessage("success", "Configuracion de APIs externas guardada en este navegador.");
  } catch {
    showMessage("error", "No fue posible guardar la configuracion local. Revisa permisos del navegador.");
  }
}

function loadExternalConfigFromStorage() {
  try {
    const raw = window.localStorage.getItem(EXTERNAL_CONFIG_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    applyExternalConfigToDom(parsed);
  } catch (error) {
    console.warn("[ExternalBot] No se pudo cargar configuracion local", error);
  }
}

function clearExternalConfigFromStorage() {
  try {
    window.localStorage.removeItem(EXTERNAL_CONFIG_STORAGE_KEY);
    applyExternalConfigToDom({});
    refreshExternalConfigStatus();
    showMessage("success", "Configuracion externa eliminada.");
  } catch {
    showMessage("error", "No fue posible limpiar la configuracion externa.");
  }
}

function sanitizeStoredBotHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .map((entry) => {
      const text = cleanText(entry?.text || "");
      if (!text) return null;
      const roleNorm = normalizeText(entry?.role || "");
      return {
        role: roleNorm === "user" ? "user" : "assistant",
        text,
        at: cleanText(entry?.at || "") || new Date().toISOString()
      };
    })
    .filter(Boolean)
    .slice(-60);
}

function sanitizeStoredThinkingTurns(rawTurns) {
  if (!Array.isArray(rawTurns)) return [];
  return rawTurns
    .filter((turn) => turn && typeof turn === "object")
    .map((turn) => ({ ...turn }))
    .slice(-40);
}

function saveBotMemoryToStorage() {
  try {
    const payload = {
      version: 1,
      saved_at: new Date().toISOString(),
      company: state.selectedCompany ? {
        nit: cleanText(state.selectedCompany?.nit || ""),
        razon_social: cleanText(state.selectedCompany?.razon_social || "")
      } : null,
      botHistory: sanitizeStoredBotHistory(state.botHistory),
      botContext: {
        lastTermId: cleanText(state.botContext?.lastTermId || ""),
        lastIntent: cleanText(state.botContext?.lastIntent || "")
      },
      botServerSessionId: normalizeBotServerSessionId(state.botServerSessionId || readStoredBotServerSessionId()),
      botThinkingTurns: sanitizeStoredThinkingTurns(state.botThinkingTurns)
    };
    window.localStorage.setItem(BOT_MEMORY_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[BotMemory] No se pudo guardar memoria local", error);
  }
}

function clearBotMemoryFromStorage() {
  try {
    window.localStorage.removeItem(BOT_MEMORY_STORAGE_KEY);
  } catch (error) {
    console.warn("[BotMemory] No se pudo limpiar memoria local", error);
  }
}

function restoreBotMemoryFromStorage() {
  if (!dom.botChatLog) return;
  state.botServerSessionId = normalizeBotServerSessionId(state.botServerSessionId || readStoredBotServerSessionId());
  try {
    const raw = window.localStorage.getItem(BOT_MEMORY_STORAGE_KEY);
    if (!raw) {
      if (!dom.botChatLog.children.length) addBotMessage("bot", botWelcomeText(), { track: false });
      return;
    }
    const parsed = JSON.parse(raw);
    const history = sanitizeStoredBotHistory(parsed?.botHistory);
    const ctx = parsed?.botContext && typeof parsed.botContext === "object" ? parsed.botContext : {};

    state.botHistory = history;
    state.botContext = {
      lastTermId: cleanText(ctx?.lastTermId || ""),
      lastIntent: cleanText(ctx?.lastIntent || "")
    };
    state.botServerSessionId = normalizeBotServerSessionId(parsed?.botServerSessionId || readStoredBotServerSessionId());
    if (state.botServerSessionId) saveBotServerSessionIdToStorage(state.botServerSessionId);
    state.botThinkingTurns = sanitizeStoredThinkingTurns(parsed?.botThinkingTurns);

    dom.botChatLog.innerHTML = "";
    if (!history.length) {
      addBotMessage("bot", botWelcomeText(), { track: false });
    } else {
      history.forEach((turn) => {
        addBotMessage(turn.role === "user" ? "user" : "bot", turn.text, { track: false });
      });
    }
    renderBotThinkingLog();
  } catch (error) {
    console.warn("[BotMemory] No se pudo restaurar memoria local", error);
    clearBotMemoryFromStorage();
    state.botHistory = [];
    state.botContext = { lastTermId: "", lastIntent: "" };
    state.botServerSessionId = normalizeBotServerSessionId(readStoredBotServerSessionId());
    state.botThinkingTurns = [];
    dom.botChatLog.innerHTML = "";
    addBotMessage("bot", botWelcomeText(), { track: false });
    renderBotThinkingLog();
  }
}

function refreshExternalConfigStatus() {
  if (!dom.extConfigStatus) return;
  const providers = selectedExternalProviders();
  const cfg = readExternalConfigFromDom();
  const configured = configuredProviderIdSet(cfg);
  const ready = providers.filter((p) => configured.has(p.id));
  const missing = providers.filter((p) => !configured.has(p.id));
  const advisorInfo = ` Backend asesor: ${currentAdvisorBaseUrl()}.`;

  if (!dom.extModeToggle?.checked) {
    dom.extConfigStatus.textContent = `Modo IA externa desactivado. Activalo para consultar APIs y responder en este chat.${advisorInfo}`;
    return;
  }
  if (!providers.length) {
    dom.extConfigStatus.textContent = `Selecciona al menos una herramienta externa para consulta.${advisorInfo}`;
    return;
  }
  if (!ready.length) {
    dom.extConfigStatus.textContent = `Sin APIs listas para: ${missing.map((p) => p.name).join(", ")}.${advisorInfo}`;
    return;
  }
  const missingText = missing.length ? ` Faltan credenciales/endpoints para: ${missing.map((p) => p.name).join(", ")}.` : "";
  dom.extConfigStatus.textContent = `APIs listas: ${ready.map((p) => p.name).join(", ")}.${missingText}${advisorInfo}`;
}

function parseDocIds(raw) {
  const parts = String(raw || "")
    .split(/[\n,;]+/g)
    .map(cleanText)
    .filter(Boolean);
  return [...new Set(parts)];
}

function generateExternalPromptFromCurrentInput() {
  const question = cleanText(dom.botQuestionInput?.value || "") || "Analiza la informacion recopilada de la empresa y explica hallazgos clave.";
  const payload = buildExternalContextPayload(question);
  const prompt = buildExternalPromptText(payload);
  if (dom.extPromptOutput) dom.extPromptOutput.value = prompt;
  showMessage("success", "Prompt A/F/A generado. Puedes copiarlo y abrir los links seleccionados.");
}

async function copyExternalPromptToClipboard() {
  const text = cleanText(dom.extPromptOutput?.value || "");
  if (!text) {
    showMessage("warning", "Primero genera el prompt A/F/A.");
    return;
  }
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      dom.extPromptOutput.focus();
      dom.extPromptOutput.select();
      document.execCommand("copy");
    }
    showMessage("success", "Prompt copiado al portapapeles.");
  } catch {
    showMessage("error", "No fue posible copiar automaticamente. Copialo manualmente del cuadro de prompt.");
  }
}

function downloadExternalContextJson() {
  const question = cleanText(dom.botQuestionInput?.value || "") || "Analiza la informacion recopilada de la empresa.";
  const payload = buildExternalContextPayload(question);
  const filename = `contexto_ia_externa_${state.selectedCompany?.nit || "sin_empresa"}_${stamp()}.json`;
  download(JSON.stringify(payload, null, 2), filename, "application/json;charset=utf-8;");
}

function openSelectedExternalLinks() {
  const providers = selectedExternalProviders();
  if (!providers.length) {
    showMessage("warning", "Selecciona al menos una herramienta externa.");
    return;
  }
  providers.forEach((p) => {
    try { window.open(p.url, "_blank", "noopener,noreferrer"); } catch {}
  });
  showMessage("info", `Se abrieron ${providers.length} links externos para analisis.`);
}

function selectedExternalProviders() {
  const checks = [...(dom.extProviderList?.querySelectorAll(".ext-provider-check:checked") || [])];
  if (!checks.length) {
    return BOT_EXTERNAL_PROVIDERS.map((p) => ({ id: p.id, name: p.name, url: p.url }));
  }
  return checks
    .map((input) => {
      const url = input.getAttribute("data-url") || "";
      const name = cleanText(input.parentElement?.textContent || "Herramienta externa");
      if (!url) return null;
      const match = BOT_EXTERNAL_PROVIDERS.find(
        (p) => p.url === url || normalizeText(p.name) === normalizeText(name)
      );
      return {
        id: match?.id || normalizeText(name).replace(/[^a-z0-9]+/g, ""),
        name: match?.name || name,
        url
      };
    })
    .filter(Boolean);
}

function buildExternalContextPayload(question) {
  const yearsAsc = [...(state.years || [])].sort((a, b) => a - b);
  const latest = yearsAsc.length ? yearsAsc[yearsAsc.length - 1] : null;
  const latestSnap = latest !== null ? state.snapshots[latest] : null;
  const providers = selectedExternalProviders();
  const userContext = cleanText(dom.extContextInput?.value || "");
  const chatHistory = recentBotHistory(8);
  const sessionId = normalizeBotServerSessionId(state.botServerSessionId || readStoredBotServerSessionId());

  const series = yearsAsc.map((year) => {
    const snap = state.snapshots[year] || {};
    const bridge = cashBridgeForYear(year);
    return {
      anio: year,
      ingresos: nullable(snap?.income?.ingresos),
      deuda: nullable(snap?.metrics?.deuda),
      ebitda: nullable(snap?.income?.ebitda),
      utilidad_neta: nullable(snap?.income?.utilidad_neta),
      flujo_operativo: nullable(bridge?.flujoOperativo),
      flujo_periodo: nullable(snap?.cash?.flujo_caja),
      deuda_ebitda: nullable(snap?.ratios?.deuda_ebitda),
      margen_ebitda_pct: nullable(snap?.ratios?.margen_ebitda),
      margen_neto_pct: nullable(snap?.ratios?.margen_neto),
      warnings: Array.isArray(snap?.warnings) ? snap.warnings.slice(0, 12) : []
    };
  });

  return {
    generated_at: new Date().toISOString(),
    session_id: sessionId || null,
    question,
    user_context: userContext,
    external_mode: true,
    external_providers: providers.length ? providers : BOT_EXTERNAL_PROVIDERS,
    company: state.selectedCompany ? {
      nit: state.selectedCompany.nit,
      razon_social: state.selectedCompany.razon_social,
      estado: state.selectedCompany.estado,
      etapa_situacion: state.selectedCompany.etapa_situacion,
      dependencia: state.selectedCompany.dependencia
    } : null,
    years_selected: yearsAsc,
    latest_year: latest,
    latest_snapshot: latestSnap ? {
      ingresos: nullable(latestSnap?.income?.ingresos),
      deuda: nullable(latestSnap?.metrics?.deuda),
      ebitda: nullable(latestSnap?.income?.ebitda),
      utilidad_neta: nullable(latestSnap?.income?.utilidad_neta),
      flujo_periodo: nullable(latestSnap?.cash?.flujo_caja),
      flujo_operativo: nullable(cashBridgeForYear(latest)?.flujoOperativo),
      deuda_ebitda: nullable(latestSnap?.ratios?.deuda_ebitda),
      margen_ebitda_pct: nullable(latestSnap?.ratios?.margen_ebitda),
      margen_neto_pct: nullable(latestSnap?.ratios?.margen_neto),
      z_altman: nullable(latestSnap?.metrics?.z_altman),
      warnings: Array.isArray(latestSnap?.warnings) ? latestSnap.warnings.slice(0, 20) : []
    } : null,
    history: series,
    chat_history: chatHistory,
    source_priority: [
      "Supersociedades (busqueda y contexto societario)",
      "datos.gov.co (estados financieros oficiales)",
      "Herramientas externas seleccionadas (solo contraste y explicacion)"
    ],
    official_sources: BOT_DOC_SOURCES
  };
}

function buildExternalPromptText(payload) {
  const providers = (payload.external_providers || []).map((p) => (typeof p === "string" ? p : `${p.name}: ${p.url}`)).join("\n- ");
  const company = payload.company
    ? `${payload.company.razon_social} (NIT ${payload.company.nit})`
    : "Empresa no cargada";
  const years = (payload.years_selected || []).length ? payload.years_selected.join(", ") : "Sin años seleccionados";

  return [
    "# Rol",
    "Eres un analista financiero corporativo (CFO virtual) experto en contabilidad, finanzas, FP&A, control de gestion, tesoreria, impuestos (nivel conceptual), valoracion, presupuestos, BI y analisis de riesgos.",
    "",
    "# Accion",
    "Analiza la recopilacion de datos de la empresa, con rigor tecnico.",
    "Reglas obligatorias:",
    "1) No inventar datos ni fuentes.",
    "2) Separar siempre: dato observado, supuesto usado y conclusion.",
    "3) Si falta data minima, pedirla antes de concluir.",
    "4) Adaptar el analisis al contexto real de la empresa.",
    "5) Si usas fuentes externas, citar fuente + fecha + enlace.",
    "",
    "# Formato",
    "Responde en este orden:",
    "1) Preguntas clave faltantes (si aplica)",
    "2) Lectura ejecutiva (2-4 lineas)",
    "3) Analisis tecnico-financiero",
    "4) KPIs clave y su interpretacion",
    "5) Riesgos y alertas",
    "6) Recomendaciones accionables priorizadas",
    "7) Fuentes y trazabilidad",
    "",
    "# Antecedentes",
    `Empresa: ${company}`,
    `Años analizados: ${years}`,
    `Pregunta objetivo: ${payload.question || "Analisis general"}`,
    `Contexto adicional del usuario: ${payload.user_context || "No suministrado"}`,
    "Prioridad de fuente:",
    "- Supersociedades + datos abiertos oficiales primero.",
    "- Herramientas externas solo como contraste.",
    "Herramientas externas habilitadas:",
    `- ${providers || BOT_AI_ASSIST_LINKS.join("\n- ")}`,
    "",
    "# Contexto Estructurado (JSON)",
    "Usa este JSON como base de analisis. No modifiques cifras, solo interpretalas:",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}

function configuredProviderIdSet(cfg) {
  const out = new Set();
  if (cfg?.openai?.key) out.add("chatgpt");
  if (cfg?.perplexity?.key) out.add("perplexity");
  if (cfg?.humata?.key) out.add("humata");
  if (cfg?.copilot?.endpoint && cfg?.copilot?.token) out.add("copilot");
  if (cfg?.notebooklm?.endpoint && cfg?.notebooklm?.token) out.add("notebooklm");
  return out;
}

async function queryExternalProviders(payload, prompt) {
  const providers = selectedExternalProviders();
  if (!providers.length) {
    return { providers: [], results: [] };
  }
  const cfg = readExternalConfigFromDom();
  const configured = configuredProviderIdSet(cfg);
  const runnable = providers.filter((p) => configured.has(p.id));
  if (!runnable.length) {
    return {
      providers: [],
      results: [],
      noExternalConfigured: true
    };
  }
  const tasks = runnable.map((provider) => queryExternalProvider(provider, cfg, payload, prompt));
  const results = await Promise.all(tasks);
  return { providers: runnable, results };
}

async function queryExternalProvider(provider, cfg, payload, prompt) {
  const start = Date.now();
  const base = {
    id: provider.id,
    provider: provider.name,
    status: "error",
    text: "",
    sources: []
  };
  try {
    let result;
    if (provider.id === "chatgpt") {
      result = await askOpenAi(cfg, prompt);
    } else if (provider.id === "perplexity") {
      result = await askPerplexity(cfg, prompt);
    } else if (provider.id === "humata") {
      result = await askHumata(cfg, prompt, payload);
    } else if (provider.id === "copilot") {
      result = await askCustomEndpoint("Copilot", cfg?.copilot?.endpoint, cfg?.copilot?.token, prompt, payload);
    } else if (provider.id === "notebooklm") {
      result = await askCustomEndpoint("NotebookLM", cfg?.notebooklm?.endpoint, cfg?.notebooklm?.token, prompt, payload);
    } else {
      result = { status: "skipped", reason: "Proveedor externo no soportado." };
    }
    return {
      ...base,
      ...result,
      latency_ms: Date.now() - start
    };
  } catch (error) {
    return {
      ...base,
      status: "error",
      error: externalErrorMessage(error),
      latency_ms: Date.now() - start
    };
  }
}

async function askOpenAi(cfg, prompt) {
  const apiKey = cleanText(cfg?.openai?.key || "");
  if (!apiKey) return { status: "skipped", reason: "Falta OpenAI API Key para ChatGPT." };

  const model = cleanText(cfg?.openai?.model || "") || "gpt-5.1-chat-latest";
  const body = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: EXTERNAL_SYSTEM_PROMPT }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }]
      }
    ],
    max_output_tokens: 1500
  };
  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    },
    EXTERNAL_TIMEOUT_MS
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readApiError(response.status, json));

  const text = extractOpenAiText(json);
  if (!text) throw new Error("OpenAI no devolvio contenido util.");

  return {
    status: "ok",
    text: truncateText(text, 4200),
    sources: extractGenericSources(json)
  };
}

async function askPerplexity(cfg, prompt) {
  const apiKey = cleanText(cfg?.perplexity?.key || "");
  if (!apiKey) return { status: "skipped", reason: "Falta API Key de Perplexity." };

  const model = cleanText(cfg?.perplexity?.model || "") || "sonar-pro";
  const body = {
    model,
    messages: [
      { role: "system", content: EXTERNAL_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    temperature: 0.2
  };
  const response = await fetchWithTimeout(
    "https://api.perplexity.ai/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    },
    EXTERNAL_TIMEOUT_MS
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readApiError(response.status, json));

  const text = extractGenericResponseText(json);
  if (!text) throw new Error("Perplexity no devolvio contenido util.");

  return {
    status: "ok",
    text: truncateText(text, 4200),
    sources: extractGenericSources(json)
  };
}

async function askHumata(cfg, prompt, payload) {
  const apiKey = cleanText(cfg?.humata?.key || "");
  if (!apiKey) return { status: "skipped", reason: "Falta API Key de Humata." };

  const endpoint = cleanText(cfg?.humata?.endpoint || "") || "https://api.humata.ai/v1/chat/completions";
  const model = cleanText(cfg?.humata?.model || "") || "gpt-5-mini";
  const body = {
    model,
    messages: [
      { role: "system", content: EXTERNAL_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    document_ids: cfg?.humata?.docIds || [],
    context: payload
  };
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: toBearer(apiKey)
      },
      body: JSON.stringify(body)
    },
    EXTERNAL_TIMEOUT_MS
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readApiError(response.status, json));

  const text = extractGenericResponseText(json);
  if (!text) throw new Error("Humata no devolvio contenido util.");

  return {
    status: "ok",
    text: truncateText(text, 4200),
    sources: extractGenericSources(json)
  };
}

async function askCustomEndpoint(providerName, endpoint, token, prompt, payload) {
  const cleanEndpoint = cleanText(endpoint || "");
  const cleanToken = cleanText(token || "");
  if (!cleanEndpoint || !cleanToken) {
    return {
      status: "skipped",
      reason: `${providerName} requiere endpoint y token para integracion dentro del chat.`
    };
  }
  const body = {
    provider: providerName,
    question: payload?.question || "",
    prompt,
    context: payload
  };
  const response = await fetchWithTimeout(
    cleanEndpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: toBearer(cleanToken)
      },
      body: JSON.stringify(body)
    },
    EXTERNAL_TIMEOUT_MS
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readApiError(response.status, json));

  const text = extractGenericResponseText(json);
  if (!text) throw new Error(`${providerName} no devolvio contenido util.`);
  return {
    status: "ok",
    text: truncateText(text, 4200),
    sources: extractGenericSources(json)
  };
}

function buildUnifiedBotAnswer(localAnswer, externalResult) {
  if (externalResult?.noExternalConfigured) {
    return localAnswer;
  }
  const results = externalResult?.results || [];
  const ok = results.filter((r) => r.status === "ok" && cleanText(r.text));
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "error");
  if (!ok.length) {
    const details = [];
    if (skipped.length) details.push(`Faltan credenciales/endpoints para: ${skipped.map((x) => x.provider).join(", ")}.`);
    if (failed.length) details.push(`Hubo errores de conexion con: ${failed.map((x) => x.provider).join(", ")}.`);
    const extra = details.length ? `\n\n${details.join(" ")}` : "";
    return `${localAnswer}${extra}`;
  }

  const best = ok
    .slice()
    .sort((a, b) => (cleanText(b.text).length - cleanText(a.text).length) || ((b.sources || []).length - ((a.sources || []).length)))[0];
  const baseText = truncateText(best?.text || localAnswer, 5200);
  const sources = uniqueList(
    ok.flatMap((r) => r.sources || [])
      .map((s) => cleanText(s))
      .filter(Boolean)
  );
  if (!sources.length) return baseText;
  return `${baseText}\n\nFuentes:\n${sources.slice(0, 8).map((s, i) => `${i + 1}) ${s}`).join("\n")}`;
}

function extractOpenAiText(json) {
  const direct = cleanText(json?.output_text || "");
  if (direct) return direct;
  if (!Array.isArray(json?.output)) return extractGenericResponseText(json);

  const parts = [];
  json.output.forEach((o) => {
    if (!Array.isArray(o?.content)) return;
    o.content.forEach((c) => {
      if (typeof c?.text === "string") parts.push(c.text);
      if (typeof c?.output_text === "string") parts.push(c.output_text);
    });
  });
  const text = cleanText(parts.join("\n"));
  return text || extractGenericResponseText(json);
}

function extractGenericResponseText(json) {
  if (!json) return "";
  if (typeof json === "string") return cleanText(json);

  const directKeys = ["answer", "response", "text", "message", "result", "content", "output"];
  for (const key of directKeys) {
    const val = json[key];
    if (typeof val === "string" && cleanText(val)) return cleanText(val);
  }

  if (Array.isArray(json?.choices) && json.choices.length) {
    const choice = json.choices[0];
    const message = choice?.message?.content ?? choice?.text ?? "";
    if (typeof message === "string" && cleanText(message)) return cleanText(message);
    if (Array.isArray(message)) {
      const merged = message.map((part) => cleanText(part?.text || part?.content || "")).filter(Boolean).join("\n");
      if (merged) return merged;
    }
  }

  if (Array.isArray(json?.messages) && json.messages.length) {
    const merged = json.messages.map((m) => cleanText(m?.content || m?.text || "")).filter(Boolean).join("\n");
    if (merged) return merged;
  }

  return "";
}

function extractGenericSources(json) {
  const raw = [];
  if (!json) return raw;
  if (Array.isArray(json?.citations)) raw.push(...json.citations);
  if (Array.isArray(json?.sources)) raw.push(...json.sources);
  if (Array.isArray(json?.references)) raw.push(...json.references);

  const out = raw.map((x) => {
    if (typeof x === "string") return x;
    if (typeof x?.url === "string" && x.url) {
      const title = cleanText(x?.title || x?.name || "");
      return title ? `${title} - ${x.url}` : x.url;
    }
    if (typeof x?.link === "string") return x.link;
    return "";
  }).filter(Boolean);
  return uniqueList(out);
}

function uniqueList(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function truncateText(text, maxLen) {
  const raw = String(text || "");
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 3)}...`;
}

function toBearer(token) {
  const t = cleanText(token || "");
  if (!t) return "";
  return /^bearer /i.test(t) ? t : `Bearer ${t}`;
}

function readApiError(status, json) {
  const msg =
    cleanText(json?.error?.message || "") ||
    cleanText(json?.message || "") ||
    cleanText(json?.detail || "") ||
    `Error HTTP ${status}`;
  return msg;
}

function externalErrorMessage(error) {
  const text = cleanText(error?.message || String(error || ""));
  if (!text) return "Error externo no identificado.";
  if (text.toLowerCase().includes("failed to fetch")) return "No se pudo conectar (CORS/red/API).";
  return text;
}

function generateBotAnswer(questionRaw) {
  const chunks = splitCompoundQuestion(questionRaw);
  if (!chunks.length) return "Escribe una pregunta y te respondo.";
  if (chunks.length === 1) return generateSingleBotAnswer(chunks[0]);

  const sections = chunks.map((chunk, idx) => {
    const ans = generateSingleBotAnswer(chunk);
    return `Parte ${idx + 1}: ${chunk}\n${ans}`;
  });
  return `Te respondo punto por punto:\n\n${sections.join("\n\n")}`;
}

function splitCompoundQuestion(questionRaw) {
  const raw = String(questionRaw || "").replace(/\n+/g, " ").trim();
  if (!raw) return [];

  const firstPass = raw
    .split(/[?;]+/)
    .map((x) => cleanText(x))
    .filter((x) => x.length >= 4);

  const source = firstPass.length > 1 ? firstPass : [raw];
  const expanded = source.flatMap((part) => part
    .split(/\s+(?:ademas|además|tambien|también)\s+/i)
    .map((x) => cleanText(x))
    .filter((x) => x.length >= 4));

  return [...new Set(expanded)].slice(0, 3);
}

function generateSingleBotAnswer(questionRaw) {
  const q = normalizeText(questionRaw);
  if (!q) return "Escribe una pregunta y te respondo.";

  if (q.includes("hola") || q.includes("buenas")) {
    return "Hola. Preguntame lo que quieras sobre lectura financiera, valoracion o indicadores de la empresa.";
  }

  if (q.includes("ayuda") || q.includes("que puedo preguntar") || q.includes("como te pregunto")) {
    rememberBotContext({ lastIntent: "help" });
    return botHelpText();
  }

  const asksTraining = (
    q.includes("entren") ||
    q.includes("que aprendiste") ||
    q.includes("que sabes") ||
    q.includes("en que estas entrenado")
  );
  const asksAfa = (
    q.includes("a/f/a") ||
    q.includes("afa") ||
    (q.includes("accion") && q.includes("formato")) ||
    (q.includes("formato") && q.includes("antecedente"))
  );
  const asksCollection = (
    q.includes("recopil") ||
    q.includes("recopilacion") ||
    q.includes("recoleccion") ||
    q.includes("como recopilas") ||
    q.includes("como obtienes") ||
    q.includes("de donde salen los datos")
  );
  const asksPrompt = q.includes("prompt") && (q.includes("bot") || q.includes("entren"));
  const asksMissing = (
    (q.includes("falta") || q.includes("faltan") || q.includes("necesitas") || q.includes("requiere")) &&
    (
      q.includes("document") ||
      q.includes("dato") ||
      q.includes("informacion") ||
      q.includes("insumo") ||
      q.includes("valorar") ||
      q.includes("precision")
    )
  );
  const asksSources = q.includes("fuente") || q.includes("cita") || q.includes("referencia");

  const directTerm = detectBotTerm(q);
  const contextTerm = inferTermFromRecentContext(q);
  const term = directTerm || contextTerm;
  const wantsExplain = q.includes("para que sirve") || q.startsWith("que es") || q.includes("explica") || q.includes("que significa");
  const wantsSummary = q.includes("resumen") || q.includes("diagnostico") || q.includes("como va la empresa") || q.includes("salud") || q.includes("lectura");
  const wantsImprove = (
    q.includes("mejorar") ||
    q.includes("mejora") ||
    q.includes("ventana de mejora") ||
    q.includes("ventanas de mejora") ||
    q.includes("recomend") ||
    q.includes("fortaleza") ||
    q.includes("debilidad") ||
    q.includes("que hacer")
  );
  const wantsStepByStep = q.includes("paso a paso") || q.includes("plan de accion") || q.includes("plan");
  const lineByLine = botLineByLineAnswer(q);
  const metricByYear = term ? botMetricAnswerForRequestedYears(term, q) : "";

  if (asksAfa) {
    rememberBotContext({ lastIntent: "afa" });
    return botAfaFrameworkAnswer();
  }
  if (asksCollection) {
    rememberBotContext({ lastIntent: "collection" });
    return botDataCollectionProcessAnswer();
  }
  if (asksPrompt) {
    rememberBotContext({ lastIntent: "prompt" });
    return botMasterPromptAnswer();
  }
  if (asksMissing) {
    rememberBotContext({ lastIntent: "missing_inputs" });
    return botMissingInputsAnswer();
  }
  if (asksSources) {
    rememberBotContext({ lastIntent: "sources" });
    return botDocSourcesAnswer();
  }
  if (asksTraining) {
    rememberBotContext({ lastIntent: "training" });
    return botTrainingStatusAnswer();
  }
  if (wantsSummary) {
    rememberBotContext({ lastIntent: "summary" });
    return botCompanySummary();
  }
  if (wantsImprove && wantsStepByStep) {
    rememberBotContext({ lastIntent: "improvement_plan" });
    return botCompanyImprovementPlan();
  }
  if (wantsImprove) {
    rememberBotContext({ lastIntent: "improvements" });
    return botCompanyImprovements();
  }
  if (lineByLine) {
    rememberBotContext({ lastIntent: "line_by_line" });
    return lineByLine;
  }
  if (metricByYear && term) {
    rememberBotContext({ lastTermId: term.id, lastIntent: "term_year" });
    return metricByYear;
  }
  if (wantsExplain && term) {
    rememberBotContext({ lastTermId: term.id, lastIntent: "term_explain" });
    if (BOT_CONCEPT_TERM_IDS.has(term.id)) return botKnowledgeAnswer(q, true) || botExplainTerm(term);
    return botExplainTerm(term);
  }
  if (term) {
    rememberBotContext({ lastTermId: term.id, lastIntent: "term_read" });
    return botTermRead(term);
  }

  if (q.includes("balance")) {
    rememberBotContext({ lastIntent: "balance" });
    return botBalanceChatSummary();
  }
  if (q.includes("flujo")) {
    rememberBotContext({ lastIntent: "cashflow" });
    return botCashflowChatSummary();
  }

  const knowledge = botKnowledgeAnswer(q, wantsExplain);
  if (knowledge) {
    rememberBotContext({ lastIntent: "knowledge" });
    return knowledge;
  }

  return botSmartFallback(questionRaw);
}

function rememberBotContext(partial) {
  state.botContext = {
    ...(state.botContext || {}),
    ...(partial || {})
  };
  saveBotMemoryToStorage();
}

function inferTermFromRecentContext(qNorm) {
  if (!isFollowUpQuestion(qNorm)) return null;
  const id = cleanText(state.botContext?.lastTermId || "");
  if (!id) return null;
  return BOT_TERMS.find((t) => t.id === id) || null;
}

function isFollowUpQuestion(qNorm) {
  if (!qNorm) return false;
  return (
    qNorm.includes("eso") ||
    qNorm.includes("esa") ||
    qNorm.includes("ese") ||
    qNorm.includes("anterior") ||
    qNorm.includes("lo mismo") ||
    qNorm.includes("profundiza") ||
    qNorm.includes("detalla") ||
    qNorm.includes("amplia")
  );
}

function botSmartFallback(questionRaw) {
  const q = cleanText(questionRaw || "");
  if (!state.selectedCompany || !state.years.length) {
    return (
      "Puedo responderte sobre finanzas corporativas, KPIs, valoracion y lectura de estados.\n" +
      "Si quieres analisis de una empresa puntual, primero cargala por NIT o nombre y te doy lectura con datos reales.\n" +
      `Tu pregunta: "${truncateText(q, 180)}"`
    );
  }

  const company = cleanText(state.selectedCompany?.razon_social || "");
  const latest = Math.max(...state.years);
  const s = state.snapshots[latest] || {};
  const pulse = buildBotExecutivePulse(latest, s);
  return (
    `Tengo contexto de ${company} (corte ${latest}) y te puedo responder en este mismo chat.\n` +
    `No detecte el indicador exacto en: "${truncateText(q, 180)}".\n` +
    `${pulse}\n` +
    "Si quieres precision, preguntame asi: \"deuda 2024\", \"EBITDA 2024 vs 2023\", \"detalle 2024\" o \"resumen rapido\"."
  );
}

function buildBotExecutivePulse(year, snap) {
  const s = snap || {};
  const income = s.income || {};
  const ratios = s.ratios || {};
  const cash = s.cash || {};
  const money = (v) => Number.isFinite(v) ? fmtMoney(v) : "N/D";
  const lines = [];
  lines.push(`Lectura automatica ${year}:`);
  lines.push(`Ingresos ${money(income.ingresos)}, EBITDA ${money(income.ebitda)} y utilidad neta ${money(income.utilidad_neta)}.`);
  if (Number.isFinite(ratios.margen_ebitda)) {
    lines.push(`Margen EBITDA: ${fmtNum(ratios.margen_ebitda, 2)}%.`);
  }
  if (Number.isFinite(ratios.deuda_ebitda)) {
    const zone = ratios.deuda_ebitda < 3 ? "manejable" : (ratios.deuda_ebitda <= 5 ? "exigente" : "alta");
    lines.push(`Deuda/EBITDA: ${fmtNum(ratios.deuda_ebitda, 2)}x (${zone}).`);
  }
  if (Number.isFinite(cash.flujo_caja)) {
    lines.push(`Flujo de caja del periodo: ${fmtMoney(cash.flujo_caja)} (${cash.flujo_caja >= 0 ? "positivo" : "negativo"}).`);
  }
  return lines.join("\n");
}

function botHelpText() {
  return (
    "Puedes preguntarme cosas como:\n" +
    "1) Para que sirve el EBITDA\n" +
    "2) Como va la utilidad neta\n" +
    "3) Que es WACC y para que sirve\n" +
    "4) Explicame FCFF facil\n" +
    "5) Explicame la deuda EBITDA\n" +
    "6) Dame un resumen rapido\n" +
    "7) Que puede mejorar esta empresa\n" +
    "8) Que datos te faltan para valorar con precision\n" +
    "9) Explicame tu metodo A/F/A\n" +
    "10) Como haces la recopilación de datos\n" +
    "11) Genera prompt externo para esta pregunta\n" +
    "12) Deuda 2024 o EBITDA 2024 vs 2023"
  );
}

function botTrainingStatusAnswer() {
  return (
    "Estado de entrenamiento actual:\n" +
    `- Fuente cargada: ${BOT_TRAINING_SOURCE}\n` +
    "- Cobertura activa: arquitectura, estados financieros, KPIs, DCF/FCFF/WACC, QoE, multi-industria, checklist de produccion.\n" +
    "- Metodo de trabajo activo: A/F/A (Accion, Formato, Antecedentes).\n" +
    "- Modo de respuesta: explicacion facil + controles para no inventar datos.\n" +
    "Si quieres, te resumo cualquier modulo del curso en lenguaje simple."
  );
}

function botMissingInputsAnswer() {
  const inputs = [
    "Dataset de entrenamiento en JSONL (train + eval) con preguntas de tu estilo.",
    "Base documental para RAG (PDF/HTML) descargada y versionada con fecha y URL.",
    "Parametros de valoracion por fecha: Rf COP, CRP, TRM, inflacion y tasa efectiva de impuestos.",
    "Reglas por industria de las empresas que mas vas a consultar (por ejemplo: cemento, energia, banca)."
  ];
  const dynamic = [];
  if (!state.selectedCompany) dynamic.push("Empresa objetivo cargada para aterrizar respuestas con datos reales.");
  if (state.selectedCompany && !state.years.length) dynamic.push("Años seleccionados para calcular tendencias.");
  return (
    "Para entrenarlo mejor y valorar con precision, me faltaria:\n" +
    inputs.map((x, i) => `${i + 1}) ${x}`).join("\n") +
    (dynamic.length ? `\nDato puntual ahora mismo:\n- ${dynamic.join("\n- ")}` : "")
  );
}

function botDocSourcesAnswer() {
  return (
    `Fuentes base sugeridas por ${BOT_TRAINING_SOURCE}:\n` +
    BOT_DOC_SOURCES.map((u, i) => `${i + 1}) ${u}`).join("\n") +
    "\n\nHerramientas externas de contraste (configuradas para el entrenamiento del bot):\n" +
    BOT_AI_ASSIST_LINKS.map((u, i) => `${i + 1}) ${u}`).join("\n")
  );
}

function botAfaFrameworkAnswer() {
  return (
    "Metodo A/F/A del bot final:\n" +
    "A - Accion:\n" +
    "1) Entender objetivo de la pregunta.\n" +
    "2) Validar datos disponibles (empresa, años, estados, KPIs).\n" +
    "3) Si falta data minima, pedirla antes de concluir.\n" +
    "4) Analizar sin inventar cifras y marcando supuestos.\n" +
    "5) Aterrizar el analisis a la empresa consultada.\n" +
    "F - Formato:\n" +
    "Preguntas clave -> Lectura ejecutiva -> Analisis tecnico -> KPIs -> Riesgos -> Recomendaciones -> Fuentes.\n" +
    "A - Antecedentes:\n" +
    "Primero uso datos oficiales de la app (Supersociedades + datos abiertos). Fuentes externas solo como contraste, siempre con trazabilidad."
  );
}

function botDataCollectionProcessAnswer() {
  return (
    "Asi hago la recopilación de datos en este bot:\n" +
    "1) Busco la empresa en Supersociedades por NIT o nombre.\n" +
    "2) Descargo estados financieros oficiales desde datos abiertos (resultado, balance, flujo).\n" +
    "3) Normalizo conceptos contables para compararlos por año.\n" +
    "4) Calculo KPIs y reviso consistencias (caja, deuda, margenes, coberturas).\n" +
    "5) Si hay faltantes, los marco como estimacion y te digo el riesgo.\n" +
    "6) Entrego lectura final con recomendaciones accionables."
  );
}

function botMasterPromptAnswer() {
  return (
    "Prompt maestro de entrenamiento (resumen):\n" +
    "- Rol: CFO virtual con rigor tecnico y explicacion clara.\n" +
    "- Accion: no inventar datos, pedir minimos, separar dato vs supuesto.\n" +
    "- Formato: Preguntas clave -> Analisis -> KPIs -> Recomendaciones -> Fuentes.\n" +
    "- Antecedentes: priorizar datos oficiales de la app y usar fuentes externas solo como contraste con trazabilidad."
  );
}

function botKnowledgeAnswer(qNorm, wantsExplain) {
  const best = botRetrieveDocChunk(qNorm);
  if (!best) return null;

  const lines = [];
  lines.push(`${best.title} (fuente entrenamiento, pag ${best.page}).`);
  lines.push(best.explain);
  lines.push(`Para que sirve: ${best.useful}`);
  if (best.ask?.length && (wantsExplain || qNorm.includes("dato") || qNorm.includes("supuesto"))) {
    lines.push(`Para hacerlo bien necesito: ${best.ask.join("; ")}.`);
  }
  lines.push("Si quieres, te lo aterrizo con ejemplo sobre la empresa que cargaste.");
  return lines.join("\n");
}

function botRetrieveDocChunk(qNorm) {
  const tokens = botTokenize(qNorm);
  let best = null;
  let bestScore = 0;

  BOT_DOC_KNOWLEDGE.forEach((chunk) => {
    const score = botScoreChunk(qNorm, tokens, chunk);
    if (score > bestScore) {
      bestScore = score;
      best = chunk;
    }
  });

  return bestScore >= 3 ? best : null;
}

function botScoreChunk(qNorm, tokens, chunk) {
  let score = 0;
  const keywordTokens = new Set();
  chunk.keywords.forEach((kw) => {
    const n = normalizeText(kw);
    if (!n) return;
    if (qNorm.includes(n)) score += n.includes(" ") ? 3 : 2;
    botTokenize(n).forEach((t) => keywordTokens.add(t));
  });

  tokens.forEach((t) => {
    if (keywordTokens.has(t)) score += 1;
  });

  if (qNorm.includes("para que sirve") && chunk.useful) score += 1;
  if (qNorm.includes("modulo") && chunk.id.startsWith("modulo")) score += 1;
  if (qNorm.includes("checklist") && chunk.id.includes("checklist")) score += 2;
  if (qNorm.includes("wacc") && chunk.id === "capm_wacc") score += 4;
  if (qNorm.includes("capm") && chunk.id === "capm_wacc") score += 4;
  if (qNorm.includes("fcff") && chunk.id === "modulo_dcf") score += 3;
  if (qNorm.includes("jsonl") && chunk.id === "dataset_jsonl") score += 4;
  if (qNorm.includes("qoe") && chunk.id === "qoe") score += 4;
  return score;
}

function botTokenize(text) {
  return normalizeText(text)
    .split(" ")
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 3 && !BOT_STOPWORDS.has(t));
}

function detectBotTerm(qNorm) {
  const q = normalizeText(qNorm);
  if (!q) return null;
  const qTokens = new Set(botTokenize(q));
  const candidates = [];
  BOT_TERMS.forEach((term) => {
    term.aliases.forEach((alias) => {
      const a = normalizeText(alias);
      if (!a) return;

      let score = 0;
      if (fuzzyIncludes(q, a)) {
        score = 100 + a.length;
      } else {
        const aliasTokens = botTokenize(a);
        if (!aliasTokens.length) return;
        const overlap = aliasTokens.filter((t) => qTokens.has(t)).length;
        if (overlap === aliasTokens.length) {
          score = 70 + overlap * 8 + (a.length / 100);
        } else if (overlap >= Math.ceil(aliasTokens.length * 0.7)) {
          score = 45 + overlap * 6;
        }
      }

      if (score > 0) candidates.push({ term, score, aliasLen: a.length });
    });
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.score - a.score) || (b.aliasLen - a.aliasLen));
  return candidates[0].term;
}

function parseYearsFromQuestion(qNorm) {
  const out = [];
  const text = String(qNorm || "");
  const regex = /\b(19\d{2}|20\d{2})\b/g;
  let match = null;
  while ((match = regex.exec(text)) !== null) {
    const y = Number(match[1]);
    if (Number.isFinite(y)) out.push(y);
  }
  return [...new Set(out)];
}

function pickClosestPreviousYear(year) {
  const years = [...(state.years || [])]
    .filter((y) => Number.isFinite(y) && y < year)
    .sort((a, b) => a - b);
  return years.length ? years[years.length - 1] : null;
}

function formatMetricDelta(delta, kind) {
  if (!Number.isFinite(delta)) return "N/D";
  if (kind === "money") return fmtMoney(delta);
  if (kind === "pct") return `${fmtNum(delta, 2)} pp`;
  if (kind === "ratio") return `${fmtNum(delta, 2)}x`;
  return fmtNum(delta, 2);
}

function botMetricAnswerForRequestedYears(term, qNorm) {
  if (!term || !state.selectedCompany || !state.years.length) return "";

  const availableYears = [...state.years].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  if (!availableYears.length) return "";

  const requestedYears = parseYearsFromQuestion(qNorm).filter((y) => availableYears.includes(y));
  const wantsCompare = (
    qNorm.includes("vs") ||
    qNorm.includes("contra") ||
    qNorm.includes("frente") ||
    qNorm.includes("compar") ||
    qNorm.includes("variacion") ||
    qNorm.includes("cambio")
  );
  if (!requestedYears.length && !wantsCompare) return "";

  const years = requestedYears.slice();
  if (years.length < 2 && wantsCompare && availableYears.length >= 2) {
    years.push(availableYears[availableYears.length - 2], availableYears[availableYears.length - 1]);
  }

  if (years.length >= 2) {
    const y1 = years[0];
    const y2 = years[1];
    const v1 = term.getter(state.snapshots[y1]);
    const v2 = term.getter(state.snapshots[y2]);
    if (!Number.isFinite(v1) || !Number.isFinite(v2)) {
      return `No encuentro ${term.label.toLowerCase()} completo para comparar ${y1} vs ${y2}.`;
    }

    const delta = v2 - v1;
    const varPct = pct(v2, v1);
    const direction = delta >= 0 ? "subio" : "bajo";
    const varText = varPct === null ? "N/D" : `${fmtNum(Math.abs(varPct), 1)}%`;
    return (
      `${term.label} comparativo:\n` +
      `${y1}: ${formatBotValue(v1, term.kind)}\n` +
      `${y2}: ${formatBotValue(v2, term.kind)}\n` +
      `Cambio absoluto: ${formatMetricDelta(delta, term.kind)} (${direction}).\n` +
      `Cambio relativo: ${varText}.`
    );
  }

  const year = years[0];
  const value = term.getter(state.snapshots[year]);
  if (!Number.isFinite(value)) {
    if (BOT_CONCEPT_TERM_IDS.has(term.id)) return `${term.label}: ${term.explain}`;
    return `No encuentro ${term.label.toLowerCase()} en ${year} para esta empresa.`;
  }

  const prevYear = pickClosestPreviousYear(year);
  let trendLine = "No hay año previo para comparar en la seleccion actual.";
  if (prevYear !== null) {
    const prev = term.getter(state.snapshots[prevYear]);
    const varPct = pct(value, prev);
    if (Number.isFinite(prev) && varPct !== null) {
      trendLine = `Vs ${prevYear}: ${varPct >= 0 ? "subio" : "bajo"} ${fmtNum(Math.abs(varPct), 1)}%.`;
    }
  }

  return (
    `${term.label} (${year}): ${formatBotValue(value, term.kind)}.\n` +
    `${trendLine}\n` +
    `${botTermHealthHint(term, value)}`
  );
}

function botLineByLineAnswer(qNorm) {
  const asksDetail = (
    qNorm.includes("dato por dato") ||
    qNorm.includes("linea por linea") ||
    qNorm.includes("linea a linea") ||
    qNorm.includes("desglose") ||
    qNorm.includes("detalle")
  );
  if (!asksDetail) return "";

  if (!state.selectedCompany || !state.years.length) {
    return "Para darte el detalle linea por linea primero debo cargar la empresa y los años.";
  }

  const yearsAsked = parseYearsFromQuestion(qNorm);
  const latest = Math.max(...state.years);
  const year = yearsAsked.find((y) => state.snapshots[y]) || latest;
  const snap = state.snapshots[year];
  if (!snap) return `No encuentro informacion para ${year}.`;

  const income = snap.income || {};
  const ratios = snap.ratios || {};
  const cash = snap.cash || {};
  const metrics = snap.metrics || {};
  const money = (v) => Number.isFinite(v) ? fmtMoney(v) : "N/D";
  const ratio = (v) => Number.isFinite(v) ? `${fmtNum(v, 2)}x` : "N/D";

  return (
    `Detalle financiero ${year} (${state.selectedCompany.razon_social}):\n` +
    `Ingresos: ${money(income.ingresos)}\n` +
    `Costos: ${money(income.costos)}\n` +
    `Utilidad bruta: ${money(income.utilidad_bruta)}\n` +
    `Gastos operacionales: ${money(income.gastos_operacionales)}\n` +
    `EBITDA: ${money(income.ebitda)}\n` +
    `Utilidad neta: ${money(income.utilidad_neta)}\n` +
    `Deuda (solo ${year}): ${money(metrics.deuda)}\n` +
    `Deuda/EBITDA: ${ratio(ratios.deuda_ebitda)}\n` +
    `Flujo de caja del periodo: ${money(cash.flujo_caja)}\n` +
    "Si quieres, te lo comparo contra otro año exacto."
  );
}

function botExplainTerm(term) {
  const context = DEEP_LINE_CONTEXT[term.id] || DEEP_RATIO_CONTEXT[term.id];
  const extra = context?.improve ? `\nTip practico: ${context.improve}` : "";
  return `${term.label}: ${term.explain}${extra}`;
}

function botTermRead(term) {
  if (!state.selectedCompany || !state.years.length) {
    if (BOT_CONCEPT_TERM_IDS.has(term.id)) {
      const extended = botKnowledgeAnswer(`para que sirve ${term.label}`, true);
      return extended || `${term.label}: ${term.explain}`;
    }
    return `${term.label}: ${term.explain}\nCuando cargues una empresa te digo su valor y tendencia.`;
  }

  const series = buildBotSeries(term);
  if (!series.length) {
    if (BOT_CONCEPT_TERM_IDS.has(term.id)) {
      const extended = botKnowledgeAnswer(`para que sirve ${term.label}`, true);
      return extended || `${term.label}: ${term.explain}\nSi quieres, te explico formula, pasos y datos que necesito para aplicarlo.`;
    }
    return `${term.label}: ${term.explain}\nNo hay dato disponible en los años seleccionados para esta empresa.`;
  }

  const latest = series[series.length - 1];
  const trend = botSeriesTrend(series, term);
  return (
    `${term.label} en ${latest.year}: ${formatBotValue(latest.value, term.kind)}.\n` +
    `${trend}\n` +
    `${botTermHealthHint(term, latest.value)}`
  );
}

function buildBotSeries(term) {
  const years = [...state.years].sort((a, b) => a - b);
  return years
    .map((year) => ({ year, value: term.getter(state.snapshots[year]) }))
    .filter((p) => Number.isFinite(p.value));
}

function botSeriesTrend(series, term) {
  if (series.length < 2) return "No hay suficientes años para medir tendencia.";
  const first = series[0];
  const last = series[series.length - 1];
  const varPct = pct(last.value, first.value);
  if (varPct === null) return "No se pudo calcular variacion porcentual.";

  const context = DEEP_LINE_CONTEXT[term.id] || DEEP_RATIO_CONTEXT[term.id] || {};
  const betterHigh = context.betterHigh !== false;
  const favorable = betterHigh ? varPct >= 0 : varPct <= 0;
  const direction = varPct >= 0 ? "subio" : "bajo";
  return `Entre ${first.year} y ${last.year} ${direction} ${fmtNum(Math.abs(varPct), 1)}%. La lectura es ${favorable ? "favorable" : "de cuidado"}.`;
}

function botTermHealthHint(term, value) {
  if (term.id === "deuda_ebitda") {
    if (value < 3) return "Lectura facil: la deuda esta en zona manejable frente al EBITDA.";
    if (value <= 5) return "Lectura facil: la deuda esta algo exigente, requiere control.";
    return "Lectura facil: la deuda esta alta frente al EBITDA.";
  }
  if (term.id === "ebitda_costos_financieros") {
    if (value > 3) return "Lectura facil: la empresa cubre bien sus costos financieros.";
    if (value >= 1.5) return "Lectura facil: la cobertura existe, pero esta ajustada.";
    return "Lectura facil: la cobertura financiera es debil.";
  }
  if (term.id === "margen_neto") {
    return value > 0 ? "Lectura facil: hay ganancia final." : "Lectura facil: hay perdida neta.";
  }
  return "Si quieres, te explico este mismo indicador con mas detalle paso a paso.";
}

function formatBotValue(value, kind) {
  if (!Number.isFinite(value)) return "0";
  if (kind === "money") return fmtMoney(value);
  if (kind === "pct") return `${fmtNum(value, 2)}%`;
  if (kind === "ratio") return `${fmtNum(value, 2)}x`;
  return fmtNum(value, 2);
}

function botCompanySummary() {
  if (!state.selectedCompany || !state.years.length) {
    return "Primero carga una empresa para poder darte un resumen con datos reales.";
  }
  const latest = Math.max(...state.years);
  const s = state.snapshots[latest];
  const r = s?.ratios || {};
  return (
    `Resumen rapido de ${state.selectedCompany.razon_social} (${latest}):\n` +
    `Ingresos: ${fmtMoney(s?.income?.ingresos)}\n` +
    `Utilidad neta: ${fmtMoney(s?.income?.utilidad_neta)}\n` +
    `EBITDA: ${fmtMoney(s?.income?.ebitda)}\n` +
    `Margen neto: ${fmtNum(r.margen_neto, 2)}%\n` +
    `Deuda/EBITDA: ${fmtNum(r.deuda_ebitda, 2)}x\n` +
    `Si quieres, te explico cada linea una por una.`
  );
}

function botCompanyImprovements() {
  if (!state.selectedCompany || !state.years.length) {
    return "Puedo darte recomendaciones precisas cuando cargues una empresa.";
  }
  const latest = Math.max(...state.years);
  const s = state.snapshots[latest];
  const r = s?.ratios || {};
  const recs = [];
  if (Number.isFinite(r.margen_bruto) && r.margen_bruto < 20) recs.push("Mejorar margen bruto: revisar costos directos, mezcla y precios.");
  if (Number.isFinite(r.gastos_operacionales_sobre_ingresos) && r.gastos_operacionales_sobre_ingresos > 35) recs.push("Bajar gastos operacionales sobre ventas: eficiencia administrativa y comercial.");
  if (Number.isFinite(r.deuda_ebitda) && r.deuda_ebitda > 4) recs.push("Reducir presion de deuda: refinanciar y fortalecer generacion de EBITDA.");
  if (Number.isFinite(r.ebitda_costos_financieros) && r.ebitda_costos_financieros < 2) recs.push("Subir cobertura financiera: menos costo de deuda o mas EBITDA operativo.");
  if (Number.isFinite(r.margen_neto) && r.margen_neto <= 0) recs.push("Recuperar utilidad neta: controlar costos, gastos e impacto financiero.");
  if (!recs.length) recs.push("Mantener disciplina: costos controlados, deuda sana y foco en rentabilidad.");

  return `Mejoras sugeridas para ${state.selectedCompany.razon_social}:\n${recs.map((r, i) => `${i + 1}) ${r}`).join("\n")}`;
}

function botCompanyImprovementPlan() {
  if (!state.selectedCompany || !state.years.length) {
    return "Para darte un plan paso a paso necesito que primero cargues una empresa y años.";
  }
  const latest = Math.max(...state.years);
  const s = state.snapshots[latest];
  const r = s?.ratios || {};
  const issues = [];

  if (Number.isFinite(r.margen_bruto) && r.margen_bruto < 20) issues.push("margen bruto bajo");
  if (Number.isFinite(r.gastos_operacionales_sobre_ingresos) && r.gastos_operacionales_sobre_ingresos > 35) issues.push("gastos operacionales altos");
  if (Number.isFinite(r.deuda_ebitda) && r.deuda_ebitda > 4) issues.push("apalancamiento exigente");
  if (Number.isFinite(r.ebitda_costos_financieros) && r.ebitda_costos_financieros < 2) issues.push("cobertura financiera debil");
  if (Number.isFinite(r.margen_neto) && r.margen_neto <= 0) issues.push("rentabilidad neta negativa");

  const focus = issues.length ? issues.join(", ") : "eficiencia y crecimiento rentable";
  return (
    `Plan paso a paso para ${state.selectedCompany.razon_social} (base ${latest}):\n` +
    `Foco inicial: ${focus}.\n` +
    "1) Diagnostico rapido: separar que rubros explican la mayor caida de margen (costos, gastos o financieros).\n" +
    "2) Meta 90 dias: definir 3 KPIs objetivo (margen EBITDA, gasto operacional/ingresos, deuda/EBITDA).\n" +
    "3) Acciones comerciales: proteger precio y mezcla para subir utilidad bruta sin perder volumen sano.\n" +
    "4) Acciones operativas: recortar gastos de bajo retorno y automatizar procesos repetitivos.\n" +
    "5) Acciones financieras: refinanciar deuda cara, mejorar plazos y bajar costo financiero.\n" +
    "6) Gobierno de caja: seguimiento semanal de capital de trabajo (cartera, inventarios, proveedores).\n" +
    "7) Control: tablero mensual con semaforos y responsable por cada KPI.\n" +
    "Si quieres, te lo convierto en cronograma mensual con responsables y metas numericas."
  );
}

function botBalanceChatSummary() {
  if (!state.selectedCompany || !state.years.length) {
    return "El balance general sirve para ver si la empresa esta fuerte o muy endeudada. Carga una empresa y te doy lectura exacta.";
  }
  const latest = Math.max(...state.years);
  const b = state.snapshots[latest]?.balance || {};
  const liquidez = divSafe(b.activos_corrientes, b.pasivos_corrientes);
  const apal = divSafe(b.pasivos_totales, b.patrimonio_total);
  return (
    `Balance general (${latest}):\n` +
    `Activos: ${fmtMoney(b.activos_totales)}\n` +
    `Pasivos: ${fmtMoney(b.pasivos_totales)}\n` +
    `Patrimonio: ${fmtMoney(b.patrimonio_total)}\n` +
    `Liquidez: ${fmtNum(liquidez, 2)}x | Deuda/P patrimonio: ${fmtNum(apal, 2)}x`
  );
}

function botCashflowChatSummary() {
  if (!state.selectedCompany || !state.years.length) {
    return "El flujo de caja sirve para saber si entra dinero real. Carga una empresa y te doy la lectura puntual.";
  }
  const latest = Math.max(...state.years);
  const value = state.snapshots[latest]?.cash?.flujo_caja;
  return (
    `Flujo de efectivo (${latest}): ${fmtMoney(value)}.\n` +
    `${Number.isFinite(value) && value >= 0 ? "Lectura facil: la caja subio en ese año." : "Lectura facil: la caja bajo en ese año."}`
  );
}

function renderCharts() {
  destroyCharts();
  dom.chartsContainer.innerHTML = "";
  const years = [...state.years].sort((a, b) => a - b);

  CHART_ORDER.forEach((key, i) => {
    const exp = explainMetric(key, years);
    const block = document.createElement("article");
    block.className = "metric-block";
    block.innerHTML = `
      <div class="chart-box"><canvas id="chart-${i}"></canvas></div>
      <div class="interpretation-box">
        <h4>${METRIC_LABELS[key]}</h4>
        <p><strong>Que significa:</strong> ${exp.what}</p>
        <p><strong>Como leerlo:</strong> ${exp.interpretation}</p>
        <p><strong>Señales:</strong> ${exp.signals}</p>
      </div>
    `;
    dom.chartsContainer.appendChild(block);
    const chart = new Chart(block.querySelector("canvas").getContext("2d"), chartConfig(key, years));
    state.charts.push(chart);
  });
}

function chartConfig(key, years) {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      y: { ticks: { callback: (v) => (["dias_capital_trabajo", "z_altman"].includes(key) ? fmtCompact(v, false) : fmtCompact(v, true)) } },
      x: { grid: { color: "rgba(11, 73, 122, 0.08)" } }
    },
    plugins: {
      legend: { display: true },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${["dias_capital_trabajo", "z_altman"].includes(key) ? fmtNum(ctx.parsed.y, 2) : fmtMoney(ctx.parsed.y)}` } }
    }
  };

  if (key === "estado_resultados") {
    return {
      type: "line",
      data: {
        labels: years,
        datasets: [
          { label: "Ingresos", data: years.map((y) => safe(state.snapshots[y].income.ingresos)), borderColor: "#0e5f9e", tension: 0.2 },
          { label: "Gastos operacionales", data: years.map((y) => safe(state.snapshots[y].income.gastos_operacionales)), borderColor: "#b7791f", tension: 0.2 },
          { label: "Utilidad neta", data: years.map((y) => safe(state.snapshots[y].income.utilidad_neta)), borderColor: "#2f7a4d", tension: 0.2 }
        ]
      },
      options
    };
  }

  if (key === "ebitda_vs_flujo_operativo") {
    return {
      type: "line",
      data: {
        labels: years,
        datasets: [
          {
            label: "EBITDA",
            data: years.map((y) => safe(state.snapshots[y]?.income?.ebitda)),
            borderColor: "#0e5f9e",
            backgroundColor: "rgba(14,95,158,0.15)",
            tension: 0.2
          },
          {
            label: "Flujo operativo",
            data: years.map((y) => safe(cashBridgeForYear(y)?.flujoOperativo)),
            borderColor: "#2f7a4d",
            backgroundColor: "rgba(47,122,77,0.15)",
            tension: 0.2
          }
        ]
      },
      options
    };
  }

  if (key === "balance_general") {
    return {
      type: "line",
      data: {
        labels: years,
        datasets: [
          { label: "Activos", data: years.map((y) => safe(state.snapshots[y].balance.activos_totales)), borderColor: "#0e5f9e", tension: 0.2 },
          { label: "Pasivos", data: years.map((y) => safe(state.snapshots[y].balance.pasivos_totales)), borderColor: "#b83232", tension: 0.2 },
          { label: "Patrimonio", data: years.map((y) => safe(state.snapshots[y].balance.patrimonio_total)), borderColor: "#2f7a4d", tension: 0.2 }
        ]
      },
      options
    };
  }

  const vals = years.map((y) => safe(state.snapshots[y].metrics[key]));
  return {
    type: "bar",
    data: {
      labels: years,
      datasets: [{ label: METRIC_LABELS[key], data: vals, backgroundColor: vals.map((v) => barColor(key, v)), borderColor: "rgba(8,56,95,1)", borderWidth: 1 }]
    },
    options
  };
}

function barColor(key, value) {
  if (!Number.isFinite(value)) return "rgba(14,95,158,0.35)";
  if (["gastos_operacionales", "deuda", "dias_capital_trabajo"].includes(key)) return "rgba(183,121,31,0.8)";
  if (value < 0) return "rgba(184,50,50,0.8)";
  return "rgba(14,95,158,0.85)";
}

function explainMetric(key, years) {
  const ctx = METRIC_CONTEXT[key] || METRIC_CONTEXT.ingresos;
  const latest = latestYearForMetric(key, years);
  if (latest === null) {
    return {
      what: ctx.what,
      interpretation: "No hay suficientes datos para interpretar esta metrica en los años seleccionados.",
      signals: `Positivo: ${ctx.good}. Negativo: ${ctx.bad}.`
    };
  }

  if (key === "estado_resultados") {
    const s = state.snapshots[latest].income;
    return {
      what: ctx.what,
      interpretation: `Ultimo corte (${latest}): ingresos ${fmtMoney(s.ingresos)}, gastos ${fmtMoney(s.gastos_operacionales)} y utilidad neta ${fmtMoney(s.utilidad_neta)}. ${trend(years, (y) => state.snapshots[y].income.utilidad_neta, key)}`,
      signals: `Positivo: ${ctx.good}. Negativo: ${ctx.bad}.`
    };
  }

  if (key === "balance_general") {
    const b = state.snapshots[latest].balance;
    return {
      what: ctx.what,
      interpretation: `Ultimo corte (${latest}): activos ${fmtMoney(b.activos_totales)}, pasivos ${fmtMoney(b.pasivos_totales)} y patrimonio ${fmtMoney(b.patrimonio_total)}. ${trend(years, (y) => state.snapshots[y].balance.activos_totales, key)}`,
      signals: `Positivo: ${ctx.good}. Negativo: ${ctx.bad}.`
    };
  }

  if (key === "ebitda_vs_flujo_operativo") {
    const bridge = cashBridgeForYear(latest);
    const ebitda = num0(state.snapshots[latest]?.income?.ebitda);
    const flujoOp = num0(bridge?.flujoOperativo);
    const conversion = divSafe(flujoOp, ebitda);
    const brecha = flujoOp - ebitda;
    const convTxt = conversion === null ? "N/D" : `${fmtNum(conversion * 100, 1)}%`;
    const mayorPresion = [
      { label: "capex", value: Math.abs(num0(bridge?.capex)) },
      { label: "impuestos", value: Math.abs(num0(bridge?.impuestos)) },
      { label: "capital de trabajo", value: Math.max(0, num0(bridge?.deltaCapitalTrabajo)) }
    ].sort((a, b) => b.value - a.value)[0]?.label || "rubros operativos";

    const lectura = conversion === null
      ? "No se pudo calcular conversion EBITDA -> flujo operativo."
      : (conversion >= 0.8
        ? "La conversion de EBITDA a caja operativa es fuerte."
        : (conversion >= 0.4 ? "La conversion es intermedia; hay consumo relevante de caja." : "La conversion es debil; el EBITDA no se refleja en caja operativa."));

    return {
      what: ctx.what,
      interpretation:
        `Ultimo corte (${latest}): EBITDA ${fmtMoney(ebitda)} vs flujo operativo ${fmtMoney(flujoOp)}. ` +
        `Conversion EBITDA->caja operativa: ${convTxt}. Brecha: ${fmtMoney(brecha)}. ` +
        `${lectura} La mayor presion viene de ${mayorPresion}.`,
      signals: `Positivo: ${ctx.good}. Negativo: ${ctx.bad}.`
    };
  }

  const latestValue = state.snapshots[latest].metrics[key];
  if (key === "z_altman") {
    return {
      what: ctx.what,
      interpretation: `Ultimo valor (${latest}): ${fmtNum(latestValue, 2)}. Zona estimada: ${zZone(latestValue)}. Valores altos suelen indicar menor tension financiera.`,
      signals: `Positivo: ${ctx.good}. Negativo: ${ctx.bad}.`
    };
  }

  if (key === "dias_capital_trabajo") {
    return {
      what: ctx.what,
      interpretation: `Ultimo valor (${latest}): ${fmtNum(latestValue, 2)} dias. Menos dias suele implicar un ciclo de caja mas eficiente. ${trend(years, (y) => state.snapshots[y].metrics[key], key)}`,
      signals: `Positivo: ${ctx.good}. Negativo: ${ctx.bad}.`
    };
  }

  return {
    what: ctx.what,
    interpretation: `Ultimo valor (${latest}): ${fmtMoney(latestValue)}. ${trend(years, (y) => state.snapshots[y].metrics[key], key)}`,
    signals: `Positivo: ${ctx.good}. Negativo: ${ctx.bad}.`
  };
}

function latestYearForMetric(key, years) {
  const yearsDesc = [...years].sort((a, b) => b - a);
  if (key === "estado_resultados") {
    return latestYearWithValue(yearsDesc, (y) => {
      const income = state.snapshots[y]?.income || {};
      return [income.ingresos, income.gastos_operacionales, income.utilidad_neta].find((v) => Number.isFinite(v)) ?? null;
    });
  }
  if (key === "balance_general") {
    return latestYearWithValue(yearsDesc, (y) => {
      const balance = state.snapshots[y]?.balance || {};
      return [balance.activos_totales, balance.pasivos_totales, balance.patrimonio_total].find((v) => Number.isFinite(v)) ?? null;
    });
  }
  if (key === "ebitda_vs_flujo_operativo") {
    return latestYearWithValue(yearsDesc, (y) => {
      const ebitda = state.snapshots[y]?.income?.ebitda;
      const flujoOp = cashBridgeForYear(y)?.flujoOperativo;
      return [ebitda, flujoOp].find((v) => Number.isFinite(v)) ?? null;
    });
  }
  return latestYearWithValue(yearsDesc, (y) => state.snapshots[y]?.metrics?.[key]);
}

function trend(years, getter, key) {
  const pts = years.map((y) => ({ y, v: getter(y) })).filter((p) => p.v !== null && p.v !== undefined);
  if (pts.length < 2) return "No hay suficientes datos para calcular tendencia.";
  const first = pts[0];
  const last = pts[pts.length - 1];
  const varPct = pct(last.v, first.v);
  if (varPct === null) return "No hay suficientes datos para calcular tendencia.";
  const favorable = (HIGHER_IS_BETTER[key] !== false) === (varPct >= 0);
  return `Tendencia ${favorable ? "favorable" : "de cuidado"}: cambio acumulado de ${fmtNum(varPct, 1)}% entre ${first.y} y ${last.y}.`;
}

async function exportPdf() {
  if (!state.selectedCompany || !state.years.length) {
    showMessage("warning", "No hay datos analizados para exportar.");
    return;
  }

  const btn = dom.exportPdfBtn;
  const originalText = btn?.textContent || "Descargar PDF";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generando PDF...";
  }

  const reportNode = buildPdfReportNode();
  document.body.appendChild(reportNode);
  await sleep(120);

  try {
    const filename = `analisis_${state.selectedCompany.nit}_${stamp()}.pdf`;
    const hasHtml2Pdf = await ensureHtml2PdfLoaded();
    if (hasHtml2Pdf && window?.html2pdf) {
      const options = {
        margin: [6, 6, 6, 6],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          scrollX: 0,
          scrollY: 0,
          windowWidth: 1600
        },
        jsPDF: { unit: "mm", format: "a3", orientation: "landscape" },
        pagebreak: { mode: ["css", "legacy"], before: ".pdf-page-break" }
      };
      const worker = window.html2pdf().set(options).from(reportNode).toPdf();
      const pdf = await worker.get("pdf");
      const pageCount = Number(pdf?.internal?.getNumberOfPages?.() || 0);
      await worker.save();
      showMessage(
        "success",
        pageCount > 0
          ? `PDF generado y descargado correctamente (${pageCount} paginas).`
          : "PDF generado y descargado correctamente."
      );
    } else {
      openPrintWindow(reportNode.outerHTML);
      showMessage("warning", "No se pudo usar html2pdf. Se abrio vista de impresion para guardar en PDF.");
    }
  } catch (error) {
    console.error("[PDF] Error exportando reporte", error);
    showMessage("error", "No fue posible generar el PDF. Intenta nuevamente.");
  } finally {
    reportNode.remove();
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

async function ensureHtml2PdfLoaded(timeoutMs = 7000) {
  if (window?.html2pdf) return true;
  const src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
  let script = [...document.scripts].find((s) => (s.src || "").includes("html2pdf.bundle.min.js"));
  if (!script) {
    script = document.createElement("script");
    script.src = src;
    script.async = true;
    document.head.appendChild(script);
  }

  return new Promise((resolve) => {
    const done = () => resolve(!!window?.html2pdf);
    const timer = setTimeout(done, timeoutMs);
    script.addEventListener("load", () => { clearTimeout(timer); done(); }, { once: true });
    script.addEventListener("error", () => { clearTimeout(timer); resolve(false); }, { once: true });
  });
}

function buildPdfReportNode() {
  const yearsAsc = [...state.years].sort((a, b) => a - b);
  const company = state.selectedCompany || {};
  const container = document.createElement("section");
  container.className = "pdf-report-root";
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = "1100px";
  container.style.background = "#ffffff";
  container.style.color = "#0f2742";
  container.style.padding = "16px";
  container.style.fontFamily = "'Segoe UI', Tahoma, Arial, sans-serif";
  container.innerHTML = `
    <style>
      .pdf-head { border-bottom: 2px solid #d3e5f7; padding-bottom: 10px; margin-bottom: 12px; }
      .pdf-head h1 { margin: 0 0 8px; color: #124776; font-size: 24px; }
      .pdf-meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; font-size: 12px; color: #244b70; }
      .pdf-sec { margin: 14px 0; page-break-inside: auto; break-inside: auto; }
      .pdf-sec h2 { margin: 0 0 8px; color: #124776; font-size: 18px; }
      .pdf-sec h3 { margin: 8px 0 6px; color: #124776; font-size: 14px; }
      .pdf-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .pdf-card { border: 1px solid #c7dbf1; border-radius: 8px; padding: 8px; background: #f8fbff; }
      .pdf-table-wrap { overflow: visible; }
      .pdf-table-wrap table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: auto; }
      .pdf-table-wrap th, .pdf-table-wrap td { border: 1px solid #c5dbf3; padding: 4px 5px; text-align: right; }
      .pdf-table-wrap th:first-child, .pdf-table-wrap td:first-child { text-align: left; }
      .pdf-table-wrap th { background: #d9eafb; color: #123f6b; }
      .pdf-page-break { page-break-before: always; }
      .pdf-appendix-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
      .pdf-appendix-year { page-break-inside: avoid; break-inside: avoid; }
      .pdf-appendix-year table { width: 100%; border-collapse: collapse; font-size: 10px; }
      .pdf-appendix-year th, .pdf-appendix-year td { border: 1px solid #c5dbf3; padding: 4px 5px; }
      .pdf-appendix-year th { text-align: left; background: #e4f0fd; color: #123f6b; }
      .pdf-appendix-year td { text-align: right; }
      .pdf-appendix-year td:first-child { text-align: left; font-weight: 600; color: #1d456d; }
      .pdf-chat-list { display: grid; gap: 8px; }
      .pdf-chat-item { border: 1px solid #c7dbf1; border-radius: 8px; padding: 8px; background: #f8fbff; font-size: 11px; line-height: 1.35; }
      .pdf-chat-item strong { color: #124776; }
      .pdf-chart img { width: 100%; height: auto; border: 1px solid #c5dbf3; border-radius: 8px; background: #fff; }
    </style>
    <header class="pdf-head">
      <h1>Analizador de Empresas - Supersociedades</h1>
      <div class="pdf-meta">
        <div><strong>Empresa:</strong> ${escapeHtml(company.razon_social || "N/D")}</div>
        <div><strong>NIT:</strong> ${escapeHtml(company.nit || "N/D")}</div>
        <div><strong>Años analizados:</strong> ${yearsAsc.join(", ")}</div>
        <div><strong>Generado:</strong> ${escapeHtml(new Date().toLocaleString("es-CO"))}</div>
      </div>
    </header>
    <section class="pdf-sec" id="pdf-kpis"></section>
    <section class="pdf-sec pdf-page-break" id="pdf-states"></section>
    <section class="pdf-sec" id="pdf-analysis"></section>
    <section class="pdf-sec pdf-page-break" id="pdf-charts"></section>
    <section class="pdf-sec pdf-page-break" id="pdf-details"></section>
    <section class="pdf-sec" id="pdf-chat"></section>
  `;

  const kpisTarget = container.querySelector("#pdf-kpis");
  const statesTarget = container.querySelector("#pdf-states");
  const analysisTarget = container.querySelector("#pdf-analysis");
  const chartsTarget = container.querySelector("#pdf-charts");
  const detailsTarget = container.querySelector("#pdf-details");
  const chatTarget = container.querySelector("#pdf-chat");

  kpisTarget.innerHTML = `<h2>KPIs</h2>${cloneHtmlBlock(dom.kpiCards, true)}`;

  statesTarget.innerHTML = `
    <h2>Estados financieros</h2>
    <h3>Estado de resultados</h3>
    ${cloneHtmlBlock(dom.incomeTable)}
    <h3>Estado de resultados externo (Estrategia en Accion)</h3>
    <div class="pdf-card"><strong>Estado de carga externo:</strong> ${escapeHtml(cleanText(dom.extIncomeStatus?.textContent || "Sin estado"))}</div>
    ${cloneHtmlBlock(dom.extIncomeTable)}
    <h3>Indicadores de rentabilidad y cobertura</h3>
    ${cloneHtmlBlock(dom.metricsTable)}
    <div class="pdf-grid-2">
      <div class="pdf-card">
        <h3>Balance general</h3>
        ${cloneHtmlBlock(dom.balanceTable)}
      </div>
      <div class="pdf-card">
        <h3>Flujo de caja</h3>
        ${cloneHtmlBlock(dom.cashTable)}
      </div>
    </div>
  `;

  analysisTarget.innerHTML = `
    <h2>Interpretacion financiera</h2>
    <h3>Lectura profunda</h3>
    ${cloneHtmlBlock(dom.deepIncomeAnalysis, true)}
    <h3>Resumen de balance y flujo</h3>
    <div class="pdf-grid-2">
      <div class="pdf-card">${cloneHtmlBlock(dom.balanceSummaryCard, true)}</div>
      <div class="pdf-card">${cloneHtmlBlock(dom.cashflowSummaryCard, true)}</div>
    </div>
  `;

  const chartBlocks = cloneWithChartsAsImages(dom.chartsContainer);
  chartBlocks.classList.add("pdf-chart");
  chartsTarget.innerHTML = `<h2>Graficas</h2>`;
  chartsTarget.appendChild(chartBlocks);

  detailsTarget.innerHTML = buildPdfDetailAppendix(yearsAsc);
  chatTarget.innerHTML = buildPdfChatSection();

  return container;
}

function cloneHtmlBlock(el, withCard = false) {
  if (!el) return '<div class="pdf-card">Sin informacion disponible.</div>';
  const clone = el.cloneNode(true);
  const html = clone.innerHTML || "";
  if (!html.trim()) return '<div class="pdf-card">Sin informacion disponible.</div>';
  const wrapClass = withCard ? "pdf-card" : "pdf-table-wrap";
  return `<div class="${wrapClass}">${html}</div>`;
}

function cloneWithChartsAsImages(source) {
  const wrap = document.createElement("div");
  wrap.className = "pdf-card";
  if (!source) {
    wrap.textContent = "Sin graficas disponibles.";
    return wrap;
  }
  const clone = source.cloneNode(true);
  const srcCanvases = [...source.querySelectorAll("canvas")];
  const dstCanvases = [...clone.querySelectorAll("canvas")];
  dstCanvases.forEach((dst, idx) => {
    const src = srcCanvases[idx];
    const img = document.createElement("img");
    img.alt = `grafica-${idx + 1}`;
    try {
      img.src = src?.toDataURL?.("image/png") || "";
    } catch {
      img.src = "";
    }
    if (!img.src) {
      const placeholder = document.createElement("div");
      placeholder.textContent = "Grafica no disponible en PDF.";
      placeholder.style.padding = "8px";
      placeholder.style.fontSize = "12px";
      placeholder.style.color = "#466988";
      dst.replaceWith(placeholder);
      return;
    }
    dst.replaceWith(img);
  });
  wrap.appendChild(clone);
  return wrap;
}

function buildPdfDetailAppendix(yearsAsc) {
  const payload = exportPayload();
  const rowsByYear = new Map((payload?.rows || []).map((row) => [Number(row.anio), row]));
  const yearsDesc = [...yearsAsc].sort((a, b) => b - a);
  if (!yearsDesc.length) return '<h2>Anexo detallado</h2><div class="pdf-card">Sin informacion disponible.</div>';

  const fields = [
    ["ingresos", "Ingresos", "money"],
    ["costos", "Costos", "money"],
    ["utilidad_bruta", "Utilidad bruta", "money"],
    ["gastos_administrativos", "Gastos administrativos", "money"],
    ["gastos_venta", "Gastos de venta", "money"],
    ["otros_gastos_operacionales", "Otros gastos operacionales", "money"],
    ["otros_ingresos", "Otros ingresos", "money"],
    ["utilidad_operativa", "Utilidad operativa", "money"],
    ["ebitda", "EBITDA", "money"],
    ["ingresos_financieros", "Ingresos financieros", "money"],
    ["costos_financieros", "Costos financieros", "money"],
    ["coberturas", "Coberturas", "money"],
    ["utilidad_subsidiaria", "Utilidad subsidiaria", "money"],
    ["otros_ingresos_no_operacionales", "Otros ingresos no operacionales", "money"],
    ["otros_egresos_no_operacionales", "Otros egresos no operacionales", "money"],
    ["impuestos", "Impuestos", "money"],
    ["utilidad_neta", "Utilidad neta", "money"],
    ["crecimiento_ingresos_yoy_pct", "Crecimiento ingresos YoY", "pct"],
    ["margen_bruto_pct", "Margen bruto", "pct"],
    ["margen_ebitda_pct", "Margen EBITDA", "pct"],
    ["gastos_operacionales_sobre_ingresos_pct", "Gastos operacionales / ingresos", "pct"],
    ["margen_neto_pct", "Margen neto", "pct"],
    ["deuda_ebitda_x", "Deuda / EBITDA", "ratio"],
    ["ebitda_costos_financieros_x", "EBITDA / costos financieros", "ratio"],
    ["activos_corrientes", "Activos corrientes", "money"],
    ["pasivos_corrientes", "Pasivos corrientes", "money"],
    ["activos_totales", "Activos totales", "money"],
    ["pasivos_totales", "Pasivos totales", "money"],
    ["patrimonio_total", "Patrimonio total", "money"],
    ["ganancias_acumuladas", "Ganancias acumuladas", "money"],
    ["capital_neto_trabajo", "Capital neto de trabajo", "money"],
    ["deuda", "Deuda", "money"],
    ["dias_capital_trabajo", "Dias capital de trabajo", "num"],
    ["flujo_caja", "Flujo de caja", "money"],
    ["z_altman", "Z-Altman", "num"]
  ];

  const yearCards = yearsDesc.map((year) => {
    const row = rowsByYear.get(Number(year)) || {};
    const rows = fields.map(([key, label, kind]) => {
      return `<tr><td>${label}</td><td>${formatPdfValue(row[key], kind)}</td></tr>`;
    }).join("");
    return `
      <article class="pdf-card pdf-appendix-year">
        <h3>Año ${year}</h3>
        <table>
          <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </article>
    `;
  }).join("");

  return `
    <h2>Anexo detallado por año (todo el dataset)</h2>
    <div class="pdf-appendix-grid">${yearCards}</div>
  `;
}

function formatPdfValue(value, kind) {
  if (!Number.isFinite(value)) return "N/D";
  if (kind === "money") return `COP ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value)}`;
  if (kind === "pct") return `${fmtNum(value, 2)}%`;
  if (kind === "ratio") return `${fmtNum(value, 2)}x`;
  return fmtNum(value, 2);
}

function buildPdfChatSection() {
  const nodes = [...(dom.botChatLog?.querySelectorAll?.(".bot-msg") || [])];
  if (!nodes.length) return '<h2>Chat de asesor financiero</h2><div class="pdf-card">No hay conversacion registrada para incluir.</div>';

  const items = nodes.map((node) => {
    const role = node.classList.contains("user") ? "Usuario" : "Asesor";
    const text = cleanText(node.innerText || node.textContent || "");
    return `<article class="pdf-chat-item"><p><strong>${role}:</strong> ${escapeHtml(text).replace(/\n/g, "<br>")}</p></article>`;
  }).join("");

  return `
    <h2>Chat de asesor financiero</h2>
    <div class="pdf-chat-list">${items}</div>
  `;
}

function openPrintWindow(innerHtml) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
  if (!win) throw new Error("No se pudo abrir ventana de impresion.");
  win.document.open();
  win.document.write(`
    <html>
      <head><title>Reporte financiero</title><meta charset="utf-8" /></head>
      <body>${innerHtml}</body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function exportCsv() {
  if (!state.selectedCompany || !state.years.length) return showMessage("warning", "No hay datos analizados para exportar.");
  const payload = exportPayload();
  const cols = [
    "anio",
    "ingresos",
    "costos",
    "utilidad_bruta",
    "gastos_administrativos",
    "gastos_venta",
    "otros_gastos_operacionales",
    "otros_ingresos",
    "utilidad_operativa",
    "ebitda",
    "ingresos_financieros",
    "costos_financieros",
    "coberturas",
    "utilidad_subsidiaria",
    "otros_ingresos_no_operacionales",
    "otros_egresos_no_operacionales",
    "impuestos",
    "utilidad_neta",
    "crecimiento_ingresos_yoy_pct",
    "margen_bruto_pct",
    "margen_ebitda_pct",
    "gastos_operacionales_sobre_ingresos_pct",
    "margen_neto_pct",
    "deuda_ebitda_x",
    "ebitda_costos_financieros_x",
    "activos_corrientes",
    "pasivos_corrientes",
    "activos_totales",
    "pasivos_totales",
    "patrimonio_total",
    "ganancias_acumuladas",
    "capital_neto_trabajo",
    "deuda",
    "dias_capital_trabajo",
    "flujo_caja",
    "z_altman"
  ];
  const lines = [cols.join(",")];
  payload.rows.forEach((r) => lines.push(cols.map((c) => escCsv(r[c])).join(",")));
  download(lines.join("\n"), `analisis_${state.selectedCompany.nit}_${stamp()}.csv`, "text/csv;charset=utf-8;");
}

function exportJson() {
  if (!state.selectedCompany || !state.years.length) return showMessage("warning", "No hay datos analizados para exportar.");
  download(JSON.stringify(exportPayload(), null, 2), `analisis_${state.selectedCompany.nit}_${stamp()}.json`, "application/json;charset=utf-8;");
}

function exportPayload() {
  const rows = [...state.years].sort((a, b) => a - b).map((y) => {
    const s = state.snapshots[y];
    return {
      anio: y,
      ingresos: nullable(s.income.ingresos),
      costos: nullable(s.income.costos),
      utilidad_bruta: nullable(s.income.utilidad_bruta),
      gastos_administrativos: nullable(s.income.gastos_administrativos),
      gastos_venta: nullable(s.income.gastos_venta),
      otros_gastos_operacionales: nullable(s.income.otros_gastos_operacionales),
      otros_ingresos: nullable(s.income.otros_ingresos),
      utilidad_operativa: nullable(s.income.utilidad_operativa),
      ebitda: nullable(s.income.ebitda),
      ingresos_financieros: nullable(s.income.ingresos_financieros),
      costos_financieros: nullable(s.income.costos_financieros),
      coberturas: nullable(s.income.coberturas),
      utilidad_subsidiaria: nullable(s.income.utilidad_subsidiaria),
      otros_ingresos_no_operacionales: nullable(s.income.otros_ingresos_no_operacionales),
      otros_egresos_no_operacionales: nullable(s.income.otros_egresos_no_operacionales),
      impuestos: nullable(s.income.impuestos),
      utilidad_neta: nullable(s.income.utilidad_neta),
      crecimiento_ingresos_yoy_pct: nullable(s.ratios?.crecimiento_ingresos_yoy),
      margen_bruto_pct: nullable(s.ratios?.margen_bruto),
      margen_ebitda_pct: nullable(s.ratios?.margen_ebitda),
      gastos_operacionales_sobre_ingresos_pct: nullable(s.ratios?.gastos_operacionales_sobre_ingresos),
      margen_neto_pct: nullable(s.ratios?.margen_neto),
      deuda_ebitda_x: nullable(s.ratios?.deuda_ebitda),
      ebitda_costos_financieros_x: nullable(s.ratios?.ebitda_costos_financieros),
      activos_corrientes: nullable(s.balance.activos_corrientes), pasivos_corrientes: nullable(s.balance.pasivos_corrientes), activos_totales: nullable(s.balance.activos_totales), pasivos_totales: nullable(s.balance.pasivos_totales), patrimonio_total: nullable(s.balance.patrimonio_total), ganancias_acumuladas: nullable(s.balance.ganancias_acumuladas),
      capital_neto_trabajo: nullable(s.metrics.capital_neto_trabajo), deuda: nullable(s.metrics.deuda), dias_capital_trabajo: nullable(s.metrics.dias_capital_trabajo), flujo_caja: nullable(s.metrics.flujo_caja), z_altman: nullable(s.metrics.z_altman)
    };
  });

  return {
    app: "Analizador de Empresas - Supersociedades",
    generado_en: new Date().toISOString(),
    empresa: {
      nit: state.selectedCompany.nit,
      razon_social: state.selectedCompany.razon_social,
      estado: state.selectedCompany.estado,
      etapa_situacion: state.selectedCompany.etapa_situacion,
      dependencia: state.selectedCompany.dependencia
    },
    anos_analizados: [...state.years].sort((a, b) => a - b),
    rows,
    audit: [...state.years]
      .sort((a, b) => a - b)
      .reduce((acc, y) => {
        acc[y] = state.snapshots[y]?.audit || {};
        return acc;
      }, {}),
    external_income_statement: exportExternalIncomePayload()
  };
}

function exportExternalIncomePayload() {
  const ext = state.externalIncome || initialExternalIncomeState();
  if (!Array.isArray(ext.measures) || !ext.measures.length) return null;
  const years = [...state.years].sort((a, b) => a - b);
  const byYear = {};
  years.forEach((year) => {
    const row = ext.byYear?.[year] || {};
    const values = {};
    ext.measures.forEach((measure) => {
      const value = row[measure.property];
      values[measure.property] = Number.isFinite(value) ? value : null;
    });
    byYear[year] = values;
  });

  return {
    source: "estrategiaenaccion_powerbi",
    report_url: EXTERNAL_INCOME_CONFIG.reportUrl,
    fetched_at: ext.fetchedAt || null,
    variables: ext.measures.map((measure) => ({
      name: measure.label,
      property: measure.property,
      kind: measure.kind
    })),
    by_year: byYear
  };
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escCsv(v) {
  if (v === null || v === undefined) return "";
  const t = String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function destroyCharts() { state.charts.forEach((c) => c.destroy()); state.charts = []; }

function findValue(concepts, pattern) {
  if (!concepts || !pattern) return null;

  const exact = pattern.exact || [];
  const contains = pattern.contains || [];
  const exclude = (pattern.exclude || []).map(normalizeText);

  for (const e of exact) {
    const k = normalizeText(e);
    if (Object.prototype.hasOwnProperty.call(concepts, k)) return concepts[k];
  }

  let best = null;
  for (const needle of contains.map(normalizeText)) {
    const candidates = Object.entries(concepts)
      .filter(([k]) => fuzzyIncludes(k, needle))
      .filter(([k]) => !exclude.some((x) => x && fuzzyIncludes(k, x)))
      .filter(([k]) => {
        const overlap = tokenOverlap(k, needle);
        return overlap >= 0.45 || k.includes(needle);
      });

    if (!candidates.length) continue;

    candidates.forEach(([key, value]) => {
      const overlap = tokenOverlap(key, needle);
      const score =
        (key === needle ? 100 : 0) +
        (key.startsWith(needle) ? 20 : 0) +
        Math.round(overlap * 80) +
        (Number.isFinite(value) && value !== 0 ? 5 : 0) -
        Math.abs(key.length - needle.length);

      if (!best || score > best.score || (score === best.score && Math.abs(value || 0) > Math.abs(best.value || 0))) {
        best = { score, value };
      }
    });
  }
  return best ? best.value : null;
}

const TOKEN_STOPWORDS = new Set([
  "de", "del", "la", "las", "el", "los", "por", "en", "y", "a", "al", "que", "con", "sin", "para", "total"
]);

function tokenOverlap(key, needle) {
  const keyTokens = tokenizeFinancialText(key);
  const needleTokens = tokenizeFinancialText(needle);
  if (!needleTokens.length || !keyTokens.length) return 0;

  let matched = 0;
  needleTokens.forEach((needleToken) => {
    const hasMatch = keyTokens.some((keyToken) => tokenLike(keyToken, needleToken));
    if (hasMatch) matched += 1;
  });
  return matched / needleTokens.length;
}

function tokenizeFinancialText(text) {
  return normalizeLooseKey(text)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t && t.length >= 2 && !TOKEN_STOPWORDS.has(t));
}

function tokenLike(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const sa = textSkeleton(a);
  const sb = textSkeleton(b);
  return !!sa && !!sb && (sa === sb || sa.includes(sb) || sb.includes(sa));
}

function sumContains(concepts, needles) {
  const targets = needles.map(normalizeText);
  const vals = Object.entries(concepts)
    .filter(([k]) => targets.some((n) => fuzzyIncludes(k, n)))
    .map(([, v]) => v);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

function sumFinite(values) {
  const nums = (values || []).filter((v) => Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

function assumeZero(value, label, assumed) {
  if (Number.isFinite(value)) return value;
  if (Array.isArray(assumed)) assumed.push(label);
  return 0;
}

const DEBT_INCLUDE_TERMS = [
  "obligaciones financieras",
  "pasivos financieros",
  "deuda financiera",
  "deuda total",
  "prestamos",
  "prestamo"
];

const DEBT_EXCLUDE_TERMS = [
  "cuentas por pagar comerciales",
  "proveedores",
  "impuestos",
  "beneficios a empleados"
];

const DEBT_CURRENT_HINTS = ["corriente", "corto plazo"];
const DEBT_NON_CURRENT_HINTS = ["no corriente", "largo plazo"];
const DEBT_TOTAL_HINTS = [
  "deuda total",
  "obligaciones financieras totales",
  "pasivos financieros totales",
  "total deuda",
  "total obligaciones financieras",
  "total pasivos financieros"
];

function debtCandidateSegment(meta) {
  if (meta?.isTotal) return "total";
  if (meta?.isCurrent) return "current";
  if (meta?.isNonCurrent) return "non_current";
  return "other";
}

function debtConceptCore(key) {
  return normalizeLooseKey(key)
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

function debtConceptFingerprint(key, meta) {
  const core = debtConceptCore(key);
  return `${debtCandidateSegment(meta)}|${core || "deuda"}`;
}

function dedupeDebtCandidates(candidates) {
  const bestByFingerprint = new Map();
  (candidates || []).forEach((candidate) => {
    if (!Number.isFinite(candidate?.value)) return;
    const meta = candidate?.meta || debtCandidateMeta(candidate?.key || "");
    const fingerprint = debtConceptFingerprint(candidate?.key || "", meta);
    const absRounded = Math.round(Math.abs(candidate.value));
    const dedupeKey = `${fingerprint}|${absRounded}`;
    const score = debtCandidateScore({ ...candidate, meta });
    const current = bestByFingerprint.get(dedupeKey);
    if (
      !current ||
      score > current.score ||
      (score === current.score && Math.abs(candidate.value) > Math.abs(current.value))
    ) {
      bestByFingerprint.set(dedupeKey, { ...candidate, meta, score });
    }
  });
  return [...bestByFingerprint.values()].map(({ score, ...candidate }) => candidate);
}

function mergeEquivalentComponentCandidates(candidates) {
  const bestByCore = new Map();
  (candidates || []).forEach((candidate) => {
    if (!candidate || !Number.isFinite(candidate.value)) return;
    const core = debtConceptCore(candidate.key);
    const absRounded = Math.round(Math.abs(candidate.value));
    const dedupeKey = `${core || "deuda"}|${absRounded}`;
    const score = debtCandidateScore(candidate);
    const current = bestByCore.get(dedupeKey);
    if (
      !current ||
      score > current.score ||
      (score === current.score && Math.abs(candidate.value) > Math.abs(current.value))
    ) {
      bestByCore.set(dedupeKey, { ...candidate, score });
    }
  });
  return [...bestByCore.values()].map(({ score, ...candidate }) => candidate);
}

function includesAnyNormalized(text, needles) {
  return (needles || []).some((needle) => text.includes(needle));
}

function debtCandidateMeta(key) {
  const isNonCurrent = includesAnyNormalized(key, DEBT_NON_CURRENT_HINTS);
  const isCurrent = !isNonCurrent && includesAnyNormalized(key, DEBT_CURRENT_HINTS);
  const isTotal = !isCurrent && !isNonCurrent && includesAnyNormalized(key, DEBT_TOTAL_HINTS);
  return { isCurrent, isNonCurrent, isTotal };
}

function debtCandidateScore(candidate) {
  const key = candidate?.key || "";
  const value = Number.isFinite(candidate?.value) ? candidate.value : 0;
  let score = 0;
  if (key.includes("deuda total")) score += 150;
  if (includesAnyNormalized(key, DEBT_TOTAL_HINTS)) score += 120;
  if (key.includes("obligaciones financieras")) score += 70;
  if (key.includes("pasivos financieros")) score += 65;
  if (key.includes("deuda financiera")) score += 60;
  if (key.includes("prestamo") || key.includes("prestamos")) score += 45;
  if (includesAnyNormalized(key, DEBT_CURRENT_HINTS) || includesAnyNormalized(key, DEBT_NON_CURRENT_HINTS)) score += 20;
  score += Math.log10(Math.abs(value) + 1);
  return score;
}

function pickBestDebtCandidate(candidates, predicate) {
  let best = null;
  (candidates || []).forEach((candidate) => {
    if (typeof predicate === "function" && !predicate(candidate)) return;
    const score = debtCandidateScore(candidate);
    if (!best || score > best.score || (score === best.score && Math.abs(candidate.value) > Math.abs(best.value))) {
      best = { ...candidate, score };
    }
  });
  return best;
}

function resolveFinancialDebtFromConcepts(concepts) {
  const candidatesRaw = Object.entries(concepts || {})
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => ({ key, value, meta: debtCandidateMeta(key) }))
    .filter((candidate) => includesAnyNormalized(candidate.key, DEBT_INCLUDE_TERMS))
    .filter((candidate) => !includesAnyNormalized(candidate.key, DEBT_EXCLUDE_TERMS));
  const candidates = dedupeDebtCandidates(candidatesRaw);

  if (!candidates.length) {
    return {
      deudaSumada: null,
      deudaDirecta: null,
      componentConcepts: [],
      directConcept: "",
      candidateConcepts: []
    };
  }

  const totalCandidate = pickBestDebtCandidate(candidates, (candidate) => candidate.meta.isTotal);
  let componentCandidates = [];
  let deudaSumada = null;
  if (!totalCandidate) {
    const currentCandidate = pickBestDebtCandidate(candidates, (candidate) => candidate.meta.isCurrent);
    const nonCurrentCandidate = pickBestDebtCandidate(candidates, (candidate) => candidate.meta.isNonCurrent);
    const componentMap = new Map();
    [currentCandidate, nonCurrentCandidate].forEach((candidate) => {
      if (!candidate) return;
      if (!componentMap.has(candidate.key)) componentMap.set(candidate.key, candidate);
    });
    componentCandidates = mergeEquivalentComponentCandidates([...componentMap.values()]);
    deudaSumada = componentCandidates.length
      ? componentCandidates.reduce((acc, candidate) => acc + candidate.value, 0)
      : null;
  }

  const directCandidate = totalCandidate || pickBestDebtCandidate(candidates, () => true);

  return {
    deudaSumada,
    deudaDirecta: directCandidate ? directCandidate.value : null,
    componentConcepts: componentCandidates.map((candidate) => candidate.key),
    directConcept: directCandidate ? directCandidate.key : "",
    candidateConcepts: candidates.map((candidate) => candidate.key)
  };
}

function sumContainsFiltered(concepts, needles, excludeNeedles) {
  const targets = (needles || []).map(normalizeText);
  const excludes = (excludeNeedles || []).map(normalizeText);
  const vals = Object.entries(concepts)
    .filter(([k]) => targets.some((n) => fuzzyIncludes(k, n)))
    .filter(([k]) => !excludes.some((x) => x && fuzzyIncludes(k, x)))
    .map(([, v]) => v);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

function applySalesDeductions(grossRevenue, discountsValue) {
  if (!Number.isFinite(grossRevenue)) return null;
  if (!Number.isFinite(discountsValue)) return grossRevenue;
  const adjustedDiscount = discountsValue > 0 ? -Math.abs(discountsValue) : discountsValue;
  return grossRevenue + adjustedDiscount;
}

function divSafe(a, b) { return a === null || b === null || b === 0 ? null : a / b; }
function zZone(v) { if (!Number.isFinite(v)) return "indeterminado"; if (v > 2.6) return "solida"; if (v >= 1.1) return "gris"; return "riesgo"; }

function parseAmount(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let t = String(raw).trim();
  if (!t) return null;
  let neg = false;
  if (t.startsWith("(") && t.endsWith(")")) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/\s+/g, "").replace(/\$/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
  else if (t.includes(",") && !t.includes(".")) t = t.replace(/,/g, ".");
  t = t.replace(/[^0-9.-]/g, "");
  if (!t || ["-", ".", "-."].includes(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function chunkArray(arr, size) {
  if (!Array.isArray(arr) || size <= 0) return [];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeLooseKey(v) {
  return normalizeText(v).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function htmlToText(html) {
  const text = String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&aacute;/gi, "a")
    .replace(/&eacute;/gi, "e")
    .replace(/&iacute;/gi, "i")
    .replace(/&oacute;/gi, "o")
    .replace(/&uacute;/gi, "u")
    .replace(/&ntilde;/gi, "n");
  return cleanText(text);
}

function buildNitCandidates(rawNit) {
  const clean = nitDigits(rawNit);
  if (!clean) return [];

  const set = new Set();
  const base = clean.length > 9 ? clean.slice(0, 9) : clean;
  set.add(base); // NIT base (9 digitos), que es el formato mas comun en datos.gov.co
  set.add(clean); // valor tal cual digitado/recibido

  if (clean.length > 10) set.add(clean.slice(0, 10));
  if (clean.length > 10) set.add(clean.slice(-9)); // fallback: algunos origenes arrastran prefijos extra

  const dv = computeNitDv(base);
  if (dv !== null) set.add(`${base}${dv}`); // base + digito de verificacion calculado

  return [...set].filter((v) => /^\d+$/.test(v));
}

function computeNitDv(nitBase) {
  const digits = nitDigits(nitBase);
  if (!digits) return null;
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let sum = 0;

  for (let i = 0; i < digits.length && i < weights.length; i += 1) {
    const d = Number(digits[digits.length - 1 - i]);
    if (!Number.isFinite(d)) return null;
    sum += d * weights[i];
  }

  const mod = sum % 11;
  return mod > 1 ? 11 - mod : mod;
}

function chooseDominantNit(incomeRows, balanceRows, cashRows, candidates) {
  const allRows = [...incomeRows, ...balanceRows, ...cashRows];
  if (!allRows.length || !candidates.length) return null;

  const candidateSet = new Set(candidates.map((c) => nitDigits(c)));
  const counts = new Map();
  allRows.forEach((row) => {
    const nit = nitDigits(row?.nit);
    if (!candidateSet.has(nit)) return;
    counts.set(nit, (counts.get(nit) || 0) + 1);
  });

  if (!counts.size) return null;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0][0];
}

function textCompact(v) {
  return normalizeText(v).replace(/[^a-z0-9]/g, "");
}

function textSkeleton(v) {
  return textCompact(v).replace(/[aeiou]/g, "");
}

function fuzzyIncludes(haystack, needle) {
  if (!haystack || !needle) return false;
  if (haystack.includes(needle)) return true;
  const hCompact = textCompact(haystack);
  const nCompact = textCompact(needle);
  if (!hCompact || !nCompact) return false;
  if (hCompact.includes(nCompact)) return true;
  const hSkel = textSkeleton(haystack);
  const nSkel = textSkeleton(needle);
  if (!hSkel || !nSkel) return false;
  return hSkel.includes(nSkel);
}

function normalizeText(v) {
  if (!v) return "";
  return String(v)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/�/g, "")
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
function cleanText(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
function escapeHtml(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function nitDigits(v) { return String(v || "").replace(/\D/g, ""); }
function normalizeNit(v) { const d = nitDigits(v); return d.length >= 9 ? d.slice(0, 9) : d; }

function fmtMoney(v) {
  const n = Number.isFinite(v) ? v : 0;
  return `COP ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n)}`;
}
function fmtNum(v, dec = 2) {
  const n = Number.isFinite(v) ? v : 0;
  return new Intl.NumberFormat("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
}
function fmtCompact(v, money = true) {
  const n = Number.isFinite(v) ? v : 0;
  return money ? fmtMoney(n).replace("COP ", "") : fmtNum(n, 0);
}

function percentOf(num, den) {
  return !Number.isFinite(num) || !Number.isFinite(den) || den === 0 ? null : (num / den) * 100;
}
function pct(cur, prev) { return !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100; }
function num0(v) { return Number.isFinite(v) ? v : 0; }
function safe(v) { return Number.isFinite(v) ? v : null; }
function nullable(v) { return Number.isFinite(v) ? v : null; }

function isConnectivityLikeError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return (
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("connect") ||
    text.includes("timeout") ||
    text.includes("cors") ||
    text.includes("cloudflare") ||
    text.includes("http ")
  );
}

function isLikelyParserError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return (
    text.includes("no se encontro una empresa con el nit") ||
    text.includes("no se encontraron coincidencias")
  );
}

function toUserError(err) {
  const t = err?.message ? String(err.message) : String(err || "Ocurrio un error inesperado.");
  if (t.includes("Intentamos varios canales de conexion")) {
    return "No fue posible consultar Supersociedades ahora mismo (bloqueo CORS/proxy). Si buscas por NIT, reintenta y la app usara modo respaldo para seguir con el analisis financiero.";
  }
  if (t.includes("No se encontraron estados financieros para este NIT en datos abiertos oficiales.")) {
    return "La empresa si existe en Supersociedades, pero no se encontraron registros financieros en datos abiertos para ese NIT (ni recientes ni historicos). Verifica el NIT base de 9 digitos o intenta otra razon social del mismo grupo.";
  }
  if (t.includes("Failed to fetch") || t.includes("NetworkError")) return "Fallo de conexion. Revisa internet e intenta nuevamente.";
  return t;
}

function showMessage(type, text) {
  dom.messageBox.className = `message ${type}`;
  dom.messageBox.textContent = text;
  dom.messageBox.classList.remove("hidden");
}

function hideMessage() {
  dom.messageBox.className = "message info hidden";
  dom.messageBox.textContent = "";
}


