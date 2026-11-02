import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyReply } from 'fastify';
import { AppError } from '../../errors.js';

const RANGE = /^bytes=(\d*)-(\d*)$/;

export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Parses a single `Range: bytes=a-b` header; multi-range requests are answered in full. */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const match = RANGE.exec(header.trim());
  if (!match) return null;
  const [, startText = '', endText = ''] = match;
  if (startText === '' && endText === '') return 'invalid';
  let start: number;
  let end: number;
  if (startText === '') {
    start = Math.max(size - Number(endText), 0);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

/** Streams a stored file as an attachment, honoring a single byte range for resumable downloads. */
export async function sendStoredFile(
  reply: FastifyReply,
  filePath: string,
  filename: string,
  rangeHeader: string | undefined,
): Promise<FastifyReply> {
  const { size } = await stat(filePath);
  const range = parseRange(rangeHeader, size);
  reply
    .header('content-type', 'application/octet-stream')
    .header('content-disposition', contentDisposition(filename))
    .header('x-content-type-options', 'nosniff')
    .header('cache-control', 'private, no-store')
    .header('accept-ranges', 'bytes');
  if (range === 'invalid') {
    reply.header('content-range', `bytes */${size}`);
    throw new AppError(416, 'range_not_satisfiable', 'Requested range is not satisfiable');
  }
  if (!range) return reply.header('content-length', size).send(createReadStream(filePath));
  return reply
    .status(206)
    .header('content-range', `bytes ${range.start}-${range.end}/${size}`)
    .header('content-length', range.end - range.start + 1)
    .send(createReadStream(filePath, { start: range.start, end: range.end }));
}
