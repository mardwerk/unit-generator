import type { LabError } from '../contracts.js';
import type { ModelUsage, ModelFailure } from '../../core/index.js';

export class LabApiError extends Error {
  constructor(
    message: string,
    readonly usage?: ModelUsage,
    readonly code = 'OPERATION_FAILED',
    readonly details?: ModelFailure,
  ) {
    super(message);
  }
}

export async function api<T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const token =
    document.querySelector<HTMLMetaElement>('meta[name="unitlab-session"]')?.content ?? '';
  let response: Response;
  try {
    response = await fetch(`/api/${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new LabApiError(
      'The local server could not be reached. Check that pnpm dev is running, then reload this page.',
      undefined,
      'SERVER_UNREACHABLE',
    );
  }
  let result: T | LabError;
  try {
    result = (await response.json()) as T | LabError;
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new LabApiError(
      `The local server returned an unreadable response (${response.status}). Check its terminal output and reload this page.`,
      undefined,
      'INVALID_SERVER_RESPONSE',
    );
  }
  if (!response.ok) {
    const error = result as LabError;
    throw new LabApiError(
      error.error?.message ?? `Request failed (${response.status}).`,
      error.error?.usage,
      error.error?.code,
      error.error?.details,
    );
  }
  return result as T;
}
