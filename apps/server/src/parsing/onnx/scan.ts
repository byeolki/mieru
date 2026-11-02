import protobuf from 'protobufjs';
import type { AttrValue, Dim } from '@mieru/shared';
import type { ByteSource } from '../byte-source.js';
import { onnxDtype } from '../dtypes.js';
import { ParseError } from '../errors.js';
import { LIMITS } from '../limits.js';
import { ProtoCursor, WIRE_FIXED32, WIRE_LENGTH_DELIMITED, WIRE_VARINT } from '../proto-cursor.js';
import descriptor from './proto/onnx-proto.json' with { type: 'json' };

const root = protobuf.Root.fromJSON(descriptor);
const ValueInfoProto = root.lookupType('onnx.ValueInfoProto');

const DATA_LOCATION_EXTERNAL = 1;
const DATA_FIELDS = new Set([4, 5, 6, 7, 9, 10, 11]);

const ATTRIBUTE_TYPE = {
  FLOAT: 1,
  INT: 2,
  STRING: 3,
  TENSOR: 4,
  GRAPH: 5,
  FLOATS: 6,
  INTS: 7,
  STRINGS: 8,
  TENSORS: 9,
  GRAPHS: 10,
} as const;

export interface RawTensor {
  name: string;
  dataType: number;
  dims: number[];
  /** Where the tensor payload sits in the file (raw_data or a typed data field). */
  dataOffset: number | null;
  dataLength: number;
  isExternal: boolean;
}

export interface RawValueInfo {
  name: string;
  dtype: string | null;
  shape: Dim[] | null;
}

export interface RawNode {
  name: string;
  opType: string;
  domain: string;
  inputs: string[];
  outputs: string[];
  attributes: Record<string, AttrValue>;
  /** The `value` tensor of a Constant node, folded into its consumers later. */
  constantTensor: RawTensor | null;
}

export interface RawModel {
  irVersion: number | null;
  producerName: string;
  producerVersion: string;
  docString: string;
  opsets: { domain: string; version: number }[];
  metadata: Record<string, string>;
  nodes: RawNode[];
  initializers: RawTensor[];
  inputs: RawValueInfo[];
  outputs: RawValueInfo[];
  valueInfo: RawValueInfo[];
}

interface ScanState {
  nodeCount: number;
  tensorCount: number;
}

async function readName(cursor: ProtoCursor): Promise<string> {
  const { start, end } = await cursor.readLengthDelimitedRange();
  if (end - start > LIMITS.maxNameBytes) throw new ParseError('limits_exceeded', 'Name too long');
  const nested = cursor.child(start, end);
  return (await nested.readBytes(end - start)).toString('utf8');
}

async function readFloat32(cursor: ProtoCursor): Promise<number> {
  return (await cursor.readBytes(4)).readFloatLE(0);
}

/** Reads a repeated int64 field that may be packed or unpacked, capped at `limit` items. */
async function readRepeatedInt(
  cursor: ProtoCursor,
  wireType: number,
  into: number[],
  limit: number,
): Promise<boolean> {
  if (wireType === WIRE_VARINT) {
    const value = await cursor.readVarint();
    if (into.length < limit) into.push(value);
    return into.length >= limit;
  }
  if (wireType !== WIRE_LENGTH_DELIMITED)
    throw new ParseError('bad_protobuf', 'Bad repeated int encoding');
  const { start, end } = await cursor.readLengthDelimitedRange();
  const packed = cursor.child(start, end);
  let truncated = false;
  while (!packed.isDone) {
    const value = await packed.readVarint();
    if (into.length < limit) into.push(value);
    else truncated = true;
  }
  return truncated;
}

async function readRepeatedFloat(
  cursor: ProtoCursor,
  wireType: number,
  into: number[],
  limit: number,
): Promise<boolean> {
  if (wireType === WIRE_FIXED32) {
    const value = await readFloat32(cursor);
    if (into.length < limit) into.push(value);
    return into.length >= limit;
  }
  if (wireType !== WIRE_LENGTH_DELIMITED)
    throw new ParseError('bad_protobuf', 'Bad repeated float encoding');
  const { start, end } = await cursor.readLengthDelimitedRange();
  const count = Math.floor((end - start) / 4);
  const take = Math.min(count, limit - into.length);
  if (take > 0) {
    const bytes = await cursor.child(start, end).readBytes(take * 4);
    for (let index = 0; index < take; index += 1) into.push(bytes.readFloatLE(index * 4));
  }
  return count > take;
}

/** Scans a TensorProto header; payload bytes are located, never read. */
export async function scanTensor(cursor: ProtoCursor, state: ScanState): Promise<RawTensor> {
  state.tensorCount += 1;
  if (state.tensorCount > LIMITS.maxTensors)
    throw new ParseError('limits_exceeded', 'Too many tensors');
  const tensor: RawTensor = {
    name: '',
    dataType: 0,
    dims: [],
    dataOffset: null,
    dataLength: 0,
    isExternal: false,
  };
  while (!cursor.isDone) {
    const field = await cursor.readFieldHeader();
    if (field.fieldNumber === 1) {
      await readRepeatedInt(cursor, field.wireType, tensor.dims, LIMITS.maxDims + 1);
      if (tensor.dims.length > LIMITS.maxDims)
        throw new ParseError('limits_exceeded', 'Too many dimensions');
    } else if (field.fieldNumber === 2 && field.wireType === WIRE_VARINT) {
      tensor.dataType = await cursor.readVarint();
    } else if (field.fieldNumber === 8 && field.wireType === WIRE_LENGTH_DELIMITED) {
      tensor.name = await readName(cursor);
    } else if (field.fieldNumber === 13) {
      tensor.isExternal = true;
      await cursor.skip(field.wireType);
    } else if (field.fieldNumber === 14 && field.wireType === WIRE_VARINT) {
      if ((await cursor.readVarint()) === DATA_LOCATION_EXTERNAL) tensor.isExternal = true;
    } else if (DATA_FIELDS.has(field.fieldNumber) && field.wireType === WIRE_LENGTH_DELIMITED) {
      const { start, end } = await cursor.readLengthDelimitedRange();
      if (tensor.dataOffset === null || field.fieldNumber === 9) {
        tensor.dataOffset = start;
        tensor.dataLength = end - start;
      }
    } else {
      await cursor.skip(field.wireType);
    }
  }
  return tensor;
}

/** Counts nodes in a nested GraphProto (If/Loop/Scan bodies) without decoding them. */
async function countGraphNodes(cursor: ProtoCursor): Promise<number> {
  let count = 0;
  while (!cursor.isDone) {
    const field = await cursor.readFieldHeader();
    if (field.fieldNumber === 1) count += 1;
    await cursor.skip(field.wireType);
  }
  return count;
}

function tensorShapeOf(tensor: RawTensor): { dtype: string; shape: number[] } {
  return {
    dtype: onnxDtype(tensor.dataType)?.name ?? `type${tensor.dataType}`,
    shape: tensor.dims,
  };
}

async function scanAttribute(
  cursor: ProtoCursor,
  state: ScanState,
): Promise<{ name: string; value: AttrValue | null; tensor: RawTensor | null }> {
  let name = '';
  let type = 0;
  let floatValue = 0;
  let intValue = 0;
  let stringValue = '';
  let tensor: RawTensor | null = null;
  let graphNodes = 0;
  const floats: number[] = [];
  const ints: number[] = [];
  const strings: string[] = [];
  let truncated = false;

  while (!cursor.isDone) {
    const field = await cursor.readFieldHeader();
    switch (field.fieldNumber) {
      case 1:
        name = await readName(cursor);
        break;
      case 20:
        type = await cursor.readVarint();
        break;
      case 2:
        floatValue = await readFloat32(cursor);
        break;
      case 3:
        intValue = await cursor.readVarint();
        break;
      case 4:
        stringValue = await cursor.readString(LIMITS.maxMetadataValueBytes);
        break;
      case 5: {
        const { start, end } = await cursor.readLengthDelimitedRange();
        tensor = await scanTensor(cursor.child(start, end), state);
        break;
      }
      case 6:
      case 11: {
        const { start, end } = await cursor.readLengthDelimitedRange();
        graphNodes += await countGraphNodes(cursor.child(start, end));
        break;
      }
      case 7:
        truncated =
          (await readRepeatedFloat(cursor, field.wireType, floats, LIMITS.maxAttributeListItems)) ||
          truncated;
        break;
      case 8:
        truncated =
          (await readRepeatedInt(cursor, field.wireType, ints, LIMITS.maxAttributeListItems)) ||
          truncated;
        break;
      case 9:
        if (strings.length < LIMITS.maxAttributeListItems) {
          strings.push(await cursor.readString(LIMITS.maxMetadataValueBytes));
        } else {
          truncated = true;
          await cursor.skip(field.wireType);
        }
        break;
      default:
        await cursor.skip(field.wireType);
    }
  }

  const value: AttrValue | null = (() => {
    switch (type) {
      case ATTRIBUTE_TYPE.FLOAT:
        return { kind: 'float', value: floatValue };
      case ATTRIBUTE_TYPE.INT:
        return { kind: 'int', value: intValue };
      case ATTRIBUTE_TYPE.STRING:
        return { kind: 'string', value: stringValue };
      case ATTRIBUTE_TYPE.TENSOR:
        return tensor ? { kind: 'tensor', ...tensorShapeOf(tensor) } : null;
      case ATTRIBUTE_TYPE.GRAPH:
      case ATTRIBUTE_TYPE.GRAPHS:
        return { kind: 'graph', nodeCount: graphNodes };
      case ATTRIBUTE_TYPE.FLOATS:
        return { kind: 'floats', value: floats, truncated };
      case ATTRIBUTE_TYPE.INTS:
        return { kind: 'ints', value: ints, truncated };
      case ATTRIBUTE_TYPE.STRINGS:
        return { kind: 'strings', value: strings, truncated };
      default:
        return null;
    }
  })();
  return { name, value, tensor };
}

async function scanNode(cursor: ProtoCursor, state: ScanState): Promise<RawNode> {
  state.nodeCount += 1;
  if (state.nodeCount > LIMITS.maxNodes) throw new ParseError('limits_exceeded', 'Too many nodes');
  const node: RawNode = {
    name: '',
    opType: '',
    domain: '',
    inputs: [],
    outputs: [],
    attributes: {},
    constantTensor: null,
  };
  let valueTensor: RawTensor | null = null;
  while (!cursor.isDone) {
    const field = await cursor.readFieldHeader();
    switch (field.fieldNumber) {
      case 1:
        node.inputs.push(await readName(cursor));
        break;
      case 2:
        node.outputs.push(await readName(cursor));
        break;
      case 3:
        node.name = await readName(cursor);
        break;
      case 4:
        node.opType = await readName(cursor);
        break;
      case 7:
        node.domain = await readName(cursor);
        break;
      case 5: {
        const { start, end } = await cursor.readLengthDelimitedRange();
        const attribute = await scanAttribute(cursor.child(start, end), state);
        if (attribute.value && attribute.name) node.attributes[attribute.name] = attribute.value;
        if (attribute.name === 'value' && attribute.tensor) valueTensor = attribute.tensor;
        break;
      }
      default:
        await cursor.skip(field.wireType);
    }
  }
  if (node.opType === 'Constant' && valueTensor) node.constantTensor = valueTensor;
  return node;
}

interface DecodedDim {
  dimValue?: number;
  dimParam?: string;
}

interface DecodedValueInfo {
  name?: string;
  type?: { tensorType?: { elemType?: number; shape?: { dim?: DecodedDim[] } } };
}

async function scanValueInfo(cursor: ProtoCursor): Promise<RawValueInfo> {
  const length = cursor.end - cursor.position;
  if (length > LIMITS.maxDecodedMessageBytes)
    throw new ParseError('limits_exceeded', 'Value info too large');
  const bytes = await cursor.readBytes(length);
  let decoded: DecodedValueInfo;
  try {
    const object: DecodedValueInfo = ValueInfoProto.toObject(ValueInfoProto.decode(bytes), {
      longs: Number,
      enums: Number,
      defaults: false,
      arrays: true,
    });
    decoded = object;
  } catch {
    throw new ParseError('bad_protobuf', 'Malformed value info');
  }
  const tensorType = decoded.type?.tensorType;
  const dims = tensorType?.shape?.dim;
  if (dims && dims.length > LIMITS.maxDims)
    throw new ParseError('limits_exceeded', 'Too many dimensions');
  return {
    name: decoded.name ?? '',
    dtype: tensorType?.elemType ? (onnxDtype(tensorType.elemType)?.name ?? null) : null,
    shape: dims ? dims.map((dim) => dim.dimValue ?? dim.dimParam ?? null) : null,
  };
}

async function scanStringEntry(cursor: ProtoCursor): Promise<[string, string]> {
  let key = '';
  let value = '';
  while (!cursor.isDone) {
    const field = await cursor.readFieldHeader();
    if (field.fieldNumber === 1) key = await cursor.readString(LIMITS.maxNameBytes);
    else if (field.fieldNumber === 2) value = await cursor.readString(LIMITS.maxMetadataValueBytes);
    else await cursor.skip(field.wireType);
  }
  return [key, value];
}

async function scanOpset(cursor: ProtoCursor): Promise<{ domain: string; version: number }> {
  let domain = '';
  let version = 0;
  while (!cursor.isDone) {
    const field = await cursor.readFieldHeader();
    if (field.fieldNumber === 1) domain = await cursor.readString(LIMITS.maxNameBytes);
    else if (field.fieldNumber === 2) version = await cursor.readVarint();
    else await cursor.skip(field.wireType);
  }
  return { domain, version };
}

async function scanGraph(cursor: ProtoCursor, model: RawModel, state: ScanState): Promise<void> {
  while (!cursor.isDone) {
    const field = await cursor.readFieldHeader();
    if (field.wireType !== WIRE_LENGTH_DELIMITED) {
      await cursor.skip(field.wireType);
      continue;
    }
    const { start, end } = await cursor.readLengthDelimitedRange();
    const nested = cursor.child(start, end);
    switch (field.fieldNumber) {
      case 1:
        model.nodes.push(await scanNode(nested, state));
        break;
      case 5:
        model.initializers.push(await scanTensor(nested, state));
        break;
      case 11:
        model.inputs.push(await scanValueInfo(nested));
        break;
      case 12:
        model.outputs.push(await scanValueInfo(nested));
        break;
      case 13:
        model.valueInfo.push(await scanValueInfo(nested));
        break;
      default:
        break;
    }
  }
}

/**
 * Scans an ONNX ModelProto straight off the byte source. Container messages are walked
 * field by field; tensor payloads are only located. Memory stays flat regardless of file size.
 */
export async function scanOnnxModel(source: ByteSource): Promise<RawModel> {
  const cursor = new ProtoCursor(source, 0, source.size);
  const state: ScanState = { nodeCount: 0, tensorCount: 0 };
  const model: RawModel = {
    irVersion: null,
    producerName: '',
    producerVersion: '',
    docString: '',
    opsets: [],
    metadata: {},
    nodes: [],
    initializers: [],
    inputs: [],
    outputs: [],
    valueInfo: [],
  };
  let hasGraph = false;
  while (!cursor.isDone) {
    const field = await cursor.readFieldHeader();
    switch (field.fieldNumber) {
      case 1:
        if (field.wireType !== WIRE_VARINT) throw new ParseError('bad_protobuf', 'Bad ir_version');
        model.irVersion = await cursor.readVarint();
        break;
      case 2:
        model.producerName = await cursor.readString(LIMITS.maxNameBytes);
        break;
      case 3:
        model.producerVersion = await cursor.readString(LIMITS.maxNameBytes);
        break;
      case 6:
        model.docString = await cursor.readString(LIMITS.maxDocStringBytes);
        break;
      case 7: {
        if (field.wireType !== WIRE_LENGTH_DELIMITED)
          throw new ParseError('bad_protobuf', 'Bad graph field');
        const { start, end } = await cursor.readLengthDelimitedRange();
        await scanGraph(cursor.child(start, end), model, state);
        hasGraph = true;
        break;
      }
      case 8: {
        const { start, end } = await cursor.readLengthDelimitedRange();
        model.opsets.push(await scanOpset(cursor.child(start, end)));
        break;
      }
      case 14: {
        const { start, end } = await cursor.readLengthDelimitedRange();
        if (Object.keys(model.metadata).length < LIMITS.maxMetadataEntries) {
          const [key, value] = await scanStringEntry(cursor.child(start, end));
          if (key) model.metadata[key] = value;
        }
        break;
      }
      default:
        await cursor.skip(field.wireType);
    }
  }
  if (model.irVersion === null || !hasGraph) {
    throw new ParseError('bad_protobuf', 'Not an ONNX model (missing ir_version or graph)');
  }
  return model;
}
