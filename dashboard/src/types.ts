export interface FilterOptions {
  entidades: string[]
  tipos_delito: string[]
  anio_min: number
  anio_max: number
}

export interface Filters {
  anioDesde: number
  anioHasta: number
  entidad: string | null
  municipio: number | null // cve_mun (clave INEGI); requiere entidad
  municipioNombre: string | null
  tipoDelito: string | null
}

export interface MunicipioOption {
  cve_mun: number
  municipio: string
}

export interface MunicipioTotal {
  cve_mun: number
  municipio: string
  entidad: string
  total: number
}

export interface TrendPoint {
  anio: number
  mes: number
  total: number
}

export interface CategoryTotal {
  tipo_delito?: string
  entidad?: string
  total: number
}

export interface GrowthRow {
  tipo_delito?: string
  entidad?: string
  total_desde: number
  total_hasta: number
  growth_pct: number | null
}

export interface EntidadTasa {
  entidad: string
  total: number
  poblacion_promedio: number
  tasa: number | null
}

export interface CrimeSummary {
  total: number
  prev_total: number
  poblacion_promedio: number | null
  tasa_100k: number | null
  trend: TrendPoint[]
  by_tipo: CategoryTotal[]
  by_entidad: CategoryTotal[]
  by_municipio: MunicipioTotal[]
  tasa_by_entidad: EntidadTasa[]
  tipo_growth: GrowthRow[]
  entidad_growth: GrowthRow[]
}
