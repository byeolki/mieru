import { z } from 'zod';
import { modelSummarySchema } from './parsed-model.js';
import { roleSchema } from './roles.js';

export const README_MAX_BYTES = 256 * 1024;
export const MODEL_NAME_MAX = 200;
export const MODEL_SLUG_MAX = 100;
const SLUG_FALLBACK = 'model';

/**
 * The URL segment for a repository name: lowercase ASCII letters, digits, `.`, `_` and `-`, with
 * anything else collapsed into `-`. Names with no such characters (all Korean) become `model`.
 * Must match the backfill in migration 004.
 */
export function modelSlugFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MODEL_SLUG_MAX)
    .replace(/-+$/, '');
  return slug || SLUG_FALLBACK;
}
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
  /** Uploaded profile photo, served at /api/avatars/{key}; null shows the generated avatar. */
  avatarKey: z.string().nullable().default(null),
});
export type UserRef = z.infer<typeof userRefSchema>;

/**
 * Most external data files one ONNX model may bring. Some exporters write one file per tensor,
 * so this is far above the usual single `.data` file.
 */
export const MAX_EXTERNAL_DATA_FILES = 1024;

/** Uploads holding the external data files the `.onnx` upload's tensors point into. */
export const dataUploadIdsSchema = z.array(z.uuid()).max(MAX_EXTERNAL_DATA_FILES).default([]);

export const createModelBodySchema = z.object({
  uploadId: z.uuid(),
  dataUploadIds: dataUploadIdsSchema,
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
  /** URL segment under the owner: /{owner.username}/{slug}. */
  slug: z.string(),
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
  /** Extra context for the reason, e.g. the names of missing external data files. */
  failureDetail: z.string().nullable().default(null),
  originalName: z.string(),
  sha256: z.string().nullable(),
  summary: modelSummarySchema.nullable(),
  createdAt: z.string(),
});
export type VersionSummary = z.infer<typeof versionSummarySchema>;

export const modelResolveResponseSchema = z.object({ id: z.string() });

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
/** One external data file of a model, downloadable with the same ticket as the model. */
export const externalDataFileSchema = z.object({
  name: z.string(),
  /** The path the model's tensors use for this file; runtimes match external files by it. */
  location: z.string(),
  sizeBytes: z.number(),
  url: z.string(),
});
export type ExternalDataFile = z.infer<typeof externalDataFileSchema>;

export const fileTicketResponseSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
  /** Files an ONNX model's tensors live in; they must sit next to the model file to load it. */
  externalData: z.array(externalDataFileSchema).default([]),
});

/** Class names for a model's output indices, used by the in-browser demo. */
export const LABELS_MAX = 50_000;
export const LABEL_MAX_LENGTH = 200;
export const labelsSchema = z.object({
  labels: z.array(z.string().trim().max(LABEL_MAX_LENGTH)).max(LABELS_MAX),
});
export type Labels = z.infer<typeof labelsSchema>;

export const modelListResponseSchema = z.object({
  items: z.array(modelListItemSchema),
  nextCursor: z.string().nullable(),
});
export type ModelListResponse = z.infer<typeof modelListResponseSchema>;
