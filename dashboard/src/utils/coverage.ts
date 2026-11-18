import type { EntidadCoverage } from '../types'

export type CoverageMap = Map<string, EntidadCoverage>

// "2015-2017" si son consecutivos, "2015, 2018" si no
export function formatAnios(anios: number[]) {
  const s = [...anios].sort((a, b) => a - b)
  if (s.length === 0) return ''
  const consecutivos = s.every((y, i) => i === 0 || y === s[i - 1] + 1)
  return consecutivos && s.length > 1 ? `${s[0]}-${s[s.length - 1]}` : s.join(', ')
}

// Cobertura de los estados del alcance actual: todos, o solo el elegido.
export function coverageInScope(coverage: CoverageMap, entidad: string | null): EntidadCoverage[] {
  if (entidad) {
    const c = coverage.get(entidad)
    return c ? [c] : []
  }
  return [...coverage.values()]
}

// Años anómalos del estado que caen dentro de [desde, hasta]
export function aniosAnomalosEn(c: EntidadCoverage, desde: number, hasta: number) {
  return c.anios_anomalos.filter((y) => y >= desde && y <= hasta)
}

// tipo_growth compara SOLO el primer y el último año del rango
export function tocaExtremos(c: EntidadCoverage, desde: number, hasta: number) {
  return c.anios_anomalos.includes(desde) || c.anios_anomalos.includes(hasta)
}

// ¿Se excluye al estado del ranking de crecimiento por estado (entidad_growth)?
//  - 'inestable' (cambios bruscos de reporte): si el rango incluye CUALQUIER año anómalo.
//  - 'arranque' / 'puntual': solo si el primer o el último año del rango es anómalo,
//    porque el crecimiento compara únicamente esos dos años.
export function excluyeCrecimiento(c: EntidadCoverage, desde: number, hasta: number) {
  return c.tipo === 'inestable' ? aniosAnomalosEn(c, desde, hasta).length > 0 : tocaExtremos(c, desde, hasta)
}

// "Oaxaca (2015-2017), Campeche (2021-2025)"
export function describir(cs: EntidadCoverage[], desde: number, hasta: number) {
  return cs.map((c) => `${c.entidad} (${formatAnios(aniosAnomalosEn(c, desde, hasta))})`).join(', ')
}

// Motivo explícito de la exclusión del ranking de crecimiento
export function motivoExclusion(c: EntidadCoverage) {
  if (c.tipo === 'inestable') return `${c.entidad}: serie con cambios bruscos de reporte, no comparable`
  if (c.tipo === 'arranque' && c.anio_completo_desde !== null)
    return `${c.entidad}: datos completos desde ${c.anio_completo_desde}`
  return `${c.entidad}: ${formatAnios(c.anios_anomalos)} es un año atípico`
}
