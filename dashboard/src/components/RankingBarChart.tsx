import { useState } from 'react'
import {
  Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmtNumber, fmtCompact } from '../utils/format'
import { useChartColors } from '../theme'

interface Row {
  label: string
  value: number
}

interface View {
  key: string
  label: string
  rows: Row[]
  /** Formato del tooltip (por defecto número completo). */
  formatValue?: (v: number) => string
  /** Formato del valor al final de la barra (por defecto k/M, ej. 7.1 M, 515k). */
  formatLabel?: (v: number) => string
  /** Nombre del valor en el tooltip (por defecto "Delitos"). */
  valueLabel?: string
}

interface Props {
  title: string
  views: View[]
  /** Etiqueta del elemento seleccionado en el filtro (se pinta en --accent). */
  highlight?: string
  /** Etiqueta de la barra que se pinta en gris (p. ej. "Otros"). */
  mutedLabel?: string
  /** Ancho (px) reservado para las etiquetas del eje Y; define dónde se parte el nombre en varias líneas. */
  labelWidth?: number
}

const ROW_HEIGHT = 36
const LINE_HEIGHT = 13

// Parte un nombre en líneas de a lo sumo `maxChars` caracteres, sin cortar palabras ni truncar.
function wrapLabel(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(' ')) {
    if (current && `${current} ${word}`.length > maxChars) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) lines.push(current)
  return lines
}

interface TickProps {
  x?: number
  y?: number
  index?: number
  payload?: { value: string }
  fill: string
  maxChars: number
}

// Etiqueta del eje Y con el nombre completo (en varias líneas si hace falta); la primera, en negritas.
function CategoryTick({ x, y, index, payload, fill, maxChars }: TickProps) {
  const lines = wrapLabel(String(payload?.value ?? ''), maxChars)
  const firstDy = 4 - ((lines.length - 1) * LINE_HEIGHT) / 2
  return (
    <text x={x} y={y} textAnchor="end" fill={fill} fontSize={12} fontWeight={index === 0 ? 700 : 400}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? firstDy : LINE_HEIGHT}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

const defaultFormat = (v: number) => fmtNumber(v)

export function RankingBarChart({ title, views, highlight, mutedLabel, labelWidth = 170 }: Props) {
  const colors = useChartColors()
  const [activeKey, setActiveKey] = useState(views[0]?.key)
  const active = views.find((v) => v.key === activeKey) ?? views[0]
  const format = active?.formatValue ?? defaultFormat
  const formatLabel = active?.formatLabel ?? fmtCompact
  const rows = active?.rows ?? []
  const height = Math.max(180, rows.length * ROW_HEIGHT + 16)

  return (
    <div className="chart-card chart-card--fill">
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
      <div className="chart-fill" style={{ minHeight: height }}>
        <div className="chart-fill-inner">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                tick={<CategoryTick fill={colors.textPrimary} maxChars={Math.floor(labelWidth / 6.4)} />}
                axisLine={false}
                tickLine={false}
                width={labelWidth}
                interval={0}
              />
              <Tooltip
                formatter={(value) => format(Number(value))}
                contentStyle={{ background: colors.surface, border: `1px solid ${colors.gridline}`, color: colors.textPrimary }}
                labelStyle={{ color: colors.textSecondary }}
                cursor={{ fill: colors.gridline, opacity: 0.4 }}
              />
              <Bar dataKey="value" name={active?.valueLabel ?? 'Delitos'} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                {rows.map((r, i) => (
                  <Cell
                    key={r.label}
                    fill={
                      r.label === highlight ? colors.accent
                        : r.label === mutedLabel ? colors.barMuted
                          : i === 0 ? colors.barTop
                            : colors.barSoft
                    }
                  />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: unknown) => formatLabel(Number(v))}
                  fill={colors.textPrimary}
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
