import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { fmtNumber } from '../utils/format'
import { useChartColors, useSequentialColors } from '../theme'

interface Slice {
  label: string
  value: number
}

interface Props {
  title: string
  /** Top de tipos; la última rebanada puede ser "Otros" (se pinta en gris). */
  rows: Slice[]
  mutedLabel?: string
}

const fmtPct = (v: number) => `${v.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

// Dona de delitos por tipo: top 6 + "Otros", con % del total en la leyenda y el tooltip.
export function TipoPieChart({ title, rows, mutedLabel }: Props) {
  const colors = useChartColors()
  const seq = useSequentialColors()
  const palette = [colors.accent, colors.bar, colors.barSoft, colors.warning, seq[6], seq[2]]
  const total = rows.reduce((acc, r) => acc + r.value, 0)
  const colorOf = (r: Slice, i: number) => (r.label === mutedLabel ? colors.barMuted : palette[i % palette.length])
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0)

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload || payload.length === 0) return null
    const r = payload[0].payload as Slice
    return (
      <div className="yc-tooltip">
        <div className="yc-tooltip-title">{r.label}</div>
        <div className="yc-tooltip-row">
          <span>Total</span>
          <strong>{fmtNumber(r.value)}</strong>
        </div>
        <div className="yc-tooltip-row">
          <span>% del total</span>
          <strong>{fmtPct(pct(r.value))}</strong>
        </div>
      </div>
    )
  }

  return (
    <div className="chart-card chart-card--fill">
      <div className="chart-card-header">
        <h3>{title}</h3>
      </div>
      <div className="pie-body">
        <div className="pie-chart" role="img" aria-label={`${title}: ${rows.map((r) => `${r.label} ${fmtPct(pct(r.value))}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="label"
                innerRadius="58%"
                outerRadius="95%"
                paddingAngle={1}
                stroke={colors.surface}
                isAnimationActive={false}
              >
                {rows.map((r, i) => (
                  <Cell key={r.label} fill={colorOf(r, i)} />
                ))}
              </Pie>
              <Tooltip content={renderTooltip} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="pie-legend">
          {rows.map((r, i) => (
            <li key={r.label} className="pie-legend-row">
              <span className="year-chip-dot" style={{ background: colorOf(r, i) }} aria-hidden="true" />
              <span className="pie-legend-name">{r.label}</span>
              <strong>{fmtPct(pct(r.value))}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
