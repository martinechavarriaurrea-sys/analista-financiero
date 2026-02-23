# QA Full Validation Suite

- Fecha: 2026-02-19T22:37:09.326Z
- Empresas reales analizadas: 120
- Casos reales (empresa-anio): 480
- Escenarios borde: 8

## Resultado global
- Outputs no finitos (NaN/Inf): 0
- Mismatch core vs recomputacion manual (ratios): 0
- Mismatch core vs recomputacion manual (checks): 0
- Cambios before vs after en Deuda/EBITDA: 460
- Warnings de fallback: 917

## Edge suite
- Casos borde sin finitos: 0/8
- ingresos_cero: all_finite=true, warnings=4
- ebitda_cero: all_finite=true, warnings=1
- costos_fin_cero: all_finite=true, warnings=1
- deuda_cero: all_finite=true, warnings=0
- ebitda_negativo: all_finite=true, warnings=0
- faltantes: all_finite=true, warnings=8
- cambio_yoy_extremo: all_finite=true, warnings=0
- valores_negativos_multiples: all_finite=true, warnings=0

## Muestras before vs after (Deuda/EBITDA)
- NIT 900328533, anio 2024: nuevo=17.1716 legacy=5.0221 delta=12.1495
- NIT 900328533, anio 2023: nuevo=19.2059 legacy=7.3104 delta=11.8955
- NIT 900328533, anio 2022: nuevo=19.3147 legacy=3.2776 delta=16.0371
- NIT 900328533, anio 2021: nuevo=9.0458 legacy=2.8661 delta=6.1798
- NIT 890304403, anio 2024: nuevo=0.8928 legacy=3.0063 delta=-2.1135
- NIT 890304403, anio 2023: nuevo=0.6762 legacy=2.4504 delta=-1.7742
- NIT 890304403, anio 2022: nuevo=0.7920 legacy=2.0000 delta=-1.2080
- NIT 890304403, anio 2021: nuevo=0.9173 legacy=2.6806 delta=-1.7632
- NIT 860054073, anio 2024: nuevo=2.0973 legacy=2.9691 delta=-0.8718
- NIT 860054073, anio 2023: nuevo=7.8605 legacy=9.4807 delta=-1.6202
- NIT 860054073, anio 2022: nuevo=7.5550 legacy=3.9795 delta=3.5755
- NIT 860054073, anio 2021: nuevo=7.8964 legacy=10.2620 delta=-2.3656
- NIT 890301443, anio 2023: nuevo=2.4832 legacy=1.5464 delta=0.9368
- NIT 890301443, anio 2022: nuevo=8.8386 legacy=2.0920 delta=6.7466
- NIT 890301443, anio 2021: nuevo=2.0977 legacy=1.5601 delta=0.5376
- NIT 860000656, anio 2024: nuevo=1.9808 legacy=5.3099 delta=-3.3291
- NIT 860000656, anio 2023: nuevo=3.5484 legacy=4.5664 delta=-1.0181
- NIT 860000656, anio 2022: nuevo=4.6419 legacy=4.0036 delta=0.6382
- NIT 860000656, anio 2021: nuevo=1.7243 legacy=3.5058 delta=-1.7815
- NIT 860072045, anio 2024: nuevo=59.1050 legacy=91.7527 delta=-32.6476
