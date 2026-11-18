-- ============================================================
-- 07_municipios_fix.sql
-- municipios_by_entidad (filtro de Municipio) leía crimes_municipal con un
-- "select distinct" y con estados grandes (Oaxaca: 570 municipios) el rol
-- anon recibía error 500 (probable statement timeout), dejando el selector
-- de municipios vacío. Ahora lee la vista crimes_municipio_anio.
--
-- Ejecutar DESPUÉS de 04 (que crea crimes_municipio_anio). Idempotente.
-- Misma firma y mismo JSON: [{"cve_mun": 20001, "municipio": "..."}, ...]
-- ordenado por municipio. Como antes, incluye las claves "No Especificado" /
-- "Otros Municipios" (cve_mun terminado en 998/999) si el estado las tiene.
--
-- IMPORTANTE: la vista no se actualiza sola; tras cargar datos nuevos
-- refrescarla (ver 04):
--     refresh materialized view concurrently public.crimes_municipio_anio;
-- ============================================================

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
    from crimes_municipio_anio          -- antes: crimes_municipal
    where entidad = p_entidad
  ) m;
$$;

revoke all on function public.municipios_by_entidad(text) from public;
grant execute on function public.municipios_by_entidad(text) to anon, authenticated;
