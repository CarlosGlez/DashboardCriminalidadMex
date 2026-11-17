import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import type { FilterOptions } from '../types'

export function useFilterOptions() {
  const [options, setOptions] = useState<FilterOptions | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('filter_options').then(({ data, error }) => {
      if (cancelled) return
      if (error) setError(error.message)
      else setOptions(data as FilterOptions)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { options, error }
}
