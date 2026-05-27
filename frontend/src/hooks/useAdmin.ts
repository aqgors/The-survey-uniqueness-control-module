import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api/axios';

// ── Generic paginated hook ─────────────────────────────────────────────────
export function usePaginated<T>(
  fetcher: (params: any) => Promise<any>,
  initialParams: any = {}
) {
  const [data,       setData]       = useState<T[]>([]);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [params,     setParams]     = useState(initialParams);

  const fetch = useCallback(async (overrideParams?: any) => {
    setLoading(true);
    setError(null);
    try {
      const merged = { ...params, ...overrideParams, page };
      const res = await fetcher(merged);
      const d = res.data;
      // Support both {users, pagination} and {surveys, pagination} shapes
      const rows = d.users ?? d.surveys ?? d.anomalies ?? d.data ?? [];
      setData(rows);
      if (d.pagination) {
        setTotal(d.pagination.total);
        setTotalPages(d.pagination.totalPages);
      }
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, [params, page, fetcher]);

  useEffect(() => { fetch(); }, [page, params]);

  return { data, total, totalPages, page, setPage, loading, error, params, setParams, refetch: fetch };
}

// ── Dashboard hook ─────────────────────────────────────────────────────────
export function useDashboard() {
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    adminApi.getDashboard()
      .then(res => setData(res.data))
      .catch(e  => setError(e.response?.data?.error ?? 'Помилка'))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

// ── Anomaly stats hook ─────────────────────────────────────────────────────
export function useAnomalyStats() {
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.getAnomalyStats()
      .then(res => setData(res.data))
      .catch(e  => setError(e.response?.data?.error ?? 'Помилка'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, []);
  return { data, loading, error, refetch: load };
}
