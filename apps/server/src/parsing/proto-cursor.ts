import type { ByteSource } from './byte-source.js';
import { ParseError } from './errors.js';

export const WIRE_VARINT = 0;
export const WIRE_FIXED64 = 1;
export const WIRE_LENGTH_DELIMITED = 2;
export const WIRE_FIXED32 = 5;

const WINDOW_BYTES = 256 * 1024;
const MAX_VARINT_BYTES = 10;

export interface FieldHeader {
  fieldNumber: number;
  wireType: number;
  /** Offset of the field's value (after the tag). */
  valueOffset: number;
}

/**
 * Streaming reader for the protobuf wire format over a byte range of a ByteSource.
 * It buffers a small window, so scanning a multi-GiB ONNX file costs O(window) memory:
 * large payloads (tensor raw_data) are skipped by offset, never read.
 */
export class ProtoCursor {
  private window: Buffer = Buffer.alloc(0);
  private windowStart = 0;
  position: number;

  constructor(
    private readonly source: ByteSource,
    start: number,
    readonly end: number,
  ) {
    if (end > source.size)
      throw new ParseError('truncated', 'Message extends past the end of the file');
    this.position = start;
  }

  get isDone(): boolean {
    return this.position >= this.end;
  }

  private async byteAt(offset: number): Promise<number> {
    if (offset >= this.end) throw new ParseError('truncated', 'Unexpected end of message');
    const index = offset - this.windowStart;
    if (index < 0 || index >= this.window.length) {
      const length = Math.min(WINDOW_BYTES, this.end - offset);
      this.window = await this.source.read(offset, length);
      this.windowStart = offset;
      return this.window[0] ?? 0;
    }
    return this.window[index] ?? 0;
  }

  async readVarintBig(): Promise<bigint> {
    let result = 0n;
    let shift = 0n;
    for (let index = 0; index < MAX_VARINT_BYTES; index += 1) {
      const byte = await this.byteAt(this.position);
      this.position += 1;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
    }
    throw new ParseError('bad_protobuf', 'Malformed varint');
  }

  /** Reads a varint that must fit in a safe JS integer (lengths, enums, dims). */
  async readVarint(): Promise<number> {
    const value = await this.readVarintBig();
    // int64 fields encode negatives as 10-byte two's complement.
    const signed = value > 0x7fffffffffffffffn ? value - 0x10000000000000000n : value;
    if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new ParseError('bad_protobuf', 'Integer out of range');
    }
    return Number(signed);
  }

  /**
   * Reads an int64 value exactly: a number when it is a safe JS integer, otherwise its decimal
   * string. Exporters use INT64_MAX/MIN as "to the end" sentinels (Slice `ends`), so these
   * values are common and must not fail the parse.
   */
  async readInt64(): Promise<number | string> {
    const value = await this.readVarintBig();
    const signed = BigInt.asIntN(64, value);
    if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
      return signed.toString();
    }
    return Number(signed);
  }

  async readFieldHeader(): Promise<FieldHeader> {
    const tag = await this.readVarint();
    const fieldNumber = Math.floor(tag / 8);
    const wireType = tag & 7;
    if (fieldNumber === 0) throw new ParseError('bad_protobuf', 'Invalid field number 0');
    return { fieldNumber, wireType, valueOffset: this.position };
  }

  /** Reads a length prefix and returns the [start, end) range of the delimited value. */
  async readLengthDelimitedRange(): Promise<{ start: number; end: number }> {
    const length = await this.readVarint();
    const start = this.position;
    const end = start + length;
    if (length < 0 || end > this.end)
      throw new ParseError('truncated', 'Field extends past its message');
    this.position = end;
    return { start, end };
  }

  async readBytes(length: number): Promise<Buffer> {
    if (this.position + length > this.end)
      throw new ParseError('truncated', 'Unexpected end of message');
    const buffer = await this.source.read(this.position, length);
    this.position += length;
    return buffer;
  }

  async readString(maxBytes: number): Promise<string> {
    const { start, end } = await this.readLengthDelimitedRange();
    const length = Math.min(end - start, maxBytes);
    const bytes = await this.source.read(start, length);
    return bytes.toString('utf8');
  }

  async skip(wireType: number): Promise<void> {
    switch (wireType) {
      case WIRE_VARINT:
        await this.readVarintBig();
        return;
      case WIRE_FIXED64:
        this.advance(8);
        return;
      case WIRE_LENGTH_DELIMITED:
        await this.readLengthDelimitedRange();
        return;
      case WIRE_FIXED32:
        this.advance(4);
        return;
      default:
        throw new ParseError('bad_protobuf', `Unsupported wire type ${wireType}`);
    }
  }

  private advance(bytes: number): void {
    if (this.position + bytes > this.end)
      throw new ParseError('truncated', 'Unexpected end of message');
    this.position += bytes;
  }

  /** A cursor over a nested message range, sharing the source but not the window. */
  child(start: number, end: number): ProtoCursor {
    return new ProtoCursor(this.source, start, end);
  }
}
