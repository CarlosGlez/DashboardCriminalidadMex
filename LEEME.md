# Dashboard de criminalidad en México — estado + municipio

Réplica del proyecto `Jorge0x1/criminalidad`, con un backend propio en Supabase y la extensión a **nivel municipio**.

```
supabase/01_schema.sql      tablas (crimes_municipal, poblacion_estatal) y seguridad
supabase/02_functions.sql   funciones RPC: filter_options, municipios_by_entidad, crime_summary
supabase/03..05_*.sql       optimizaciones de rendimiento de crime_summary (vistas materializadas, índices)
supabase/06_map.sql         RPC map_municipios: total de todos los municipios de un estado (mapa)
supabase/07_municipios_fix.sql  municipios_by_entidad lee la vista (evita error 500 en estados grandes)
supabase/08_coverage.sql    RPC data_coverage: estados/años con datos anómalos (incompletos o con cambios bruscos de reporte)
supabase/09_municipios_anio.sql  RPC municipios_anio: total por año de todos los municipios de un estado (tabla y gráfica de comparativas)
scripts/prepare_data.py     limpia el CSV municipal del SESNSP y lo deja listo para importar
scripts/prepare_geo.mjs     baja y simplifica las geometrías de INEGI -> dashboard/public/geo/
dashboard/                  frontend React + TypeScript + Vite (filtros, mapa coroplético y ranking de municipios)
```

## 1. De dónde salen los datos

**Incidencia delictiva (municipal):** SESNSP – Datos abiertos de incidencia delictiva.
- Página oficial: https://www.secretariadoejecutivo.gob.mx/incidencia-delictiva/incidencia-delictiva-datos-abiertos.php
- Copia en el portal de datos abiertos: https://www.datos.gob.mx/dataset/incidencia_delictiva
- Descarga el archivo de **incidencia delictiva del fuero común, nivel MUNICIPAL, nueva metodología** (CSV, de 2015 en adelante) y su diccionario de datos.
- Ojo: el dataset de datamx.io (2011-2019, "metodología anterior") está desactualizado. No lo uses.
- El archivo viene en formato ancho (una columna por mes) y con subtipo y modalidad. `prepare_data.py` los suma y deja una fila por (año, municipio, tipo de delito).

**Población (para la tasa por 100,000 habitantes) — opcional por hoy:**
- Por estado: CONAPO, proyecciones de población (igual que el proyecto original). Cárgalo en `poblacion_estatal`.
- Por municipio: INEGI Censo 2020 o proyecciones municipales de CONAPO. Esto sería la mejora para después; hoy la tasa solo se calcula a nivel estado y nacional.

Si la tabla de población está vacía, el dashboard funciona igual y muestra "Sin datos de población" en la tasa.

## 2. Puesta en marcha (≈ 20 min)

1. **Supabase:** crea un proyecto nuevo. En *SQL Editor* ejecuta `01_schema.sql` y luego `02_functions.sql`.
2. **Datos:** limpia el CSV (usa `--hasta 2025` para que no entre un año incompleto, porque el crecimiento compara primer y último año del rango):
   ```
   python scripts/prepare_data.py ARCHIVO_SESNSP_MUNICIPAL.csv crimes_municipal.csv --desde 2015 --hasta 2025
   ```
   Si no encuentra columnas, te imprime las que trae tu archivo.
3. **Importar:** en Supabase, *Table Editor → crimes_municipal → Import data from CSV*. Si el archivo es muy grande para el navegador, usa `psql` con:
   ```
   \copy crimes_municipal(anio,cve_ent,entidad,cve_mun,municipio,tipo_delito,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12) from 'crimes_municipal.csv' csv header
   ```
4. **Rendimiento, mapa y calidad de datos:** con los datos ya importados, ejecuta en el *SQL Editor*, en este orden, `03_performance.sql`, `04_performance_nacional.sql`, `05_fix_tipo_delito.sql`, `06_map.sql`, `07_municipios_fix.sql`, `08_coverage.sql` y `09_municipios_anio.sql`. Sin 03-05 la consulta principal da *statement timeout* con el rol `anon`; 06-09 los usan el mapa, el filtro de Municipio, los avisos de calidad y las comparativas de municipios. Las vistas materializadas se crean con los datos que haya en ese momento: si las creaste antes de importar, o cargas datos nuevos después, refréscalas (ver sección 4).
5. **Frontend:**
   ```
   cd dashboard
   cp .env.example .env      # pega tu URL y tu publishable key (Project Settings → API)
   npm install
   npm run dev
   ```
6. **Deploy (Vercel):** importa el repo, carpeta `dashboard`, y agrega las dos variables de entorno.

## 3. Qué cambió respecto al original

- Filtro **Municipio** (depende del estado elegido) y ranking **Top municipios** (del estado, o Top 15 del país).
- `crime_summary` recibe `p_municipio` y devuelve `by_municipio`.
- Las tablas no se pueden leer directo desde el navegador (RLS activado); solo las funciones RPC.
- El ranking por tasa por 100k solo aparece cuando hay población cargada.
- Municipios con el mismo nombre en distintos estados se distinguen por su clave INEGI (`cve_mun`).

## 4. Mapa coroplético

- Sin estado elegido: mapa de estados (total o tasa por 100k). Con estado: mapa de sus municipios (total). Clic para filtrar.
- Ejecuta en el SQL Editor, en orden, `06_map.sql`, `07_municipios_fix.sql` y `08_coverage.sql` (después de 05). Los tres son idempotentes y leen las vistas materializadas: tras cargar datos nuevos corre `refresh materialized view concurrently` en `crimes_entidad_anio` y `crimes_municipio_anio`.
- Geometrías: Marco Geoestadístico de INEGI (servicio `gaia.inegi.org.mx/wscatgeo`, versión diciembre 2025), simplificadas con mapshaper. Se regeneran con `node scripts/prepare_geo.mjs` (solo se versionan los `.topo.json` de `dashboard/public/geo/`; los originales van a `geo_raw/`, ignorada por git).
- Los municipios se unen por `cve_mun` (clave INEGI) y los estados por nombre (coincide exactamente con el de INEGI).
- Delitos sin municipio (`No Especificado` / `Otros Municipios`, claves 998/999) no se pueden dibujar: el mapa muestra cuántos son.
- **Calidad de datos:** algunos estados tienen años con datos incompletos o cambios bruscos de reporte. `data_coverage()` (08) marca un (estado, año) como anómalo si: ≥10% de sus delitos van a claves 998/999; o su total es ≥3× / ≤1/3 de la mediana de sus años; o está entre 2× y 3× (o su inverso) de la mediana y además difiere ≥1.5× de un año vecino (así no marca ascensos graduales); o es parte de un bloque inicial con total <0.6× el del año siguiente. Los clasifica en `arranque` (bloque inicial: Oaxaca 2015-2017, Colima 2015-2016; con «completo desde»), `puntual` (un año aislado: Quintana Roo 2016) e `inestable` (Campeche 2021-2025, Yucatán 2015-2017 y 2022: serie no comparable). El dashboard avisa en el mapa, en los KPI de variación y tasa y en Interpretación. Del ranking de crecimiento por estado se excluye a un estado `inestable` si el rango incluye cualquier año anómalo, y a uno `arranque`/`puntual` solo si el primer o el último año del rango es anómalo. Límites: no detecta un último año incompleto; no distingue un cambio de nivel real de un cambio de reporte (p. ej. Nayarit desde 2022, que no se marca); la gráfica de ranking de tasa por estado no lleva nota propia.

## 5. Comparativas

- **Letrero «Analizando:»** bajo los filtros con tipo de delito, estado, municipio y periodo.
- **Año contra año:** cada año activo contra el más reciente (diferencia, % de cambio y tooltip por mes). Si a un año le faltan meses, compara solo los meses que ambos tienen. Avisa con ⚠ si hay años atípicos (`data_coverage`).
- **Tabla de municipios y gráfica municipio vs. municipio** (requieren estado): salen de una sola llamada a `municipios_anio` (09), que devuelve `[{cve_mun, municipio, anio, total}]` de todos los municipios del estado. Sin tipo de delito lee la vista `crimes_municipio_anio`; con tipo, el índice cubridor `(tipo_delito, anio)` de 05, igual que `map_municipios` (06). Todo lo demás (diferencias, % de cambio, total del periodo, orden, top 20) se calcula en el cliente; se excluyen las claves 998/999. Idempotente; no crea índices ni vistas.
- **Pastel de delitos por tipo:** top 6 + «Otros», junto a la barra por tipo.

## 6. Pendiente / mejoras para la entrega

- Población municipal para la tasa por 100k a nivel municipio.
- Actualización mensual de los datos (el SESNSP publica cada mes).
