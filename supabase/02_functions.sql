-- ============================================================
-- Funciones RPC que consume el frontend.
-- Ejecutar DESPUÉS de 01_schema.sql.
-- ============================================================

-- Opciones para los filtros (estados, tipos de delito, rango de años)
create or replace function public.filter_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'entidades',    coalesce((select jsonb_agg(entidad order by entidad)
                              from (select distinct entidad from crimes_municipal) e), '[]'::jsonb),
    'tipos_delito', coalesce((select jsonb_agg(tipo_delito order by tipo_delito)
                              from (select distinct tipo_delito from crimes_municipal) t), '[]'::jsonb),
    'anio_min',     coalesce((select min(anio) from crimes_municipal), 2015),
    'anio_max',     coalesce((select max(anio) from crimes_municipal), 2025)
  );
$$;

-- Municipios de un estado (para el filtro dependiente)
create or replace function public.municipios_by_entidad(p_entidad text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('cve_mun', cve_mun, 'municipio', municipio)
                            order by municipio), '[]'::jsonb)
  from (
    select distinct cve_mun, municipio
    from crimes_municipal
    where entidad = p_entidad
  ) m;
$$;

-- Un solo JSON con todo lo que necesita el dashboard.
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
  v_span      int := p_anio_hasta - p_anio_desde + 1;
  v_prev_desde int := p_anio_desde - (p_anio_hasta - p_anio_desde + 1);
  v_prev_hasta int := p_anio_desde - 1;
  v_prev      bigint;
  v_pob_prom  numeric;
  v_result    jsonb;
begin
  select coalesce(sum(c.total), 0) into v_prev
  from crimes_municipal c
  where c.anio between v_prev_desde and v_prev_hasta
    and (p_entidad     is null or c.entidad     = p_entidad)
    and (p_municipio   is null or c.cve_mun     = p_municipio)
    and (p_tipo_delito is null or c.tipo_delito = p_tipo_delito);

  -- Población promedio del alcance (solo a nivel estado / nacional)
  select avg(s.pob) into v_pob_prom
  from (
    select p.anio, sum(p.poblacion) as pob
    from poblacion_estatal p
    where p.anio between p_anio_desde and p_anio_hasta
      and (p_entidad is null or p.entidad = p_entidad)
    group by p.anio
  ) s;

  with scope as materialized (
    select c.* from crimes_municipal c
    where c.anio between p_anio_desde and p_anio_hasta
      and (p_entidad     is null or c.entidad     = p_entidad)
      and (p_municipio   is null or c.cve_mun     = p_municipio)
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

    -- Top 15 municipios del alcance (del estado elegido, o del país)
    'by_municipio', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cve_mun', cve_mun, 'municipio', municipio, 'entidad', entidad, 'total', total)
             order by total desc)
      from (
        select cve_mun, municipio, entidad, sum(total)::bigint as total
        from scope
        group by cve_mun, municipio, entidad
        order by total desc
        limit 15
      ) t
    ), '[]'::jsonb),

    -- Tasa por 100k de TODOS los estados (vacío si no hay población cargada)
    'tasa_by_entidad', coalesce((
      select jsonb_agg(jsonb_build_object(
               'entidad', entidad, 'total', total,
               'poblacion_promedio', round(pob), 'tasa', tasa) order by tasa desc)
      from (
        select s.entidad, s.total, p.pob,
               round(s.total::numeric / v_span / p.pob * 100000, 1) as tasa
        from (
          -- sin filtro de estado/municipio: sirve para ubicar al estado en el ranking nacional
          select c.entidad, sum(c.total)::bigint as total
          from crimes_municipal c
          where c.anio between p_anio_desde and p_anio_hasta
            and (p_tipo_delito is null or c.tipo_delito = p_tipo_delito)
          group by c.entidad
        ) s
        join (
          select entidad, avg(poblacion)::numeric as pob
          from poblacion_estatal
          where anio between p_anio_desde and p_anio_hasta
          group by entidad
        ) p using (entidad)
      ) t
    ), '[]'::jsonb),

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

-- Solo las funciones son accesibles desde el navegador
revoke all on function public.filter_options()                                  from public;
revoke all on function public.municipios_by_entidad(text)                       from public;
revoke all on function public.crime_summary(int, int, text, text, int)          from public;
grant execute on function public.filter_options()                               to anon, authenticated;
grant execute on function public.municipios_by_entidad(text)                    to anon, authenticated;
grant execute on function public.crime_summary(int, int, text, text, int)       to anon, authenticated;
