import type { Filters } from '../types'

interface Props {
  filters: Filters
}

// Letrero con lo que se está analizando, debajo de la barra de filtros.
export function AnalysisContext({ filters }: Props) {
  const periodo =
    filters.anioDesde === filters.anioHasta ? String(filters.anioDesde) : `${filters.anioDesde}–${filters.anioHasta}`
  const partes = [
    filters.tipoDelito ?? 'Todos los delitos',
    filters.entidad ?? 'Nacional',
    ...(filters.entidad && filters.municipio ? [filters.municipioNombre ?? `Municipio ${filters.municipio}`] : []),
    periodo,
  ]

  return (
    <p className="analysis-context" aria-live="polite">
      <span className="analysis-context-kicker">Analizando:</span> {partes.join(' · ')}
    </p>
  )
}
