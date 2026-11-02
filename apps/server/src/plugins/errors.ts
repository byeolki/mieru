import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ApiErrorBody } from '@mieru/shared';
import { AppError } from '../errors.js';

const CLIENT_ERROR_MIN = 400;
const SERVER_ERROR_MIN = 500;

function body(code: string, message: string, details?: Record<string, unknown>): ApiErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

/** Maps every thrown error to the API error shape, never leaking internals on 5xx. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(body(error.code, error.message, error.details));
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send(
        body('validation_failed', 'Request validation failed', {
          issues: error.validation.map((issue) => ({
            path: issue.instancePath,
            message: issue.message,
          })),
        }),
      );
    }
    const status = error.statusCode ?? SERVER_ERROR_MIN;
    if (status >= CLIENT_ERROR_MIN && status < SERVER_ERROR_MIN) {
      return reply.status(status).send(body(error.code || 'bad_request', error.message));
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(SERVER_ERROR_MIN).send(body('internal', 'Something went wrong'));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(body('not_found', 'Not found')),
  );
}
