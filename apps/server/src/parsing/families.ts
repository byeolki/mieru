import type { OpFamily } from '@mieru/shared';

const OP_FAMILY: Record<string, OpFamily> = {};
const assign = (family: OpFamily, ops: string[]) => {
  for (const op of ops) OP_FAMILY[op] = family;
};

assign('compute', [
  'Conv',
  'ConvTranspose',
  'ConvInteger',
  'QLinearConv',
  'MatMul',
  'MatMulInteger',
  'QLinearMatMul',
  'Gemm',
  'FusedMatMul',
  'Einsum',
  'DeformConv',
]);
assign('attention', [
  'Attention',
  'MultiHeadAttention',
  'GroupQueryAttention',
  'PackedAttention',
  'RotaryEmbedding',
  'SkipSimplifiedLayerNormalization',
  'EmbedLayerNormalization',
]);
assign('normalization', [
  'BatchNormalization',
  'LayerNormalization',
  'SimplifiedLayerNormalization',
  'SkipLayerNormalization',
  'InstanceNormalization',
  'GroupNormalization',
  'RMSNormalization',
  'LpNormalization',
  'MeanVarianceNormalization',
  'LRN',
]);
assign('activation', [
  'Relu',
  'LeakyRelu',
  'PRelu',
  'Elu',
  'Selu',
  'Celu',
  'Gelu',
  'FastGelu',
  'BiasGelu',
  'QuickGelu',
  'Sigmoid',
  'HardSigmoid',
  'HardSwish',
  'Swish',
  'Mish',
  'Tanh',
  'Softmax',
  'LogSoftmax',
  'Softplus',
  'Softsign',
  'ThresholdedRelu',
  'Clip',
]);
assign('shape', [
  'Reshape',
  'Flatten',
  'Squeeze',
  'Unsqueeze',
  'Transpose',
  'Concat',
  'Split',
  'Slice',
  'Gather',
  'GatherElements',
  'GatherND',
  'Expand',
  'Tile',
  'Pad',
  'Shape',
  'Size',
  'Resize',
  'Upsample',
  'DepthToSpace',
  'SpaceToDepth',
  'MaxPool',
  'AveragePool',
  'GlobalAveragePool',
  'GlobalMaxPool',
  'LpPool',
  'RoiAlign',
  'ReduceMean',
  'ReduceSum',
  'ReduceMax',
  'ReduceMin',
]);

/** Family of an ONNX op for coloring; anything unknown is "other". */
export function opFamily(opType: string): OpFamily {
  return OP_FAMILY[opType] ?? 'other';
}

/** Best-effort family for a safetensors tensor, inferred from its name. */
export function tensorFamily(name: string, rank: number): OpFamily {
  const lower = name.toLowerCase();
  if (/(attn|attention|q_proj|k_proj|v_proj|o_proj|qkv|query|key|value)/.test(lower))
    return 'attention';
  if (/(norm|ln_|\.ln\d*\.|layernorm|bn\d*\.|batchnorm|rms)/.test(lower)) return 'normalization';
  if (/(embed|wte|wpe|pos_emb|position)/.test(lower)) return 'shape';
  if (/(conv|linear|proj|fc|mlp|dense|lm_head|classifier|head)/.test(lower) || rank >= 2)
    return 'compute';
  return 'other';
}
