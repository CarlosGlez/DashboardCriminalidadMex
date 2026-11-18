import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { TrendPoint } from '../types'
import { fmtNumber, fmtAxis } from '../utils/format'
import { useChartColors } from '../theme'
import { MESES_ABREV } from '../constants'

interface Props {
  trend: TrendPoint[]
}

const MAX_YEARS = 8


export function YearComparisonChart({ trend }: Props) {
  const colors = useChartColors()

  const allYears = Array.from(new Set(trend.map((p) => p.anio))).sort((a, b) => a - b)
  const years = allYears.slice(Math.max(0, allYears.length - MAX_YEARS))
  const omitted = allYears.length - years.length
  const latest = years[years.length - 1]

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
      {latest !== undefined && (
        <p className="chart-note">
          Resaltado: {latest} (año más reciente). Pasa el mouse sobre una línea para ver los valores de cada año.
        </p>
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
          <YAxis
            tick={{ fill: colors.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v) => fmtAxis(Number(v))}
          />
          <Tooltip
            formatter={(value) => fmtNumber(Number(value))}
            itemSorter={(item) => -Number(item.name)}
            contentStyle={{ background: colors.surface, border: `1px solid ${colors.gridline}`, color: colors.textPrimary }}
            labelStyle={{ color: colors.textSecondary }}
          />
          {years.map((y) => (
            <Line
              key={y}
              type="monotone"
              dataKey={String(y)}
              name={String(y)}
              stroke={y === latest ? colors.series1 : colors.baseline}
              strokeWidth={y === latest ? 3.5 : 1.25}
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
