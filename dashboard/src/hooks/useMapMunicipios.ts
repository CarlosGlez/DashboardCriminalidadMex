import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import type { Filters, MapMunicipioRow } from '../types'

interface State {
  key: string | null
  rows: MapMunicipioRow[] | null
  error: string | null
}

// Total de TODOS los municipios del estado elegido (RPC map_municipios, supabase/06_map.sql).
// Sin estado seleccionado no consulta nada: el mapa de estados usa crime_summary.
// Ignora el filtro de municipio: el mapa siempre pinta el estado completo.
export function useMapMunicipios(filters: Filters | null) {
  const entidad = filters?.entidad ?? null
  const anioDesde = filters?.anioDesde ?? 0
  const anioHasta = filters?.anioHasta ?? 0
  const tipoDelito = filters?.tipoDelito ?? null
  const key = entidad ? `${anioDesde}|${anioHasta}|${entidad}|${tipoDelito ?? ''}` : null

  const [state, setState] = useState<State>({ key: null, rows: null, error: null })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    supabase
      .rpc('map_municipios', {
        p_anio_desde: anioDesde,
        p_anio_hasta: anioHasta,
        p_entidad: entidad,
        p_tipo_delito: tipoDelito,
      })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setState({ key, rows: null, error: error.message })
        else setState({ key, rows: data as MapMunicipioRow[], error: null })
      })
    return () => {
      cancelled = true
    }
  }, [key, anioDesde, anioHasta, entidad, tipoDelito])

  // Evita mostrar datos de otro filtro mientras llegan los nuevos
  const current = state.key === key
  return {
    rows: current ? state.rows : null,
    error: current ? state.error : null,
    loading: key !== null && !current,
  }
}
