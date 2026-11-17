import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import type { CrimeSummary, Filters } from '../types'

export function useCrimeSummary(filters: Filters) {
  const [summary, setSummary] = useState<CrimeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .rpc('crime_summary', {
        p_anio_desde: filters.anioDesde,
        p_anio_hasta: filters.anioHasta,
        p_entidad: filters.entidad,
        p_tipo_delito: filters.tipoDelito,
        p_municipio: filters.municipio,
      })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setSummary(data as CrimeSummary)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters.anioDesde, filters.anioHasta, filters.entidad, filters.municipio, filters.tipoDelito])

  return { summary, loading, error }
}
