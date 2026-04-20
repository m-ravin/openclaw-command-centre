// Centralised API client — all fetches go through here so we have one place
// to swap base URLs, add auth headers, or toggle to local-only mode.

import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : '/api',
  timeout: 15000,
});

// ─── Typed request helpers ───────────────────────────────────────────────────

export async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<T>(path, { params });
  return data;
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await api.post<T>(path, body);
  return data;
}

export async function patch<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await api.patch<T>(path, body);
  return data;
}

export async function put<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await api.put<T>(path, body);
  return data;
}

export async function del<T>(path: string): Promise<T> {
  const { data } = await api.delete<T>(path);
  return data;
}
