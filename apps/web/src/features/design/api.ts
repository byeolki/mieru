import { z } from 'zod';
import { designListResponseSchema, designSchema, type SaveDesignBody } from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';

export const designKeys = {
  list: ['designs'] as const,
  detail: (id: string) => ['designs', id] as const,
};

export const listDesigns = () => apiRequest('/api/designs', designListResponseSchema);
export const getDesign = (id: string) => apiRequest(`/api/designs/${id}`, designSchema);
export const createDesign = (body: SaveDesignBody) =>
  apiRequest('/api/designs', designSchema, { method: 'POST', body });
export const updateDesign = (id: string, body: SaveDesignBody) =>
  apiRequest(`/api/designs/${id}`, designSchema, { method: 'PUT', body });
export const deleteDesign = (id: string) =>
  apiRequest(`/api/designs/${id}`, z.undefined(), { method: 'DELETE' });
