import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import type { EntidadCoverage } from '../types'
import type { CoverageMap } from '../utils/coverage'

const EMPTY: CoverageMap = new Map()

// Estados con años de desglose municipal incompleto (RPC data_coverage, supabase/08_coverage.sql).
// No depende de los filtros: se pide una sola vez. Si la RPC falla o aún no existe, devuelve un
// mapa vacío y el dashboard funciona igual, solo que sin avisos de cobertura.
export function useCoverage(): CoverageMap {
  const [coverage, setCoverage] = useState<CoverageMap>(EMPTY)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('data_coverage').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        console.warn('data_coverage no disponible; se omiten los avisos de cobertura:', error.message)
        return
      }
      // Tolera la versión anterior de la RPC (anios_incompletos, sin tipo)
      type Crudo = Partial<EntidadCoverage> & { entidad: string; anios_incompletos?: number[] }
      setCoverage(
        new Map(
          (data as Crudo[]).map((c): [string, EntidadCoverage] => [
            c.entidad,
            {
              entidad: c.entidad,
              tipo: c.tipo ?? 'arranque',
              anios_anomalos: c.anios_anomalos ?? c.anios_incompletos ?? [],
              anio_completo_desde: c.anio_completo_desde ?? null,
              anios_sin_municipio: c.anios_sin_municipio,
              pct_sin_max: c.pct_sin_max ?? null,
            },
          ]),
        ),
      )
    })
    return () => {
      cancelled = true
    }
  }, [])

  return coverage
}
