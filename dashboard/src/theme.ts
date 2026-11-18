import { useMemo } from 'react'

// La paleta vive solo en index.css (variables CSS). Recharts y el SVG del mapa necesitan valores
// concretos, así que se leen una vez de :root.
const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function readPalette() {
  return {
    surface: cssVar('--card'),
    textPrimary: cssVar('--text'),
    textSecondary: cssVar('--text-muted'),
    muted: cssVar('--text-muted'),
    gridline: cssVar('--border'),
    baseline: cssVar('--border'),
    bar: cssVar('--bar'),
    barMuted: cssVar('--bar-muted'),
    barSoft: cssVar('--bar-soft'),
    barTop: cssVar('--bar-top'),
    track: cssVar('--track'),
    accent: cssVar('--accent'),
    warning: cssVar('--warning'),
    noData: cssVar('--map-nodata'),
  }
}

export function useChartColors() {
  return useMemo(readPalette, [])
}

// Rampa secuencial de 7 pasos para el mapa coroplético: de menos a más oscuro = más delitos.
export function useSequentialColors() {
  return useMemo(() => [1, 2, 3, 4, 5, 6, 7].map((i) => cssVar(`--map-${i}`)), [])
}
