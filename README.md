# Analizador de Empresas (Supersociedades)

Aplicacion de escritorio en Python para analizar empresas colombianas consultando:
- Busqueda oficial en Supersociedades (`superwas.supersociedades.gov.co`) por NIT o razon social.
- Estados financieros NIIF oficiales publicados en `datos.gov.co` (Superintendencia de Sociedades).

La app calcula y visualiza (por ano) los indicadores solicitados:
- Ingresos
- Utilidad neta
- EBITDA
- Gastos operacionales
- Capital neto de trabajo
- Deuda
- Dias de capital de trabajo
- Balance general
- Flujo de caja
- Z-Altman (Zaltam)

Ademas genera explicaciones amigables e informes en Excel/PDF guardados automaticamente en el Escritorio del usuario.

## Compartir por URL (frontend + backend)

Si quieres compartir la herramienta por enlace web (sin `file:///`), revisa:

- `DEPLOY_WEB_SHARE.md` (paso a paso completo).
- `.env.example` (variables de entorno para backend).
- `render.yaml` (plantilla de despliegue backend en Render).

## Arquitectura

```text
+---------------------------------------------------------------+
|                         UI Desktop                            |
|      CustomTkinter + Matplotlib + Treeview + Export           |
+--------------------------+------------------------------------+
                           |
                           v
+---------------------------------------------------------------+
|                      AnalysisService                          |
|   Orquesta busqueda -> descarga -> normalizacion -> calculo   |
+------------+-----------------------+--------------------------+
             |                       |
             v                       v
+------------------------+   +-------------------------------+
| SupersocSearchService  |   | SocrataFinancialService       |
| POST ConsultaGeneral   |   | GET datos.gov.co resource API |
+------------------------+   +-------------------------------+
             \                       /
              \                     /
               v                   v
          +-----------------------------------+
          | DataNormalizer + Financial Engine |
          | concept mapping, KPI, Z-Altman    |
          +-----------------------------------+
                           |
                           v
                +------------------------+
                | ExplanationService     |
                +------------------------+
                           |
                           v
                +------------------------+
                | ReportExporter         |
                | Excel + PDF + charts   |
                +------------------------+
```

## Fuente de datos y estrategia

1. **Busqueda empresa por NIT/nombre**
   - Endpoint: `https://superwas.supersociedades.gov.co/ConsultaGeneralSociedadesWeb/ConsultaGeneral`
   - POST:
     - `action=consultaPorNit` + `nit=...`
     - `action=consultaPorRazonSocial` + `razonSocial=...`
2. **Estados financieros NIIF por NIT (datos abiertos oficiales)**
   - Estado de situacion financiera: dataset `pfdp-zks5`
   - Estado de resultado integral: dataset `prwj-nzxa`
   - Estado de flujo efectivo: dataset `ctcp-462n`
   - Endpoint base: `https://www.datos.gov.co/resource/{dataset_id}.json`
3. **Normalizacion**
   - Selecciona el valor mas confiable por ano/concepto priorizando `Periodo Actual`.
   - Toma ultimos 7 anos disponibles.
   - Tolerante a cambios de etiquetas mediante patrones (exact + contains).

## Estructura del proyecto

```text
app/
  main.py
  config.py
  core/
    exceptions.py
    logging_config.py
    paths.py
  finance/
    indicators.py
  models/
    entities.py
  services/
    analysis_service.py
    data_normalizer.py
    explanation_service.py
    report_exporter.py
    socrata_financials.py
    supersoc_search.py
  ui/
    app_window.py
    theme.py
  utils/
    numbers.py
    text.py
scripts/
  run.ps1
  install_to_desktop.ps1
  package.ps1
tests/
  test_indicators.py
  test_paths.py
requirements.txt
```

## Instalacion y ejecucion

### Opcion 1: correr localmente desde el repo

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.main
```

### Opcion 2: copiar e instalar en Escritorio automaticamente

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_to_desktop.ps1
```

Esto copia el proyecto a:
- `Desktop/AnalizadorEmpresasSupersociedades`

Y crea:
- `Iniciar_Analizador.bat`

### Reportes

La app guarda por defecto en:
- `Desktop/AnalizadorEmpresasSupersociedades/reportes`

## Empaquetado a ejecutable (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1
```

Genera:
- `AnalizadorEmpresasSupersociedades.exe`

Y lo copia a:
- `Desktop/AnalizadorEmpresasSupersociedades`

### Instalador tipo setup (opcional, Inno Setup)

1. Genera primero el `.exe` con `scripts/package.ps1`.
2. Abre `scripts/installer_windows.iss` en Inno Setup.
3. Compila el instalador.

Resultado:
- `dist/Instalador_AnalizadorEmpresasSupersociedades.exe`

## Pruebas

```powershell
.\.venv\Scripts\Activate.ps1
pytest -q
```

## Notas financieras

- Z-Altman implementado con formula Z'' (mercados emergentes/no manufactureras):
  - `Z = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4`
  - `X1 = Capital de trabajo / Activos totales`
  - `X2 = Ganancias acumuladas / Activos totales`
  - `X3 = EBIT / Activos totales`
  - `X4 = Patrimonio / Pasivos totales`
- Si faltan rubros en algun ano, la app lo reporta en la pestana `Mensajes`.

## Manejo de errores incorporado

- Empresa no encontrada.
- NIT invalido.
- Caida de conexion (Supersociedades o datos.gov.co).
- Datos incompletos por ano.
- Cambios de formato (parser con validaciones y errores explicitos).
