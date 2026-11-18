import { lazy, Suspense, useEffect, useState } from 'react'
import './App.css'
import { useFilterOptions } from './hooks/useFilterOptions'
import { useCrimeSummary } from './hooks/useCrimeSummary'
import { useMapMunicipios } from './hooks/useMapMunicipios'
import { useCoverage } from './hooks/useCoverage'
import { FilterBar } from './components/FilterBar'
import { KpiCards } from './components/KpiCards'
import { TrendChart } from './components/TrendChart'
import { RankingBarChart } from './components/RankingBarChart'
import { YearComparisonChart } from './components/YearComparisonChart'
import { Insights } from './components/Insights'
import { fmtDecimal } from './utils/format'
import { ENTIDAD_ABREV } from './constants'
import type { CrimeSummary, Filters, MunicipioTotal } from './types'

// d3-geo y d3-scale solo se descargan cuando se muestra el mapa
const ChoroplethMap = lazy(() => import('./components/ChoroplethMap').then((m) => ({ default: m.ChoroplethMap })))

// En el ranking nacional se agrega el estado (abreviado) para distinguir municipios con el mismo nombre.
function municipioLabel(m: MunicipioTotal, dentroDeEstado: boolean) {
  return dentroDeEstado ? m.municipio : `${m.municipio}, ${ENTIDAD_ABREV[m.entidad] ?? m.entidad}`
}

const TOP_TIPOS = 10
const OTROS = 'Otros'

// Top 10 tipos de delito; el resto se agrupa en una sola barra "Otros".
function topConOtros(tipos: { tipo_delito?: string | null; total: number }[]) {
  const sorted = [...tipos].sort((a, b) => b.total - a.total)
  const rows = sorted.slice(0, TOP_TIPOS).map((t) => ({ label: t.tipo_delito ?? '', value: t.total }))
  const resto = sorted.slice(TOP_TIPOS).reduce((acc, t) => acc + t.total, 0)
  return resto > 0 ? [...rows, { label: OTROS, value: resto }] : rows
}

// Delitos por estado (ancho completo, solo sin estado elegido); debajo, tipo y municipios lado a lado.
function RankingCharts({ summary, filters }: { summary: CrimeSummary; filters: Filters }) {
  const tipoChart = (
    <RankingBarChart
      title="Delitos por tipo"
      views={[{ key: 'total', label: 'Total', rows: topConOtros(summary.by_tipo) }]}
      mutedLabel={OTROS}
    />
  )

  const estadoChart = (
    <RankingBarChart
      title="Delitos por estado"
      highlight={filters.entidad ?? undefined}
      labelWidth={240}
      views={[
        {
          key: 'total',
          label: 'Total',
          rows: summary.by_entidad.map((e) => ({ label: e.entidad ?? '', value: e.total })),
        },
        ...(summary.tasa_by_entidad.length > 0
          ? [{
              key: 'tasa',
              label: 'Por 100k hab.',
              valueLabel: 'Tasa por 100k',
              rows: [...summary.tasa_by_entidad]
                .sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0))
                .map((e) => ({ label: e.entidad, value: e.tasa ?? 0 })),
              formatValue: (v: number) => fmtDecimal(v),
            }]
          : []),
      ]}
    />
  )

  const municipiosChart =
    !filters.municipio && summary.by_municipio.length > 0 ? (
      <RankingBarChart
        title={filters.entidad ? `Top municipios de ${filters.entidad}` : 'Top 15 municipios del país'}
        labelWidth={270}
        views={[{
          key: 'total',
          label: 'Total',
          rows: summary.by_municipio.map((m) => ({ label: municipioLabel(m, !!filters.entidad), value: m.total })),
        }]}
      />
    ) : null

  return (
    <>
      {!filters.entidad && <div className="chart-grid chart-grid--single">{estadoChart}</div>}
      <div className={municipiosChart ? 'chart-grid' : 'chart-grid chart-grid--single'}>
        {tipoChart}
        {municipiosChart}
      </div>
    </>
  )
}

function App() {
  const { options, error: optionsError } = useFilterOptions()
  const [filters, setFilters] = useState<Filters | null>(null)

  useEffect(() => {
    if (options && !filters) {
      setFilters({
        anioDesde: options.anio_min,
        anioHasta: options.anio_max,
        entidad: null,
        municipio: null,
        municipioNombre: null,
        tipoDelito: null,
      })
    }
  }, [options, filters])

  const { summary, loading, error } = useCrimeSummary(
    filters ?? { anioDesde: 0, anioHasta: 0, entidad: null, municipio: null, municipioNombre: null, tipoDelito: null },
  )

  // Totales de todos los municipios del estado elegido; se pide en paralelo a crime_summary
  const mapData = useMapMunicipios(filters)
  // Estados/años con desglose municipal incompleto (avisos y exclusiones en mapa, KPIs e Insights)
  const coverage = useCoverage()

  if (optionsError) {
    return <div className="state-message state-message--error">Error cargando opciones: {optionsError}</div>
  }

  if (!options || !filters) {
    return <div className="state-message">Cargando dashboard...</div>
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Dashboard de Criminalidad</h1>
        <p className="dashboard-subtitle">
          {options.anio_min}-{options.anio_max} · Fuente: SESNSP
        </p>
      </header>

      <FilterBar options={options} filters={filters} onChange={setFilters} />

      {error && <div className="state-message state-message--error">Error cargando datos: {error}</div>}

      {loading && !summary && <div className="state-message">Cargando datos...</div>}

      {summary && (
        <>
          <KpiCards summary={summary} filters={filters} coverage={coverage} />

          <div className="chart-grid chart-grid--single">
            <Suspense fallback={<div className="state-message">Cargando mapa...</div>}>
              <ChoroplethMap summary={summary} filters={filters} mapData={mapData} coverage={coverage} onChange={setFilters} />
            </Suspense>
          </div>

          <div className="chart-grid chart-grid--single">
            <TrendChart trend={summary.trend} />
          </div>

          <div className="chart-grid chart-grid--single">
            <YearComparisonChart trend={summary.trend} />
          </div>

          <RankingCharts summary={summary} filters={filters} />

          <Insights summary={summary} filters={filters} coverage={coverage} />
        </>
      )}
    </div>
  )
}

export default App
