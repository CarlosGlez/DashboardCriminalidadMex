import { useEffect, useState } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export type GeoCollection<P> = FeatureCollection<Polygon | MultiPolygon, P>

// Caché a nivel de módulo: cada archivo se baja una sola vez por sesión.
const cache = new Map<string, Promise<GeoCollection<unknown>>>()

function load<P>(path: string, objectName: string): Promise<GeoCollection<P>> {
  let promise = cache.get(path)
  if (!promise) {
    promise = fetch(`${import.meta.env.BASE_URL}geo/${path}`)
      .then((res) => {
        if (!res.ok) throw new Error(`No se pudo cargar la geometría (${res.status})`)
        return res.json() as Promise<Topology>
      })
      .then(
        (topo) => feature(topo, topo.objects[objectName] as GeometryCollection) as unknown as GeoCollection<unknown>,
      )
    // Si falla, no dejar la promesa rechazada en caché para poder reintentar
    promise.catch(() => cache.delete(path))
    cache.set(path, promise)
  }
  return promise as Promise<GeoCollection<P>>
}

interface GeoState<P> {
  path: string | null
  data: GeoCollection<P> | null
  error: string | null
}

// Carga un TopoJSON de public/geo/<path> y lo devuelve como FeatureCollection.
// path = null no carga nada.
export function useGeo<P>(path: string | null, objectName: string) {
  const [state, setState] = useState<GeoState<P>>({ path: null, data: null, error: null })

  useEffect(() => {
    if (!path) return
    let cancelled = false
    load<P>(path, objectName)
      .then((data) => {
        if (!cancelled) setState({ path, data, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ path, data: null, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [path, objectName])

  // Ignora el resultado de una ruta anterior mientras llega el de la actual
  const current = state.path === path
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: path !== null && !current,
  }
}
