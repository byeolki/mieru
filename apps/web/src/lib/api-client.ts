import type { z } from 'zod';
import { ApiError, toApiError } from './api-error.js';
import { getAccessToken, refreshSession } from './auth-store.js';
import { linkTokenFor } from './link-store.js';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const linkToken = linkTokenFor(path);
  if (linkToken) headers['x-share-link'] = linkToken;
  // Files (an avatar PNG) go up as raw bytes with their own type; everything else is JSON.
  let body: BodyInit | undefined;
  if (options.body instanceof Blob) {
    headers['content-type'] = options.body.type;
    body = options.body;
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  return fetch(path, {
    method: options.method ?? 'GET',
    headers: { ...headers, ...options.headers },
    body,
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
