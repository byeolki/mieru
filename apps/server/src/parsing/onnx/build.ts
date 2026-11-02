import {
  PARSER_VERSION,
  type Dim,
  type OnnxEdge,
  type OnnxNode,
  type ParsedModel,
  type TensorInfo,
} from '@mieru/shared';
import { elementCount, onnxDtype } from '../dtypes.js';
import { ParseError } from '../errors.js';
import { opFamily } from '../families.js';
import { buildStrip } from '../strip.js';
import type { TensorIndexEntry } from '../tensor-index.js';
import type { RawModel, RawTensor } from './scan.js';

const DEFAULT_DOMAINS = new Set(['', 'ai.onnx']);

export interface OnnxBuildResult {
  parsed: ParsedModel;
  tensorIndex: TensorIndexEntry[];
}

/**
 * Splits exporter node names into a group hierarchy:
 * `/model/layers.3/self_attn/q_proj/MatMul` → [model, layers.3, self_attn, q_proj].
 */
export function groupPathOf(name: string): string[] {
  if (name.includes('/')) return name.split('/').filter(Boolean).slice(0, -1);
  if (name.includes('.')) return name.split('.').filter(Boolean).slice(0, -1);
  return [];
}

function tensorParams(tensor: RawTensor): number {
  return elementCount(tensor.dims);
}

function tensorBytes(tensor: RawTensor): number {
  const info = onnxDtype(tensor.dataType);
  if (!info || info.bits === 0) return tensor.dataLength;
  return Math.ceil((tensorParams(tensor) * info.bits) / 8);
}

function infoOfTensor(tensor: RawTensor): TensorInfo {
  return { name: tensor.name, dtype: onnxDtype(tensor.dataType)?.name ?? null, shape: tensor.dims };
}

/** Builds the graph payload, summary and tensor index from a scanned ONNX model. */
export function buildOnnxModel(raw: RawModel, fileSizeBytes: number): OnnxBuildResult {
  const externalTensor = raw.initializers.find((tensor) => tensor.isExternal);
  if (externalTensor) {
    throw new ParseError(
      'external_data_unsupported',
      'Models with external data files are not supported',
    );
  }

  const weights = new Map<string, RawTensor>();
  for (const tensor of raw.initializers) weights.set(tensor.name, tensor);
  for (const node of raw.nodes) {
    const output = node.outputs[0];
    if (node.constantTensor && output)
      weights.set(output, { ...node.constantTensor, name: output });
  }

  const shapes = new Map<string, TensorInfo>();
  for (const info of [...raw.inputs, ...raw.outputs, ...raw.valueInfo]) {
    if (info.name) shapes.set(info.name, info);
  }
  const shapeOf = (name: string): TensorInfo =>
    shapes.get(name) ?? { name, dtype: null, shape: null as Dim[] | null };

  const graphInputs = raw.inputs.filter((input) => !weights.has(input.name));
  const producers = new Map<string, string>();
  for (const input of graphInputs) producers.set(input.name, `in:${input.name}`);

  const nodes: OnnxNode[] = [];
  raw.nodes.forEach((rawNode, index) => {
    if (rawNode.constantTensor) return;
    const id = `n${index}`;
    const params = rawNode.inputs.flatMap((input) => {
      const weight = weights.get(input);
      return weight ? [weight] : [];
    });
    for (const output of rawNode.outputs) if (output) producers.set(output, id);
    nodes.push({
      id,
      name: rawNode.name || `${rawNode.opType}_${index}`,
      opType: rawNode.opType,
      domain: DEFAULT_DOMAINS.has(rawNode.domain) ? '' : rawNode.domain,
      family: opFamily(rawNode.opType),
      groupPath: groupPathOf(rawNode.name),
      inputs: rawNode.inputs.filter((input) => input && !weights.has(input)),
      outputs: rawNode.outputs.filter(Boolean),
      params: params.map(infoOfTensor),
      paramCount: params.reduce((sum, tensor) => sum + tensorParams(tensor), 0),
      attributes: rawNode.attributes,
    });
  });

  const edges: OnnxEdge[] = [];
  for (const node of nodes) {
    for (const input of node.inputs) {
      const source = producers.get(input);
      if (source)
        edges.push({ id: `e${edges.length}`, source, target: node.id, tensor: shapeOf(input) });
    }
  }
  for (const output of raw.outputs) {
    const source = producers.get(output.name);
    if (source)
      edges.push({ id: `e${edges.length}`, source, target: `out:${output.name}`, tensor: output });
  }

  const dtypeBreakdown: Record<string, { params: number; bytes: number }> = {};
  const tensorIndex: TensorIndexEntry[] = [];
  let totalParams = 0;
  for (const tensor of weights.values()) {
    const params = tensorParams(tensor);
    const bytes = tensorBytes(tensor);
    const dtype = onnxDtype(tensor.dataType)?.name ?? 'unknown';
    totalParams += params;
    const entry = (dtypeBreakdown[dtype] ??= { params: 0, bytes: 0 });
    entry.params += params;
    entry.bytes += bytes;
    if (tensor.dataOffset !== null) {
      tensorIndex.push({
        name: tensor.name,
        dtype,
        shape: tensor.dims,
        offset: tensor.dataOffset,
        length: tensor.dataLength,
      });
    }
  }

  const defaultOpset = raw.opsets.find((opset) => DEFAULT_DOMAINS.has(opset.domain));
  const producer = [raw.producerName, raw.producerVersion].filter(Boolean).join(' ');
  return {
    parsed: {
      parserVersion: PARSER_VERSION,
      summary: {
        format: 'onnx',
        fileSizeBytes,
        totalParams,
        tensorCount: weights.size,
        nodeCount: nodes.length,
        ...(defaultOpset ? { opsetVersion: defaultOpset.version } : {}),
        ...(producer ? { producer } : {}),
        dtypeBreakdown,
        strip: buildStrip(nodes.map((node) => ({ family: node.family, weight: 1 }))),
      },
      payload: {
        kind: 'onnx-graph',
        inputs: graphInputs,
        outputs: raw.outputs,
        nodes,
        edges,
        metadata: raw.metadata,
      },
    },
    tensorIndex,
  };
}
