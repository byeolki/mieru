import type { FastifyInstance, FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import { hasRoleAtLeast, type ModelAccess, type Role } from '@mieru/shared';
import type { Clock } from '../clock.js';
import type { DbPool } from '../db/pool.js';
import { AppError, forbidden, notFound, unauthorized } from '../errors.js';
import { hashToken } from '../features/auth/tokens.js';
import { resolveModelAccess, type Principal } from '../features/sharing/access-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    modelAccess: ModelAccess | null;
    /** Set by download-ticket verification; replaces the header/bearer principal. */
    ticketPrincipal: Principal | null;
  }
}

const SHARE_LINK_HEADER = 'x-share-link';
const GATE_MARK = Symbol('model-access-gate');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GATED_PREFIX = '/api/models/:id';

type Gate = ((request: FastifyRequest, reply: FastifyReply) => Promise<void>) & {
  [GATE_MARK]?: true;
};

export function principalOf(request: FastifyRequest): Principal {
  if (request.ticketPrincipal) return request.ticketPrincipal;
  const header = request.headers[SHARE_LINK_HEADER];
  const linkToken =
    typeof header === 'string' && header.length > 0 && header.length <= 128 ? header : null;
  return {
    userId: request.auth?.userId ?? null,
    linkTokenHash: linkToken ? hashToken(linkToken) : null,
  };
}

export interface ModelGateOptions {
  /** Require the original-file download right as well. */
  download?: boolean;
  /** Require a signed-in user even if a link or public access would allow viewing. */
  loggedIn?: boolean;
}

export type ModelGateFactory = (minRole: Role, options?: ModelGateOptions) => Gate;

/**
 * Registers the model access gate. Every route under /api/models/:id must use it; a route
 * added without it makes the server refuse to boot, so a forgotten check can't ship.
 */
export function registerModelAccess(
  app: FastifyInstance,
  deps: { db: DbPool; clock: Clock },
): ModelGateFactory {
  app.decorateRequest('modelAccess', null);
  app.decorateRequest('ticketPrincipal', null);

  app.addHook('onRoute', (route: RouteOptions) => {
    if (!route.url.startsWith(GATED_PREFIX)) return;
    const handlers = Array.isArray(route.preHandler)
      ? route.preHandler
      : route.preHandler
        ? [route.preHandler]
        : [];
    const isGated = handlers.some((handler) => (handler as Gate)[GATE_MARK] === true);
    if (!isGated)
      throw new Error(
        `Route ${route.method.toString()} ${route.url} is missing requireModelAccess`,
      );
  });

  return (minRole, options = {}) => {
    const gate: Gate = async (request) => {
      const { id } = request.params as { id?: string };
      if (!id || !UUID.test(id)) throw notFound('Model not found');
      if (options.loggedIn && !request.auth) throw unauthorized();
      const access = await resolveModelAccess(
        deps.db,
        id.toLowerCase(),
        principalOf(request),
        deps.clock(),
      );
      if (!access) throw notFound('Model not found');
      if (!hasRoleAtLeast(access.role, minRole)) throw forbidden('Your role does not allow this');
      if (options.download && !access.canDownload) {
        throw new AppError(403, 'download_not_allowed', 'Downloading this model is not allowed');
      }
      request.modelAccess = access;
    };
    gate[GATE_MARK] = true;
    return gate;
  };
}

export function currentModelAccess(request: FastifyRequest): ModelAccess {
  if (!request.modelAccess) throw notFound('Model not found');
  return request.modelAccess;
}
