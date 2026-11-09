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

function startDownload(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Asks for a short-lived download URL and lets the browser download it natively. Returns the
 * model's external data files instead of downloading when it has any, so the caller can list
 * them: they must be saved next to the `.onnx` for it to load.
 */
export async function downloadOriginal(id: string): Promise<DownloadableFile[]> {
  const ticket = await apiRequest(`/api/models/${id}/file-ticket`, fileTicketResponseSchema, {
    method: 'POST',
    body: {},
  });
  if (ticket.externalData.length === 0) {
    startDownload(ticket.url);
    return [];
  }
  return [
    { name: null, url: ticket.url, sizeBytes: null },
    ...ticket.externalData.map((file) => ({
      name: file.name,
      url: file.url,
      sizeBytes: file.sizeBytes,
    })),
  ];
}

/** One file of a model download; `name` null is the model file itself. */
export interface DownloadableFile {
  name: string | null;
  url: string;
  sizeBytes: number | null;
}
