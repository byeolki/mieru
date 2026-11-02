import { z } from 'zod';
import {
  fileTicketResponseSchema,
  modelDetailSchema,
  modelListResponseSchema,
  parsedModelSchema,
  readmeResponseSchema,
  type CreateModelBody,
  type UpdateModelBody,
} from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';

export const modelKeys = {
  list: (scope: 'owned' | 'shared') => ['models', 'list', scope] as const,
  detail: (id: string) => ['models', id] as const,
  graph: (id: string, version: number | null) => ['models', id, 'graph', version] as const,
  readme: (id: string) => ['models', id, 'readme'] as const,
};

export function listModels(scope: 'owned' | 'shared') {
  return apiRequest(`/api/models?scope=${scope}&limit=50`, modelListResponseSchema);
}

export function getModel(id: string) {
  return apiRequest(`/api/models/${id}`, modelDetailSchema);
}

export function createModel(body: CreateModelBody) {
  return apiRequest('/api/models', modelDetailSchema, { method: 'POST', body });
}

export function updateModel(id: string, body: UpdateModelBody) {
  return apiRequest(`/api/models/${id}`, modelDetailSchema, { method: 'PATCH', body });
}

export function deleteModel(id: string) {
  return apiRequest(`/api/models/${id}`, z.undefined(), { method: 'DELETE' });
}

export function getGraph(id: string, version: number | null) {
  return apiRequest(
    `/api/models/${id}/graph${version ? `?version=${version}` : ''}`,
    parsedModelSchema,
  );
}

export function getReadme(id: string) {
  return apiRequest(`/api/models/${id}/readme`, readmeResponseSchema);
}

export function saveReadme(id: string, markdown: string, baseUpdatedAt: string | null) {
  return apiRequest(`/api/models/${id}/readme`, readmeResponseSchema, {
    method: 'PUT',
    body: { markdown, baseUpdatedAt },
  });
}

/** Asks for a short-lived download URL, then lets the browser download it natively. */
export async function downloadOriginal(id: string) {
  const { url } = await apiRequest(`/api/models/${id}/file-ticket`, fileTicketResponseSchema, {
    method: 'POST',
    body: {},
  });
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
