import { fileTicketResponseSchema, labelsSchema } from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';

export const demoKeys = {
  labels: (modelId: string) => ['models', modelId, 'labels'] as const,
};

export const getLabels = (modelId: string) =>
  apiRequest(`/api/models/${modelId}/labels`, labelsSchema);

export const saveLabels = (modelId: string, labels: string[]) =>
  apiRequest(`/api/models/${modelId}/labels`, labelsSchema, { method: 'PUT', body: { labels } });

/** A short-lived URL for the current version's original file. */
export const getModelFileUrl = async (modelId: string) =>
  (
    await apiRequest(`/api/models/${modelId}/file-ticket`, fileTicketResponseSchema, {
      method: 'POST',
      body: {},
    })
  ).url;
