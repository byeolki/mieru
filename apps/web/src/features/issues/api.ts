import { z } from 'zod';
import {
  activityResponseSchema,
  issueListResponseSchema,
  issueSchema,
  modelListResponseSchema,
  starResponseSchema,
  type IssueKind,
  type IssueState,
} from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';

export const issueKeys = {
  list: (modelId: string, state: IssueState, kind: IssueKind | null) =>
    ['models', modelId, 'issues', state, kind] as const,
  all: (modelId: string) => ['models', modelId, 'issues'] as const,
  detail: (modelId: string, number: number) => ['models', modelId, 'issue', number] as const,
  nodeCounts: (modelId: string) => ['models', modelId, 'issue-node-counts'] as const,
  activity: ['me', 'activity'] as const,
  stars: ['me', 'stars'] as const,
};

export function listIssues(modelId: string, state: IssueState, kind: IssueKind | null) {
  const params = new URLSearchParams({ state, limit: '50' });
  if (kind) params.set('kind', kind);
  return apiRequest(`/api/models/${modelId}/issues?${params.toString()}`, issueListResponseSchema);
}

export const getIssue = (modelId: string, number: number) =>
  apiRequest(`/api/models/${modelId}/issues/${number}`, issueSchema);

export const nodeIssueCounts = (modelId: string) =>
  apiRequest(`/api/models/${modelId}/issues/node-counts`, z.record(z.string(), z.number()));

export const createIssue = (
  modelId: string,
  body: { kind: IssueKind; title: string; body: string; nodeRef?: string },
) => apiRequest(`/api/models/${modelId}/issues`, issueSchema, { method: 'POST', body });

export const updateIssue = (
  modelId: string,
  number: number,
  body: Partial<{
    title: string;
    body: string;
    kind: IssueKind;
    state: IssueState;
    locked: boolean;
  }>,
) => apiRequest(`/api/models/${modelId}/issues/${number}`, issueSchema, { method: 'PATCH', body });

export const deleteIssue = (modelId: string, number: number) =>
  apiRequest(`/api/models/${modelId}/issues/${number}`, z.undefined(), { method: 'DELETE' });

export const createReply = (modelId: string, number: number, body: string) =>
  apiRequest(`/api/models/${modelId}/issues/${number}/replies`, issueSchema, {
    method: 'POST',
    body: { body },
  });

export const updateReply = (modelId: string, number: number, replyId: string, body: string) =>
  apiRequest(`/api/models/${modelId}/issues/${number}/replies/${replyId}`, z.undefined(), {
    method: 'PATCH',
    body: { body },
  });

export const deleteReply = (modelId: string, number: number, replyId: string) =>
  apiRequest(`/api/models/${modelId}/issues/${number}/replies/${replyId}`, z.undefined(), {
    method: 'DELETE',
  });

export const getActivity = () => apiRequest('/api/me/activity', activityResponseSchema);

export const getMyStars = () => apiRequest('/api/me/stars', modelListResponseSchema);

export const setStar = (modelId: string, starred: boolean) =>
  apiRequest(`/api/models/${modelId}/star`, starResponseSchema, {
    method: starred ? 'PUT' : 'DELETE',
  });
