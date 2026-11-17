import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { TrendPoint } from '../types'
import { useChartColors, useCategoricalColors } from '../theme'
import { MESES_ABREV } from '../constants'

interface Props {
  trend: TrendPoint[]
}

const MAX_YEARS = 8

const numberFmt = new Intl.NumberFormat('es-MX')

export function YearComparisonChart({ trend }: Props) {
  const colors = useChartColors()
  const seriesColors = useCategoricalColors()

  const allYears = Array.from(new Set(trend.map((p) => p.anio))).sort((a, b) => a - b)
  const years = allYears.slice(Math.max(0, allYears.length - MAX_YEARS))
  const omitted = allYears.length - years.length

  const byMonth = new Map<number, Record<string, number | string>>()
  for (let mes = 1; mes <= 12; mes++) byMonth.set(mes, { label: MESES_ABREV[mes - 1] })
  for (const p of trend) {
    if (!years.includes(p.anio)) continue
    const row = byMonth.get(p.mes)!
    row[String(p.anio)] = p.total
  }
  const data = Array.from(byMonth.values())

  return (
    <div className="chart-card">
      <h3>Comparativa año contra año</h3>
      {omitted > 0 && (
        <p className="chart-note">Mostrando los últimos {MAX_YEARS} años del rango seleccionado ({omitted} año(s) omitido(s) para mantener la lectura clara).</p>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.gridline} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: colors.muted, fontSize: 12 }}
            axisLine={{ stroke: colors.baseline }}
            tickLine={false}
          />
          <YAxis tick={{ fill: colors.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            formatter={(value) => numberFmt.format(Number(value))}
            contentStyle={{ background: colors.surface, border: `1px solid ${colors.gridline}`, color: colors.textPrimary }}
            labelStyle={{ color: colors.textSecondary }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: colors.textSecondary }} />
          {years.map((y, i) => (
            <Line
              key={y}
              type="monotone"
              dataKey={String(y)}
              name={String(y)}
              stroke={seriesColors[i % seriesColors.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
