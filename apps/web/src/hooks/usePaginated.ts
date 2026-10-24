import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Loads one page at a time from a paginated endpoint. Keeps the previous page on screen while the next
 * one loads (no flicker) and cancels stale requests when the page or filters change quickly.
 */
export function usePaginated<T>(path: string | null, params: Record<string, string | number | undefined>) {
  const [data, setData] = useState<Page<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (v === undefined || v === '' ? [] : [[k, String(v)]])),
  ).toString();

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setLoading(true);
    api<Page<T>>(`${path}?${query}`, { signal: controller.signal })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, query, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data, loading, error, reload };
}
