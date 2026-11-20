import { fmtNumber, fmtDecimal } from '../utils/format'
import type { ReactNode } from 'react'
import type { CrimeSummary, Filters } from '../types'
import { MESES } from '../constants'
import {
  aniosAnomalosEn, coverageInScope, describir, excluyeCrecimiento, motivoExclusion, tocaExtremos,
} from '../utils/coverage'
import type { CoverageMap } from '../utils/coverage'

interface Props {
  summary: CrimeSummary
  filters: Filters
  coverage: CoverageMap
  anioMin: number
}


// Base mínima para entrar a un ranking de crecimiento (por tipo o por estado): el año inicial debe tener
// al menos 100 casos o el 0.5% del total de ese año (lo que sea mayor). Evita "+53,000%" de 1 a 531 casos.
const BASE_MIN_CASOS = 100
const BASE_MIN_PCT = 0.005

function conBaseMinima<T extends { total_desde: number }>(rows: T[], totalAnioInicial: number): T[] {
  const base = Math.max(BASE_MIN_CASOS, totalAnioInicial * BASE_MIN_PCT)
  return rows.filter((g) => g.total_desde >= base)
}

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
// desdeAnio: se ignoran los años anteriores (datos municipales incompletos del estado, ver data_coverage).
function ownScopeGrowth(trend: CrimeSummary['trend'], desdeAnio = 0) {
  if (trend.length === 0) return null
  const years = Array.from(new Set(trend.map((p) => p.anio)))
    .filter((y) => y >= desdeAnio)
    .sort((a, b) => a - b)
  if (years.length < 2) return null
  const firstYear = years[0]
  const lastYear = years[years.length - 1]
  const totalFirst = trend.filter((p) => p.anio === firstYear).reduce((a, p) => a + p.total, 0)
  const totalLast = trend.filter((p) => p.anio === lastYear).reduce((a, p) => a + p.total, 0)
  if (totalFirst === 0) return null
  const pct = ((totalLast - totalFirst) / totalFirst) * 100
  const omitidoDesde = trend.some((p) => p.anio < firstYear) ? firstYear : null
  return { firstYear, lastYear, totalFirst, totalLast, pct, omitidoDesde }
}

// Resalta en negritas las cifras clave de un texto: porcentajes, totales con separador de miles y tasas.
const KEY_FIGURES = /([+-]?\d+(?:[.,]\d+)?%|\d{1,3}(?:,\d{3})+(?!\s+habitantes)|\d+(?:\.\d+)?(?= por cada 100,000))/g
function emphasize(text: string): ReactNode[] {
  return text.split(KEY_FIGURES).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

interface ActionItem {
  title: string
  body: string
}

// `summary.entidad_growth` ya debe venir sin los estados con años anómalos (lo hace Insights).
function buildActionPlan(
  summary: CrimeSummary,
  filters: Filters,
  coverage: CoverageMap,
): { headline: ActionItem; secondary: ActionItem[] } {
  const topGrowthTipo = summary.tipo_growth.find((g) => g.growth_pct !== null && g.growth_pct > 0)
  const topGrowthEntidad = summary.entidad_growth.find((g) => g.growth_pct !== null && g.growth_pct > 0)
  const { peakMonth, peakMonthIdx, liftPct } = seasonalityPeak(summary.trend)
  // Con un estado elegido, la tendencia propia solo se calcula sobre años comparables:
  //  - 'arranque': desde su primer año completo.
  //  - 'inestable' (cualquier año anómalo en el rango) o 'puntual' (primer/último año anómalo): no se calcula.
  const covEntidad = filters.entidad ? coverage.get(filters.entidad) : undefined
  const anomaloEnRango = !!covEntidad && aniosAnomalosEn(covEntidad, filters.anioDesde, filters.anioHasta).length > 0
  const tendenciaNoComparable =
    !!covEntidad &&
    anomaloEnRango &&
    covEntidad.tipo !== 'arranque' &&
    excluyeCrecimiento(covEntidad, filters.anioDesde, filters.anioHasta)
  const desdeCompleto = covEntidad?.tipo === 'arranque' && anomaloEnRango ? (covEntidad.anio_completo_desde ?? 0) : 0
  const ownGrowth = tendenciaNoComparable ? null : ownScopeGrowth(summary.trend, desdeCompleto)
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
      body: `Concentrar recursos en ${topTasaEntidad.entidad} (mayor tasa de incidencia del país: ${fmtDecimal(topTasaEntidad.tasa!)} por cada 100,000 habitantes), con foco en ${topTipoLabel.toLowerCase()}. Conviene anticipar esa capacidad desde ${anticipo.toLowerCase()}, ya que ${peakMonth.toLowerCase()} concentra cada año, en promedio, ${liftPct.toFixed(0)}% más casos que el resto (${periodoHistorico}; es un patrón recurrente, no un pico ya ocurrido).${distintoLider ? ` Al mismo tiempo, vigilar a ${topGrowthEntidad!.entidad}: aunque hoy tiene menor tasa, es el estado que más rápido está creciendo (${topGrowthEntidad!.growth_pct! >= 0 ? '+' : ''}${topGrowthEntidad!.growth_pct}%) y podría volverse la siguiente prioridad.` : ''}`,
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
      body: `${topGrowthTipo.tipo_delito} pasó de ${fmtNumber(topGrowthTipo.total_desde)} a ${fmtNumber(topGrowthTipo.total_hasta)} casos (${topGrowthTipo.growth_pct! >= 0 ? '+' : ''}${topGrowthTipo.growth_pct}%) entre ${filters.anioDesde} y ${filters.anioHasta}; ajustar coberturas y controles en consecuencia.`,
    })
  }

  // Seguimiento de tendencia estatal
  if (!filters.entidad && topGrowthEntidad && topGrowthEntidad.entidad !== topTasaEntidad?.entidad) {
    secondary.push({
      title: 'Estado a vigilar',
      body: `${topGrowthEntidad.entidad} registra el mayor incremento reciente en incidencia (${topGrowthEntidad.growth_pct! >= 0 ? '+' : ''}${topGrowthEntidad.growth_pct}%, de ${fmtNumber(topGrowthEntidad.total_desde)} a ${fmtNumber(topGrowthEntidad.total_hasta)} casos); amerita seguimiento cercano aunque su tasa actual no sea la más alta.`,
    })
  } else if (filters.entidad && ownGrowth && Math.abs(ownGrowth.pct) >= 10) {
    const alza = ownGrowth.pct > 0
    secondary.push({
      title: 'Tendencia a vigilar',
      body: `La incidencia en ${alcance} muestra una tendencia ${alza ? 'al alza' : 'a la baja'} (${ownGrowth.pct >= 0 ? '+' : ''}${ownGrowth.pct.toFixed(0)}% entre ${ownGrowth.firstYear} y ${ownGrowth.lastYear}${ownGrowth.omitidoDesde ? `; se omiten los años anteriores a ${ownGrowth.omitidoDesde} por datos municipales incompletos` : ''}); ${alza ? 'conviene anticipar mayor demanda de cobertura' : 'el riesgo parece estar cediendo, lo que abre espacio para optimizar reservas destinadas a este mercado'}.`,
    })
  }

  // Revisión periódica
  secondary.push({
    title: 'Revisión periódica',
    body: 'Recalcular estos indicadores conforme el SESNSP publique nueva información (actualización mensual) para mantener las prioridades vigentes.',
  })

  return { headline, secondary }
}

export function Insights({ summary: rawSummary, filters, coverage, anioMin }: Props) {
  // Cobertura de datos (data_coverage): entidad_growth y tipo_growth comparan solo el primer y el
  // último año del rango. Si uno de esos años es anómalo para un estado (p. ej. Oaxaca 2015 → +378%),
  // el crecimiento sale distorsionado, así que esos estados se excluyen del ranking de estados.
  // Las series 'inestables' (cambios bruscos de reporte) se excluyen si el rango incluye cualquier año anómalo.
  const { anioDesde, anioHasta } = filters
  const span = anioHasta - anioDesde + 1
  const prevDesde = anioDesde - span
  const enAlcance = coverageInScope(coverage, filters.entidad)
  const excluidos = filters.entidad ? [] : enAlcance.filter((c) => excluyeCrecimiento(c, anioDesde, anioHasta))
  // Total del año inicial del alcance activo (misma base que tipo_growth y entidad_growth)
  const totalAnioInicial = rawSummary.trend.filter((p) => p.anio === anioDesde).reduce((a, p) => a + p.total, 0)
  const summary: CrimeSummary = {
    ...rawSummary,
    tipo_growth: conBaseMinima(rawSummary.tipo_growth, totalAnioInicial),
    entidad_growth: conBaseMinima(
      excluidos.length > 0
        ? rawSummary.entidad_growth.filter((g) => !excluidos.some((c) => c.entidad === g.entidad))
        : rawSummary.entidad_growth,
      totalAnioInicial,
    ),
  }
  // Notas: crecimiento por tipo (extremos del rango), variación vs periodo anterior (rango + anterior)
  // y tasa por 100k (promedio del rango: un año anómalo la distorsiona y con ella el lugar en el ranking)
  const afectaTipo = enAlcance.some((c) => tocaExtremos(c, anioDesde, anioHasta))
  const hayPrevio = prevDesde >= anioMin && rawSummary.prev_total > 0 // misma regla que la tarjeta de variación: periodo anterior completo
  const afectaVariacion = hayPrevio && enAlcance.some((c) => aniosAnomalosEn(c, prevDesde, anioHasta).length > 0)
  const afectaTasa =
    rawSummary.tasa_by_entidad.length > 0 &&
    enAlcance.some((c) => aniosAnomalosEn(c, anioDesde, anioHasta).length > 0)
  const afectadosNota = enAlcance.filter(
    (c) => aniosAnomalosEn(c, hayPrevio ? prevDesde : anioDesde, anioHasta).length > 0,
  )
  const consecuencias = [
    afectaTipo && `el crecimiento por tipo de delito (compara ${anioDesde} contra ${anioHasta})`,
    afectaVariacion && `la variación frente al periodo anterior (${prevDesde}-${anioDesde - 1})`,
    afectaTasa && 'la tasa por 100,000 habitantes (y con ella el lugar en el ranking)',
  ].filter(Boolean) as string[]
  const unirY = (items: string[]) =>
    items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`

  const topGrowthTipo = summary.tipo_growth.find((g) => g.growth_pct !== null && g.growth_pct > 0)
  const topGrowthEntidad = summary.entidad_growth.find((g) => g.growth_pct !== null && g.growth_pct > 0)
  const { peakMonth, liftPct } = seasonalityPeak(summary.trend)

  const topTasaEntidad = [...summary.tasa_by_entidad]
    .filter((e) => e.tasa !== null)
    .sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0))[0]

  const { headline, secondary } = buildActionPlan(summary, filters, coverage)

  return (
    <div className="insights-card">
      <h3>Interpretación y conclusiones</h3>
      <ul className="insights-list">
        {topGrowthTipo && (
          <li>
            <strong>{topGrowthTipo.tipo_delito}</strong> es el delito con mayor crecimiento entre {filters.anioDesde} y {filters.anioHasta}: pasó de <strong>{fmtNumber(topGrowthTipo.total_desde)}</strong> a <strong>{fmtNumber(topGrowthTipo.total_hasta)}</strong> casos (<strong>{topGrowthTipo.growth_pct! >= 0 ? '+' : ''}{topGrowthTipo.growth_pct}%</strong>).
          </li>
        )}
        <li>
          Se observa estacionalidad: cada año, <strong>{peakMonth.toLowerCase()}</strong> concentra en promedio <strong>{liftPct.toFixed(0)}%</strong> más casos que el resto del año (patrón histórico {filters.anioDesde}-{filters.anioHasta}, se repite todos los años, no un pico puntual ya ocurrido).
        </li>
        {!filters.entidad && topGrowthEntidad && (
          <li>
            <strong>{topGrowthEntidad.entidad}</strong> es el estado que más incrementó su incidencia delictiva (<strong>{topGrowthEntidad.growth_pct! >= 0 ? '+' : ''}{topGrowthEntidad.growth_pct}%</strong>), de <strong>{fmtNumber(topGrowthEntidad.total_desde)}</strong> a <strong>{fmtNumber(topGrowthEntidad.total_hasta)}</strong> casos.
          </li>
        )}
        {!filters.entidad && topTasaEntidad && (
          <li>
            Ajustando por población, <strong>{topTasaEntidad.entidad}</strong> tiene la mayor tasa de incidencia del país: <strong>{fmtDecimal(topTasaEntidad.tasa!)}</strong> delitos por cada 100,000 habitantes al año — un panorama distinto al de volumen bruto, donde dominan los estados más poblados.
          </li>
        )}
        {excluidos.length > 0 && (
          <li className="insights-note">
            <strong>Excluido de la comparación de crecimiento por estado:</strong>{' '}
            {excluidos.map(motivoExclusion).join('; ')}. Compararlos distorsionaría el crecimiento.
          </li>
        )}
        {consecuencias.length > 0 && (
          <li className="insights-note">
            <strong>Datos atípicos o incompletos:</strong> {describir(afectadosNota, hayPrevio ? prevDesde : anioDesde, anioHasta)}. En esos años el total no es comparable con el resto de la serie (puede estar por debajo o por encima de lo real), así que {unirY(consecuencias)} {consecuencias.length > 1 ? 'pueden' : 'puede'} verse distorsionado{consecuencias.length > 1 ? 's' : ''}{!filters.entidad ? ' (los totales nacionales incluyen a esos estados)' : ''}.
          </li>
        )}
      </ul>

      <div className="action-plan">
        <h4>Plan de acción recomendado</h4>
        <p className="action-plan-headline">{emphasize(headline.body)}</p>
        {secondary.length > 0 && (
          <ol>
            {secondary.map((item) => (
              <li key={item.title}>
                <strong>{item.title}.</strong> {emphasize(item.body)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
