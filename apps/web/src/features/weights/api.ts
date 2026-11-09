import { tensorFiltersSchema, tensorListResponseSchema, tensorStatsSchema } from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';

export const weightKeys = {
  list: (modelId: string, version: number | null) =>
    ['models', modelId, 'tensors', version] as const,
  stats: (modelId: string, version: number | null, name: string) =>
    ['models', modelId, 'tensors', version, 'stats', name] as const,
  filters: (modelId: string, version: number | null, name: string) =>
    ['models', modelId, 'tensors', version, 'filters', name] as const,
};

function query(params: Record<string, string | number | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== null) search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const listTensors = (modelId: string, version: number | null) =>
  apiRequest(`/api/models/${modelId}/tensors${query({ version })}`, tensorListResponseSchema);

export const getTensorStats = (modelId: string, version: number | null, name: string) =>
  apiRequest(`/api/models/${modelId}/tensors/stats${query({ name, version })}`, tensorStatsSchema);

export const getTensorFilters = (modelId: string, version: number | null, name: string) =>
  apiRequest(
    `/api/models/${modelId}/tensors/filters${query({ name, version })}`,
    tensorFiltersSchema,
  );
