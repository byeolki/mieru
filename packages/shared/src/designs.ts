import { z } from 'zod';
import { userRefSchema } from './models.js';

export const DESIGN_MAX_LAYERS = 200;
const DIM_MAX = 1_000_000;

const id = z.string().min(1).max(64);
const positive = z.number().int().min(1).max(DIM_MAX);
const nonNegative = z.number().int().min(0).max(DIM_MAX);

/** Layers that map one-to-one onto `torch.nn` modules inside an `nn.Sequential`. */
export const designLayerSchema = z.discriminatedUnion('type', [
  z.object({
    id,
    type: z.literal('conv2d'),
    inChannels: positive,
    outChannels: positive,
    kernelSize: positive,
    stride: positive,
    padding: nonNegative,
  }),
  z.object({ id, type: z.literal('batchnorm2d'), numFeatures: positive }),
  z.object({ id, type: z.literal('maxpool2d'), kernelSize: positive, stride: positive }),
  z.object({ id, type: z.literal('avgpool2d'), kernelSize: positive, stride: positive }),
  z.object({ id, type: z.literal('adaptiveavgpool2d'), outputSize: positive }),
  z.object({ id, type: z.literal('flatten') }),
  z.object({ id, type: z.literal('linear'), inFeatures: positive, outFeatures: positive }),
  z.object({ id, type: z.literal('relu') }),
  z.object({ id, type: z.literal('gelu') }),
  z.object({ id, type: z.literal('sigmoid') }),
  z.object({ id, type: z.literal('tanh') }),
  z.object({ id, type: z.literal('dropout'), p: z.number().min(0).max(1) }),
  z.object({ id, type: z.literal('softmax') }),
]);
export type DesignLayer = z.infer<typeof designLayerSchema>;
export type DesignLayerType = DesignLayer['type'];

export const designSpecSchema = z.object({
  /** Input shape including the batch dimension, e.g. `[1, 3, 32, 32]` or `[1, 784]`. */
  input: z.object({ shape: z.array(positive).min(2).max(4) }),
  layers: z.array(designLayerSchema).max(DESIGN_MAX_LAYERS),
});
export type DesignSpec = z.infer<typeof designSpecSchema>;

export const designVisibilitySchema = z.enum(['private', 'public']);
export type DesignVisibility = z.infer<typeof designVisibilitySchema>;

export const saveDesignBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  spec: designSpecSchema,
  visibility: designVisibilitySchema.default('private'),
});
export type SaveDesignBody = z.input<typeof saveDesignBodySchema>;

export const designSchema = z.object({
  id: z.string(),
  name: z.string(),
  spec: designSpecSchema,
  visibility: designVisibilitySchema,
  owner: userRefSchema,
  canEdit: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Design = z.infer<typeof designSchema>;

export const designListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      visibility: designVisibilitySchema,
      layerCount: z.number(),
      updatedAt: z.string(),
    }),
  ),
});
