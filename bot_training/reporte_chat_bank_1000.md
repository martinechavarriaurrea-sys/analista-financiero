# Banco de chats multi-turn 1000

- Generado: 2026-02-23T00:22:49.196Z
- Chats: 1000
- Nucleo completo: 60
- Familias de plantilla: 3
- Anos base: 2020, 2021, 2022, 2023, 2024, 2025

## Estructura estandar
- ChatID
- Contexto (empresa + 6 anos + portal)
- U1/B1, U2/B2, U3/B3
- Regla anti-alucinacion: Si falta dato interno y portal no lo trae, responder: 'Dato no disponible', indicar faltante exacto y proxy recomendado.

## Distribucion por tipo
- growth: 6
- profitability: 7
- cashflow_wcm: 12
- debt_risk: 11
- valuation: 5
- credit_decision: 5
- external_benchmark: 2
- accounting_policy: 1
- quality_of_earnings: 1
- net_income_tax: 1
- scenario: 5
- planning: 4
- metric_causa_accion: 940

## Distribucion por fuente esperada
- interno: 991
- interno+portal: 9

## Contrato de respuesta
- Respuesta corta (1-2 lineas)
- Calculo/formula usada
- Datos usados (ano, rubros, fuente)
- Interpretacion
- Accion recomendada
- Si falta dato: Dato no disponible + faltante + proxy