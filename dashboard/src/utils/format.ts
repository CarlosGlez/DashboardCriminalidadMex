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
