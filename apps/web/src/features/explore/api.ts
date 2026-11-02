import {
  exploreResponseSchema,
  exploreSearchResponseSchema,
  modelListResponseSchema,
  profileSchema,
  type ExploreSort,
  type ModelFormat,
} from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';

export interface SearchFilters {
  q: string;
  format: ModelFormat | null;
  downloadableOnly: boolean;
  sort: ExploreSort;
}

export const exploreKeys = {
  sections: ['explore'] as const,
  search: (filters: SearchFilters) => ['explore', 'search', filters] as const,
  profile: (username: string) => ['users', username] as const,
  profileModels: (username: string) => ['users', username, 'models'] as const,
  profileStars: (username: string) => ['users', username, 'stars'] as const,
};

export const getExplore = () => apiRequest('/api/explore', exploreResponseSchema);

export function searchModels(filters: SearchFilters, page: number) {
  const params = new URLSearchParams({ sort: filters.sort, page: String(page) });
  if (filters.q) params.set('q', filters.q);
  if (filters.format) params.set('format', filters.format);
  if (filters.downloadableOnly) params.set('downloadable', 'true');
  return apiRequest(`/api/explore/search?${params.toString()}`, exploreSearchResponseSchema);
}

export const getProfile = (username: string) => apiRequest(`/api/users/${username}`, profileSchema);
export const getProfileModels = (username: string) =>
  apiRequest(`/api/users/${username}/models`, modelListResponseSchema);
export const getProfileStars = (username: string) =>
  apiRequest(`/api/users/${username}/stars`, modelListResponseSchema);
