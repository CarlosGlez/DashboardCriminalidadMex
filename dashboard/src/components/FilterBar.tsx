import type { FilterOptions, Filters } from '../types'
import { useMunicipios } from '../hooks/useMunicipios'

interface Props {
  options: FilterOptions
  filters: Filters
  onChange: (next: Filters) => void
}

export function FilterBar({ options, filters, onChange }: Props) {
  const { municipios, loading: loadingMunicipios } = useMunicipios(filters.entidad)
  const years = []
  for (let y = options.anio_min; y <= options.anio_max; y++) years.push(y)

  return (
    <div className="filter-bar" role="group" aria-label="Filtros del dashboard">
      <div className="filter-field filter-period" role="group" aria-label="Periodo">
        <span>Periodo</span>
        <div className="filter-period-selects">
          <select
            aria-label="Desde"
            value={filters.anioDesde}
            onChange={(e) => {
              const anioDesde = Number(e.target.value)
              onChange({ ...filters, anioDesde, anioHasta: Math.max(anioDesde, filters.anioHasta) })
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span aria-hidden="true">–</span>
          <select
            aria-label="Hasta"
            value={filters.anioHasta}
            onChange={(e) => {
              const anioHasta = Number(e.target.value)
              onChange({ ...filters, anioHasta, anioDesde: Math.min(anioHasta, filters.anioDesde) })
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="filter-field">
        <span>Estado</span>
        <select
          value={filters.entidad ?? ''}
          onChange={(e) =>
            onChange({ ...filters, entidad: e.target.value || null, municipio: null, municipioNombre: null })
          }
        >
          <option value="">Todos los estados</option>
          {options.entidades.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>Municipio</span>
        <select
          value={filters.municipio ?? ''}
          disabled={!filters.entidad || loadingMunicipios}
          onChange={(e) => {
            const cve = e.target.value ? Number(e.target.value) : null
            const nombre = municipios.find((m) => m.cve_mun === cve)?.municipio ?? null
            onChange({ ...filters, municipio: cve, municipioNombre: nombre })
          }}
        >
          <option value="">
            {!filters.entidad ? 'Elige un estado primero' : loadingMunicipios ? 'Cargando...' : 'Todos los municipios'}
          </option>
          {municipios.map((m) => (
            <option key={m.cve_mun} value={m.cve_mun}>{m.municipio}</option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>Tipo de delito</span>
        <select
          value={filters.tipoDelito ?? ''}
          onChange={(e) => onChange({ ...filters, tipoDelito: e.target.value || null })}
        >
          <option value="">Todos los tipos</option>
          {options.tipos_delito.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
