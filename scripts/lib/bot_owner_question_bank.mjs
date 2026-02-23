import fs from "fs/promises";

export const OWNER_RESPONSE_CONTRACT = {
  short_answer: "1-2 lineas maximo",
  formula: "calculo o formula usada",
  data_used: "ano, rubros y fuente interno/portal",
  interpretation: "por que importa para negocio y riesgo",
  action: "recomendacion concreta y priorizada",
  missing_data_policy: "si falta dato interno y portal no lo trae: 'Dato no disponible' + faltante + proxy recomendado"
};

export const OWNER_ANTI_HALLUCINATION_RULE =
  "Si falta dato interno y portal no lo trae, responder: 'Dato no disponible', indicar faltante exacto y proxy recomendado.";

const OWNER_QUESTION_SOURCE = `
A) Salud general del negocio (1-30)
1) La empresa esta creciendo o se esta quedando quieta?
2) Que es lo mas importante que esta haciendo bien hoy?
3) Que es lo mas peligroso que esta haciendo mal hoy?
4) En que se le esta yendo la plata sin darse cuenta?
5) La empresa depende demasiado de uno o dos clientes?
6) Si pierde su cliente mas grande, aguanta el golpe?
7) Que tan estable es el negocio mes a mes?
8) Que parte del negocio jala y cual frena?
9) Que producto o servicio es el mas rentable?
10) Cual vende mucho pero deja poca ganancia?
11) Cual producto deberia dejar de vender porque no conviene?
12) Que tan bien controla sus costos?
13) Que tan bien controla sus gastos?
14) La empresa esta organizada o vive apagando incendios?
15) Que tan facil es que un error pequeno se vuelva un problema grande?
16) Que tan dependiente es de una persona clave?
17) La empresa tiene procesos claros o todo es a la carrera?
18) Donde se pierde mas tiempo en la operacion?
19) Donde se cometen mas errores?
20) Que quejas se repiten de los clientes?
21) Que parte del servicio al cliente esta fallando?
22) La calidad del producto es consistente?
23) Que tan rapido entrega y que tan seguido se atrasa?
24) Cuales son las 3 cosas que mas le duelen al negocio hoy?
25) Cual es la meta mas importante para los proximos 3 meses?
26) Cual es la meta mas importante para los proximos 12 meses?
27) Que tan facil es subir precios en este negocio?
28) Que tan facil es bajar costos sin danar la calidad?
29) Que tan competitivo es el mercado donde juega?
30) Que ventaja real tiene la empresa frente a otros?

B) Que debe mejorar (diagnostico simple) (31-70)
31) Que parte del negocio esta mas pesada para sostener?
32) Que area esta generando mas problemas: ventas, operacion o administracion?
33) Donde se estan tomando decisiones sin datos?
34) Que indicador te gustaria entender pero no entiendes?
35) En que se nota que la empresa no esta controlada?
36) Que gastos crecieron y no sabes por que?
37) Que costos subieron y nadie explica bien?
38) Que area siempre pide mas plata y no muestra resultados?
39) Que proyecto lleva tiempo y no se ve el retorno?
40) Que parte del negocio depende de promociones/descuentos?
41) Los descuentos se salen de control?
42) La empresa vende barato por miedo a perder clientes?
43) Que tan claro esta el precio vs el valor que entrega?
44) Que tan facil es que te copien el producto/servicio?
45) Que procesos deberian documentarse ya?
46) Que tareas deberian automatizarse ya?
47) Que tareas se podrian eliminar?
48) Que tareas se podrian delegar?
49) Que reuniones sobran?
50) Que reportes faltan para tomar mejores decisiones?
51) Que decisiones estan siendo reactivas y no planeadas?
52) Que parte del negocio deberia medirse semanalmente?
53) Que parte deberia medirse mensualmente?
54) Que parte deberia medirse diariamente?
55) Que errores se repiten porque nadie los corrige de raiz?
56) Que parches estan saliendo caros?
57) Que compras se hacen sin comparar proveedores?
58) Que inventario se compra por si acaso y se queda ahi?
59) Que clientes pagan tarde siempre y aun asi les vendes?
60) Que proveedores te estan presionando por pagos atrasados?
61) Que tan ordenada esta la facturacion?
62) Que tan ordenada esta la cobranza?
63) La empresa sabe exactamente cuanto le cuesta producir o vender?
64) La empresa sabe cuanto gana por cada venta realmente?
65) La empresa sabe cuanto le cuesta conseguir un cliente?
66) Que tan claro esta quien es responsable de cada resultado?
67) Que tan facil seria para ti explicar el negocio en 2 minutos?
68) Que cosa cambiarias primero si solo pudieras cambiar una?
69) Que te da mas miedo hoy: que caigan ventas o que falte caja?
70) Cual es el cuello de botella mas grande?

C) Como mejorar ventas sin perder plata (71-105)
71) Que tipo de clientes te dejan mejor ganancia?
72) Que tipo de clientes te consumen tiempo y dejan poco?
73) Que canal de venta es el mas efectivo?
74) Que canal trae muchos leads pero pocos cierres?
75) Que canal te deja mejor margen?
76) Que parte del proceso de ventas esta fallando?
77) La empresa tiene un guion comercial claro?
78) Cuanto se demora un cliente en decidir?
79) Que objecion aparece mas: precio, confianza o tiempo?
80) Que tan claro es el valor que ofreces vs competencia?
81) Tu precio esta bien o estas regalando margen?
82) Puedes subir precio a ciertos clientes sin perderlos?
83) Que servicio extra puedes cobrar que hoy regalas?
84) Que producto engancha y luego permite vender otros mejores?
85) Que producto deberia ser premium y no lo estas cobrando?
86) Que paquete podrias armar para vender mas sin bajar precio?
87) Que opcion de suscripcion o contrato podrias ofrecer?
88) Que alianzas podrian aumentar ventas?
89) Que referidos podrias activar?
90) Que campanas si han funcionado historicamente?
91) Que campanas han sido perdida de plata?
92) Que metrica te diria si marketing esta sirviendo?
93) Que tan bien se hace seguimiento a cotizaciones?
94) Que porcentaje de cotizaciones se convierten en ventas?
95) Que tan rapido responden al cliente?
96) Que tan bien gestionan quejas para que vuelvan a comprar?
97) Que tan repetitivas son las ventas (recompra)?
98) Que tan dependiente es de ventas de ultimo minuto?
99) Que puede hacerse para reducir devoluciones?
100) Que puede hacerse para reducir descuentos?
101) Que puede hacerse para vender mas de lo que si deja margen?
102) Que indicadores simples te mostrarian mejora semanal?
103) Que meta realista de ventas tiene sentido sin ahogar la operacion?
104) Que riesgos hay si fuerzas crecimiento rapido?
105) Que harias si manana te piden crecer 20%?

D) Costos y gastos: bajar sin matar el negocio (106-145)
106) Cual es el gasto mas grande y por que existe?
107) Que gastos son necesarios y cuales son costumbre?
108) Que gastos se podrian renegociar ya?
109) Que contratos estan caros?
110) Que proveedores te suben precios sin justificacion?
111) Que insumo esta disparando costos?
112) Que desperdicio existe en produccion o en operacion?
113) Que se dana o se pierde con frecuencia?
114) Que tareas generan reprocesos?
115) Cuanto te cuesta un error tipico?
116) Que actividad agrega valor real y cual es puro tramite?
117) Que procesos podrian estandarizarse para ahorrar?
118) Que compras podrias centralizar para negociar mejor?
119) Que compras podrias pasar a licitacion/competencia?
120) Que parte del inventario se queda quieta?
121) Que parte del inventario se mueve muy rapido y se agota?
122) Que productos te cuestan mas de lo que parecen?
123) Que gastos deberian asignarse por area para controlarlos?
124) Que gasto esta creciendo sin relacion con ventas?
125) Que gastos pueden moverse de fijo a variable?
126) Que servicios tercerizados estan caros?
127) Tener mas gente realmente esta mejorando resultados?
128) Que roles estan duplicados?
129) Que actividades podrian automatizarse para reducir carga?
130) Que herramientas pagas no se usan?
131) Que gastos administrativos son fugas?
132) Que gastos de ventas no generan ventas?
133) Que gastos de logistica podrian optimizarse?
134) Que rutas/entregas cuestan mas?
135) Que decisiones de compra se hacen por urgencia?
136) Que tanto te cuesta operar por falta de planeacion?
137) Que controles minimos faltan para evitar perdidas?
138) Que meta de reduccion de gastos es realista sin afectar calidad?
139) Que recorte seria peligroso y por que?
140) Que ahorro puedes lograr en 30 dias?
141) Que ahorro puedes lograr en 90 dias?
142) Que ahorro requiere inversion para lograrlo?
143) Que indicadores te muestran si el ahorro es real y no maquillaje?
144) Que pasa si reduces gasto 10% pero cae servicio?
145) Como balanceas ahorro vs crecimiento?

E) Caja y me quedo sin plata: preguntas simples (146-190)
146) Por que tengo ventas pero no tengo plata en la cuenta?
147) Que me esta drenando la caja: cartera, inventario o deudas?
148) Cada cuanto se queda sin caja la empresa?
149) Que mes del ano es el mas duro de caja?
150) Que gastos te llegan juntos y te ahogan?
151) Que tan rapido cobras lo que vendes?
152) Que tan tarde pagas a proveedores?
153) Que tan grande es la cartera vencida?
154) Cuales clientes pagan tarde siempre?
155) Que haces hoy cuando un cliente se atrasa?
156) Tu politica de credito es clara o improvisada?
157) Que garantias pides y cuando?
158) Ofreces descuentos por pronto pago? Sirven?
159) Tu facturacion se demora y por eso cobras tarde?
160) Que errores de facturacion retrasan cobros?
161) Cuanto inventario tienes quieto?
162) Que inventario podrias liquidar para recuperar caja?
163) Cuanto te cuesta tener inventario guardado?
164) Compras mucho por miedo a quedarte sin stock?
165) Cuanto podrias bajar inventario sin afectar ventas?
166) Que proveedores te dan mejor plazo?
167) Que proveedores podrias renegociar?
168) Que pagos podrias pasar a cuotas?
169) Que gastos podrias mover a pago por uso?
170) Que tan predecible es tu flujo de caja?
171) Tienes un presupuesto de caja mensual?
172) Que pasa si el proximo mes vendes 15% menos?
173) Que pasa si un cliente grande no paga?
174) Cuanta caja minima necesitas para dormir tranquilo?
175) Que senales te alertan que se viene una crisis de caja?
176) Que decision tomas tarde y empeora la caja?
177) Que gasto grande puedes pausar sin matar la operacion?
178) Que inversion puedes aplazar?
179) Que cobro puedes acelerar esta semana?
180) Que acuerdos puedes hacer con clientes para cobrar antes?
181) Que acuerdos puedes hacer con proveedores para pagar despues?
182) Como puedo tener mas caja en 14 dias?
183) Como puedo tener mas caja en 30 dias?
184) Que plan de caja de emergencia recomiendas?
185) Que indicador simple me dice si voy bien con caja?
186) Como hago para no confundir utilidad con caja?
187) Que errores tipicos hacen que una empresa se quede sin caja?
188) Como se arma un control semanal de caja?
189) Que debo mirar todos los lunes para no ahogarme?
190) Que debo mirar todos los viernes para anticiparme?

F) Disminuir deuda: preguntas estilo dueno no financiero (191-245)
191) Cuanta deuda tengo en total y a quien le debo?
192) Que deuda es la mas peligrosa?
193) Cual es la deuda mas cara (mas intereses)?
194) Cual es la deuda que se vence mas pronto y me puede ahogar?
195) Que pasa si no pago a tiempo?
196) Que deudas puedo renegociar?
197) Como le pido al banco que me mejore la tasa?
198) Que necesita ver el banco para confiar mas en mi?
199) Que puedo mostrar para pedir mas plazo?
200) Me conviene juntar deudas en una sola (consolidar)?
201) Que es refinanciar y cuando conviene?
202) Que es reestructurar y cuando conviene?
203) Que es normal: pagar deuda rapido o tener deuda sana?
204) Como se si mi deuda es manejable?
205) Que parte de mi negocio debe pagar la deuda cada mes?
206) Que indicador me dice si estoy muy endeudado?
207) Que indicador me dice si puedo pagar intereses sin sufrir?
208) Que pasa si suben las tasas de interes?
209) Que pasa si el dolar sube y tengo deuda en dolares?
210) Me conviene deuda a tasa fija o variable?
211) Que significa plazo y por que importa?
212) Que significa cuota y por que me puede matar la caja?
213) Que es el perfil de vencimientos y como lo arreglo?
214) Que deuda debo pagar primero: la mas cara o la mas urgente?
215) Como priorizo pagos si no me alcanza?
216) Que pasa si pago una deuda y me quedo sin caja?
217) Cuanta caja debo guardar antes de prepagar deuda?
218) Como puedo bajar intereses sin bajar ventas?
219) Como puedo bajar deuda sin despedir gente?
220) Que gastos debo cortar para pagar deuda mas rapido?
221) Que inventario puedo vender para pagar deuda?
222) Que activos puedo vender sin afectar el negocio?
223) Me conviene vender cartera (factoring) para bajar deuda?
224) Que tan caro es el factoring y cuando si vale?
225) Que pasa si uso tarjeta/credito rotativo para operar?
226) Como evito pagar deuda con mas deuda?
227) Que debo negociar primero con proveedores?
228) Como paso pagos grandes a cuotas?
229) Como hago un plan de pagos realista a 12 meses?
230) Como hago un plan de pagos realista a 24 meses?
231) Que significa tener una deuda estrangulando la operacion?
232) Que senales muestran que debo reestructurar ya?
233) Que senales muestran que todavia puedo manejarla?
234) Que errores comete la gente al renegociar con bancos?
235) Que documentos necesita un banco para reestructurar?
236) Que tan malo es estar reportado y como evitarlo?
237) Que es un covenant y por que me puede perjudicar?
238) Como evito incumplir covenants?
239) Que condiciones debo aceptar y cuales no?
240) Como hago para que mi deuda no crezca aunque el negocio crezca?
241) Como uso el capital de trabajo para bajar deuda?
242) Como uso mejores margenes para bajar deuda?
243) Como uso mejor cobranza para bajar deuda?
244) Como uso inventario mas bajo para bajar deuda?
245) Como se que mi plan de deuda esta funcionando?

G) Revisar ventajas y oportunidades (246-275)
246) Que ventaja tiene la empresa que de verdad se note?
247) Que ventaja cree tener pero en realidad no es ventaja?
248) Que ventaja tiene frente a competidores en precio, calidad o servicio?
249) Que ventaja tiene en velocidad de entrega?
250) Que ventaja tiene en relacion con clientes?
251) Que ventaja tiene en costos (mas barato operar)?
252) Que ventaja tiene en talento o conocimiento?
253) Que ventaja tiene en marca?
254) Que ventaja tiene en canales de venta?
255) Que ventaja podria crear con una mejora pequena?
256) Que oportunidad hay de vender mas al mismo cliente?
257) Que oportunidad hay de subir precio justificadamente?
258) Que oportunidad hay de reducir devoluciones/garantias?
259) Que oportunidad hay de reducir desperdicios?
260) Que oportunidad hay de negociar mejor con proveedores?
261) Que oportunidad hay de automatizar y ahorrar?
262) Que oportunidad hay de mejorar el mix de productos?
263) Que oportunidad hay de mejorar el servicio postventa?
264) Que oportunidad hay de abrir un canal nuevo sin gastar mucho?
265) Que oportunidad hay de alianzas comerciales?
266) Que oportunidad hay de empaquetar productos/servicios?
267) Que oportunidad hay de suscripcion/contratos recurrentes?
268) Que oportunidad hay de vender premium?
269) Que oportunidad hay de salir de productos malos?
270) Que oportunidad hay de mejorar tiempos de entrega?
271) Que oportunidad hay de mejorar cobranza con tecnologia?
272) Que oportunidad hay de reducir inventario sin perder ventas?
273) Que oportunidad hay de cambiar condiciones de pago?
274) Que oportunidad hay de mejorar rentabilidad sin crecer?
275) Que oportunidad hay de mejorar rentabilidad creciendo?

H) Preguntas de control y seguimiento (276-300)
276) Que debo revisar cada semana para saber si vamos bien?
277) Que debo revisar cada mes para no llevarme sorpresas?
278) Que 5 indicadores me muestran si el negocio esta sano?
279) Que indicador me muestra si la deuda esta bajando de verdad?
280) Que indicador me muestra si la caja esta mejorando?
281) Que indicador me muestra si la empresa esta vendiendo bien?
282) Que indicador me muestra si el margen se esta danando?
283) Que indicador me muestra si los gastos se salieron de control?
284) Que indicador me muestra si la cartera se esta volviendo peligrosa?
285) Que indicador me muestra si inventario esta creciendo mal?
286) Que preguntas debo hacerle a mi contador cada mes?
287) Que preguntas debo hacerle a mi jefe de ventas cada mes?
288) Que preguntas debo hacerle a mi jefe de operaciones cada mes?
289) Que decisiones debo tomar si o si cuando cae la caja?
290) Que decisiones debo evitar cuando cae la caja?
291) Como se si una mejora de gastos es real o es maquillaje?
292) Como se si un crecimiento de ventas es saludable?
293) Como se si estoy vendiendo mucho pero mal?
294) Que alarma me dice que debo frenar y reorganizar?
295) Que alarma me dice que debo renegociar deuda ya?
296) Que alarma me dice que debo cambiar politica de credito?
297) Que alarma me dice que debo recortar inventario?
298) Que alarma me dice que debo subir precios?
299) Que alarma me dice que debo parar CAPEX?
300) Cual es el plan mas simple de 90 dias para mejorar todo?
`;

const OWNER_CATEGORIES = {
  A: "salud_general",
  B: "diagnostico_simple",
  C: "ventas_sin_perder_margen",
  D: "costos_gastos",
  E: "caja_liquidez",
  F: "deuda_dueno_no_financiero",
  G: "ventajas_oportunidades",
  H: "control_seguimiento"
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

function inferSource(question) {
  const q = normalize(question);
  if (q.includes("portal") || q.includes("comparables") || q.includes("competidores")) return "interno+portal";
  return "interno";
}

function parseOwnerQuestions() {
  const lines = OWNER_QUESTION_SOURCE.split(/\r?\n/g).map((x) => x.trim()).filter(Boolean);
  const out = [];
  let category = "general";
  let group = "A";

  for (const line of lines) {
    const head = line.match(/^([A-H])\)\s+/);
    if (head) {
      group = head[1];
      category = OWNER_CATEGORIES[group] || "general";
      continue;
    }

    const m = line.match(/^(\d+)\)\s+(.+\?)$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const question = clean(m[2]);
    if (!Number.isFinite(idx) || !question) continue;

    out.push({
      id: `OWN-${String(idx).padStart(3, "0")}`,
      index: idx,
      group,
      category,
      question,
      source_expected: inferSource(question),
      response_contract: OWNER_RESPONSE_CONTRACT,
      anti_hallucination_rule: OWNER_ANTI_HALLUCINATION_RULE
    });
  }

  out.sort((a, b) => a.index - b.index);
  return out;
}

function dedupe(records) {
  const seen = new Set();
  const out = [];
  for (const r of records || []) {
    const k = normalize(r.question);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function buildOwnerQuestionBank(options = {}) {
  const target = Number(options.target) > 0 ? Number(options.target) : 300;
  const years = Array.isArray(options.years) && options.years.length
    ? options.years.map((y) => Number(y)).filter((y) => Number.isFinite(y))
    : [2020, 2021, 2022, 2023, 2024, 2025];
  const base = parseOwnerQuestions();

  if (target <= base.length) return base.slice(0, target);

  const variants = [];
  let id = 1;
  for (const q of base) {
    for (const year of years) {
      if (base.length + variants.length >= target * 3) break;
      const tagged = clean(`${q.question} (en ${year})`);
      variants.push({
        ...q,
        id: `${q.id}-Y${year}-V${String(id).padStart(3, "0")}`,
        question: tagged,
        variant_of: q.id,
        variables: { ANO: year }
      });
      id += 1;
    }
    if (base.length + variants.length >= target * 3) break;
  }

  const merged = dedupe([...base, ...variants]).slice(0, target).map((q, idx) => ({
    ...q,
    id: `OWN-${String(idx + 1).padStart(4, "0")}`
  }));

  return merged;
}

export function toJsonl(records) {
  return (records || []).map((r) => JSON.stringify(r)).join("\n");
}

export async function writeOwnerQuestionBankFiles(options = {}) {
  const outDir = options.output_dir || "bot_training";
  const years = Array.isArray(options.years) && options.years.length
    ? options.years.map((y) => Number(y)).filter((y) => Number.isFinite(y))
    : [2020, 2021, 2022, 2023, 2024, 2025];

  const base300 = buildOwnerQuestionBank({ target: 300, years });
  const target = Number(options.target) > 0 ? Number(options.target) : 1000;
  const bankTarget = buildOwnerQuestionBank({ target, years });

  function summarize(records, targetValue) {
    return {
      generated_at: new Date().toISOString(),
      base_count: base300.length,
      target: targetValue,
      generated: records.length,
      years,
      categories: records.reduce((acc, q) => {
        acc[q.category] = (acc[q.category] || 0) + 1;
        return acc;
      }, {}),
      source_counts: records.reduce((acc, q) => {
        acc[q.source_expected] = (acc[q.source_expected] || 0) + 1;
        return acc;
      }, {})
    };
  }

  const summary300 = summarize(base300, 300);
  const summary = summarize(bankTarget, target);

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${outDir}/owner_question_bank_300.json`, JSON.stringify({ summary: summary300, questions: base300 }, null, 2), "utf8");
  await fs.writeFile(`${outDir}/owner_question_bank_300.jsonl`, toJsonl(base300), "utf8");
  await fs.writeFile(`${outDir}/owner_question_bank_${target}.json`, JSON.stringify({ summary, questions: bankTarget }, null, 2), "utf8");
  await fs.writeFile(`${outDir}/owner_question_bank_${target}.jsonl`, toJsonl(bankTarget), "utf8");

  const md = [
    `# Banco owner-friendly (${target})`,
    "",
    `- Generado: ${summary.generated_at}`,
    `- Base: ${base300.length}`,
    `- Target: ${summary.generated}`,
    `- Anos variante: ${years.join(", ")}`,
    "",
    "## Regla anti-alucinacion",
    `- ${OWNER_ANTI_HALLUCINATION_RULE}`,
    "",
    "## Contrato de respuesta",
    "- Respuesta corta (1-2 lineas)",
    "- Calculo/formula usada",
    "- Datos usados (ano, rubros, fuente)",
    "- Interpretacion",
    "- Accion recomendada",
    "- Si falta dato: Dato no disponible + faltante + proxy",
    "",
    "## Distribucion por categoria",
    ...Object.entries(summary.categories).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Distribucion por fuente esperada",
    ...Object.entries(summary.source_counts).map(([k, v]) => `- ${k}: ${v}`)
  ].join("\n");

  await fs.writeFile(`${outDir}/reporte_owner_question_bank_${target}.md`, md, "utf8");

  return {
    summary,
    files: [
      `${outDir}/owner_question_bank_300.json`,
      `${outDir}/owner_question_bank_300.jsonl`,
      `${outDir}/owner_question_bank_${target}.json`,
      `${outDir}/owner_question_bank_${target}.jsonl`,
      `${outDir}/reporte_owner_question_bank_${target}.md`
    ]
  };
}
