-- ============================================================
-- 03_performance.sql
-- Optimiza crime_summary (statement timeout del rol anon).
-- Ejecutar en el SQL Editor DESPUÉS de 01_schema.sql y 02_functions.sql.
-- Es idempotente: se puede correr varias veces.
-- NO modifica 01 ni 02; reemplaza la función crime_summary (misma firma,
-- mismo JSON de salida).
--
-- Cambios:
--   1. Índices para los filtros reales (cve_mun, anio) y (entidad, anio, tipo_delito).
--   2. Vista materializada crimes_entidad_anio (anio, entidad, tipo_delito, m01..m12, total):
--      ~decenas de miles de filas en vez de ~1M. Se usa para todo lo que no
--      necesita detalle municipal (total, trend, by_tipo, by_entidad, growth, tasa).
--   3. tasa_by_entidad se omite (y no escanea nada) si no hay población cargada.
--   4. by_municipio es lo único que sigue leyendo crimes_municipal, y lo hace
--      con índice (entidad/cve_mun + anio).
--
-- IMPORTANTE: la vista materializada NO se actualiza sola. Después de cargar
-- o modificar crimes_municipal corre:
--     refresh materialized view concurrently public.crimes_entidad_anio;
-- ============================================================

-- ---------- 1. Índices ----------
-- Municipio + rango de años (+ tipo para poder filtrar sin ir al heap de más)
create index if not exists crimes_municipal_mun_anio_tipo_idx
  on public.crimes_municipal (cve_mun, anio, tipo_delito);

-- Estado + rango de años + tipo (by_municipio de un estado, con o sin tipo)
create index if not exists crimes_municipal_ent_anio_tipo_idx
  on public.crimes_municipal (entidad, anio, tipo_delito);

-- ---------- 2. Agregado por (año, estado, tipo de delito) ----------
create materialized view if not exists public.crimes_entidad_anio as
select
  anio,
  entidad,
  tipo_delito,
  sum(m01)::bigint as m01, sum(m02)::bigint as m02, sum(m03)::bigint as m03,
  sum(m04)::bigint as m04, sum(m05)::bigint as m05, sum(m06)::bigint as m06,
  sum(m07)::bigint as m07, sum(m08)::bigint as m08, sum(m09)::bigint as m09,
  sum(m10)::bigint as m10, sum(m11)::bigint as m11, sum(m12)::bigint as m12,
  sum(total)::bigint as total
from public.crimes_municipal
group by anio, entidad, tipo_delito;

-- Requerido para REFRESH ... CONCURRENTLY
create unique index if not exists crimes_entidad_anio_pk
  on public.crimes_entidad_anio (anio, entidad, tipo_delito);
create index if not exists crimes_entidad_anio_ent_idx
  on public.crimes_entidad_anio (entidad, anio);

-- Las vistas materializadas no usan RLS: que no sean legibles desde la API.
-- (crime_summary es security definer, así que sí puede leerla.)
revoke all on public.crimes_entidad_anio from public, anon, authenticated;

-- ---------- 3. crime_summary optimizada ----------
create or replace function public.crime_summary(
  p_anio_desde  int,
  p_anio_hasta  int,
  p_entidad     text default null,
  p_tipo_delito text default null,
  p_municipio   int  default null      -- cve_mun; requiere p_entidad
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_span       int := p_anio_hasta - p_anio_desde + 1;
  v_prev_desde int := p_anio_desde - (p_anio_hasta - p_anio_desde + 1);
  v_prev_hasta int := p_anio_desde - 1;
  v_prev       bigint;
  v_pob_prom   numeric;
  v_tasa_ent   jsonb := '[]'::jsonb;
  v_result     jsonb;
begin
  -- Total del periodo anterior: municipio -> tabla base (índice cve_mun, anio);
  -- estado / nacional -> agregado (pocas filas).
  if p_municipio is not null then
    select coalesce(sum(c.total), 0) into v_prev
    from crimes_municipal c
    where c.cve_mun = p_municipio
      and c.anio between v_prev_desde and v_prev_hasta
      and (p_entidad     is null or c.entidad     = p_entidad)
      and (p_tipo_delito is null or c.tipo_delito = p_tipo_delito);
  else
    select coalesce(sum(a.total), 0) into v_prev
    from crimes_entidad_anio a
    where a.anio between v_prev_desde and v_prev_hasta
      and (p_entidad     is null or a.entidad     = p_entidad)
      and (p_tipo_delito is null or a.tipo_delito = p_tipo_delito);
  end if;

  -- Población promedio del alcance (solo a nivel estado / nacional)
  select avg(s.pob) into v_pob_prom
  from (
    select p.anio, sum(p.poblacion) as pob
    from poblacion_estatal p
    where p.anio between p_anio_desde and p_anio_hasta
      and (p_entidad is null or p.entidad = p_entidad)
    group by p.anio
  ) s;

  -- Tasa por 100k de TODOS los estados. Solo se calcula si hay población
  -- para el rango; si no, queda '[]' sin tocar ninguna tabla de delitos.
  if exists (select 1 from poblacion_estatal
             where anio between p_anio_desde and p_anio_hasta) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'entidad', entidad, 'total', total,
             'poblacion_promedio', round(pob), 'tasa', tasa) order by tasa desc), '[]'::jsonb)
    into v_tasa_ent
    from (
      select s.entidad, s.total, p.pob,
             round(s.total::numeric / v_span / p.pob * 100000, 1) as tasa
      from (
        select a.entidad, sum(a.total)::bigint as total
        from crimes_entidad_anio a
        where a.anio between p_anio_desde and p_anio_hasta
          and (p_tipo_delito is null or a.tipo_delito = p_tipo_delito)
        group by a.entidad
      ) s
      join (
        select entidad, avg(poblacion)::numeric as pob
        from poblacion_estatal
        where anio between p_anio_desde and p_anio_hasta
        group by entidad
      ) p using (entidad)
    ) t;
  end if;

  with scope as materialized (
    -- Sin municipio: agregado por estado (muy pequeño).
    select a.anio, a.entidad, a.tipo_delito,
           a.m01, a.m02, a.m03, a.m04, a.m05, a.m06,
           a.m07, a.m08, a.m09, a.m10, a.m11, a.m12, a.total
    from crimes_entidad_anio a
    where p_municipio is null
      and a.anio between p_anio_desde and p_anio_hasta
      and (p_entidad     is null or a.entidad     = p_entidad)
      and (p_tipo_delito is null or a.tipo_delito = p_tipo_delito)
    union all
    -- Con municipio: tabla base por (cve_mun, anio).
    select c.anio, c.entidad, c.tipo_delito,
           c.m01, c.m02, c.m03, c.m04, c.m05, c.m06,
           c.m07, c.m08, c.m09, c.m10, c.m11, c.m12, c.total
    from crimes_municipal c
    where p_municipio is not null
      and c.cve_mun = p_municipio
      and c.anio between p_anio_desde and p_anio_hasta
      and (p_entidad     is null or c.entidad     = p_entidad)
      and (p_tipo_delito is null or c.tipo_delito = p_tipo_delito)
  )
  select jsonb_build_object(
    'total', coalesce((select sum(total) from scope), 0),
    'prev_total', v_prev,
    'poblacion_promedio', v_pob_prom,
    -- con un municipio seleccionado no hay población municipal: tasa = null
    'tasa_100k', case when v_pob_prom is not null and p_municipio is null
                      then round((select sum(total) from scope)::numeric / v_span / v_pob_prom * 100000, 1) end,

    'trend', coalesce((
      select jsonb_agg(jsonb_build_object('anio', anio, 'mes', mes, 'total', total) order by anio, mes)
      from (
        select s.anio, m.mes, sum(m.val)::bigint as total
        from scope s
        cross join lateral (values
          (1, s.m01), (2, s.m02), (3, s.m03), (4, s.m04), (5, s.m05), (6, s.m06),
          (7, s.m07), (8, s.m08), (9, s.m09), (10, s.m10), (11, s.m11), (12, s.m12)
        ) as m(mes, val)
        group by s.anio, m.mes
      ) t
    ), '[]'::jsonb),

    'by_tipo', coalesce((
      select jsonb_agg(jsonb_build_object('tipo_delito', tipo_delito, 'total', total) order by total desc)
      from (select tipo_delito, sum(total)::bigint as total from scope group by tipo_delito) t
    ), '[]'::jsonb),

    'by_entidad', coalesce((
      select jsonb_agg(jsonb_build_object('entidad', entidad, 'total', total) order by total desc)
      from (select entidad, sum(total)::bigint as total from scope group by entidad) t
    ), '[]'::jsonb),

    -- Top 15 municipios del alcance (del estado elegido, o del país).
    -- Única parte que necesita detalle municipal: lee la tabla base con índice.
    'by_municipio', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cve_mun', cve_mun, 'municipio', municipio, 'entidad', entidad, 'total', total)
             order by total desc)
      from (
        select c.cve_mun, c.municipio, c.entidad, sum(c.total)::bigint as total
        from crimes_municipal c
        where c.anio between p_anio_desde and p_anio_hasta
          and (p_entidad     is null or c.entidad     = p_entidad)
          and (p_municipio   is null or c.cve_mun     = p_municipio)
          and (p_tipo_delito is null or c.tipo_delito = p_tipo_delito)
        group by c.cve_mun, c.municipio, c.entidad
        order by total desc
        limit 15
      ) t
    ), '[]'::jsonb),

    'tasa_by_entidad', v_tasa_ent,

    -- Crecimiento primer año vs último año del rango, por tipo de delito
    'tipo_growth', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tipo_delito', tipo_delito, 'total_desde', desde, 'total_hasta', hasta,
               'growth_pct', case when desde > 0 then round((hasta - desde)::numeric / desde * 100, 1) end)
             order by case when desde > 0 then (hasta - desde)::numeric / desde end desc nulls last)
      from (
        select tipo_delito,
               coalesce(sum(total) filter (where anio = p_anio_desde), 0)::bigint as desde,
               coalesce(sum(total) filter (where anio = p_anio_hasta), 0)::bigint as hasta
        from scope group by tipo_delito
      ) t
    ), '[]'::jsonb),

    -- Crecimiento primer año vs último año del rango, por estado
    'entidad_growth', coalesce((
      select jsonb_agg(jsonb_build_object(
               'entidad', entidad, 'total_desde', desde, 'total_hasta', hasta,
               'growth_pct', case when desde > 0 then round((hasta - desde)::numeric / desde * 100, 1) end)
             order by case when desde > 0 then (hasta - desde)::numeric / desde end desc nulls last)
      from (
        select entidad,
               coalesce(sum(total) filter (where anio = p_anio_desde), 0)::bigint as desde,
               coalesce(sum(total) filter (where anio = p_anio_hasta), 0)::bigint as hasta
        from scope group by entidad
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.crime_summary(int, int, text, text, int)     from public;
grant execute on function public.crime_summary(int, int, text, text, int)  to anon, authenticated;

-- ---------- 4. Estadísticas frescas ----------
analyze public.crimes_municipal;
analyze public.crimes_entidad_anio;
