-- ============================================================
-- 08_coverage.sql
-- data_coverage(): estados y años con datos ANÓMALOS (incompletos o con cambios
-- bruscos de reporte).
-- Ejecutar DESPUÉS de 04 (usa crimes_municipio_anio). Idempotente: se puede
-- volver a correr (ya se corrieron versiones anteriores; esta las reemplaza).
-- NO modifica crime_summary ni ninguna otra función.
--
-- 1) Un (estado, año) es ANÓMALO si cumple cualquiera de estos criterios:
--    a. sin_municipio: >= p_umbral_pct % (10) de sus delitos van a claves sin
--       municipio (cve_mun terminado en 998 "No Especificado" o 999 "Otros
--       Municipios").
--    b. fuera de la mediana, fuerte: su total es >= p_fuerte (3) veces o
--       <= 1/p_fuerte de la mediana de los años del estado.
--    c. fuera de la mediana, moderado: entre p_moderada (2) y p_fuerte veces la
--       mediana (o su inverso) Y además ese año difiere >= p_salto (1.5) veces
--       de un año vecino. Sirve para no marcar ascensos o descensos graduales
--       (San Luis Potosí 2015, Nayarit 2021-2025).
--    d. arranque: desde el primer año, mientras su total sea < p_ratio_arranque
--       (0.6) veces el del año siguiente (Colima 2016: 13,226 vs 24,425).
--
-- 2) Cada estado con años anómalos se clasifica en uno de tres tipos:
--    'arranque'  todos los anómalos son un bloque pegado al primer año
--                (Oaxaca 2015-2017, Colima 2015-2016). Tiene anio_completo_desde.
--    'puntual'   un solo año anómalo aislado (Quintana Roo 2016).
--    'inestable' dos o más años anómalos que no son solo el bloque inicial
--                (Campeche 2021-2025, Yucatán 2015-2017 y 2022). Serie con cambios
--                bruscos de reporte: NO se da anio_completo_desde (sería engañoso).
--
-- Con los datos cargados (simulado y probado con las series reales):
--   arranque : Colima [2015, 2016], Oaxaca [2015, 2016, 2017]
--   puntual  : Quintana Roo [2016]
--   inestable: Campeche [2021..2025], Yucatán [2015, 2016, 2017, 2022]
--   sin marcar: los demás (incluidos Nayarit y San Luis Potosí).
--
-- Límites: la mediana de pocos años puede caer en cualquiera de dos niveles
-- parecidos (Yucatán): el estado se marca igual, pero qué años son "los raros"
-- es ambiguo. No hay forma de saber con estos datos si un cambio de nivel es
-- real o un cambio de reporte.
--
-- Devuelve solo los estados con algún año anómalo:
--   [{"entidad": "Oaxaca", "tipo": "arranque",
--     "anios_anomalos": [2015, 2016, 2017],
--     "anio_completo_desde": 2018,           -- solo en 'arranque', si no null
--     "anios_sin_municipio": [2015, 2016, 2017],
--     "pct_sin_max": 30.9},                  -- peor % sin municipio; null si no aplica
--    ...]
-- Si ningún estado tiene años anómalos devuelve '[]'.
--
-- El frontend lo usa para: avisos en el mapa, KPIs (variación y tasa), excluir
-- estados del "estado que más incrementó" y notas en Interpretación.
--
-- IMPORTANTE: lee la vista materializada; tras cargar datos nuevos refrescar
--     refresh materialized view concurrently public.crimes_municipio_anio;
-- ============================================================

-- Versiones anteriores con otra firma: con varias conviviendo, PostgREST no
-- sabría cuál llamar cuando el frontend no manda argumentos.
drop function if exists public.data_coverage(numeric);
drop function if exists public.data_coverage(numeric, numeric);

create or replace function public.data_coverage(
  p_umbral_pct     numeric default 10,
  p_fuerte         numeric default 3,
  p_moderada       numeric default 2,
  p_salto          numeric default 1.5,
  p_ratio_arranque numeric default 0.6
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with por_anio as (
    select m.entidad, m.anio,
           sum(m.total)::numeric as total,
           coalesce(sum(m.total) filter (where m.cve_mun % 1000 >= 998), 0)::numeric as sin_municipio
    from crimes_municipio_anio m
    group by m.entidad, m.anio
  ),
  med as (
    select p.entidad,
           (percentile_cont(0.5) within group (order by p.total))::numeric as mediana
    from por_anio p
    group by p.entidad
  ),
  vecinos as (
    select p.entidad, p.anio, p.total, p.sin_municipio, md.mediana,
           lag(p.total)  over w as total_prev, lag(p.anio)  over w as anio_prev,
           lead(p.total) over w as total_sig,  lead(p.anio) over w as anio_sig
    from por_anio p
    join med md on md.entidad = p.entidad
    window w as (partition by p.entidad order by p.anio)
  ),
  evaluado as (
    select v.*,
           v.total / nullif(v.mediana, 0) as ratio_mediana,
           -- cambio más fuerte contra un año vecino (consecutivo)
           greatest(
             case when v.anio_sig  = v.anio + 1 and v.total > 0 and v.total_sig  > 0
                  then greatest(v.total / v.total_sig,  v.total_sig  / v.total)  end,
             case when v.anio_prev = v.anio - 1 and v.total > 0 and v.total_prev > 0
                  then greatest(v.total / v.total_prev, v.total_prev / v.total)  end
           ) as salto,
           (v.total > 0 and 100.0 * v.sin_municipio / v.total >= p_umbral_pct) as por_sin_municipio,
           (v.anio_sig = v.anio + 1 and v.total < p_ratio_arranque * v.total_sig) as cond_arranque
    from vecinos v
  ),
  cadena as (
    -- true mientras TODOS los años desde el primero cumplan cond_arranque
    select e.*,
           bool_and(e.cond_arranque) over (
             partition by e.entidad order by e.anio
             rows between unbounded preceding and current row) as en_cadena
    from evaluado e
  ),
  marcado as (
    select c.*,
           (   c.por_sin_municipio
            or c.ratio_mediana >= p_fuerte or c.ratio_mediana <= 1 / p_fuerte
            or ((c.ratio_mediana > p_moderada or c.ratio_mediana < 1 / p_moderada)
                and coalesce(c.salto, 0) >= p_salto)
            or (coalesce(c.en_cadena, false) and coalesce(c.cond_arranque, false))
           ) as anomalo
    from cadena c
  ),
  prefijo as (
    -- true mientras TODOS los años desde el primero sean anómalos (bloque inicial)
    select k.*,
           bool_and(k.anomalo) over (
             partition by k.entidad order by k.anio
             rows between unbounded preceding and current row) as en_prefijo
    from marcado k
  ),
  resumen as (
    select x.entidad,
           count(*) filter (where x.anomalo)                         as n_anomalos,
           count(*) filter (where x.anomalo and not x.en_prefijo)    as n_fuera_prefijo,
           jsonb_agg(x.anio order by x.anio) filter (where x.anomalo) as anios_anomalos,
           coalesce(jsonb_agg(x.anio order by x.anio) filter (where x.por_sin_municipio), '[]'::jsonb)
                                                                     as anios_sin_municipio,
           round(max(100.0 * x.sin_municipio / x.total) filter (where x.por_sin_municipio), 1)
                                                                     as pct_sin_max,
           max(x.anio) filter (where x.anomalo)                      as ultimo_anomalo
    from prefijo x
    group by x.entidad
    having bool_or(x.anomalo)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'entidad', r.entidad,
           'tipo', case when r.n_fuera_prefijo = 0 then 'arranque'
                        when r.n_anomalos = 1      then 'puntual'
                        else 'inestable' end,
           'anios_anomalos', r.anios_anomalos,
           'anio_completo_desde', case when r.n_fuera_prefijo = 0 then r.ultimo_anomalo + 1 end,
           'anios_sin_municipio', r.anios_sin_municipio,
           'pct_sin_max', r.pct_sin_max) order by r.entidad), '[]'::jsonb)
  from resumen r;
$$;

revoke all on function public.data_coverage(numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.data_coverage(numeric, numeric, numeric, numeric, numeric) to anon, authenticated;
