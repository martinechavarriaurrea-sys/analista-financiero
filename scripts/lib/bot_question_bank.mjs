import fs from "fs/promises";

const CORE_QUESTIONS_TEXT = `
1. Cual es la razon social y el NIT?
2. Cual es la actividad economica (CIIU) principal?
3. En que ciudad y departamento opera principalmente?
4. Cual es el tamano de la empresa segun ingresos?
5. Como ha crecido la empresa en los ultimos 6 anos?
6. Cual fue el ano de mayor crecimiento y por que?
7. Cual fue el ano de peor desempeno y por que?
8. Que lineas de negocio explican la mayoria de ingresos?
9. Que canales de venta aportan mas al ingreso?
10. Cual es la estructura de costos del negocio?
11. Que costos son fijos y cuales variables?
12. Que gastos son discrecionales y cuales obligatorios?
13. Que eventos extraordinarios afectaron resultados?
14. Hay concentracion de clientes relevante?
15. Hay concentracion de proveedores relevante?
16. Cual es la estacionalidad de ventas?
17. La empresa depende de TRM/insumos importados?
18. Cual es el nivel de informalidad/contingencias?
19. Que indicadores internos usa gerencia hoy?
20. Cuales son los 3 riesgos principales del negocio?
21. Cual fue el ingreso total de cada ano?
22. Cual fue el crecimiento YoY de ingresos por ano?
23. Cual es el CAGR de ingresos 6 anos?
24. Que porcentaje de ingresos viene del top 5 clientes?
25. Como cambia el precio promedio (ASP) por ano?
26. Como cambia el volumen vendido por ano?
27. Que parte del crecimiento fue precio vs volumen?
28. Que productos/lineas crecieron mas y cuales cayeron?
29. Que canal tiene mayor crecimiento y por que?
30. Que tasa de devoluciones/bonificaciones afecta ingresos?
31. Que descuentos promedio se aplican por canal?
32. Que impacto tienen rebates/bonos comerciales?
33. Que efecto tuvo la inflacion en ingresos reales?
34. Como se comportan ingresos en terminos USD (si aplica)?
35. La cartera esta creciendo mas rapido que ventas?
36. Existen ingresos no recurrentes? Identificalos.
37. Cual es la calidad del ingreso (recurrencia)?
38. Cual es el ingreso por cliente (ARPC) si aplica?
39. Cual es la tasa de churn si aplica?
40. Hay concentracion por region/segmento?
41. Cual es la elasticidad aproximada precio-volumen?
42. Que mezcla de productos mejora margen?
43. Que mezcla de productos destruye margen?
44. Cual es la tasa de crecimiento trimestral/mensual (si hay)?
45. Que meses son pico y valle?
46. Que objetivos de ventas se cumplieron por ano?
47. Que gap existe vs presupuesto?
48. Que sensibilidad hay ante caida del 10% en ventas?
49. Que sensibilidad hay ante aumento del 5% en precio?
50. Que acciones recomiendas para crecer sin perder margen?
51. Cual fue el costo de ventas (COGS) por ano?
52. Cual fue el margen bruto por ano?
53. Que explica el cambio del margen bruto ano a ano?
54. Cuanto pesa materia prima/compra vs mano de obra vs indirectos?
55. Como evoluciono el costo unitario por ano?
56. Que porcentaje del COGS es variable?
57. Hay sobrecostos por ineficiencia/mermas?
58. Como impacta la TRM el COGS?
59. Que tan expuesto esta el margen a proveedores clave?
60. Cual es el punto de equilibrio (break-even) aproximado?
61. Que capacidad instalada existe y cual es su utilizacion?
62. Hay cuellos de botella operativos?
63. Que porcentaje del inventario es obsoleto?
64. Que provisiones afectan el margen?
65. Como cambian fletes y logistica en el COGS?
66. Que impacto tiene la mezcla de canales en margen bruto?
67. Cual es el margen bruto por linea/canal?
68. Que productos tienen margen negativo?
69. Donde se pierde margen: compras, produccion o ventas?
70. Que ahorro potencial existe renegociando proveedores?
71. Que ahorro potencial existe mejorando rotacion inventario?
72. Que ahorro potencial existe reduciendo mermas?
73. Que impacto tiene un +10% en COGS sobre EBITDA?
74. Que impacto tiene un -5% en COGS sobre EBITDA?
75. Hay costos capitalizables que hoy van a gasto?
76. Hay costos recurrentes mal clasificados?
77. Cuanto del margen depende de "otros" no claros?
78. Que indicadores de operacion explican margen (drivers)?
79. Que acciones recomiendas para recuperar margen bruto?
80. Cual es el margen bruto "normalizado" sin extraordinarios?
81. Cuales son los gastos operacionales por ano?
82. Cual es el % OPEX/Ingresos por ano?
83. Que rubros de OPEX crecen mas rapido que ventas?
84. Que parte de OPEX es fija vs variable?
85. Cual es el EBITDA por ano?
86. Cual es el margen EBITDA por ano?
87. Que explica la variacion del EBITDA ano a ano?
88. El EBITDA se convierte en caja? Cuanto?
89. Cual es el EBIT y su margen por ano?
90. Que depreciacion/amortizacion pesa sobre EBIT?
91. Que gastos son "one-off" y deben normalizarse?
92. Cual es el EBITDA normalizado?
93. Que gastos administrativos son recortables sin riesgo?
94. Que gastos de venta son inversion (crecimiento) vs desperdicio?
95. Cual es la productividad: ingresos por empleado?
96. Cual es la productividad: EBITDA por empleado?
97. Como se comparan margenes vs empresas similares (portal)?
98. Que palancas suben EBITDA mas rapido?
99. Que palancas bajan riesgo de caja?
100. Que sensibilidad tiene EBITDA a caida de 5 puntos de margen bruto?
101. Que sensibilidad tiene EBITDA a subida de OPEX del 10%?
102. Cual es el operating leverage (apalancamiento operativo)?
103. Cual es el contribution margin estimado?
104. Que estructura de costos te hace mas vulnerable?
105. Que estructura te da resiliencia?
106. Hay subutilizacion que infla costos fijos por unidad?
107. Cuales son los 5 rubros OPEX mas grandes y por que?
108. Que OPEX deberia capitalizarse como CAPEX (si aplica)?
109. Que politica de remuneracion impacta EBITDA?
110. Que gasto comercial genera ROI medible?
111. Cual es el LTV/CAC si aplica?
112. Cual es el margen EBITDA por canal?
113. Cual es el margen EBITDA por linea?
114. Cuales son las 3 iniciativas para subir EBITDA en 90 dias?
115. Cuales son las 3 iniciativas para subir EBITDA en 12 meses?
116. Cual fue la utilidad neta por ano?
117. Cual es el margen neto por ano?
118. Cual es la tasa efectiva de impuestos por ano?
119. La tasa efectiva es consistente con el regimen colombiano?
120. Hay diferencias permanentes/temporales relevantes?
121. Hay impuestos diferidos significativos?
122. Que contingencias fiscales existen?
123. Que tan "limpia" es la utilidad (sin extraordinarios)?
124. Que parte de utilidad es financiera vs operativa?
125. Que parte de utilidad proviene de otros ingresos?
126. Hay ingresos no operacionales recurrentes?
127. Hay gastos no operacionales recurrentes?
128. Hay deterioros/provisiones que distorsionan utilidad?
129. Hay cambios contables que expliquen saltos?
130. Hay subsidios o beneficios tributarios?
131. Cual es el ROE por ano?
132. Cual es el ROA por ano?
133. Cual es el ROIC aproximado por ano?
134. La empresa destruye o crea valor vs WACC?
135. Cual es el EPS si aplica?
136. Como se relaciona utilidad con caja operativa?
137. Que ano tuvo mejor conversion utilidad->caja?
138. Que ano tuvo peor conversion y por que?
139. Que ajustes harias para normalizar la utilidad?
140. Que conclusion ejecutiva sacas de la utilidad neta?
141. Cuales son activos corrientes por ano?
142. Cuales son pasivos corrientes por ano?
143. Cual es el capital de trabajo neto por ano?
144. Cual es la razon corriente por ano?
145. Cual es la prueba acida por ano?
146. Como cambia la caja por ano y por que?
147. Como cambia CxC por ano y por que?
148. Cual es el DSO (dias cartera) por ano?
149. Como cambia inventario por ano y por que?
150. Cual es el DIH (dias inventario) por ano?
151. Como cambia CxP por ano y por que?
152. Cual es el DPO (dias proveedores) por ano?
153. Cual es el ciclo de conversion de efectivo (CCC) por ano?
154. El CCC mejora o empeora y por que?
155. Cual es la cartera vencida >90 dias?
156. Cual es la provision de cartera y cobertura?
157. Que % de inventario es lento/obsoleto?
158. Que riesgos hay por liquidez a 90 dias?
159. Cual es la caja minima operativa recomendada?
160. Que palancas liberan caja rapido (CxC, inventario, CxP)?
161. Que descuento por pronto pago conviene vs costo deuda?
162. Que politicas de credito deberian ajustarse?
163. Que clientes deben bajar cupo o pedir garantias?
164. Que proveedores permiten extender plazo sin riesgo?
165. Como se ve la liquidez en estres (ventas -20%)?
166. Cual es el burn rate si hay perdidas?
167. Cuanto runway tiene con caja actual?
168. Que senales anticipan crisis de caja?
169. Que tan dependiente es de anticipos de clientes?
170. Hay factoring? Cual es su costo efectivo?
171. Hay confirming? Cual es su costo?
172. Como impacta la inflacion en CT?
173. Que tan sensible es CT a crecimiento de ventas?
174. Cual es el CT "normalizado" por estacionalidad?
175. Que plan de accion recomiendas para mejorar CCC?
176. Cual es la deuda total por ano (CP y LP)?
177. Cual es la deuda neta por ano?
178. Cual es Deuda Neta/EBITDA por ano?
179. Cual es la cobertura de intereses (EBIT/Intereses)?
180. Cual es la cobertura (EBITDA/Intereses)?
181. Cual es el costo promedio ponderado de la deuda?
182. Cual es el calendario de vencimientos?
183. Que porcentaje es tasa fija vs variable?
184. Que riesgo hay por IBR/DTF/IPC?
185. Que riesgo hay por TRM en deuda?
186. Que covenants existen y como van vs limites?
187. Cual es el DSCR por ano (si hay data)?
188. La empresa puede refinanciar? Con que argumentos?
189. Que garantias estan comprometidas?
190. Que tan bancarizable es segun indicadores?
191. Que senales muestran riesgo de incumplimiento?
192. Que plan de desapalancamiento recomiendas?
193. Conviene pre-pagar deuda o invertir en CAPEX?
194. Que impacto tiene subir 300 bps la tasa?
195. Que impacto tiene bajar 200 bps la tasa?
196. Que impacto tiene devaluacion del 15%?
197. Que nivel de deuda seria "sano" para esta empresa?
198. Que estructura de deuda optimiza costo y riesgo?
199. Cual es tu rating interno (A/B/C/D) y por que?
200. Darias credito? Con que condiciones y mitigantes?
`;

const TEMPLATE_TEXT = `
P1. Cual fue {RUBRO} en {ANO}?
P2. Como cambio {RUBRO} vs ano anterior en {ANO}?
P3. Cual es el % de {RUBRO} sobre ingresos en {ANO}?
P4. Cual fue el principal driver que movio {RUBRO} en {ANO}?
P5. Que rubros explican el 80% del cambio de EBITDA en {ANO}?
P6. Descompon crecimiento de ingresos en {ANO}: precio vs volumen vs mix.
P7. Cual es el margen bruto en {ANO} y su variacion?
P8. Cual es el margen EBITDA en {ANO} y su variacion?
P9. Que {SEGMENTO} aporta mas al EBITDA en {ANO}?
P10. Cual es el margen bruto por {CANAL} en {ANO}?
P11. Cual es el margen EBITDA por {CANAL} en {ANO}?
P12. Identifica el top 5 {SEGMENTO} por ingresos en {ANO}.
P13. Identifica el top 5 {SEGMENTO} por margen bruto en {ANO}.
P14. Identifica el top 5 {SEGMENTO} por morosidad en {ANO}.
P15. Que {SEGMENTO} destruye margen en {ANO}?
P16. Que clientes deberian tener ajuste de cupo en {ANO} y por que?
P17. Cual es el DSO en {ANO} y sus causas?
P18. Cual es el DIH en {ANO} y sus causas?
P19. Cual es el DPO en {ANO} y sus causas?
P20. Cual es el CCC en {ANO} y sus causas?
P21. Cuanta caja libera reducir DSO en 10 dias en {ANO}?
P22. Cuanta caja libera reducir DIH en 15 dias en {ANO}?
P23. Que pasa con caja si extendemos DPO 10 dias en {ANO}?
P24. Cual es Deuda Neta/EBITDA en {ANO}?
P25. Como se ve la cobertura de intereses en {ANO}?
P26. Cual es el costo efectivo de deuda en {ANO}?
P27. Que riesgos de refinanciacion hay en los proximos 12 meses desde {ANO}?
P28. Simula {ESCENARIO} en {ANO}: impacto en EBITDA y caja.
P29. Simula {ESCENARIO} en {ANO}: impacto en covenants.
P30. Que CAPEX minimo requiere sostener operaciones en {ANO}?
P31. Cual es el FCF en {ANO} y por que?
P32. Cuanto del EBITDA se convierte en FCF en {ANO}?
P33. Cual es la tasa efectiva de impuestos en {ANO} y explicacion?
P34. Normaliza EBITDA en {ANO} removiendo one-offs listados.
P35. Compara {RUBRO} interno vs portal en {ANO}: diferencias y causas.
P36. Compara margenes vs comparables del portal en {ANO}: gap y acciones.
P37. Identifica 3 red flags financieras en {ANO}.
P38. Identifica 3 oportunidades rapidas (quick wins) en {ANO}.
P39. Recomiendas dar credito en {ANO} bajo politica X? Condiciones.
P40. Resume en 5 bullets el desempeno total de {ANO}.
`;

export const RESPONSE_SCHEMA = {
  short_answer: "1-2 lineas maximo",
  formula: "calculo o formula usada",
  data_used: "ano, rubros y fuente interno/portal",
  interpretation: "por que importa para negocio y riesgo",
  action: "recomendacion concreta y priorizada",
  missing_data_policy: "si falta dato: decir 'Dato no disponible', explicar faltante y proxy permitido"
};

export const VARIABLE_SETS = {
  RUBRO: [
    "Ingresos", "COGS", "Utilidad Bruta", "OPEX", "EBITDA", "EBIT", "Intereses",
    "Impuestos", "Utilidad Neta", "Caja", "CxC", "Inventarios", "CxP", "Deuda"
  ],
  SEGMENTO: ["Canal", "Linea", "Region", "Cliente", "Producto"],
  CANAL: ["E-commerce", "Retail", "Mayorista", "B2B", "Distribuidores"],
  ESCENARIO: [
    "Base", "-10% ventas", "+5% precio", "+10% COGS", "+10% OPEX", "+300 bps tasa", "TRM +15%"
  ]
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

function parseNumberedList(text) {
  return String(text || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^([A-Z]?\d+)\.\s+/, "").trim())
    .filter(Boolean);
}

export const CORE_QUESTIONS = parseNumberedList(CORE_QUESTIONS_TEXT);

export const TEMPLATE_DEFINITIONS = TEMPLATE_TEXT
  .split(/\r?\n/g)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const m = line.match(/^(P\d+)\.\s+(.+)$/);
    if (!m) return null;
    return { id: m[1], template: m[2] };
  })
  .filter(Boolean);

function placeholders(template) {
  const out = [];
  const rx = /\{([A-Z_]+)\}/g;
  let m = null;
  while ((m = rx.exec(String(template || ""))) !== null) out.push(m[1]);
  return [...new Set(out)];
}

function inferType(question) {
  const q = normalize(question);
  if (q.includes("simula") || q.includes("sensibilidad") || q.includes("impacto")) return "scenario";
  if (q.includes("deuda") || q.includes("cobertura") || q.includes("covenant")) return "debt_risk";
  if (q.includes("caja") || q.includes("ccc") || q.includes("dso") || q.includes("dih") || q.includes("dpo")) return "cashflow_wcm";
  if (q.includes("margen") || q.includes("ebitda") || q.includes("opex") || q.includes("cogs")) return "profitability";
  if (q.includes("impuesto") || q.includes("utilidad neta") || q.includes("roe") || q.includes("roa") || q.includes("roic")) return "net_income_tax";
  if (q.includes("portal") || q.includes("comparables")) return "external_benchmark";
  return "general";
}

function inferSourceExpected(question) {
  const q = normalize(question);
  if (q.includes("portal") || q.includes("comparables")) return "interno+portal";
  return "interno";
}

function buildCoreRecords() {
  return CORE_QUESTIONS.map((question, idx) => ({
    id: `C${String(idx + 1).padStart(3, "0")}`,
    question: clean(question),
    type: inferType(question),
    source_expected: inferSourceExpected(question),
    variables: {},
    response_schema: RESPONSE_SCHEMA
  }));
}

function valuePool(varName, years, overrides = {}) {
  if (varName === "ANO") return (overrides.ANO || years || []).map((y) => String(y));
  return overrides[varName] || VARIABLE_SETS[varName] || [];
}

function fillTemplate(template, variables) {
  return String(template || "").replace(/\{([A-Z_]+)\}/g, (_, key) => {
    const val = variables[key];
    return val === undefined || val === null ? `{${key}}` : String(val);
  });
}

function dedupeByQuestion(records) {
  const seen = new Set();
  const out = [];
  for (const rec of records || []) {
    const key = normalize(rec.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(rec);
  }
  return out;
}

export function expandTemplateQuestions(opts = {}) {
  const years = Array.isArray(opts.years) && opts.years.length ? opts.years : [2019, 2020, 2021, 2022, 2023, 2024];
  const out = [];

  TEMPLATE_DEFINITIONS.forEach((tpl, idx) => {
    const vars = placeholders(tpl.template);
    if (!vars.length) {
      out.push({
        id: `${tpl.id}-001`,
        question: clean(tpl.template),
        type: inferType(tpl.template),
        source_expected: inferSourceExpected(tpl.template),
        variables: {},
        response_schema: RESPONSE_SCHEMA
      });
      return;
    }

    const pools = vars.map((v) => valuePool(v, years, opts));
    if (pools.some((p) => !p.length)) return;

    const indices = new Array(pools.length).fill(0);
    let guard = 0;
    const maxForTemplate = Number(opts.max_per_template) > 0 ? Number(opts.max_per_template) : 120;

    while (guard < maxForTemplate) {
      const variables = {};
      vars.forEach((v, i) => {
        variables[v] = pools[i][indices[i] % pools[i].length];
      });

      const question = clean(fillTemplate(tpl.template, variables));
      out.push({
        id: `${tpl.id}-${String(guard + 1).padStart(3, "0")}`,
        question,
        type: inferType(question),
        source_expected: inferSourceExpected(question),
        variables,
        response_schema: RESPONSE_SCHEMA
      });

      guard += 1;
      for (let i = indices.length - 1; i >= 0; i -= 1) {
        indices[i] += 1;
        if (indices[i] < pools[i].length) break;
        indices[i] = 0;
      }
    }
  });

  return dedupeByQuestion(out);
}

export function buildQuestionBank(opts = {}) {
  const target = Number(opts.target) > 0 ? Number(opts.target) : 1000;
  const includeCore = opts.include_core !== false;
  const years = Array.isArray(opts.years) && opts.years.length ? opts.years : [2019, 2020, 2021, 2022, 2023, 2024];

  const core = includeCore ? buildCoreRecords() : [];
  const templateExpanded = expandTemplateQuestions({ ...opts, years });
  const merged = dedupeByQuestion([...core, ...templateExpanded]);

  if (merged.length >= target) return merged.slice(0, target);

  const extra = [];
  let i = 0;
  while (merged.length + extra.length < target && i < templateExpanded.length * 6) {
    const base = templateExpanded[i % templateExpanded.length];
    extra.push({
      ...base,
      id: `${base.id}-R${Math.floor(i / templateExpanded.length) + 1}`,
      question: `${base.question} (variante ${Math.floor(i / templateExpanded.length) + 1})`
    });
    i += 1;
  }

  return dedupeByQuestion([...merged, ...extra]).slice(0, target);
}

export function toJsonl(records) {
  return (records || []).map((rec) => JSON.stringify(rec)).join("\n");
}

export async function writeQuestionBankFiles(options = {}) {
  const outDir = options.output_dir || "bot_training";
  const years = options.years || [2019, 2020, 2021, 2022, 2023, 2024];
  const target = Number(options.target) > 0 ? Number(options.target) : 1000;

  const coreRecords = buildCoreRecords();
  const templates = TEMPLATE_DEFINITIONS;
  const bank = buildQuestionBank({ target, years, include_core: true });

  const summary = {
    generated_at: new Date().toISOString(),
    target,
    generated: bank.length,
    core_count: coreRecords.length,
    templates_count: templates.length,
    years,
    type_counts: bank.reduce((acc, q) => {
      acc[q.type] = (acc[q.type] || 0) + 1;
      return acc;
    }, {}),
    source_counts: bank.reduce((acc, q) => {
      acc[q.source_expected] = (acc[q.source_expected] || 0) + 1;
      return acc;
    }, {})
  };

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${outDir}/question_bank_core_200.json`, JSON.stringify(coreRecords, null, 2), "utf8");
  await fs.writeFile(`${outDir}/question_templates_40.json`, JSON.stringify(templates, null, 2), "utf8");
  await fs.writeFile(`${outDir}/question_bank_${target}.json`, JSON.stringify({ summary, questions: bank }, null, 2), "utf8");
  await fs.writeFile(`${outDir}/question_bank_${target}.jsonl`, toJsonl(bank), "utf8");

  const md = [
    `# Banco de preguntas ${target}`,
    "",
    `- Generado: ${summary.generated_at}`,
    `- Preguntas: ${summary.generated}`,
    `- Nucleo: ${summary.core_count}`,
    `- Plantillas: ${summary.templates_count}`,
    `- Anos base: ${years.join(", ")}`,
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
    "- Si falta dato: 'Dato no disponible' + faltante + proxy"
  ].join("\n");

  await fs.writeFile(`${outDir}/reporte_banco_preguntas_${target}.md`, md, "utf8");

  return { summary, files: [
    `${outDir}/question_bank_core_200.json`,
    `${outDir}/question_templates_40.json`,
    `${outDir}/question_bank_${target}.json`,
    `${outDir}/question_bank_${target}.jsonl`,
    `${outDir}/reporte_banco_preguntas_${target}.md`
  ] };
}
