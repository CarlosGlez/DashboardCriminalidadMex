import { fmtNumber, fmtDecimal } from '../utils/format'
import type { CrimeSummary, Filters } from '../types'
import { aniosAnomalosEn, coverageInScope, describir } from '../utils/coverage'
import type { CoverageMap } from '../utils/coverage'

interface Props {
  summary: CrimeSummary
  filters: Filters
  coverage: CoverageMap
}


function WarnTip({ text }: { text: string }) {
  return (
    <span className="warn-tip" tabIndex={0} role="img" aria-label={`Advertencia: ${text}`}>
      <span aria-hidden="true">⚠</span>
      <span className="warn-tip-text" role="tooltip">{text}</span>
    </span>
  )
}

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
        <span className="stat-value">{fmtNumber(summary.total)}</span>
      </div>

      {variacion !== null && (
        <div className="stat-tile">
          <span className="stat-label">
            Variación vs. periodo anterior ({prevDesde}-{prevHasta})
            {incompletos.length > 0 && (
              <WarnTip text={`Ojo: incluye años atípicos o incompletos: ${describir(incompletos, prevDesde, filters.anioHasta)}.`} />
            )}
          </span>
          <span className={`stat-value stat-delta ${variacion >= 0 ? 'stat-delta--up' : 'stat-delta--down'}`}>
            <span aria-hidden="true">{variacion >= 0 ? '▲' : '▼'}</span>
            {Math.abs(variacion).toFixed(1)}%
            <span className="stat-delta-label">{variacion >= 0 ? 'aumento' : 'disminución'}</span>
          </span>
        </div>
      )}

      <div className="stat-tile">
        <span className="stat-label">Delito más frecuente</span>
        <span className="stat-value stat-value--text">{topTipo?.tipo_delito ?? 'Sin datos'}</span>
        {topTipo && <span className="stat-sub">{fmtNumber(topTipo.total)} casos</span>}
      </div>

      <div className="stat-tile">
        <span className="stat-label">Promedio mensual</span>
        <span className="stat-value">{fmtNumber(Math.round(promedioMensual))}</span>
      </div>

      <div className="stat-tile">
        <span className="stat-label">
          Tasa anual por 100k habitantes
          {incompletosTasa.length > 0 && (
            <WarnTip
              text={`Ojo: el promedio incluye años atípicos o incompletos: ${describir(incompletosTasa, filters.anioDesde, filters.anioHasta)}.`}
            />
          )}
        </span>
        {summary.tasa_100k === null ? (
          <span className="stat-value stat-value--muted">Sin datos de población</span>
        ) : (
          <span className="stat-value">{fmtDecimal(summary.tasa_100k)}</span>
        )}
      </div>
    </div>
  )
}
