# Dashboard de criminalidad en México — estado + municipio

Réplica del proyecto `Jorge0x1/criminalidad`, con un backend propio en Supabase y la extensión a **nivel municipio**.

```
supabase/01_schema.sql      tablas (crimes_municipal, poblacion_estatal) y seguridad
supabase/02_functions.sql   funciones RPC: filter_options, municipios_by_entidad, crime_summary
scripts/prepare_data.py     limpia el CSV municipal del SESNSP y lo deja listo para importar
dashboard/                  frontend React + TypeScript + Vite (filtro y ranking de municipios)
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
4. **Frontend:**
   ```
   cd dashboard
   cp .env.example .env      # pega tu URL y tu publishable key (Project Settings → API)
   npm install
   npm run dev
   ```
5. **Deploy (Vercel):** importa el repo, carpeta `dashboard`, y agrega las dos variables de entorno.

## 3. Qué cambió respecto al original

- Filtro **Municipio** (depende del estado elegido) y ranking **Top municipios** (del estado, o Top 15 del país).
- `crime_summary` recibe `p_municipio` y devuelve `by_municipio`.
- Las tablas no se pueden leer directo desde el navegador (RLS activado); solo las funciones RPC.
- El ranking por tasa por 100k solo aparece cuando hay población cargada.
- Municipios con el mismo nombre en distintos estados se distinguen por su clave INEGI (`cve_mun`).

## 4. Pendiente / mejoras para la entrega

- Población municipal para la tasa por 100k a nivel municipio.
- Mapa por municipio (requiere GeoJSON municipal de INEGI).
- Actualización mensual de los datos (el SESNSP publica cada mes).
