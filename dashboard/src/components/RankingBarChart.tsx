import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useChartColors } from '../theme'

interface Row {
  label: string
  value: number
}

interface View {
  key: string
  label: string
  rows: Row[]
  formatValue?: (v: number) => string
}

interface Props {
  title: string
  views: View[]
  highlight?: string
}

const numberFmt = new Intl.NumberFormat('es-MX')
const defaultFormat = (v: number) => numberFmt.format(v)

export function RankingBarChart({ title, views, highlight }: Props) {
  const colors = useChartColors()
  const [activeKey, setActiveKey] = useState(views[0]?.key)
  const active = views.find((v) => v.key === activeKey) ?? views[0]
  const format = active?.formatValue ?? defaultFormat
  const height = Math.max(180, (active?.rows.length ?? 0) * 32)

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3>{title}</h3>
        {views.length > 1 && (
          <div className="view-toggle" role="group" aria-label={`Vista de ${title}`}>
            {views.map((v) => (
              <button
                key={v.key}
                type="button"
                className={v.key === active?.key ? 'view-toggle-btn view-toggle-btn--active' : 'view-toggle-btn'}
                onClick={() => setActiveKey(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={active?.rows ?? []} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={colors.gridline} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: colors.muted, fontSize: 12 }}
            axisLine={{ stroke: colors.baseline }}
            tickLine={false}
            tickFormatter={(v) => format(Number(v))}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: colors.textSecondary, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={160}
            interval={0}
          />
          <Tooltip
            formatter={(value) => format(Number(value))}
            contentStyle={{ background: colors.surface, border: `1px solid ${colors.gridline}`, color: colors.textPrimary }}
            labelStyle={{ color: colors.textSecondary }}
            cursor={{ fill: colors.gridline, opacity: 0.4 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {(active?.rows ?? []).map((r) => (
              <Cell key={r.label} fill={r.label === highlight ? colors.critical : colors.series1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
