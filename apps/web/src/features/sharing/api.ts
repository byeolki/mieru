import { z } from 'zod';
import {
  resolvedLinkSchema,
  shareLinkSchema,
  shareSchema,
  userSummarySchema,
  type GrantableRole,
} from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';

export const sharingKeys = {
  shares: (modelId: string) => ['models', modelId, 'shares'] as const,
  links: (modelId: string) => ['models', modelId, 'links'] as const,
};

export const listShares = (modelId: string) =>
  apiRequest(`/api/models/${modelId}/shares`, z.array(shareSchema));

export const upsertShare = (
  modelId: string,
  username: string,
  role: GrantableRole,
  allowDownload: boolean,
) =>
  apiRequest(`/api/models/${modelId}/shares/${username}`, shareSchema, {
    method: 'PUT',
    body: { role, allowDownload },
  });

export const removeShare = (modelId: string, username: string) =>
  apiRequest(`/api/models/${modelId}/shares/${username}`, z.undefined(), { method: 'DELETE' });

export const listLinks = (modelId: string) =>
  apiRequest(`/api/models/${modelId}/share-links`, z.array(shareLinkSchema));

export const createLink = (
  modelId: string,
  body: {
    role: GrantableRole;
    allowDownload: boolean;
    expiresAt: string | null;
    label: string | null;
  },
) => apiRequest(`/api/models/${modelId}/share-links`, shareLinkSchema, { method: 'POST', body });

export const updateLink = (
  modelId: string,
  linkId: string,
  body: Partial<{ role: GrantableRole; allowDownload: boolean }>,
) =>
  apiRequest(`/api/models/${modelId}/share-links/${linkId}`, shareLinkSchema, {
    method: 'PATCH',
    body,
  });

export const revokeLink = (modelId: string, linkId: string) =>
  apiRequest(`/api/models/${modelId}/share-links/${linkId}`, z.undefined(), { method: 'DELETE' });

export const searchUsers = (query: string) =>
  apiRequest(`/api/users/search?q=${encodeURIComponent(query)}`, z.array(userSummarySchema));

export const resolveLink = (token: string) =>
  apiRequest('/api/share-links/resolve', resolvedLinkSchema, {
    method: 'POST',
    headers: { 'x-share-link': token },
  });
