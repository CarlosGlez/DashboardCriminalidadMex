import { useEffect, useState } from 'react'

export function useDarkMode() {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setDark(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return dark
}

export const categorical = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}

export const palette = {
  light: {
    surface: '#fcfcfb',
    textPrimary: '#0b0b0b',
    textSecondary: '#52514e',
    muted: '#898781',
    gridline: '#e1e0d9',
    baseline: '#c3c2b7',
    series1: '#2a78d6',
    good: '#0ca30c',
    critical: '#d03b3b',
  },
  dark: {
    surface: '#1a1a19',
    textPrimary: '#ffffff',
    textSecondary: '#c3c2b7',
    muted: '#898781',
    gridline: '#2c2c2a',
    baseline: '#383835',
    series1: '#3987e5',
    good: '#0ca30c',
    critical: '#e66767',
  },
}

// Rampa secuencial de un solo tono (7 clases) para mapas coropléticos.
// Claro: de menos a más oscuro. Oscuro: de menos a más brillante sobre fondo oscuro.
export const sequential = {
  light: ['#e6effa', '#c2d9f3', '#98bfea', '#6ca2de', '#3f83d0', '#2a63aa', '#1d4a82'],
  dark: ['#2b3f5c', '#2d4f7c', '#2f629f', '#3377bd', '#3987e5', '#6aa5ee', '#9cc3f5'],
}

export function useSequentialColors() {
  const dark = useDarkMode()
  return dark ? sequential.dark : sequential.light
}

export function useChartColors() {
  const dark = useDarkMode()
  return dark ? palette.dark : palette.light
}

export function useCategoricalColors() {
  const dark = useDarkMode()
  return dark ? categorical.dark : categorical.light
}
