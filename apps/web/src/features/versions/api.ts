import { z } from 'zod';
import { modelDiffSchema, versionListResponseSchema } from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';

export const versionKeys = {
  list: (modelId: string) => ['models', modelId, 'versions'] as const,
  diff: (modelId: string, from: number, to: number) =>
    ['models', modelId, 'diff', from, to] as const,
};

export const listVersions = (modelId: string) =>
  apiRequest(`/api/models/${modelId}/versions`, versionListResponseSchema);

export const createVersion = (
  modelId: string,
  upload: { uploadId: string; dataUploadIds: string[] },
  note: string,
) =>
  apiRequest(`/api/models/${modelId}/versions`, versionListResponseSchema, {
    method: 'POST',
    body: { ...upload, note: note.trim() || undefined },
  });

export const deleteVersion = (modelId: string, number: number) =>
  apiRequest(`/api/models/${modelId}/versions/${String(number)}`, z.undefined(), {
    method: 'DELETE',
  });

export const getDiff = (modelId: string, from: number, to: number) =>
  apiRequest(`/api/models/${modelId}/diff?from=${String(from)}&to=${String(to)}`, modelDiffSchema);
