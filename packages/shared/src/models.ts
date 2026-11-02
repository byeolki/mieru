import { z } from 'zod';
import { modelSummarySchema } from './parsed-model.js';
import { roleSchema } from './roles.js';

export const README_MAX_BYTES = 256 * 1024;
export const MODEL_NAME_MAX = 200;
export const MODEL_DESCRIPTION_MAX = 500;

export const visibilitySchema = z.enum(['private', 'users', 'link', 'public']);
export type Visibility = z.infer<typeof visibilitySchema>;

export const versionStatusSchema = z.enum(['processing', 'ready', 'failed']);
export type VersionStatus = z.infer<typeof versionStatusSchema>;

export const modelFormatSchema = z.enum(['onnx', 'safetensors']);
export type ModelFormat = z.infer<typeof modelFormatSchema>;

export const accessViaSchema = z.enum(['owner', 'workspace', 'share', 'link', 'public', 'admin']);
export type AccessVia = z.infer<typeof accessViaSchema>;

const licenseSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.+-]{1,64}$/);
const utf8 = new TextEncoder();

export function utf8ByteLength(text: string): number {
  return utf8.encode(text).length;
}

const readmeSchema = z
  .string()
  .refine((text) => utf8ByteLength(text) <= README_MAX_BYTES, 'README is larger than 256 KiB');

export const userRefSchema = z.object({
  username: z.string(),
  displayName: z.string(),
});
export type UserRef = z.infer<typeof userRefSchema>;

export const createModelBodySchema = z.object({
  uploadId: z.uuid(),
  name: z.string().trim().min(1).max(MODEL_NAME_MAX),
  description: z.string().trim().max(MODEL_DESCRIPTION_MAX).optional(),
  readme: readmeSchema.optional(),
  license: licenseSchema.optional(),
  visibility: visibilitySchema.default('private'),
  publicAllowDownload: z.boolean().default(true),
});
export type CreateModelBody = z.input<typeof createModelBodySchema>;

export const updateModelBodySchema = z
  .object({
    name: z.string().trim().min(1).max(MODEL_NAME_MAX).optional(),
    description: z.string().trim().max(MODEL_DESCRIPTION_MAX).nullable().optional(),
    license: licenseSchema.nullable().optional(),
    visibility: visibilitySchema.optional(),
    publicAllowDownload: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');
export type UpdateModelBody = z.infer<typeof updateModelBodySchema>;

export const modelAccessSchema = z.object({
  role: roleSchema,
  canDownload: z.boolean(),
  via: accessViaSchema,
});
export type ModelAccess = z.infer<typeof modelAccessSchema>;

export const modelListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  format: modelFormatSchema.nullable(),
  owner: userRefSchema,
  myRole: roleSchema.nullable(),
  status: versionStatusSchema.nullable(),
  sizeBytes: z.number().nullable(),
  totalParams: z.number().nullable(),
  visibility: visibilitySchema,
  publicAllowDownload: z.boolean(),
  starCount: z.number(),
  openIssueCount: z.number(),
  strip: modelSummarySchema.shape.strip,
  updatedAt: z.string(),
});
export type ModelListItem = z.infer<typeof modelListItemSchema>;

export const versionSummarySchema = z.object({
  id: z.string(),
  number: z.number(),
  status: versionStatusSchema,
  failureReason: z.string().nullable(),
  originalName: z.string(),
  sha256: z.string().nullable(),
  summary: modelSummarySchema.nullable(),
  createdAt: z.string(),
});
export type VersionSummary = z.infer<typeof versionSummarySchema>;

export const modelDetailSchema = modelListItemSchema.extend({
  license: z.string().nullable(),
  hasReadme: z.boolean(),
  currentVersion: versionSummarySchema.nullable(),
  latestVersion: versionSummarySchema.nullable(),
  myAccess: modelAccessSchema,
  starredByMe: z.boolean(),
  takenDown: z.boolean(),
  takenDownReason: z.string().nullable(),
});
export type ModelDetail = z.infer<typeof modelDetailSchema>;

export const readmeResponseSchema = z.object({
  markdown: z.string(),
  updatedAt: z.string().nullable(),
  updatedBy: userRefSchema.nullable(),
});
export type ReadmeResponse = z.infer<typeof readmeResponseSchema>;

export const updateReadmeBodySchema = z.object({
  markdown: readmeSchema,
  baseUpdatedAt: z.string().nullable(),
});

export const fileTicketBodySchema = z.object({
  kind: z.enum(['model', 'labels']).default('model'),
  version: z.number().int().positive().optional(),
});
export const fileTicketResponseSchema = z.object({ url: z.string(), expiresAt: z.string() });

export const modelListResponseSchema = z.object({
  items: z.array(modelListItemSchema),
  nextCursor: z.string().nullable(),
});
export type ModelListResponse = z.infer<typeof modelListResponseSchema>;
