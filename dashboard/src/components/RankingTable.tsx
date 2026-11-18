import { fmtCompact, fmtNumber } from '../utils/format'

export interface RankingRow {
  name: string
  /** Texto pequeño bajo el nombre (p. ej. el estado). */
  sub?: string
  value: number
}

interface Props {
  title: string
  rows: RankingRow[]
}

// Ranking tipo tabla: lugar, nombre (con estado debajo), barra sobre pista y valor al final.
export function RankingTable({ title, rows }: Props) {
  const max = Math.max(...rows.map((r) => r.value), 1)

  return (
    <div className="chart-card chart-card--fill">
      <div className="chart-card-header">
        <h3>{title}</h3>
      </div>
      <ol className="rank-table">
        {rows.map((r, i) => (
          <li key={`${r.name}-${r.sub ?? ''}`} className="rank-row" title={`${r.name}${r.sub ? `, ${r.sub}` : ''}: ${fmtNumber(r.value)} delitos`}>
            <span className="rank-pos">{i + 1}</span>
            <span className="rank-name">
              <strong>{r.name}</strong>
              {r.sub && <small>{r.sub}</small>}
            </span>
            <span className="rank-track" aria-hidden="true">
              <span
                className={i === 0 ? 'rank-fill rank-fill--top' : 'rank-fill'}
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </span>
            <span className="rank-value">{fmtCompact(r.value)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
