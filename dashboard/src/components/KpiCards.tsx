import type { CrimeSummary, Filters } from '../types'
import { aniosAnomalosEn, coverageInScope, describir } from '../utils/coverage'
import type { CoverageMap } from '../utils/coverage'

interface Props {
  summary: CrimeSummary
  filters: Filters
  coverage: CoverageMap
}

const numberFmt = new Intl.NumberFormat('es-MX')

export function KpiCards({ summary, filters, coverage }: Props) {
  const variacion =
    summary.prev_total > 0
      ? ((summary.total - summary.prev_total) / summary.prev_total) * 100
      : null

  const topTipo = summary.by_tipo[0]
  const monthsInRange = (filters.anioHasta - filters.anioDesde + 1) * 12
  const promedioMensual = summary.total / monthsInRange

  const span = filters.anioHasta - filters.anioDesde + 1
  const prevDesde = filters.anioDesde - span
  const prevHasta = filters.anioDesde - 1

  // Estados con años anómalos (incompletos o con cambios bruscos de reporte) en el periodo o en el
  // periodo anterior: el total de esos años no es comparable y la variación puede distorsionarse.
  const incompletos =
    variacion === null
      ? []
      : coverageInScope(coverage, filters.entidad).filter(
          (c) => aniosAnomalosEn(c, prevDesde, filters.anioHasta).length > 0,
        )

  // La tasa es el promedio anual del rango: un año anómalo la distorsiona
  const incompletosTasa =
    summary.tasa_100k === null
      ? []
      : coverageInScope(coverage, filters.entidad).filter(
          (c) => aniosAnomalosEn(c, filters.anioDesde, filters.anioHasta).length > 0,
        )

  return (
    <div className="kpi-row">
      <div className="stat-tile">
        <span className="stat-label">Total de delitos ({filters.anioDesde}-{filters.anioHasta})</span>
        <span className="stat-value">{numberFmt.format(summary.total)}</span>
      </div>

      <div className="stat-tile">
        <span className="stat-label">Variación vs. periodo anterior ({prevDesde}-{prevHasta})</span>
        {variacion === null ? (
          <span className="stat-value stat-value--muted">Sin datos previos</span>
        ) : (
          <span className={`stat-value stat-delta ${variacion >= 0 ? 'stat-delta--up' : 'stat-delta--down'}`}>
            <span aria-hidden="true">{variacion >= 0 ? '▲' : '▼'}</span>
            {Math.abs(variacion).toFixed(1)}%
            <span className="stat-delta-label">{variacion >= 0 ? 'aumento' : 'disminución'}</span>
          </span>
        )}
        {incompletos.length > 0 && (
          <span className="stat-sub">
            Ojo: incluye años atípicos o incompletos: {describir(incompletos, prevDesde, filters.anioHasta)}.
          </span>
        )}
      </div>

      <div className="stat-tile">
        <span className="stat-label">Delito más frecuente</span>
        <span className="stat-value stat-value--text">{topTipo?.tipo_delito ?? 'Sin datos'}</span>
        {topTipo && <span className="stat-sub">{numberFmt.format(topTipo.total)} casos</span>}
      </div>

      <div className="stat-tile">
        <span className="stat-label">Promedio mensual</span>
        <span className="stat-value">{numberFmt.format(Math.round(promedioMensual))}</span>
      </div>

      <div className="stat-tile">
        <span className="stat-label">Tasa anual por 100k habitantes</span>
        {summary.tasa_100k === null ? (
          <span className="stat-value stat-value--muted">Sin datos de población</span>
        ) : (
          <span className="stat-value">{summary.tasa_100k.toLocaleString('es-MX', { maximumFractionDigits: 1 })}</span>
        )}
        {incompletosTasa.length > 0 && (
          <span className="stat-sub">
            Ojo: el promedio incluye años atípicos o incompletos: {describir(incompletosTasa, filters.anioDesde, filters.anioHasta)}.
          </span>
        )}
      </div>
    </div>
  )
}
