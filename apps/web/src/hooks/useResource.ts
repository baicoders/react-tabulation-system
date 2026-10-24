import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

/** Loads one API resource. Keeps the last good data on screen while it reloads. */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setLoading(true);
    api<T>(path, { signal: controller.signal })
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
  }, [path, key]);

  const reload = useCallback(() => setKey((k) => k + 1), []);
  return { data, error, loading, reload };
}
