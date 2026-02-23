# QA Full Validation Suite

- Fecha: 2026-02-20T13:31:14.249Z
- Empresas reales analizadas: 300
- Casos reales (empresa-anio): 900
- Escenarios borde: 8

## Resultado global
- Outputs no finitos (NaN/Inf): 0
- Mismatch core vs recomputacion manual (ratios): 2
- Mismatch core vs recomputacion manual (checks): 0
- Cambios before vs after en Deuda/EBITDA: 900
- Warnings de fallback: 897

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
- NIT 900328533, anio 2024: nuevo=3.5920 legacy=5.0221 delta=-1.4302
- NIT 900328533, anio 2023: nuevo=5.7767 legacy=7.3104 delta=-1.5337
- NIT 900328533, anio 2022: nuevo=1.7272 legacy=3.2776 delta=-1.5505
- NIT 890304403, anio 2024: nuevo=0.4080 legacy=3.0063 delta=-2.5983
- NIT 890304403, anio 2023: nuevo=0.3739 legacy=2.4504 delta=-2.0766
- NIT 890304403, anio 2022: nuevo=0.2648 legacy=2.0000 delta=-1.7352
- NIT 860054073, anio 2024: nuevo=1.1298 legacy=2.9691 delta=-1.8393
- NIT 860054073, anio 2023: nuevo=4.2871 legacy=9.4807 delta=-5.1935
- NIT 860054073, anio 2022: nuevo=1.9957 legacy=3.9795 delta=-1.9838
- NIT 890301443, anio 2024: nuevo=0.0000 legacy=0.0449 delta=-0.0449
- NIT 890301443, anio 2023: nuevo=1.2416 legacy=1.5464 delta=-0.3048
- NIT 890301443, anio 2022: nuevo=1.6227 legacy=2.0920 delta=-0.4693
- NIT 860000656, anio 2024: nuevo=1.9808 legacy=5.3099 delta=-3.3291
- NIT 860000656, anio 2023: nuevo=1.7854 legacy=4.5664 delta=-2.7810
- NIT 860000656, anio 2022: nuevo=1.2247 legacy=4.0036 delta=-2.7789
- NIT 860072045, anio 2024: nuevo=29.6258 legacy=91.7527 delta=-62.1269
- NIT 860072045, anio 2023: nuevo=4.0292 legacy=10.3916 delta=-6.3624
- NIT 860072045, anio 2022: nuevo=3.0762 legacy=9.6778 delta=-6.6016
- NIT 811044853, anio 2024: nuevo=19.2618 legacy=38.5661 delta=-19.3043
- NIT 811044853, anio 2023: nuevo=-10.1182 legacy=-17.2272 delta=7.1090
