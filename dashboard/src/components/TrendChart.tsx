import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
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
  const sorted = [...trend].sort((a, b) => a.anio - b.anio || a.mes - b.mes)
  const data = sorted.map((p) => ({ key: `${p.anio}-${p.mes}`, anio: p.anio, mes: p.mes, total: p.total }))

  // Una marca por año, en el primer mes disponible de cada uno: el eje muestra solo años
  const ticks: string[] = []
  const seen = new Set<number>()
  for (const d of data) {
    if (!seen.has(d.anio)) {
      seen.add(d.anio)
      ticks.push(d.key)
    }
  }
  const byKey = new Map(data.map((d) => [d.key, d]))

  return (
    <div className="chart-card">
      <h3>Tendencia mensual</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.gridline} vertical={false} />
          <XAxis
            dataKey="key"
            ticks={ticks}
            interval={0}
            tickFormatter={(k) => String(byKey.get(String(k))?.anio ?? '')}
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
            domain={paddedDomain(data.map((d) => d.total))}
          />
          <Tooltip
            formatter={(value) => fmtNumber(Number(value))}
            labelFormatter={(k) => {
              const d = byKey.get(String(k))
              return d ? `${MESES_ABREV[d.mes - 1]} ${d.anio}` : String(k)
            }}
            contentStyle={{ background: colors.surface, border: `1px solid ${colors.gridline}`, color: colors.textPrimary }}
            labelStyle={{ color: colors.textSecondary }}
          />
          <Area
            type="monotone"
            dataKey="total"
            name="Delitos"
            stroke={colors.accent}
            strokeWidth={2}
            fill={colors.accent}
            fillOpacity={0.15}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
