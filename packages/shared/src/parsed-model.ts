import { z } from 'zod';

/** Bump when the parser output changes shape or meaning; old sidecars are re-parsed lazily. */
export const PARSER_VERSION = 1;

export const OP_FAMILIES = [
  'compute',
  'attention',
  'normalization',
  'activation',
  'shape',
  'other',
] as const;
export const opFamilySchema = z.enum(OP_FAMILIES);
export type OpFamily = z.infer<typeof opFamilySchema>;

export const dimSchema = z.union([z.number(), z.string(), z.null()]);
export type Dim = z.infer<typeof dimSchema>;

export const tensorInfoSchema = z.object({
  name: z.string(),
  dtype: z.string().nullable(),
  shape: z.array(dimSchema).nullable(),
});
export type TensorInfo = z.infer<typeof tensorInfoSchema>;

export const stripSegmentSchema = z.object({ family: opFamilySchema, weight: z.number() });
export type StripSegment = z.infer<typeof stripSegmentSchema>;

export const modelSummarySchema = z.object({
  format: z.enum(['onnx', 'safetensors']),
  fileSizeBytes: z.number(),
  totalParams: z.number(),
  tensorCount: z.number(),
  nodeCount: z.number().optional(),
  opsetVersion: z.number().optional(),
  producer: z.string().optional(),
  dtypeBreakdown: z.record(z.string(), z.object({ params: z.number(), bytes: z.number() })),
  strip: z.array(stripSegmentSchema),
});
export type ModelSummary = z.infer<typeof modelSummarySchema>;

export const attrValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('int'), value: z.number() }),
  z.object({ kind: z.literal('float'), value: z.number() }),
  z.object({ kind: z.literal('string'), value: z.string() }),
  z.object({ kind: z.literal('ints'), value: z.array(z.number()), truncated: z.boolean() }),
  z.object({ kind: z.literal('floats'), value: z.array(z.number()), truncated: z.boolean() }),
  z.object({ kind: z.literal('strings'), value: z.array(z.string()), truncated: z.boolean() }),
  z.object({ kind: z.literal('tensor'), dtype: z.string(), shape: z.array(z.number()) }),
  z.object({ kind: z.literal('graph'), nodeCount: z.number() }),
]);
export type AttrValue = z.infer<typeof attrValueSchema>;

export const onnxNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  opType: z.string(),
  domain: z.string(),
  family: opFamilySchema,
  groupPath: z.array(z.string()),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  params: z.array(tensorInfoSchema),
  paramCount: z.number(),
  attributes: z.record(z.string(), attrValueSchema),
});
export type OnnxNode = z.infer<typeof onnxNodeSchema>;

export const onnxEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  tensor: tensorInfoSchema,
});
export type OnnxEdge = z.infer<typeof onnxEdgeSchema>;

export const onnxGraphPayloadSchema = z.object({
  kind: z.literal('onnx-graph'),
  inputs: z.array(tensorInfoSchema),
  outputs: z.array(tensorInfoSchema),
  nodes: z.array(onnxNodeSchema),
  edges: z.array(onnxEdgeSchema),
  metadata: z.record(z.string(), z.string()),
});
export type OnnxGraphPayload = z.infer<typeof onnxGraphPayloadSchema>;

export interface ModuleNode {
  path: string;
  name: string;
  children: ModuleNode[];
  tensors: { name: string; dtype: string; shape: number[]; params: number; bytes: number }[];
  paramCount: number;
  byteSize: number;
}

export const moduleNodeSchema: z.ZodType<ModuleNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    name: z.string(),
    children: z.array(moduleNodeSchema),
    tensors: z.array(
      z.object({
        name: z.string(),
        dtype: z.string(),
        shape: z.array(z.number()),
        params: z.number(),
        bytes: z.number(),
      }),
    ),
    paramCount: z.number(),
    byteSize: z.number(),
  }),
);

export const safetensorsTreePayloadSchema = z.object({
  kind: z.literal('safetensors-tree'),
  root: moduleNodeSchema,
  metadata: z.record(z.string(), z.string()),
});
export type SafetensorsTreePayload = z.infer<typeof safetensorsTreePayloadSchema>;

export const parsedModelSchema = z.object({
  parserVersion: z.number(),
  summary: modelSummarySchema,
  payload: z.discriminatedUnion('kind', [onnxGraphPayloadSchema, safetensorsTreePayloadSchema]),
});
export type ParsedModel = z.infer<typeof parsedModelSchema>;
