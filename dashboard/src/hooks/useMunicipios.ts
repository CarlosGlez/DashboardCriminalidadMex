import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import type { MunicipioOption } from '../types'

// Municipios del estado elegido (alimenta el filtro dependiente de municipio).
export function useMunicipios(entidad: string | null) {
  const [municipios, setMunicipios] = useState<MunicipioOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!entidad) {
      setMunicipios([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase.rpc('municipios_by_entidad', { p_entidad: entidad }).then(({ data, error }) => {
      if (cancelled) return
      setMunicipios(error ? [] : (data as MunicipioOption[]))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [entidad])

  return { municipios, loading }
}
