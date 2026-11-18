-- ============================================================
-- 05_fix_tipo_delito.sql
-- Arregla el timeout de crime_summary(2015, 2025, null, 'Amenazas', null).
-- Ejecutar DESPUÉS de 04_performance_nacional.sql. Idempotente.
-- No modifica 03 ni 04 (solo agrega un índice y reemplaza crime_summary).
--
-- Diagnóstico (diag.csv): la única parte lenta era by_municipio con tipo de
-- delito (14 s). Usaba el índice correcto (tipo_delito, anio) pero ese índice
-- solo trae las claves: para leer cve_mun, municipio, entidad y total tenía que
-- visitar 19,339 páginas del heap (26,153 filas dispersas por toda la tabla).
-- Un Index Only Scan sobre el mismo índice contaba esas filas en ~30 ms.
-- Además, con plan genérico Postgres elige otro índice (anio, tipo_delito) y
-- filtra ~1M filas: con costo estimado absurdamente bajo (rows=1), por lo que
-- plpgsql podría adoptarlo tras unas llamadas.
--
-- Cambios:
--   1. Índice cubridor (tipo_delito, anio) INCLUDE (cve_mun, municipio, entidad, total)
--      -> by_municipio con tipo se resuelve con Index Only Scan, sin heap.
--   2. set plan_cache_mode = force_custom_plan en la función.
--   3. by_municipio con tipo: consultas separadas, sin "p_x is null or col = p_x".
--   Misma firma y mismo JSON.
--
-- Nacional + tipo de delito: lo ÚNICO que lee crimes_municipal es by_municipio.
-- Todo lo demás sale de crimes_entidad_anio.
-- ============================================================

-- ---------- 1. Índice cubridor ----------
create index if not exists crimes_municipal_tipo_anio_cov_idx
  on public.crimes_municipal (tipo_delito, anio)
  include (cve_mun, municipio, entidad, total);

-- Opcional: el índice (tipo_delito, anio) de 04 queda redundante con este.
-- drop index if exists public.crimes_municipal_tipo_anio_idx;

-- ---------- 2. crime_summary ----------
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
set plan_cache_mode = force_custom_plan
as $$
declare
  v_span       int := p_anio_hasta - p_anio_desde + 1;
  v_prev_desde int := p_anio_desde - (p_anio_hasta - p_anio_desde + 1);
  v_prev_hasta int := p_anio_desde - 1;
  v_prev       bigint;
  v_pob_prom   numeric;
  v_tasa_ent   jsonb := '[]'::jsonb;
  v_by_mun     jsonb;
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

  -- Tasa por 100k de TODOS los estados. Solo si hay población para el rango.
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

  -- Top 15 municipios del alcance (del estado elegido, o del país).
  if p_tipo_delito is null then
    -- Sin tipo: vista crimes_municipio_anio (pocas filas).
    select coalesce(jsonb_agg(jsonb_build_object(
             'cve_mun', cve_mun, 'municipio', municipio, 'entidad', entidad, 'total', total)
           order by total desc), '[]'::jsonb)
    into v_by_mun
    from (
      select m.cve_mun, m.municipio, m.entidad, sum(m.total)::bigint as total
      from crimes_municipio_anio m
      where m.anio between p_anio_desde and p_anio_hasta
        and (p_entidad   is null or m.entidad = p_entidad)
        and (p_municipio is null or m.cve_mun = p_municipio)
      group by m.cve_mun, m.municipio, m.entidad
      order by total desc
      limit 15
    ) t;

  elsif p_municipio is not null then
    -- Tipo + municipio: índice (cve_mun, anio, tipo_delito).
    -- cve_mun ya identifica al estado, no hace falta filtrar entidad.
    select coalesce(jsonb_agg(jsonb_build_object(
             'cve_mun', cve_mun, 'municipio', municipio, 'entidad', entidad, 'total', total)
           order by total desc), '[]'::jsonb)
    into v_by_mun
    from (
      select c.cve_mun, c.municipio, c.entidad, sum(c.total)::bigint as total
      from crimes_municipal c
      where c.cve_mun     = p_municipio
        and c.anio between p_anio_desde and p_anio_hasta
        and c.tipo_delito = p_tipo_delito
      group by c.cve_mun, c.municipio, c.entidad
      order by total desc
      limit 15
    ) t;

  elsif p_entidad is not null then
    -- Tipo + estado: índice (entidad, anio, tipo_delito).
    select coalesce(jsonb_agg(jsonb_build_object(
             'cve_mun', cve_mun, 'municipio', municipio, 'entidad', entidad, 'total', total)
           order by total desc), '[]'::jsonb)
    into v_by_mun
    from (
      select c.cve_mun, c.municipio, c.entidad, sum(c.total)::bigint as total
      from crimes_municipal c
      where c.entidad     = p_entidad
        and c.anio between p_anio_desde and p_anio_hasta
        and c.tipo_delito = p_tipo_delito
      group by c.cve_mun, c.municipio, c.entidad
      order by total desc
      limit 15
    ) t;

  else
    -- Nacional + tipo: Index Only Scan en crimes_municipal_tipo_anio_cov_idx.
    select coalesce(jsonb_agg(jsonb_build_object(
             'cve_mun', cve_mun, 'municipio', municipio, 'entidad', entidad, 'total', total)
           order by total desc), '[]'::jsonb)
    into v_by_mun
    from (
      select c.cve_mun, c.municipio, c.entidad, sum(c.total)::bigint as total
      from crimes_municipal c
      where c.tipo_delito = p_tipo_delito
        and c.anio between p_anio_desde and p_anio_hasta
      group by c.cve_mun, c.municipio, c.entidad
      order by total desc
      limit 15
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

    'by_municipio', v_by_mun,

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

-- ---------- 3. Estadísticas / mapa de visibilidad ----------
-- El Index Only Scan necesita el visibility map al día (autovacuum suele
-- bastar; en diag.csv Heap Fetches era 73 de 26,153). Si tras cargar datos
-- ves "Heap Fetches" altos en el EXPLAIN, corre aparte:  vacuum analyze public.crimes_municipal;
analyze public.crimes_municipal;
