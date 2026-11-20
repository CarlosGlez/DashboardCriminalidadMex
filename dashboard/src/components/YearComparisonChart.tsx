import { useEffect, useRef, useState } from 'react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { Filters, TrendPoint } from '../types'
import { fmtNumber, fmtMil, fmtPctChange, fmtSigned, niceScale, pctChange } from '../utils/format'
import { coverageInScope, formatAnios } from '../utils/coverage'
import type { CoverageMap } from '../utils/coverage'
import { useChartColors } from '../theme'
import { MESES_ABREV } from '../constants'
import { WarnTip } from './WarnTip'

interface Props {
  trend: TrendPoint[]
  filters: Filters
  coverage: CoverageMap
}

// "ene–sep" si los meses son consecutivos; "ene, mar, may" si no.
function mesesTexto(meses: number[]) {
  const s = [...meses].sort((a, b) => a - b)
  const nombre = (m: number) => MESES_ABREV[m - 1].toLowerCase()
  const consecutivos = s.every((m, i) => i === 0 || m === s[i - 1] + 1)
  return consecutivos && s.length > 1 ? `${nombre(s[0])}–${nombre(s[s.length - 1])}` : s.map(nombre).join(', ')
}

function DeltaText({ diff, pct }: { diff: number; pct: number | null }) {
  const up = diff >= 0
  return (
    <span className={`stat-delta ${up ? 'stat-delta--up' : 'stat-delta--down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {fmtSigned(diff)} ({fmtPctChange(pct)})
    </span>
  )
}

const MAX_ACTIVE = 4

export function YearComparisonChart({ trend, filters, coverage }: Props) {
  const colors = useChartColors()
  const [picked, setPicked] = useState<number[] | null>(null)
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // El menú se cierra con Esc y con clic fuera
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const allYears = Array.from(new Set(trend.map((p) => p.anio))).sort((a, b) => a - b)

  // Por defecto: el año más reciente contra el anterior. La selección manual se limpia
  // de años que ya no están en el rango filtrado.
  const manual = (picked ?? []).filter((y) => allYears.includes(y))
  const active = (manual.length > 0 ? manual : allYears.slice(-2)).sort((a, b) => a - b)
  const latest = active[active.length - 1]

  // Más reciente en acento; los anteriores, de más cercano a más lejano, en tonos neutros distinguibles
  const olderColors = [colors.barMuted, colors.barSoft, colors.bar]
  const colorOf = (y: number) => {
    if (y === latest) return colors.accent
    const rank = [...active].reverse().indexOf(y) - 1 // 0 = el inmediato anterior
    return olderColors[rank % olderColors.length]
  }

  const toggle = (y: number) => {
    const next = active.includes(y) ? active.filter((a) => a !== y) : [...active, y]
    if (next.length === 0 || next.length > MAX_ACTIVE) return
    setPicked(next)
  }

  // Elegir un año en el menú lo cierra
  const choose = (y: number) => {
    toggle(y)
    setOpen(false)
  }

  const byMonth = new Map<number, Record<string, number | string>>()
  for (let mes = 1; mes <= 12; mes++) byMonth.set(mes, { label: MESES_ABREV[mes - 1], mes })
  for (const p of trend) {
    if (!active.includes(p.anio)) continue
    byMonth.get(p.mes)![String(p.anio)] = p.total
  }
  const data = Array.from(byMonth.values())
  const { domain, ticks } = niceScale(trend.filter((p) => active.includes(p.anio)).map((p) => p.total))

  // Total por (año, mes); un mes sin fila no tiene datos
  const valueOf = new Map<string, number>()
  for (const p of trend) valueOf.set(`${p.anio}-${p.mes}`, p.total)

  // Cada año activo contra el más reciente. Si falta algún mes en alguno de los dos,
  // se comparan solo los meses que tienen ambos.
  const resumenes = active
    .filter((y) => y !== latest)
    .reverse()
    .map((y) => {
      const comunes: number[] = []
      for (let mes = 1; mes <= 12; mes++) {
        if (valueOf.has(`${y}-${mes}`) && valueOf.has(`${latest}-${mes}`)) comunes.push(mes)
      }
      const totalY = comunes.reduce((acc, m) => acc + (valueOf.get(`${y}-${m}`) ?? 0), 0)
      const totalLatest = comunes.reduce((acc, m) => acc + (valueOf.get(`${latest}-${m}`) ?? 0), 0)
      return {
        y,
        comunes,
        totalY,
        totalLatest,
        diff: totalLatest - totalY,
        pct: pctChange(totalY, totalLatest),
        parcial: comunes.length < 12,
      }
    })

  // Años atípicos (incompletos o con cambios bruscos de reporte) entre los años comparados
  const atipicos = coverageInScope(coverage, filters.entidad)
    .map((c) => ({ entidad: c.entidad, anios: c.anios_anomalos.filter((y) => active.includes(y)) }))
    .filter((c) => c.anios.length > 0)
  const avisoAtipicos = `Ojo: incluye años atípicos o incompletos: ${atipicos
    .map((c) => `${c.entidad} (${formatAnios(c.anios)})`)
    .join(', ')}.`

  const renderTooltip = ({ active: on, payload, label }: TooltipContentProps) => {
    if (!on || !payload || payload.length === 0) return null
    const mes = (payload[0].payload as { mes: number }).mes
    const vals = active
      .map((y) => ({ y, v: valueOf.get(`${y}-${mes}`) }))
      .filter((r): r is { y: number; v: number } => r.v !== undefined)
      .reverse()
    const latestVal = valueOf.get(`${latest}-${mes}`)
    return (
      <div className="yc-tooltip">
        <div className="yc-tooltip-title">{label}</div>
        {vals.map((r) => (
          <div key={r.y} className="yc-tooltip-row">
            <span className="year-chip-dot" style={{ background: colorOf(r.y) }} aria-hidden="true" />
            <span>{r.y}</span>
            <strong>{fmtNumber(r.v)}</strong>
          </div>
        ))}
        {latestVal !== undefined &&
          vals
            .filter((r) => r.y !== latest)
            .map((r) => (
              <div key={`d${r.y}`} className="yc-tooltip-delta">
                {latest} vs {r.y}:{' '}
                <DeltaText diff={latestVal - r.v} pct={pctChange(r.v, latestVal)} />
              </div>
            ))}
      </div>
    )
  }

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3 className="warn-anchor warn-anchor--left">
          Comparativa año contra año
          {atipicos.length > 0 && <WarnTip text={avisoAtipicos} />}
        </h3>
        <div className="year-picker" ref={pickerRef}>
          <ul className="year-chips" aria-label="Años activos">
            {[...active].reverse().map((y) => (
              <li key={y} className="year-chip">
                <span className="year-chip-dot" style={{ background: colorOf(y) }} aria-hidden="true" />
                {y}
                {active.length > 1 && (
                  <button type="button" className="year-chip-x" aria-label={`Quitar ${y}`} onClick={() => toggle(y)}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="view-toggle-btn year-add"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            Elegir años +
          </button>
          {open && (
            <div className="year-menu" role="group" aria-label={`Elegir años (máximo ${MAX_ACTIVE})`}>
              <p className="year-menu-note">Máximo {MAX_ACTIVE} años</p>
              <div className="year-menu-grid">
                {[...allYears].reverse().map((y) => {
                  const on = active.includes(y)
                  const blocked = !on && active.length >= MAX_ACTIVE
                  return (
                    <button
                      key={y}
                      type="button"
                      className={on ? 'year-option year-option--on' : 'year-option'}
                      aria-pressed={on}
                      disabled={blocked}
                      onClick={() => choose(y)}
                    >
                      {y}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {resumenes.length > 0 && (
        <div className="yc-summary">
          {resumenes.map((r) => (
            <div key={r.y} className="yc-card">
              <span className="yc-card-title">
                <span className="year-chip-dot" style={{ background: colorOf(r.y) }} aria-hidden="true" />
                {latest} vs {r.y}
              </span>
              {r.comunes.length === 0 ? (
                <span className="stat-sub">Sin meses en común para comparar</span>
              ) : (
                <>
                  <span className="yc-card-delta">
                    <DeltaText diff={r.diff} pct={r.pct} />
                  </span>
                  <span className="stat-sub">
                    {r.y}: {fmtNumber(r.totalY)} · {latest}: {fmtNumber(r.totalLatest)}
                  </span>
                  {r.parcial && <span className="yc-card-note">Comparando {mesesTexto(r.comunes)}</span>}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.gridline} vertical={false} />
          <XAxis
            dataKey="label"
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
          <Tooltip content={renderTooltip} />
          {active.map((y) => (
            <Line
              key={y}
              type="monotone"
              dataKey={String(y)}
              name={String(y)}
              stroke={colorOf(y)}
              strokeWidth={y === latest ? 3.5 : 2}
              dot={false}
              activeDot={{ r: y === latest ? 5 : 3 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
