import { apiErrorSchema } from '@mieru/shared';

/** A failed API call with the server's stable error code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(response.status, code, message, details);
  }
  return new ApiError(response.status, 'http_error', `Request failed with ${response.status}`);
}
