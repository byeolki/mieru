import { z } from 'zod';
import { userRefSchema, versionStatusSchema } from './models.js';

export const versionListItemSchema = z.object({
  number: z.number(),
  status: versionStatusSchema,
  failureReason: z.string().nullable(),
  originalName: z.string(),
  note: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  totalParams: z.number().nullable(),
  createdAt: z.string(),
  createdBy: userRefSchema.nullable(),
  isCurrent: z.boolean(),
});
export type VersionListItem = z.infer<typeof versionListItemSchema>;

export const versionListResponseSchema = z.object({
  items: z.array(versionListItemSchema),
  /** Distinct file bytes across all versions, against the per-repository limit. */
  usedBytes: z.number(),
  limitBytes: z.number(),
});

export const VERSION_NOTE_MAX = 500;
export const createVersionBodySchema = z.object({
  uploadId: z.uuid(),
  note: z.string().trim().max(VERSION_NOTE_MAX).optional(),
});
export type CreateVersionBody = z.infer<typeof createVersionBodySchema>;

export const diffStatusSchema = z.enum(['added', 'removed', 'changed', 'unchanged']);
export type DiffStatus = z.infer<typeof diffStatusSchema>;

/** Why a node counts as changed; several can apply at once. */
export const nodeChangeSchema = z.enum(['op', 'attributes', 'inputs', 'weights']);
export type NodeChange = z.infer<typeof nodeChangeSchema>;

const diffCountsSchema = z.object({
  added: z.number(),
  removed: z.number(),
  changed: z.number(),
  unchanged: z.number(),
});

/** Differences between two versions. Only non-unchanged entries are listed. */
export const modelDiffSchema = z.object({
  from: z.number(),
  to: z.number(),
  nodes: z.array(
    z.object({
      name: z.string(),
      opType: z.string(),
      status: diffStatusSchema.exclude(['unchanged']),
      changes: z.array(nodeChangeSchema),
    }),
  ),
  tensors: z.array(
    z.object({
      name: z.string(),
      status: diffStatusSchema.exclude(['unchanged']),
      fromShape: z.array(z.number()).nullable(),
      toShape: z.array(z.number()).nullable(),
    }),
  ),
  summary: z.object({
    nodes: diffCountsSchema,
    tensors: diffCountsSchema,
    paramsFrom: z.number(),
    paramsTo: z.number(),
  }),
});
export type ModelDiff = z.infer<typeof modelDiffSchema>;
