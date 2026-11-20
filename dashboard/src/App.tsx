import { lazy, Suspense, useEffect, useState } from 'react'
import './App.css'
import { useFilterOptions } from './hooks/useFilterOptions'
import { useCrimeSummary } from './hooks/useCrimeSummary'
import { useMapMunicipios } from './hooks/useMapMunicipios'
import { useMunicipiosAnio } from './hooks/useMunicipiosAnio'
import { useCoverage } from './hooks/useCoverage'
import { FilterBar } from './components/FilterBar'
import { KpiCards } from './components/KpiCards'
import { AnalysisContext } from './components/AnalysisContext'
import { MunicipiosComparativa } from './components/MunicipiosComparativa'
import { TipoPieChart } from './components/TipoPieChart'
import { RankingBarChart } from './components/RankingBarChart'
import { RankingTable } from './components/RankingTable'
import { YearComparisonChart } from './components/YearComparisonChart'
import { Insights } from './components/Insights'
import { fmtDecimal } from './utils/format'
import type { CrimeSummary, Filters } from './types'

// d3-geo y d3-scale solo se descargan cuando se muestra el mapa
const ChoroplethMap = lazy(() => import('./components/ChoroplethMap').then((m) => ({ default: m.ChoroplethMap })))

const TOP_TIPOS = 10
const TOP_TIPOS_PIE = 6
const OTROS = 'Otros'

// Top N tipos de delito; el resto se agrupa en una sola barra/rebanada "Otros".
function topConOtros(tipos: { tipo_delito?: string | null; total: number }[], n = TOP_TIPOS) {
  const sorted = [...tipos].sort((a, b) => b.total - a.total)
  const rows = sorted.slice(0, n).map((t) => ({ label: t.tipo_delito ?? '', value: t.total }))
  const resto = sorted.slice(n).reduce((acc, t) => acc + t.total, 0)
  return resto > 0 ? [...rows, { label: OTROS, value: resto }] : rows
}

// Delitos por estado (ancho completo, solo sin estado elegido); debajo, barras y pastel por tipo lado a lado.
// El top de municipios del país va en su propia fila (con estado elegido lo cubre la tabla comparativa).
function RankingCharts({ summary, filters }: { summary: CrimeSummary; filters: Filters }) {
  const tipoChart = (
    <RankingBarChart
      title="Delitos por tipo"
      labelWidth={230}
      views={[{ key: 'total', label: 'Total', rows: topConOtros(summary.by_tipo) }]}
      mutedLabel={OTROS}
    />
  )

  const estadoChart = (
    <RankingBarChart
      title="Delitos por estado"
      highlight={filters.entidad ?? undefined}
      labelWidth={250}
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
              formatLabel: (v: number) => fmtDecimal(v),
              rows: [...summary.tasa_by_entidad]
                .sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0))
                .map((e) => ({ label: e.entidad, value: e.tasa ?? 0 })),
              formatValue: (v: number) => fmtDecimal(v),
            }]
          : []),
      ]}
    />
  )

  const pieChart = (
    <TipoPieChart title="Delitos por tipo (% del total)" rows={topConOtros(summary.by_tipo, TOP_TIPOS_PIE)} mutedLabel={OTROS} />
  )

  const municipiosChart =
    !filters.entidad && !filters.municipio && summary.by_municipio.length > 0 ? (
      <RankingTable
        title="Top 15 municipios del país"
        rows={summary.by_municipio.map((m) => ({ name: m.municipio, sub: m.entidad, value: m.total }))}
      />
    ) : null

  return (
    <>
      {!filters.entidad && <div className="chart-grid chart-grid--single">{estadoChart}</div>}
      <div className="chart-grid">
        {tipoChart}
        {pieChart}
      </div>
      {municipiosChart && <div className="chart-grid chart-grid--single">{municipiosChart}</div>}
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
  // Total por año de todos los municipios del estado: alimenta la tabla y la gráfica municipal
  const munAnio = useMunicipiosAnio(filters)
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

      <AnalysisContext filters={filters} />

      {error && <div className="state-message state-message--error">Error cargando datos: {error}</div>}

      {loading && !summary && <div className="state-message">Cargando datos...</div>}

      {summary && (
        <>
          <KpiCards summary={summary} filters={filters} coverage={coverage} anioMin={options.anio_min} />

          <div className="chart-grid chart-grid--single">
            <Suspense fallback={<div className="state-message">Cargando mapa...</div>}>
              <ChoroplethMap summary={summary} filters={filters} mapData={mapData} coverage={coverage} onChange={setFilters} />
            </Suspense>
          </div>

          <div className="chart-grid chart-grid--single">
            <YearComparisonChart trend={summary.trend} filters={filters} coverage={coverage} />
          </div>

          {filters.entidad ? (
            <MunicipiosComparativa
              filters={filters}
              coverage={coverage}
              rows={munAnio.rows}
              loading={munAnio.loading}
              error={munAnio.error}
            />
          ) : (
            <div className="chart-grid chart-grid--single">
              <MunicipiosComparativa filters={filters} coverage={coverage} rows={null} loading={false} error={null} />
            </div>
          )}

          <RankingCharts summary={summary} filters={filters} />

          <Insights summary={summary} filters={filters} coverage={coverage} anioMin={options.anio_min} />
        </>
      )}
    </div>
  )
}

export default App
