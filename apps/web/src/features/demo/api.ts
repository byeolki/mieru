import { fileTicketResponseSchema, labelsSchema } from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';

export const demoKeys = {
  labels: (modelId: string) => ['models', modelId, 'labels'] as const,
  externalData: (modelId: string) => ['models', modelId, 'external-data'] as const,
};

export const getLabels = (modelId: string) =>
  apiRequest(`/api/models/${modelId}/labels`, labelsSchema);

export const saveLabels = (modelId: string, labels: string[]) =>
  apiRequest(`/api/models/${modelId}/labels`, labelsSchema, { method: 'PUT', body: { labels } });

const requestFileTicket = (modelId: string) =>
  apiRequest(`/api/models/${modelId}/file-ticket`, fileTicketResponseSchema, {
    method: 'POST',
    body: {},
  });

/** A short-lived URL for the current version's original file. */
export const getModelFileUrl = async (modelId: string) => (await requestFileTicket(modelId)).url;

/** A weights file the current version's ONNX model references by `path`. */
export interface ExternalDataFileInfo {
  /** Location string stored in the model's initializers, e.g. `./model.onnx.data`. */
  path: string;
  /** Short-lived download URL; fetch the list right before creating a session. */
  url: string;
  sizeBytes: number;
}

/** External data files of the current version, empty when the weights live inside the model. */
export const getExternalDataFiles = async (modelId: string): Promise<ExternalDataFileInfo[]> =>
  (await requestFileTicket(modelId)).externalData.map((file) => ({
    path: file.location,
    url: file.url,
    sizeBytes: file.sizeBytes,
  }));
