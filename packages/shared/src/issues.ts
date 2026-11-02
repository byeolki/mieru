import { z } from 'zod';
import { userRefSchema } from './models.js';

export const ISSUE_BODY_MAX = 64 * 1024;
export const REPLY_BODY_MAX = 16 * 1024;

export const issueKindSchema = z.enum(['bug', 'question', 'feedback']);
export type IssueKind = z.infer<typeof issueKindSchema>;

export const issueStateSchema = z.enum(['open', 'closed']);
export type IssueState = z.infer<typeof issueStateSchema>;

export const issueListItemSchema = z.object({
  number: z.number(),
  kind: issueKindSchema,
  title: z.string(),
  state: issueStateSchema,
  author: userRefSchema.nullable(),
  nodeRef: z.string().nullable(),
  replyCount: z.number(),
  locked: z.boolean(),
  lastActivityAt: z.string(),
  createdAt: z.string(),
});
export type IssueListItem = z.infer<typeof issueListItemSchema>;

export const replySchema = z.object({
  id: z.string(),
  author: userRefSchema.nullable(),
  body: z.string(),
  deleted: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});
export type Reply = z.infer<typeof replySchema>;

export const issueSchema = issueListItemSchema.extend({
  body: z.string(),
  deleted: z.boolean(),
  closedAt: z.string().nullable(),
  closedBy: userRefSchema.nullable(),
  canEdit: z.boolean(),
  canModerate: z.boolean(),
  canReply: z.boolean(),
  replies: z.array(replySchema),
});
export type Issue = z.infer<typeof issueSchema>;

export const createIssueBodySchema = z.object({
  kind: issueKindSchema,
  title: z.string().trim().min(1).max(200),
  body: z.string().max(ISSUE_BODY_MAX).default(''),
  nodeRef: z.string().trim().min(1).max(512).optional(),
});

export const updateIssueBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().max(ISSUE_BODY_MAX).optional(),
    kind: issueKindSchema.optional(),
    state: issueStateSchema.optional(),
    locked: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

export const replyBodySchema = z.object({ body: z.string().trim().min(1).max(REPLY_BODY_MAX) });

export const issueListResponseSchema = z.object({
  items: z.array(issueListItemSchema),
  counts: z.object({ open: z.number(), closed: z.number() }),
  nextCursor: z.string().nullable(),
});

export const activityItemSchema = z.object({
  model: z.object({ id: z.string(), name: z.string(), ownerUsername: z.string() }),
  issue: issueListItemSchema,
  unread: z.boolean(),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const activityResponseSchema = z.object({
  items: z.array(activityItemSchema),
  unreadCount: z.number(),
});

export const starResponseSchema = z.object({ starred: z.boolean(), starCount: z.number() });
