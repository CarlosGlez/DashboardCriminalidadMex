import type { CrimeSummary, Filters } from '../types'
import { MESES } from '../constants'

interface Props {
  summary: CrimeSummary
  filters: Filters
}

const numberFmt = new Intl.NumberFormat('es-MX')
const tasaFmt = (v: number) => v.toLocaleString('es-MX', { maximumFractionDigits: 1 })

function seasonalityPeak(trend: CrimeSummary['trend']) {
  const totals = new Array(12).fill(0)
  const counts = new Array(12).fill(0)
  for (const p of trend) {
    totals[p.mes - 1] += p.total
    counts[p.mes - 1] += 1
  }
  const avgs = totals.map((t, i) => (counts[i] > 0 ? t / counts[i] : 0))
  const max = Math.max(...avgs)
  const overallAvg = avgs.reduce((a, b) => a + b, 0) / 12
  const peakIdx = avgs.indexOf(max)
  const liftPct = overallAvg > 0 ? ((max - overallAvg) / overallAvg) * 100 : 0
  return { peakMonth: MESES[peakIdx], peakMonthIdx: peakIdx, liftPct }
}

// Mes anterior al pico, para recomendar anticipar recursos en vez de reaccionar
// una vez que la ventana de mayor incidencia ya está en curso (o ya pasó).
function monthBefore(monthIdx: number) {
  return MESES[(monthIdx - 1 + 12) % 12]
}

// Crecimiento del propio recorte activo (respeta los filtros de estado/tipo, a
// diferencia de tipo_growth/entidad_growth que comparan entre categorías).
function ownScopeGrowth(trend: CrimeSummary['trend']) {
  if (trend.length === 0) return null
  const years = Array.from(new Set(trend.map((p) => p.anio))).sort((a, b) => a - b)
  if (years.length < 2) return null
  const firstYear = years[0]
  const lastYear = years[years.length - 1]
  const totalFirst = trend.filter((p) => p.anio === firstYear).reduce((a, p) => a + p.total, 0)
  const totalLast = trend.filter((p) => p.anio === lastYear).reduce((a, p) => a + p.total, 0)
  if (totalFirst === 0) return null
  const pct = ((totalLast - totalFirst) / totalFirst) * 100
  return { firstYear, lastYear, totalFirst, totalLast, pct }
}

interface ActionItem {
  title: string
  body: string
}

function buildActionPlan(summary: CrimeSummary, filters: Filters): { headline: ActionItem; secondary: ActionItem[] } {
  const topGrowthTipo = summary.tipo_growth.find((g) => g.growth_pct !== null && g.growth_pct > 0)
  const topGrowthEntidad = summary.entidad_growth.find((g) => g.growth_pct !== null && g.growth_pct > 0)
  const { peakMonth, peakMonthIdx, liftPct } = seasonalityPeak(summary.trend)
  const ownGrowth = ownScopeGrowth(summary.trend)
  const topTipoLabel = topGrowthTipo?.tipo_delito ?? summary.by_tipo[0]?.tipo_delito ?? 'el delito más frecuente'
  const anticipo = monthBefore(peakMonthIdx)
  const periodoHistorico = `histórico ${filters.anioDesde}-${filters.anioHasta}`
  const alcance = filters.municipioNombre ? `${filters.municipioNombre}, ${filters.entidad}` : filters.entidad

  const tasaRanked = [...summary.tasa_by_entidad].filter((e) => e.tasa !== null).sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0))
  const topTasaEntidad = tasaRanked[0]
  const tasaRank = filters.entidad && !filters.municipio ? tasaRanked.findIndex((e) => e.entidad === filters.entidad) + 1 : null

  // Encabezado: una sola respuesta a "dónde + qué + cuándo priorizar", en vez de
  // dejar que cada métrica sugiera algo distinto sin conciliarlas.
  let headline: ActionItem
  if (filters.entidad) {
    const enRiesgo = tasaRank !== null && tasaRank <= 10
    headline = {
      title: 'Prioridad #1',
      body: `En ${alcance}, el foco debe estar en ${topTipoLabel.toLowerCase()}${tasaRank ? ` (la tasa de incidencia lo ubica en el lugar ${tasaRank} de 32 estados${enRiesgo ? ', dentro de los de mayor riesgo relativo' : ''})` : ''}. Conviene anticipar recursos desde ${anticipo.toLowerCase()}, ya que ${peakMonth.toLowerCase()} concentra cada año, en promedio, ${liftPct.toFixed(0)}% más casos que el resto (${periodoHistorico}; es un patrón recurrente, no un pico ya ocurrido).`,
    }
  } else if (topTasaEntidad) {
    const distintoLider = topGrowthEntidad && topGrowthEntidad.entidad !== topTasaEntidad.entidad
    headline = {
      title: 'Prioridad #1',
      body: `Concentrar recursos en ${topTasaEntidad.entidad} (mayor tasa de incidencia del país: ${tasaFmt(topTasaEntidad.tasa!)} por cada 100,000 habitantes), con foco en ${topTipoLabel.toLowerCase()}. Conviene anticipar esa capacidad desde ${anticipo.toLowerCase()}, ya que ${peakMonth.toLowerCase()} concentra cada año, en promedio, ${liftPct.toFixed(0)}% más casos que el resto (${periodoHistorico}; es un patrón recurrente, no un pico ya ocurrido).${distintoLider ? ` Al mismo tiempo, vigilar a ${topGrowthEntidad!.entidad}: aunque hoy tiene menor tasa, es el estado que más rápido está creciendo (${topGrowthEntidad!.growth_pct! >= 0 ? '+' : ''}${topGrowthEntidad!.growth_pct}%) y podría volverse la siguiente prioridad.` : ''}`,
    }
  } else {
    headline = {
      title: 'Prioridad #1',
      body: `Mantener el enfoque en ${topTipoLabel.toLowerCase()}, anticipando recursos desde ${anticipo.toLowerCase()} para la ventana de mayor incidencia de ${peakMonth.toLowerCase()} (${periodoHistorico}).`,
    }
  }

  const secondary: ActionItem[] = []

  // Categoría de riesgo (detalle de soporte, ya no compite con el encabezado)
  if (topGrowthTipo) {
    secondary.push({
      title: 'Categoría de riesgo en crecimiento',
      body: `${topGrowthTipo.tipo_delito} pasó de ${numberFmt.format(topGrowthTipo.total_desde)} a ${numberFmt.format(topGrowthTipo.total_hasta)} casos (${topGrowthTipo.growth_pct! >= 0 ? '+' : ''}${topGrowthTipo.growth_pct}%) entre ${filters.anioDesde} y ${filters.anioHasta}; ajustar coberturas y controles en consecuencia.`,
    })
  }

  // Seguimiento de tendencia estatal
  if (!filters.entidad && topGrowthEntidad && topGrowthEntidad.entidad !== topTasaEntidad?.entidad) {
    secondary.push({
      title: 'Estado a vigilar',
      body: `${topGrowthEntidad.entidad} registra el mayor incremento reciente en incidencia (${topGrowthEntidad.growth_pct! >= 0 ? '+' : ''}${topGrowthEntidad.growth_pct}%, de ${numberFmt.format(topGrowthEntidad.total_desde)} a ${numberFmt.format(topGrowthEntidad.total_hasta)} casos); amerita seguimiento cercano aunque su tasa actual no sea la más alta.`,
    })
  } else if (filters.entidad && ownGrowth && Math.abs(ownGrowth.pct) >= 10) {
    const alza = ownGrowth.pct > 0
    secondary.push({
      title: 'Tendencia a vigilar',
      body: `La incidencia en ${alcance} muestra una tendencia ${alza ? 'al alza' : 'a la baja'} (${ownGrowth.pct >= 0 ? '+' : ''}${ownGrowth.pct.toFixed(0)}% entre ${ownGrowth.firstYear} y ${ownGrowth.lastYear}); ${alza ? 'conviene anticipar mayor demanda de cobertura' : 'el riesgo parece estar cediendo, lo que abre espacio para optimizar reservas destinadas a este mercado'}.`,
    })
  }

  // Revisión periódica
  secondary.push({
    title: 'Revisión periódica',
    body: 'Recalcular estos indicadores conforme el SESNSP publique nueva información (actualización mensual) para mantener las prioridades vigentes.',
  })

  return { headline, secondary }
}

export function Insights({ summary, filters }: Props) {
  const topGrowthTipo = summary.tipo_growth.find((g) => g.growth_pct !== null && g.growth_pct > 0)
  const topGrowthEntidad = summary.entidad_growth.find((g) => g.growth_pct !== null && g.growth_pct > 0)
  const { peakMonth, liftPct } = seasonalityPeak(summary.trend)

  const topTasaEntidad = [...summary.tasa_by_entidad]
    .filter((e) => e.tasa !== null)
    .sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0))[0]

  const { headline, secondary } = buildActionPlan(summary, filters)

  return (
    <div className="insights-card">
      <h3>Interpretación y conclusiones</h3>
      <ul className="insights-list">
        <li>
          {topGrowthTipo ? (
            <>
              <strong>{topGrowthTipo.tipo_delito}</strong> es el delito con mayor crecimiento entre {filters.anioDesde} y {filters.anioHasta}: pasó de {numberFmt.format(topGrowthTipo.total_desde)} a {numberFmt.format(topGrowthTipo.total_hasta)} casos ({topGrowthTipo.growth_pct! >= 0 ? '+' : ''}{topGrowthTipo.growth_pct}%).
            </>
          ) : (
            'No se identificó un crecimiento sostenido por tipo de delito en el rango seleccionado.'
          )}
        </li>
        <li>
          Se observa estacionalidad: cada año, <strong>{peakMonth.toLowerCase()}</strong> concentra en promedio {liftPct.toFixed(0)}% más casos que el resto del año (patrón histórico {filters.anioDesde}-{filters.anioHasta}, se repite todos los años, no un pico puntual ya ocurrido).
        </li>
        {!filters.entidad && (
          <li>
            {topGrowthEntidad ? (
              <>
                <strong>{topGrowthEntidad.entidad}</strong> es el estado que más incrementó su incidencia delictiva ({topGrowthEntidad.growth_pct! >= 0 ? '+' : ''}{topGrowthEntidad.growth_pct}%), de {numberFmt.format(topGrowthEntidad.total_desde)} a {numberFmt.format(topGrowthEntidad.total_hasta)} casos.
              </>
            ) : (
              'No se identificó un incremento sostenido por estado en el rango seleccionado.'
            )}
          </li>
        )}
        {!filters.entidad && topTasaEntidad && (
          <li>
            Ajustando por población, <strong>{topTasaEntidad.entidad}</strong> tiene la mayor tasa de incidencia del país: {tasaFmt(topTasaEntidad.tasa!)} delitos por cada 100,000 habitantes al año — un panorama distinto al de volumen bruto, donde dominan los estados más poblados.
          </li>
        )}
      </ul>

      <div className="action-plan">
        <h4>Plan de acción recomendado</h4>
        <p className="action-plan-headline">{headline.body}</p>
        {secondary.length > 0 && (
          <ol>
            {secondary.map((item) => (
              <li key={item.title}>
                <strong>{item.title}.</strong> {item.body}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
