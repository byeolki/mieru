import protobuf from 'protobufjs';
import descriptor from '../../src/parsing/onnx/proto/onnx-proto.json' with { type: 'json' };

const root = protobuf.Root.fromJSON(descriptor);
const ModelProto = root.lookupType('onnx.ModelProto');

const FLOAT = 1;
const INT64 = 7;
const ATTR_INT = 2;
const ATTR_INTS = 7;
const ATTR_FLOAT = 1;
const ATTR_TENSOR = 4;
const ATTR_GRAPH = 5;

/** Deterministic PRNG (mulberry32) so fixture bytes and hashes are stable across runs. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function floatTensor(name: string, dims: number[], random: () => number) {
  const count = dims.reduce((product, dim) => product * dim, 1);
  const data = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) data.writeFloatLE(random() * 2 - 1, index * 4);
  return { name, dims, dataType: FLOAT, rawData: data };
}

/** Like `floatTensor` but strictly positive, for values such as BatchNorm variance. */
function positiveFloatTensor(name: string, dims: number[], random: () => number) {
  const count = dims.reduce((product, dim) => product * dim, 1);
  const data = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) data.writeFloatLE(0.1 + random() * 0.9, index * 4);
  return { name, dims, dataType: FLOAT, rawData: data };
}

function perturbed<T extends { name: string; rawData: Buffer }>(tensors: T[], name?: string): T[] {
  return tensors.map((tensor) => {
    if (tensor.name !== name) return tensor;
    const rawData = Buffer.from(tensor.rawData);
    rawData.writeFloatLE(rawData.readFloatLE(0) + 1, 0);
    return { ...tensor, rawData };
  });
}

function int64Tensor(name: string, values: number[]) {
  const data = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => data.writeBigInt64LE(BigInt(value), index * 8));
  return { name, dims: [values.length], dataType: INT64, rawData: data };
}

function valueInfo(name: string, dims: (number | string)[]) {
  return {
    name,
    type: {
      tensorType: {
        elemType: FLOAT,
        shape: {
          dim: dims.map((dim) => (typeof dim === 'number' ? { dimValue: dim } : { dimParam: dim })),
        },
      },
    },
  };
}

const ints = (name: string, values: number[]) => ({ name, type: ATTR_INTS, ints: values });
const int = (name: string, value: number) => ({ name, type: ATTR_INT, i: value });
const float = (name: string, value: number) => ({ name, type: ATTR_FLOAT, f: value });

function encodeModel(graph: object): Buffer {
  const message = ModelProto.fromObject({
    irVersion: 9,
    opsetImport: [{ domain: '', version: 17 }],
    producerName: 'mieru-fixtures',
    producerVersion: '1',
    metadataProps: [{ key: 'author', value: 'mieru' }],
    graph,
  });
  return Buffer.from(ModelProto.encode(message).finish());
}

/**
 * Tiny CNN: Conv → BatchNorm → Relu → two Conv branches → Add → GlobalAveragePool →
 * Reshape (shape from a Constant node) → Gemm. Parameter total is fixed and asserted in tests.
 */
export interface TinyCnnOptions {
  /** Flips the first value of this initializer, to model a retrained layer in a new version. */
  perturb?: string;
  /** Adds a Relu after the head, to model an architecture change. */
  extraHeadRelu?: boolean;
}

export function tinyCnnOnnx(options: TinyCnnOptions = {}): Buffer {
  const random = seededRandom(1);
  const shapeConstant = int64Tensor('shape_value', [1, 4]);
  return encodeModel({
    name: 'tiny-cnn',
    input: [valueInfo('input', ['batch', 3, 8, 8])],
    output: [valueInfo('logits', ['batch', 10])],
    initializer: perturbed(
      [
        floatTensor('conv1.weight', [4, 3, 3, 3], random),
        floatTensor('conv1.bias', [4], random),
        floatTensor('bn.scale', [4], random),
        floatTensor('bn.bias', [4], random),
        floatTensor('bn.mean', [4], random),
        // A negative variance would make the model produce NaN when it is actually run.
        positiveFloatTensor('bn.var', [4], random),
        floatTensor('branch_a.weight', [4, 4, 3, 3], random),
        floatTensor('branch_b.weight', [4, 4, 3, 3], random),
        floatTensor('fc.weight', [10, 4], random),
        floatTensor('fc.bias', [10], random),
      ],
      options.perturb,
    ),
    valueInfo: [valueInfo('relu_out', ['batch', 4, 8, 8])],
    node: [
      {
        name: '/stem/conv/Conv',
        opType: 'Conv',
        input: ['input', 'conv1.weight', 'conv1.bias'],
        output: ['conv1_out'],
        attribute: [ints('kernel_shape', [3, 3]), ints('pads', [1, 1, 1, 1])],
      },
      {
        name: '/stem/bn/BatchNormalization',
        opType: 'BatchNormalization',
        input: ['conv1_out', 'bn.scale', 'bn.bias', 'bn.mean', 'bn.var'],
        output: ['bn_out'],
        attribute: [float('epsilon', 1e-5)],
      },
      { name: '/stem/act/Relu', opType: 'Relu', input: ['bn_out'], output: ['relu_out'] },
      {
        name: '/block/branch_a/Conv',
        opType: 'Conv',
        input: ['relu_out', 'branch_a.weight'],
        output: ['a_out'],
        attribute: [ints('kernel_shape', [3, 3]), ints('pads', [1, 1, 1, 1])],
      },
      {
        name: '/block/branch_b/Conv',
        opType: 'Conv',
        input: ['relu_out', 'branch_b.weight'],
        output: ['b_out'],
        attribute: [ints('kernel_shape', [3, 3]), ints('pads', [1, 1, 1, 1])],
      },
      { name: '/block/Add', opType: 'Add', input: ['a_out', 'b_out'], output: ['sum'] },
      {
        name: '/head/pool/GlobalAveragePool',
        opType: 'GlobalAveragePool',
        input: ['sum'],
        output: ['pooled'],
      },
      {
        name: '/head/Constant',
        opType: 'Constant',
        output: ['shape'],
        attribute: [{ name: 'value', type: ATTR_TENSOR, t: shapeConstant }],
      },
      { name: '/head/Reshape', opType: 'Reshape', input: ['pooled', 'shape'], output: ['flat'] },
      {
        name: '/head/fc/Gemm',
        opType: 'Gemm',
        input: ['flat', 'fc.weight', 'fc.bias'],
        output: [options.extraHeadRelu ? 'fc_out' : 'logits'],
        attribute: [int('transB', 1)],
      },
      ...(options.extraHeadRelu
        ? [{ name: '/head/act/Relu', opType: 'Relu', input: ['fc_out'], output: ['logits'] }]
        : []),
    ],
  });
}

/** Parameters in tinyCnnOnnx (weights + biases + BN stats + the Constant shape tensor). */
export const TINY_CNN_PARAMS = 108 + 4 + 16 + 144 + 144 + 40 + 10 + 2;

/** Tiny MLP with real weights: Gemm → Relu → Gemm → Softmax (used for demo tests later). */
export function tinyMlpOnnx(): Buffer {
  const random = seededRandom(2);
  return encodeModel({
    name: 'tiny-mlp',
    input: [valueInfo('features', [1, 4])],
    output: [valueInfo('probabilities', [1, 3])],
    initializer: [
      floatTensor('fc1.weight', [8, 4], random),
      floatTensor('fc1.bias', [8], random),
      floatTensor('fc2.weight', [3, 8], random),
      floatTensor('fc2.bias', [3], random),
    ],
    node: [
      {
        name: 'fc1',
        opType: 'Gemm',
        input: ['features', 'fc1.weight', 'fc1.bias'],
        output: ['h'],
        attribute: [int('transB', 1)],
      },
      { name: 'act', opType: 'Relu', input: ['h'], output: ['h_relu'] },
      {
        name: 'fc2',
        opType: 'Gemm',
        input: ['h_relu', 'fc2.weight', 'fc2.bias'],
        output: ['logits'],
        attribute: [int('transB', 1)],
      },
      {
        name: 'softmax',
        opType: 'Softmax',
        input: ['logits'],
        output: ['probabilities'],
        attribute: [int('axis', 1)],
      },
    ],
  });
}

/** Transformer-shaped graph with `layers` × 12 nodes and hierarchical names (perf fixture). */
export function syntheticTransformerOnnx(layers: number): Buffer {
  const random = seededRandom(3);
  const initializer: ReturnType<typeof floatTensor>[] = [];
  const node: object[] = [];
  let current = 'hidden_0';
  for (let layer = 0; layer < layers; layer += 1) {
    const prefix = `/model/layers.${layer}`;
    const weight = (name: string) => {
      const tensorName = `layers.${layer}.${name}`;
      initializer.push(floatTensor(tensorName, [2, 2], random));
      return tensorName;
    };
    const out = (name: string) => `${prefix}/${name}_out`;
    const steps: [string, string, string[]][] = [
      ['input_layernorm/LayerNormalization', 'LayerNormalization', [current, weight('ln1.weight')]],
      [
        'self_attn/q_proj/MatMul',
        'MatMul',
        [out('input_layernorm/LayerNormalization'), weight('q.weight')],
      ],
      [
        'self_attn/k_proj/MatMul',
        'MatMul',
        [out('input_layernorm/LayerNormalization'), weight('k.weight')],
      ],
      [
        'self_attn/v_proj/MatMul',
        'MatMul',
        [out('input_layernorm/LayerNormalization'), weight('v.weight')],
      ],
      [
        'self_attn/scores/MatMul',
        'MatMul',
        [out('self_attn/q_proj/MatMul'), out('self_attn/k_proj/MatMul')],
      ],
      ['self_attn/Softmax', 'Softmax', [out('self_attn/scores/MatMul')]],
      [
        'self_attn/context/MatMul',
        'MatMul',
        [out('self_attn/Softmax'), out('self_attn/v_proj/MatMul')],
      ],
      ['self_attn/o_proj/MatMul', 'MatMul', [out('self_attn/context/MatMul'), weight('o.weight')]],
      ['residual_1/Add', 'Add', [current, out('self_attn/o_proj/MatMul')]],
      ['mlp/up_proj/MatMul', 'MatMul', [out('residual_1/Add'), weight('up.weight')]],
      ['mlp/act/Gelu', 'Gelu', [out('mlp/up_proj/MatMul')]],
      ['mlp/down_proj/MatMul', 'MatMul', [out('mlp/act/Gelu'), weight('down.weight')]],
    ];
    for (const [name, opType, inputs] of steps) {
      node.push({ name: `${prefix}/${name}`, opType, input: inputs, output: [out(name)] });
    }
    const next = `hidden_${layer + 1}`;
    node.push({
      name: `${prefix}/residual_2/Add`,
      opType: 'Add',
      input: [out('residual_1/Add'), out('mlp/down_proj/MatMul')],
      output: [next],
    });
    current = next;
  }
  return encodeModel({
    name: 'synthetic-transformer',
    input: [valueInfo('hidden_0', ['batch', 'seq', 2])],
    output: [valueInfo(current, ['batch', 'seq', 2])],
    initializer,
    node,
  });
}

export const EXTERNAL_DATA_NAME = 'model.onnx.data';

/**
 * An ONNX model whose two weights live in an external data file, as `torch.onnx.export` writes
 * models over 2 GB. The data file holds `w1` at offset 0 and `w2` at offset 16, 16 bytes each.
 */
export function externalDataOnnx(): { model: Buffer; data: Buffer } {
  const random = seededRandom(7);
  const data = Buffer.concat([
    floatTensor('w1', [2, 2], random).rawData,
    floatTensor('w2', [2, 2], random).rawData,
  ]);
  const external = (name: string, offset: number) => ({
    name,
    dims: [2, 2],
    dataType: FLOAT,
    dataLocation: 1,
    externalData: [
      // A directory part, which some exporters write, is matched by base name.
      { key: 'location', value: `./${EXTERNAL_DATA_NAME}` },
      { key: 'offset', value: String(offset) },
      { key: 'length', value: '16' },
    ],
  });
  const model = encodeModel({
    name: 'external',
    input: [valueInfo('x', [1, 2])],
    output: [valueInfo('z', [1, 2])],
    initializer: [external('w1', 0), external('w2', 16)],
    node: [
      { name: 'mm1', opType: 'MatMul', input: ['x', 'w1'], output: ['y'] },
      { name: 'mm2', opType: 'MatMul', input: ['y', 'w2'], output: ['z'] },
    ],
  });
  return { model, data };
}

const INT8 = 3;
const INT64_MAX = '9223372036854775807';

/** Parameters in `realWorldQuirksOnnx`: w (4) + then_w (3) + then_c (2) + sparse (16) + q (4). */
export const QUIRKS_PARAMS = 4 + 3 + 2 + 16 + 4;

/**
 * Features real exports use that toy models don't: an INT64_MAX attribute (opset 9 Slice
 * `ends`), an If whose branch holds its own initializer and Constant, a sparse initializer, and
 * an int8 tensor stored as `int32_data` varints instead of raw bytes.
 */
export function realWorldQuirksOnnx(): Buffer {
  const random = seededRandom(3);
  const thenBranch = {
    name: 'then',
    output: [valueInfo('then_out', [3])],
    initializer: [floatTensor('then_w', [3], random)],
    node: [
      {
        name: 'then_const',
        opType: 'Constant',
        output: ['then_c'],
        attribute: [{ name: 'value', type: ATTR_TENSOR, t: floatTensor('then_c', [2], random) }],
      },
      { name: 'then_add', opType: 'Add', input: ['then_w', 'then_w'], output: ['then_out'] },
    ],
  };
  return encodeModel({
    name: 'quirks',
    input: [valueInfo('x', ['batch', 4]), valueInfo('flag', [])],
    output: [valueInfo('sliced', ['batch', 4]), valueInfo('branch', [3])],
    initializer: [
      floatTensor('w', [4], random),
      { name: 'q', dims: [4], dataType: INT8, int32Data: [-1, 2, -3, 4] },
    ],
    sparseInitializer: [
      {
        values: { name: 'sparse', dims: [3], dataType: FLOAT, floatData: [1, 2, 3] },
        indices: { name: 'sparse_indices', dims: [3], dataType: INT64, int64Data: [0, 5, 15] },
        dims: [4, 4],
      },
    ],
    node: [
      { name: 'scale', opType: 'Mul', input: ['x', 'w'], output: ['scaled'] },
      { name: 'quant', opType: 'Add', input: ['scaled', 'q'], output: ['shifted'] },
      {
        name: 'slice',
        opType: 'Slice',
        input: ['shifted'],
        output: ['sliced'],
        attribute: [
          { name: 'starts', type: ATTR_INTS, ints: [0] },
          { name: 'ends', type: ATTR_INTS, ints: [INT64_MAX] },
          { name: 'axes', type: ATTR_INTS, ints: [1] },
        ],
      },
      {
        name: 'branch',
        opType: 'If',
        input: ['flag'],
        output: ['branch'],
        attribute: [{ name: 'then_branch', type: ATTR_GRAPH, g: thenBranch }],
      },
    ],
  });
}

interface SafetensorsEntry {
  name: string;
  dtype: string;
  shape: number[];
}

const DTYPE_BYTES: Record<string, number> = { F32: 4, F16: 2, BF16: 2, I64: 8, U8: 1 };

/** Writes a valid safetensors buffer for the given tensors (zero-filled data). */
export function safetensorsBuffer(
  entries: SafetensorsEntry[],
  metadata?: Record<string, string>,
): Buffer {
  const header: Record<string, unknown> = metadata ? { __metadata__: metadata } : {};
  let offset = 0;
  for (const entry of entries) {
    const size =
      entry.shape.reduce((product, dim) => product * dim, 1) * (DTYPE_BYTES[entry.dtype] ?? 4);
    header[entry.name] = {
      dtype: entry.dtype,
      shape: entry.shape,
      data_offsets: [offset, offset + size],
    };
    offset += size;
  }
  return safetensorsWithHeader(JSON.stringify(header), offset);
}

export function safetensorsWithHeader(headerJson: string, dataBytes: number): Buffer {
  const headerBytes = Buffer.from(headerJson, 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(headerBytes.length));
  return Buffer.concat([length, headerBytes, Buffer.alloc(dataBytes)]);
}

export const NESTED_SAFETENSORS: SafetensorsEntry[] = [
  { name: 'model.embed_tokens.weight', dtype: 'F32', shape: [16, 8] },
  { name: 'model.layers.0.self_attn.q_proj.weight', dtype: 'F32', shape: [8, 8] },
  { name: 'model.layers.0.self_attn.k_proj.weight', dtype: 'F32', shape: [8, 8] },
  { name: 'model.layers.0.input_layernorm.weight', dtype: 'F16', shape: [8] },
  { name: 'model.layers.1.self_attn.q_proj.weight', dtype: 'F32', shape: [8, 8] },
  { name: 'model.layers.1.input_layernorm.weight', dtype: 'F16', shape: [8] },
  { name: 'lm_head.weight', dtype: 'BF16', shape: [16, 8] },
];

/** 16·8 + 8·8 + 8·8 + 8 + 8·8 + 8 + 16·8 */
export const NESTED_SAFETENSORS_PARAMS = 128 + 64 + 64 + 8 + 64 + 8 + 128;

const GraphProto = root.lookupType('onnx.GraphProto');
const TensorProto = root.lookupType('onnx.TensorProto');

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = BigInt(value);
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining > 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0n);
  return Buffer.from(bytes);
}

/**
 * Lays out an ONNX file whose single initializer has `payloadBytes` of raw_data, returning the
 * bytes before and after the payload. Writing them around a sparse hole produces a huge but
 * cheap-to-create file for memory tests.
 */
export function largeOnnxLayout(payloadBytes: number): { head: Buffer; tail: Buffer } {
  const elementCount = payloadBytes / 4;
  const tensorHeader = Buffer.from(
    TensorProto.encode(
      TensorProto.fromObject({ name: 'big.weight', dims: [elementCount], dataType: FLOAT }),
    ).finish(),
  );
  const rawDataPrefix = Buffer.concat([Buffer.from([0x4a]), varint(payloadBytes)]);
  const tensorLength = tensorHeader.length + rawDataPrefix.length + payloadBytes;
  const initializerPrefix = Buffer.concat([Buffer.from([0x2a]), varint(tensorLength)]);
  const rest = Buffer.from(
    GraphProto.encode(
      GraphProto.fromObject({
        name: 'large',
        input: [valueInfo('x', [1, elementCount])],
        output: [valueInfo('y', [1, elementCount])],
        node: [{ name: 'mul', opType: 'Mul', input: ['x', 'big.weight'], output: ['y'] }],
      }),
    ).finish(),
  );
  const graphLength = initializerPrefix.length + tensorLength + rest.length;
  const modelPrefix = Buffer.from(
    ModelProto.encode(
      ModelProto.fromObject({ irVersion: 9, opsetImport: [{ domain: '', version: 17 }] }),
    ).finish(),
  );
  const head = Buffer.concat([
    modelPrefix,
    Buffer.from([0x3a]),
    varint(graphLength),
    initializerPrefix,
    tensorHeader,
    rawDataPrefix,
  ]);
  return { head, tail: rest };
}
