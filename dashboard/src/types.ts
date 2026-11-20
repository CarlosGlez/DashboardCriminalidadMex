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

// Fila de la RPC map_municipios (total de un municipio del estado elegido).
// Incluye las claves "No especificado" / "Otros municipios" (cve_mun terminado en 998/999),
// que no existen en el mapa.
export interface MapMunicipioRow {
  cve_mun: number
  municipio: string
  total: number
}

// Fila de la RPC municipios_anio (supabase/09_municipios_anio.sql): total de un municipio del
// estado elegido en un año. Incluye las claves 998/999.
export interface MunicipioAnioRow {
  cve_mun: number
  municipio: string
  anio: number
  total: number
}

// Fila de la RPC data_coverage (supabase/08_coverage.sql): estados con años anómalos
// (incompletos o con cambios bruscos de reporte). Los estados sin años anómalos no aparecen.
//  - 'arranque':  los años anómalos son un bloque pegado al primer año (tiene anio_completo_desde)
//  - 'puntual':   un solo año anómalo aislado
//  - 'inestable': varios años anómalos fuera del bloque inicial; serie no comparable
export type CoverageTipo = 'arranque' | 'puntual' | 'inestable'

export interface EntidadCoverage {
  entidad: string
  tipo: CoverageTipo
  anios_anomalos: number[]
  anio_completo_desde: number | null // solo en 'arranque': último año anómalo + 1
  anios_sin_municipio?: number[]
  pct_sin_max: number | null // peor % de delitos sin municipio; null si no hubo años por ese criterio
}

// Propiedades de las geometrías (dashboard/public/geo, generadas con scripts/prepare_geo.mjs)
export interface EntGeoProps {
  name: string // nombre INEGI; coincide exactamente con `entidad` en la BD
  e: number // cve_ent
}
export interface MunGeoProps {
  c: number // cve_mun (clave INEGI de 5 dígitos como entero)
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
