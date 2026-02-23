# Arquitectura de Pensamiento del Bot

Esta arquitectura modela un flujo parecido al de una IA: interpreta la pregunta, revisa evidencia, genera hipotesis, prioriza acciones y responde con trazabilidad.

## Flujo cognitivo (5 capas)

1. Intencion
- Detecta el objetivo principal de la pregunta:
  - `improvement_diagnostic`
  - `risk_assessment`
  - `comparison`
  - `formula_explain`
  - `followup_clarification`
  - `financial_reading`

2. Foco y restricciones
- Selecciona ano objetivo y ano comparativo.
- Aplica regla de no acumulacion entre anos si no se pide explicitamente.

3. Evidencia y calidad de datos
- Evalua cobertura de rubros criticos:
  - ingresos, EBITDA, deuda/EBITDA, margen EBITDA, margen neto, flujo operativo.
- Clasifica calidad en `alta`, `media` o `baja`.

4. Hipotesis y priorizacion
- Convierte senales financieras en hipotesis causa -> impacto -> accion.
- Ordena prioridades por severidad (`alta`, `media`, `baja`).

5. Respuesta ejecutiva
- Entrega respuesta en formato fijo:
  - Respuesta corta
  - Calculo/formula
  - Datos usados
  - Interpretacion
  - Accion recomendada
  - Validacion de precision
  - Si falta dato

## Integracion tecnica

- Motor principal: `advisor_server.js`
- Constructor cognitivo: `buildThinkingArchitecture(...)`
- Emision de traza (opcional): `ADVISOR_THINKING_TRACE=1`

## Objetivo operativo

- Evitar respuestas repetitivas o genericas.
- Mantener precision numerica por ano.
- Aumentar accionabilidad aun cuando haya datos incompletos.
