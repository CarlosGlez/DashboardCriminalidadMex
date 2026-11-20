import { useMemo, useState } from 'react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { Filters, MunicipioAnioRow } from '../types'
import { aniosAnomalosEn, coverageInScope, formatAnios } from '../utils/coverage'
import type { CoverageMap } from '../utils/coverage'
import { fmtMil, fmtNumber, fmtPctChange, fmtSigned, niceScale } from '../utils/format'
import { buildMunicipios, MAX_MUNICIPIOS } from '../utils/municipios'
import type { MunicipioStats } from '../utils/municipios'
import { useChartColors } from '../theme'
import { WarnTip } from './WarnTip'

interface Props {
  filters: Filters
  coverage: CoverageMap
  rows: MunicipioAnioRow[] | null
  loading: boolean
  error: string | null
}

type SortKey = 'municipio' | 'inicial' | 'final' | 'diff' | 'pct' | 'periodo'

const TOP_VISIBLE = 20
const DEFAULT_COUNT = 3

// Tabla comparativa de municipios del estado + gráfica municipio vs. municipio.
// Ambas salen de la misma respuesta (municipios_anio); la casilla "Comparar" de la tabla
// agrega o quita municipios de la gráfica.
export function MunicipiosComparativa({ filters, coverage, rows, loading, error }: Props) {
  const colors = useChartColors()
  const [picked, setPicked] = useState<number[] | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'periodo', dir: 'desc' })
  const [showAll, setShowAll] = useState(false)

  const { anioDesde, anioHasta, entidad, municipio } = filters

  const munis = useMemo(() => (rows ? buildMunicipios(rows, anioDesde, anioHasta) : []), [rows, anioDesde, anioHasta])

  if (!entidad) {
    return (
      <div className="chart-card">
        <div className="chart-card-header">
          <h3>Comparativa de municipios</h3>
        </div>
        <p className="chart-note chart-note--empty">Elige un estado para comparar sus municipios</p>
      </div>
    )
  }

  if (error) return <div className="state-message state-message--error">Error cargando municipios: {error}</div>
  if (loading || !rows) return <div className="state-message">Cargando municipios...</div>

  const byCve = new Map(munis.map((m) => [m.cve_mun, m]))

  // Por defecto: el municipio del filtro + los de mayor total del estado hasta completar 3.
  // La selección manual se limpia de municipios que ya no están en los datos.
  const defaults: number[] = []
  if (municipio !== null && byCve.has(municipio)) defaults.push(municipio)
  for (const m of munis) {
    if (defaults.length >= DEFAULT_COUNT) break
    if (!defaults.includes(m.cve_mun)) defaults.push(m.cve_mun)
  }
  const active = picked === null ? defaults : picked.filter((c) => byCve.has(c))

  const toggle = (cve: number) => {
    const next = active.includes(cve) ? active.filter((c) => c !== cve) : [...active, cve]
    if (next.length > MAX_MUNICIPIOS) return
    setPicked(next)
  }

  // ---- Tabla ----
  const sorted = [...munis].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    if (sort.key === 'municipio') return a.municipio.localeCompare(b.municipio, 'es') * dir
    // % cambio indefinido ("—") siempre al final
    if (sort.key === 'pct') {
      if (a.pct === null && b.pct === null) return 0
      if (a.pct === null) return 1
      if (b.pct === null) return -1
    }
    return ((a[sort.key] as number) - (b[sort.key] as number)) * dir
  })
  const visible: MunicipioStats[] = showAll ? sorted : sorted.slice(0, TOP_VISIBLE)
  // El municipio del filtro siempre se ve, aunque quede fuera del top
  const seleccionado = municipio !== null ? byCve.get(municipio) : undefined
  const extra = !showAll && seleccionado && !visible.includes(seleccionado) ? seleccionado : null

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'municipio' ? 'asc' : 'desc' }))
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none')
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '')

  // Aviso si el año inicial o el final es atípico para el estado
  const extremosAtipicos = coverageInScope(coverage, entidad)
    .flatMap((c) => [...aniosAnomalosEn(c, anioDesde, anioDesde), ...aniosAnomalosEn(c, anioHasta, anioHasta)])
    .filter((y, i, arr) => arr.indexOf(y) === i)
  const avisoExtremos = `Ojo: ${formatAnios(extremosAtipicos)} es un año atípico o incompleto en ${entidad}; la diferencia y el % de cambio pueden no ser comparables.`

  const th = (key: SortKey, label: string, num = true) => (
    <th scope="col" aria-sort={ariaSort(key)} className={num ? 'mt-num' : undefined}>
      <button type="button" className="mt-sort" onClick={() => onSort(key)}>
        {label}
        <span aria-hidden="true">{arrow(key)}</span>
      </button>
    </th>
  )

  const renderRow = (m: MunicipioStats) => {
    const on = active.includes(m.cve_mun)
    const blocked = !on && active.length >= MAX_MUNICIPIOS
    const tone = m.diff === 0 ? '' : m.diff > 0 ? 'stat-delta--up' : 'stat-delta--down'
    return (
      <tr key={m.cve_mun} className={m.cve_mun === municipio ? 'mt-row mt-row--selected' : 'mt-row'}>
        <th scope="row" className="mt-name">{m.municipio}</th>
        <td className="mt-num">{fmtNumber(m.inicial)}</td>
        <td className="mt-num">{fmtNumber(m.final)}</td>
        <td className={`mt-num ${tone}`}>{fmtSigned(m.diff)}</td>
        <td className={`mt-num ${m.pct === null ? '' : tone}`}>{fmtPctChange(m.pct)}</td>
        <td className="mt-num">{fmtNumber(m.periodo)}</td>
        <td className="mt-check">
          <input
            type="checkbox"
            checked={on}
            disabled={blocked}
            aria-label={`Comparar ${m.municipio}`}
            title={blocked ? `Máximo ${MAX_MUNICIPIOS} municipios` : undefined}
            onChange={() => toggle(m.cve_mun)}
          />
        </td>
      </tr>
    )
  }

  // ---- Gráfica ----
  const years: number[] = []
  for (let y = anioDesde; y <= anioHasta; y++) years.push(y)
  // El primero en acento; los demás en tonos neutros, además con trazo distinto
  const lineColors = [colors.accent, colors.bar, colors.barMuted, colors.barSoft]
  const dashes = [undefined, '6 3', '2 3', '8 3 2 3']
  const chartData = years.map((y) => {
    const point: Record<string, number> = { anio: y }
    for (const c of active) point[`m${c}`] = byCve.get(c)?.byYear.get(y) ?? 0
    return point
  })
  const { domain, ticks } = niceScale(chartData.flatMap((p) => active.map((c) => p[`m${c}`])))

  return (
    <>
      <div className="chart-grid chart-grid--single">
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="warn-anchor warn-anchor--left">
              Comparativa de municipios de {entidad}
              {extremosAtipicos.length > 0 && <WarnTip text={avisoExtremos} />}
            </h3>
            <span className="chart-note">{munis.length} municipios</span>
          </div>
          {anioDesde === anioHasta && (
            <p className="chart-note">Elige un periodo de más de un año para ver la diferencia entre el año inicial y el final.</p>
          )}
          {munis.length === 0 ? (
            <p className="chart-note chart-note--empty">Sin datos de municipios para este filtro</p>
          ) : (
            <>
              <div className="mt-scroll">
                <table className="mt-table">
                  <thead>
                    <tr>
                      {th('municipio', 'Municipio', false)}
                      {th('inicial', `Total ${anioDesde}`)}
                      {th('final', `Total ${anioHasta}`)}
                      {th('diff', 'Diferencia')}
                      {th('pct', '% cambio')}
                      {th('periodo', 'Total del periodo')}
                      <th scope="col" className="mt-check">Comparar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(renderRow)}
                    {extra && renderRow(extra)}
                  </tbody>
                </table>
              </div>
              {munis.length > TOP_VISIBLE && (
                <button type="button" className="view-toggle-btn year-add mt-more" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? `Ver solo los ${TOP_VISIBLE} primeros` : `Ver todos (${munis.length})`}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {munis.length > 0 && (
        <div className="chart-grid chart-grid--single">
          <div className="chart-card">
            <div className="chart-card-header">
              <h3>Municipio contra municipio</h3>
              <ul className="year-chips" aria-label="Municipios en la gráfica">
                {active.map((c, i) => (
                  <li key={c} className="year-chip">
                    <span className="year-chip-dot" style={{ background: lineColors[i % lineColors.length] }} aria-hidden="true" />
                    {byCve.get(c)?.municipio}
                    <button
                      type="button"
                      className="year-chip-x"
                      aria-label={`Quitar ${byCve.get(c)?.municipio}`}
                      onClick={() => toggle(c)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {active.length === 0 ? (
              <p className="chart-note chart-note--empty">
                Marca la casilla «Comparar» en la tabla para agregar municipios (máximo {MAX_MUNICIPIOS}).
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={colors.gridline} vertical={false} />
                  <XAxis
                    dataKey="anio"
                    tick={{ fill: colors.muted, fontSize: 13 }}
                    axisLine={{ stroke: colors.baseline }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: colors.muted, fontSize: 13 }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                    tickFormatter={(v) => fmtMil(Number(v))}
                    domain={domain}
                    ticks={ticks}
                  />
                  <Tooltip
                    formatter={(value) => fmtNumber(Number(value))}
                    itemSorter={(item) => -Number(item.value)}
                    contentStyle={{ background: colors.surface, border: `1px solid ${colors.gridline}`, color: colors.textPrimary }}
                    labelStyle={{ color: colors.textSecondary }}
                  />
                  {active.map((c, i) => (
                    <Line
                      key={c}
                      type="monotone"
                      dataKey={`m${c}`}
                      name={byCve.get(c)?.municipio}
                      stroke={lineColors[i % lineColors.length]}
                      strokeDasharray={dashes[i % dashes.length]}
                      strokeWidth={i === 0 ? 3.5 : 2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </>
  )
}
