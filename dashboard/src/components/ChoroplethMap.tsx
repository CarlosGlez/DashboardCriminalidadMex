import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { geoConicConformal, geoPath } from 'd3-geo'
import { scaleQuantile } from 'd3-scale'
import { useGeo } from '../hooks/useGeo'
import { useChartColors, useDarkMode, useSequentialColors } from '../theme'
import type { CrimeSummary, EntGeoProps, Filters, MapMunicipioRow, MunGeoProps } from '../types'
import { aniosAnomalosEn, coverageInScope, describir, formatAnios } from '../utils/coverage'
import type { CoverageMap } from '../utils/coverage'

interface MapData {
  rows: MapMunicipioRow[] | null
  loading: boolean
  error: string | null
}

interface Props {
  summary: CrimeSummary
  filters: Filters
  mapData: MapData
  coverage: CoverageMap
  onChange: (next: Filters) => void
}

type Metric = 'total' | 'tasa'

interface Shape {
  key: number | string // cve_mun (municipios) o nombre del estado
  name: string
  d: string
  value: number | null
}

const W = 760
const H = 480
const PAD = 6
const MIN_WARNING_SHARE = 0.02 // desde 2% de delitos sin municipio se muestra como aviso

const numberFmt = new Intl.NumberFormat('es-MX')
const tasaFmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })
const compactFmt = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 })

export function ChoroplethMap({ summary, filters, mapData, coverage, onChange }: Props) {
  const colors = useChartColors()
  const ramp = useSequentialColors()
  const dark = useDarkMode()
  const [metric, setMetric] = useState<Metric>('total')
  const [hover, setHover] = useState<Shape | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  const porEstado = !filters.entidad
  const hasTasa = summary.tasa_by_entidad.length > 0
  const activeMetric: Metric = porEstado && hasTasa ? metric : 'total'

  // ---- Geometrías ----
  const estados = useGeo<EntGeoProps>('estados.topo.json', 'ent')
  const entFeature = estados.data?.features.find((f) => f.properties.name === filters.entidad)
  const munPath = entFeature ? `mun/${String(entFeature.properties.e).padStart(2, '0')}.topo.json` : null
  const munGeo = useGeo<MunGeoProps>(munPath, 'mun')

  const geoError = estados.error ?? munGeo.error
  const collection = porEstado ? estados.data : munGeo.data

  // Los paths solo se recalculan al cambiar de geometría (no al cambiar métrica ni filtros)
  const geometry = useMemo(() => {
    if (!collection) return []
    // Cónica conforme como la que usa INEGI; se ajusta al área a mostrar
    const projection = geoConicConformal()
      .parallels([17.5, 29.5])
      .rotate([102, 0])
      .fitExtent([[PAD, PAD], [W - PAD, H - PAD]], collection)
    const path = geoPath(projection).digits(1)
    return collection.features.map((f) => {
      const p = f.properties as EntGeoProps & MunGeoProps
      return { key: porEstado ? p.name : p.c, d: path(f) ?? '' }
    })
  }, [collection, porEstado])

  // ---- Valores por forma ----
  const rows = mapData.rows
  const rowNames = useMemo(() => new Map((rows ?? []).map((r) => [r.cve_mun, r.municipio])), [rows])

  const valueByKey = useMemo(() => {
    const m = new Map<number | string, number>()
    if (porEstado) {
      if (activeMetric === 'tasa') {
        for (const e of summary.tasa_by_entidad) if (e.tasa !== null) m.set(e.entidad, e.tasa)
      } else {
        for (const e of summary.by_entidad) if (e.entidad) m.set(e.entidad, e.total)
      }
    } else {
      for (const r of rows ?? []) m.set(r.cve_mun, r.total)
    }
    return m
  }, [porEstado, activeMetric, summary.tasa_by_entidad, summary.by_entidad, rows])

  const shapes: Shape[] = useMemo(
    () =>
      geometry.map((g) => ({
        key: g.key,
        d: g.d,
        name: porEstado ? String(g.key) : (rowNames.get(g.key as number) ?? `Municipio ${g.key}`),
        value: valueByKey.get(g.key) ?? null,
      })),
    [geometry, porEstado, rowNames, valueByKey],
  )

  const scale = useMemo(() => {
    const values = shapes.flatMap((s) => (s.value === null ? [] : [s.value]))
    if (values.length === 0) return null
    return { q: scaleQuantile<string>().domain(values).range(ramp), min: Math.min(...values), max: Math.max(...values) }
  }, [shapes, ramp])

  const formatValue = (v: number) =>
    activeMetric === 'tasa' ? `${tasaFmt.format(v)} por 100 mil hab.` : `${numberFmt.format(v)} delitos`

  // ---- Delitos que el SESNSP no asigna a un municipio ("No especificado" / "Otros municipios") ----
  const unlocated = useMemo(() => {
    if (porEstado || !rows || geometry.length === 0) return null
    const known = new Set(geometry.map((g) => g.key))
    let sin = 0
    let con = 0
    for (const r of rows) {
      if (known.has(r.cve_mun)) con += r.total
      else sin += r.total
    }
    const total = sin + con
    return { total: sin, share: total > 0 ? sin / total : 0 }
  }, [porEstado, rows, geometry])

  // ---- Avisos ----
  // Estados con años anómalos (incompletos o con cambios bruscos de reporte) dentro del rango (RPC data_coverage)
  const anomalos = coverageInScope(coverage, filters.entidad).filter(
    (c) => aniosAnomalosEn(c, filters.anioDesde, filters.anioHasta).length > 0,
  )
  const avisos: string[] = []
  if (porEstado) {
    if (anomalos.length > 0) {
      avisos.push(
        `Datos atípicos o incompletos en el rango: ${describir(anomalos, filters.anioDesde, filters.anioHasta)}. ` +
          `El total y la tasa por 100 mil habitantes de esos estados en esos años no son comparables con el resto de su serie, y su color tampoco.`,
      )
    }
  } else {
    const cov = anomalos[0]
    if (cov) {
      const anios = formatAnios(aniosAnomalosEn(cov, filters.anioDesde, filters.anioHasta))
      if (cov.tipo === 'inestable') {
        avisos.push(
          `En ${filters.entidad}, la serie tiene cambios bruscos de reporte (años atípicos: ${anios}): ` +
            `los totales por municipio no son comparables entre años.`,
        )
      } else if (cov.tipo === 'puntual') {
        avisos.push(`En ${filters.entidad}, ${anios} es un año atípico: su total se desvía mucho del resto de la serie.`)
      } else {
        avisos.push(
          `En ${filters.entidad}, los datos de ${anios} están incompletos` +
            (cov.pct_sin_max ? ` (hasta ${cov.pct_sin_max}% de sus delitos sin municipio asignado)` : '') +
            `, por lo que en esos años sus municipios se ven por debajo de lo real.` +
            (cov.anio_completo_desde !== null && cov.anio_completo_desde <= filters.anioHasta
              ? ` Para comparar usa ${cov.anio_completo_desde} o después.`
              : ''),
        )
      }
    }
    if (unlocated && unlocated.share >= MIN_WARNING_SHARE) {
      avisos.push(
        `${numberFmt.format(unlocated.total)} delitos (${(unlocated.share * 100).toFixed(1)}%) de ${filters.entidad} ` +
          `no tienen municipio asignado en el SESNSP («No especificado» u «Otros municipios») y no aparecen en el mapa.`,
      )
    }
  }

  // ---- Interacción ----
  const select = (s: Shape) => {
    if (porEstado) {
      onChange({ ...filters, entidad: String(s.key), municipio: null, municipioNombre: null })
    } else if (s.value !== null) {
      const cve = s.key as number
      onChange(
        filters.municipio === cve
          ? { ...filters, municipio: null, municipioNombre: null }
          : { ...filters, municipio: cve, municipioNombre: s.name },
      )
    }
  }

  const moveTip = (e: MouseEvent) => {
    const wrap = wrapRef.current
    const tip = tipRef.current
    if (!wrap || !tip) return
    const rect = wrap.getBoundingClientRect()
    // Voltea el tooltip hacia la izquierda cerca del borde derecho
    const x = e.clientX - rect.left
    const flip = x > rect.width - 220
    tip.style.transform = `translate(${flip ? x - tip.offsetWidth - 12 : x + 12}px, ${e.clientY - rect.top + 12}px)`
  }

  const onKey = (e: KeyboardEvent, s: Shape) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select(s)
    }
  }

  const selectedShape = !porEstado ? shapes.find((s) => s.key === filters.municipio) : undefined

  const title = porEstado
    ? `Mapa por estado — ${activeMetric === 'tasa' ? 'tasa por 100 mil habitantes' : 'total de delitos'}`
    : `Mapa de municipios de ${filters.entidad} — total de delitos`

  const loading = estados.loading || munGeo.loading || (!porEstado && mapData.loading)
  const interactive = (s: Shape) => porEstado || s.value !== null

  // Límites de las clases para la leyenda
  const thresholds = scale ? [scale.min, ...scale.q.quantiles(), scale.max] : []
  const legendFmt = (v: number) => (activeMetric === 'tasa' ? tasaFmt.format(v) : compactFmt.format(v))
  const legendTitle =
    activeMetric === 'tasa'
      ? 'Delitos por cada 100,000 habitantes (promedio anual del periodo)'
      : `Total de delitos del periodo (${filters.anioDesde}-${filters.anioHasta}) por ${porEstado ? 'estado' : 'municipio'}`

  return (
    <div className="chart-card map-card">
      <div className="chart-card-header">
        <h3>{title}</h3>
        <div className="map-actions">
          {!porEstado && (
            <button
              type="button"
              className="view-toggle-btn map-back"
              onClick={() => onChange({ ...filters, entidad: null, municipio: null, municipioNombre: null })}
            >
              ← Todo el país
            </button>
          )}
          {porEstado && hasTasa && (
            <div className="view-toggle" role="group" aria-label="Métrica del mapa">
              {(['total', 'tasa'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={m === activeMetric ? 'view-toggle-btn view-toggle-btn--active' : 'view-toggle-btn'}
                  onClick={() => setMetric(m)}
                >
                  {m === 'total' ? 'Total' : 'Por 100k hab.'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="chart-note">
        {porEstado
          ? activeMetric === 'tasa'
            ? 'Tasa anual promedio del periodo por cada 100,000 habitantes. Haz clic en un estado para ver sus municipios.'
            : 'Total de delitos del periodo. Haz clic en un estado para ver sus municipios.'
          : 'Total de delitos del periodo por municipio. No hay población municipal cargada, por eso no se muestra la tasa por 100,000 habitantes. Haz clic en un municipio para filtrar.'}
      </p>

      {avisos.length > 0 && (
        <div className="map-warning" role="note">
          <strong>Atención:</strong> {avisos.join(' ')}
        </div>
      )}
      {avisos.length === 0 && unlocated && unlocated.total > 0 && (
        <p className="chart-note">
          {numberFmt.format(unlocated.total)} delitos sin municipio asignado («No especificado» u «Otros municipios») no se
          muestran en el mapa.
        </p>
      )}

      {(geoError || mapData.error) && (
        <div className="state-message state-message--error">
          Error cargando el mapa: {geoError ?? mapData.error}
        </div>
      )}

      <div className="map-wrap" ref={wrapRef}>
        {loading && <div className="map-loading">Cargando mapa...</div>}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="map-svg"
          role="group"
          aria-label={title}
          onMouseLeave={() => setHover(null)}
        >
          {shapes.map((s) => (
            <path
              key={s.key}
              d={s.d}
              className={interactive(s) ? 'map-shape map-shape--clickable' : 'map-shape'}
              fill={scale && s.value !== null ? scale.q(s.value) : colors.gridline}
              stroke={colors.surface}
              strokeWidth={porEstado ? 1 : 0.6}
              vectorEffect="non-scaling-stroke"
              onMouseEnter={(e) => {
                setHover(s)
                moveTip(e)
              }}
              onMouseMove={moveTip}
              onClick={() => select(s)}
              // Solo los estados (32) entran al orden de tabulación; para municipios está el filtro de Municipio
              tabIndex={porEstado ? 0 : undefined}
              role={porEstado ? 'button' : undefined}
              aria-label={porEstado ? `${s.name}: ${s.value === null ? 'sin datos' : formatValue(s.value)}` : undefined}
              onKeyDown={porEstado ? (e) => onKey(e, s) : undefined}
            />
          ))}
          {selectedShape && (
            <path d={selectedShape.d} className="map-outline" fill="none" stroke={colors.textPrimary}
              strokeWidth={2} vectorEffect="non-scaling-stroke" />
          )}
          {hover && hover.key !== selectedShape?.key && (
            <path d={hover.d} className="map-outline" fill="none" stroke={colors.textPrimary}
              strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        <div ref={tipRef} className="map-tooltip" hidden={!hover}>
          {hover && (
            <>
              <strong>{hover.name}</strong>
              <span>{hover.value === null ? 'Sin datos' : formatValue(hover.value)}</span>
            </>
          )}
        </div>
      </div>

      {scale && (
        <div className="map-legend">
          <div className="map-legend-title">{legendTitle}</div>
          <div className="map-legend-scale">
            <span className="map-legend-end">{activeMetric === 'tasa' ? 'Menor tasa' : 'Menos delitos'}</span>
            <div className="map-legend-body">
              <div className="map-legend-bar">
                {ramp.map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </div>
              <div className="map-legend-labels">
                {thresholds.map((t, i) => (
                  <span key={i}>{legendFmt(t)}</span>
                ))}
              </div>
            </div>
            <span className="map-legend-end">{activeMetric === 'tasa' ? 'Mayor tasa' : 'Más delitos'}</span>
          </div>
          <div className="map-legend-caption">
            {dark ? 'Más claro' : 'Más oscuro'} = {activeMetric === 'tasa' ? 'mayor tasa' : 'más delitos'}. Cada color agrupa a
            una séptima parte de los {porEstado ? 'estados' : 'municipios'}; los números son los límites entre colores.
          </div>
          <div className="map-legend-nodata">
            <span style={{ background: colors.gridline }} /> Sin datos
          </div>
        </div>
      )}
    </div>
  )
}
