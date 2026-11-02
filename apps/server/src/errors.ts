/** An error whose code and HTTP status are safe to expose to API clients. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);
export const forbidden = (message = 'Forbidden') => new AppError(403, 'forbidden', message);
export const unauthorized = (code = 'unauthorized', message = 'Authentication required') =>
  new AppError(401, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(400, code, message, details);
