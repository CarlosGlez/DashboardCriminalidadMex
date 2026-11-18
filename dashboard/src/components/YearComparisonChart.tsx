import { useState } from 'react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { TrendPoint } from '../types'
import { fmtNumber, fmtMil, paddedDomain } from '../utils/format'
import { useChartColors } from '../theme'
import { MESES_ABREV } from '../constants'

interface Props {
  trend: TrendPoint[]
}

const MAX_ACTIVE = 4

export function YearComparisonChart({ trend }: Props) {
  const colors = useChartColors()
  const [picked, setPicked] = useState<number[] | null>(null)
  const [open, setOpen] = useState(false)

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

  const byMonth = new Map<number, Record<string, number | string>>()
  for (let mes = 1; mes <= 12; mes++) byMonth.set(mes, { label: MESES_ABREV[mes - 1] })
  for (const p of trend) {
    if (!active.includes(p.anio)) continue
    byMonth.get(p.mes)![String(p.anio)] = p.total
  }
  const data = Array.from(byMonth.values())

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3>Comparativa año contra año</h3>
        <div className="year-picker">
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
                      onClick={() => toggle(y)}
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
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.gridline} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: colors.muted, fontSize: 12 }}
            axisLine={{ stroke: colors.baseline }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: colors.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v) => fmtMil(Number(v))}
            domain={paddedDomain(trend.filter((p) => active.includes(p.anio)).map((p) => p.total))}
          />
          <Tooltip
            formatter={(value) => fmtNumber(Number(value))}
            itemSorter={(item) => -Number(item.name)}
            contentStyle={{ background: colors.surface, border: `1px solid ${colors.gridline}`, color: colors.textPrimary }}
            labelStyle={{ color: colors.textSecondary }}
          />
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
