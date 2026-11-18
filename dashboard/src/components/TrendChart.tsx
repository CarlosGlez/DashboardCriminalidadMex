import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { TrendPoint } from '../types'
import { fmtNumber, fmtAxis, paddedDomain } from '../utils/format'
import { useChartColors } from '../theme'
import { MESES_ABREV } from '../constants'

interface Props {
  trend: TrendPoint[]
}


export function TrendChart({ trend }: Props) {
  const colors = useChartColors()
  const data = trend.map((p) => ({
    label: `${MESES_ABREV[p.mes - 1]} ${String(p.anio).slice(2)}`,
    total: p.total,
  }))

  return (
    <div className="chart-card">
      <h3>Tendencia mensual</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.gridline} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: colors.muted, fontSize: 12 }}
            axisLine={{ stroke: colors.baseline }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: colors.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v) => fmtAxis(Number(v))}
            domain={paddedDomain(data.map((d) => d.total))}
          />
          <Tooltip
            formatter={(value) => fmtNumber(Number(value))}
            contentStyle={{ background: colors.surface, border: `1px solid ${colors.gridline}`, color: colors.textPrimary }}
            labelStyle={{ color: colors.textSecondary }}
          />
          <Line
            type="monotone"
            dataKey="total"
            name="Delitos"
            stroke={colors.accent}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
