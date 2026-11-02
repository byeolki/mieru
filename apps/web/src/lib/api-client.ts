import type { z } from 'zod';
import { ApiError, toApiError } from './api-error.js';
import { getAccessToken, refreshSession } from './auth-store.js';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    credentials: 'same-origin',
  });
}

/**
 * Calls the API, refreshing the access token once on 401 and retrying. Responses are
 * validated with `schema` so the UI never trusts an unexpected payload shape.
 * @throws {ApiError} with the server's error code on any non-2xx response.
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  let response = await send(path, options);
  if (response.status === 401 && getAccessToken() && (await refreshSession())) {
    response = await send(path, options);
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return schema.parse(undefined);
  return schema.parse(await response.json());
}

export { ApiError };
