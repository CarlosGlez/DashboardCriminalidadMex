// Formato de números unificado para todo el dashboard (es-MX).

/** Número completo con separador de miles: 1,234,567 (tarjetas, tablas, tooltips). */
export const fmtNumber = (v: number) => v.toLocaleString('es-MX')

/** Decimal con un máximo de 1 decimal (tasas por 100k). */
export const fmtDecimal = (v: number) => v.toLocaleString('es-MX', { maximumFractionDigits: 1 })

/** Formato corto para ejes y leyendas: 950, 12k, 1.5M. */
export function fmtAxis(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}M`
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}k`
  return fmtDecimal(v)
}

/** Dominio del eje Y con margen alrededor del mínimo y el máximo (no parte de 0). */
export function paddedDomain(values: number[]): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return [0, 1]
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const pad = (max - min) * 0.12 || max * 0.05 || 1
  const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(max - min, 1))) - 1)
  return [Math.max(0, Math.floor((min - pad) / step) * step), Math.ceil((max + pad) / step) * step]
}

/** Valor al final de las barras: 7.1 M, 2.4 M, 515k, 950. */
export function fmtCompact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`
  if (abs >= 1_000) return `${Math.round(v / 1_000).toLocaleString('es-MX')}k`
  return fmtNumber(Math.round(v))
}

/** Ejes en español: 160 mil, 1.2 M. */
export function fmtMil(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} M`
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} mil`
  return fmtNumber(v)
}

/** Dominio y marcas "redondas" (100 mil, 125 mil, 150 mil…) con margen alrededor de los datos. */
export function niceScale(values: number[]): { domain: [number, number]; ticks: number[] } {
  const [lo0, hi0] = paddedDomain(values)
  const raw = (hi0 - lo0) / 4 || 1
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((c) => c >= raw) ?? 10 * mag
  const lo = Math.floor(lo0 / step) * step
  const hi = Math.ceil(hi0 / step) * step
  const ticks: number[] = []
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t))
  return { domain: [lo, hi], ticks }
}

/** Redondea un corte de leyenda a un número legible: 75, 250, 500, 850, 1.2k, 120k… */
export function niceLegendValue(v: number): number {
  const abs = Math.abs(v)
  if (abs < 20) return Math.round(v)
  if (abs < 100) return Math.round(v / 5) * 5
  if (abs < 300) return Math.round(v / 25) * 25
  if (abs < 1000) return Math.round(v / 50) * 50
  const mag = 10 ** (Math.floor(Math.log10(abs)) - 1) // 2 cifras significativas
  return Math.round(v / mag) * mag
}

/** Etiqueta de un corte de leyenda ya redondeado: 850, 1.2k, 120k, 1.9 M. */
export function fmtLegend(v: number): string {
  const r = niceLegendValue(v)
  const abs = Math.abs(r)
  if (abs >= 1_000_000) return `${(r / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} M`
  if (abs >= 1_000) return `${(r / 1_000).toLocaleString('es-MX', { maximumFractionDigits: abs < 10_000 ? 1 : 0 })}k`
  return fmtNumber(r)
}

/** Diferencia con signo: +1,234 / −567 / 0 (signo menos tipográfico). */
export function fmtSigned(v: number): string {
  if (v === 0) return '0'
  return `${v > 0 ? '+' : '−'}${fmtNumber(Math.abs(v))}`
}

/** Porcentaje de cambio con signo y 1 decimal: +12.3% / −4.5%; "—" si no está definido (base 0). */
export function fmtPctChange(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  if (v === 0) return '0.0%'
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/** % de cambio de `base` a `actual`; null si la base es 0 (sería infinito). */
export function pctChange(base: number, actual: number): number | null {
  return base > 0 ? ((actual - base) / base) * 100 : null
}
