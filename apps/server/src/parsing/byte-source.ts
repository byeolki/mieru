import type { FileHandle } from 'node:fs/promises';
import { ParseError } from './errors.js';

/** Random-access bytes; parsers read through this so they never load a whole file. */
export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Buffer>;
}

export class BufferByteSource implements ByteSource {
  constructor(private readonly buffer: Buffer) {}

  get size(): number {
    return this.buffer.length;
  }

  read(offset: number, length: number): Promise<Buffer> {
    if (offset < 0 || offset + length > this.buffer.length) {
      return Promise.reject(new ParseError('truncated', 'Read past the end of the file'));
    }
    return Promise.resolve(this.buffer.subarray(offset, offset + length));
  }
}

export class FileByteSource implements ByteSource {
  constructor(
    private readonly handle: FileHandle,
    readonly size: number,
  ) {}

  async read(offset: number, length: number): Promise<Buffer> {
    if (offset < 0 || offset + length > this.size) {
      throw new ParseError('truncated', 'Read past the end of the file');
    }
    const buffer = Buffer.allocUnsafe(length);
    let filled = 0;
    while (filled < length) {
      const { bytesRead } = await this.handle.read(
        buffer,
        filled,
        length - filled,
        offset + filled,
      );
      if (bytesRead === 0) throw new ParseError('truncated', 'File ended early');
      filled += bytesRead;
    }
    return buffer;
  }
}
