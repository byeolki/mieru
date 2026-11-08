// ONNX field numbers (onnx.proto): ModelProto.graph = 7, GraphProto.output = 12,
// ValueInfoProto.name = 1. All three are length-delimited (wire type 2).
const MODEL_GRAPH_FIELD = 7;
const GRAPH_OUTPUT_FIELD = 12;
const VALUE_INFO_NAME_FIELD = 1;
const LENGTH_DELIMITED = 2;

const utf8 = new TextEncoder();

function varint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  bytes.push(rest);
  return bytes;
}

function lengthDelimited(field: number, payload: readonly number[]): number[] {
  return [...varint((field << 3) | LENGTH_DELIMITED), ...varint(payload.length), ...payload];
}

/** Encodes `ModelProto { graph { output { name } ... } }` holding only the given output names. */
export function encodeExtraOutputs(names: readonly string[]): Uint8Array {
  const outputs = names.flatMap((name) =>
    lengthDelimited(
      GRAPH_OUTPUT_FIELD,
      lengthDelimited(VALUE_INFO_NAME_FIELD, [...utf8.encode(name)]),
    ),
  );
  return Uint8Array.from(lengthDelimited(MODEL_GRAPH_FIELD, outputs));
}

/**
 * Exposes intermediate tensors as extra graph outputs without re-encoding the model.
 *
 * Protobuf merges a message field that appears twice and concatenates repeated fields, so a
 * second `graph` holding only `output` entries, appended after the original bytes, adds those
 * outputs to the existing graph. The runtime infers their types, so names are enough.
 */
export function appendGraphOutputs(model: Uint8Array, names: readonly string[]): Uint8Array {
  if (names.length === 0) return model;
  const suffix = encodeExtraOutputs(names);
  const patched = new Uint8Array(model.length + suffix.length);
  patched.set(model);
  patched.set(suffix, model.length);
  return patched;
}
