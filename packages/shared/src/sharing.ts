import { z } from 'zod';
import { grantableRoleSchema, roleSchema } from './roles.js';

export const userSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const shareSchema = z.object({
  user: userSummarySchema,
  role: grantableRoleSchema,
  allowDownload: z.boolean(),
  createdAt: z.string(),
});
export type Share = z.infer<typeof shareSchema>;

export const upsertShareBodySchema = z.object({
  role: grantableRoleSchema,
  allowDownload: z.boolean().default(true),
});

export const shareLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  label: z.string().nullable(),
  role: grantableRoleSchema,
  allowDownload: z.boolean(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  visitorCount: z.number(),
  createdAt: z.string(),
});
export type ShareLink = z.infer<typeof shareLinkSchema>;

const expiresAtSchema = z.iso.datetime({ offset: true }).nullable();

export const createShareLinkBodySchema = z.object({
  role: grantableRoleSchema.default('viewer'),
  allowDownload: z.boolean().default(false),
  expiresAt: expiresAtSchema.default(null),
  label: z.string().trim().max(100).nullable().default(null),
});

export const updateShareLinkBodySchema = z
  .object({
    role: grantableRoleSchema.optional(),
    allowDownload: z.boolean().optional(),
    expiresAt: expiresAtSchema.optional(),
    label: z.string().trim().max(100).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

export const resolvedLinkSchema = z.object({
  modelId: z.string(),
  role: roleSchema,
  canDownload: z.boolean(),
});
export type ResolvedLink = z.infer<typeof resolvedLinkSchema>;
