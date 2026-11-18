-- ============================================================
-- 06_map.sql
-- RPC para el mapa coroplético por municipio.
-- Ejecutar DESPUÉS de 05_fix_tipo_delito.sql. Idempotente.
-- NO modifica crime_summary ni ninguna función/vista existente.
--
-- map_municipios(p_anio_desde, p_anio_hasta, p_entidad, p_tipo_delito)
--   Devuelve el total de delitos de TODOS los municipios del estado
--   (no solo el top 15):  [{"cve_mun": 14039, "municipio": "...", "total": 123}, ...]
--   - p_entidad es obligatorio (sin estado el mapa usa by_entidad de
--     crime_summary). Si viene null devuelve '[]'.
--   - Ignora cualquier filtro de municipio: el mapa siempre pinta el estado
--     completo y resalta el municipio elegido desde el frontend.
--   - Un estado tiene como máximo ~570 municipios (Oaxaca): ~40 KB de JSON.
--
-- Rutas de lectura (mismo criterio que 04 y 05):
--   * sin tipo de delito -> vista crimes_municipio_anio (índice entidad, anio).
--   * con tipo de delito -> Index Only Scan en
--     crimes_municipal_tipo_anio_cov_idx (tipo_delito, anio) INCLUDE
--     (cve_mun, municipio, entidad, total); entidad se filtra sobre las
--     columnas incluidas, sin visitar el heap. No se crea ningún índice nuevo.
--   * plan_cache_mode = force_custom_plan, igual que en 05.
-- ============================================================

create or replace function public.map_municipios(
  p_anio_desde  int,
  p_anio_hasta  int,
  p_entidad     text,
  p_tipo_delito text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
declare
  v_result jsonb;
begin
  if p_entidad is null then
    return '[]'::jsonb;
  end if;

  if p_tipo_delito is null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'cve_mun', cve_mun, 'municipio', municipio, 'total', total)
           order by total desc), '[]'::jsonb)
    into v_result
    from (
      select m.cve_mun, min(m.municipio) as municipio, sum(m.total)::bigint as total
      from crimes_municipio_anio m
      where m.entidad = p_entidad
        and m.anio between p_anio_desde and p_anio_hasta
      group by m.cve_mun
    ) t;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'cve_mun', cve_mun, 'municipio', municipio, 'total', total)
           order by total desc), '[]'::jsonb)
    into v_result
    from (
      select c.cve_mun, min(c.municipio) as municipio, sum(c.total)::bigint as total
      from crimes_municipal c
      where c.tipo_delito = p_tipo_delito
        and c.anio between p_anio_desde and p_anio_hasta
        and c.entidad = p_entidad
      group by c.cve_mun
    ) t;
  end if;

  return v_result;
end;
$$;

-- Solo accesible vía RPC, como el resto de las funciones
revoke all on function public.map_municipios(int, int, text, text) from public;
grant execute on function public.map_municipios(int, int, text, text) to anon, authenticated;
