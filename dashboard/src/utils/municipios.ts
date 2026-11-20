import type { MunicipioAnioRow } from '../types'
import { pctChange } from './format'

export interface MunicipioStats {
  cve_mun: number
  municipio: string
  /** Total por año; los años sin fila cuentan como 0. */
  byYear: Map<number, number>
  inicial: number
  final: number
  diff: number
  /** null si el año inicial es 0 (el cambio sería infinito). */
  pct: number | null
  periodo: number
}

export const MAX_MUNICIPIOS = 4

// "No especificado" / "Otros municipios" (cve_mun terminado en 998/999): no son municipios reales.
export const esMunicipioReal = (cve: number) => cve % 1000 !== 998 && cve % 1000 !== 999

// Una sola respuesta de municipios_anio alimenta la tabla y la gráfica.
export function buildMunicipios(rows: MunicipioAnioRow[], desde: number, hasta: number): MunicipioStats[] {
  const map = new Map<number, MunicipioStats>()
  for (const r of rows) {
    if (!esMunicipioReal(r.cve_mun)) continue
    let m = map.get(r.cve_mun)
    if (!m) {
      m = { cve_mun: r.cve_mun, municipio: r.municipio, byYear: new Map(), inicial: 0, final: 0, diff: 0, pct: null, periodo: 0 }
      map.set(r.cve_mun, m)
    }
    m.byYear.set(r.anio, (m.byYear.get(r.anio) ?? 0) + r.total)
  }
  const out = [...map.values()]
  for (const m of out) {
    m.inicial = m.byYear.get(desde) ?? 0
    m.final = m.byYear.get(hasta) ?? 0
    m.diff = m.final - m.inicial
    m.pct = pctChange(m.inicial, m.final)
    for (const [y, t] of m.byYear) if (y >= desde && y <= hasta) m.periodo += t
  }
  return out.sort((a, b) => b.periodo - a.periodo)
}
