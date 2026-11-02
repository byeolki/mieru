export const PARSE_FAILURE_CODES = [
  'bad_header',
  'truncated',
  'bad_protobuf',
  'bad_json',
  'offsets_invalid',
  'unsupported_dtype',
  'limits_exceeded',
  'external_data_unsupported',
  'timeout',
  'internal',
] as const;

export type ParseFailureCode = (typeof PARSE_FAILURE_CODES)[number];

/** A model file that can't be parsed; `code` is stable and shown to users as a reason. */
export class ParseError extends Error {
  constructor(
    readonly code: ParseFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export function isParseFailureCode(value: unknown): value is ParseFailureCode {
  return typeof value === 'string' && (PARSE_FAILURE_CODES as readonly string[]).includes(value);
}
