const TOKENS = [
  'Conv',
  'Relu',
  'Add',
  'MatMul',
  'Softmax',
  'LayerNorm',
  'Gemm',
  'Concat',
  'Reshape',
  'Gelu',
  'みえる',
  '見える',
  '[1,64,56,56]',
  'bf16',
  '·',
  '·',
  '·',
];
const ROWS = 34;
const ROW_LENGTH = 220;

/** Deterministic pseudo-random sequence so the field renders the same on every load. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function buildField(): string {
  const random = seeded(7);
  const rows: string[] = [];
  for (let row = 0; row < ROWS; row++) {
    let line = '';
    while (line.length < ROW_LENGTH) {
      const token = TOKENS[Math.floor(random() * TOKENS.length)] ?? '·';
      line += token + ' '.repeat(2 + Math.floor(random() * 6));
    }
    rows.push(line);
  }
  return rows.join('\n');
}

const FIELD = buildField();
const FIELD_CLASSES =
  'absolute inset-0 overflow-hidden font-mono text-[13px] leading-[26px] whitespace-pre select-none';

/**
 * Op names and みえる scattered behind the hero. A light band sweeps across and tints the
 * glyphs it passes; the band is skipped entirely when the visitor prefers reduced motion.
 */
export function GlyphField() {
  return (
    <div aria-hidden="true" className="glyph-field-mask pointer-events-none absolute inset-0">
      <pre className={`${FIELD_CLASSES} text-[#1d2030]`}>{FIELD}</pre>
      <div className="glyph-window absolute inset-y-0 left-0 hidden overflow-hidden will-change-transform motion-safe:block">
        <pre className={`${FIELD_CLASSES} glyph-window-content text-primary will-change-transform`}>
          {FIELD}
        </pre>
      </div>
    </div>
  );
}
