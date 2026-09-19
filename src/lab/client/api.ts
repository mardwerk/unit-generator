import type { LabError } from '../contracts.js';

const fragment = new URLSearchParams(location.hash.slice(1));
const incomingToken = fragment.get('token');
if (incomingToken) {
  sessionStorage.setItem('unitlab-token', incomingToken);
  history.replaceState(null, '', location.pathname + location.search);
}

export async function api<T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${sessionStorage.getItem('unitlab-token') ?? ''}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  const result = (await response.json()) as T | LabError;
  if (!response.ok) {
    const error = result as LabError;
    throw new Error(error.error?.message ?? `Request failed (${response.status}).`);
  }
  return result as T;
}
