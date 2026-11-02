import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ModuleNode } from '@mieru/shared';
import { formatBytes, formatParams, formatShape } from '../../lib/format.js';

type Row =
  | { kind: 'module'; key: string; depth: number; module: ModuleNode }
  | { kind: 'tensor'; key: string; depth: number; tensor: ModuleNode['tensors'][number] };

const ROW_HEIGHT = 40;
const INDENT_PX = 18;
const INITIAL_OPEN_DEPTH = 2;

function flatten(root: ModuleNode, open: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const visit = (module: ModuleNode, depth: number) => {
    for (const child of module.children) {
      rows.push({ kind: 'module', key: `m:${child.path}`, depth, module: child });
      if (open.has(child.path)) visit(child, depth + 1);
    }
    for (const tensor of module.tensors) {
      rows.push({ kind: 'tensor', key: `t:${module.path}.${tensor.name}`, depth, tensor });
    }
  };
  visit(root, 0);
  return rows;
}

function initiallyOpen(root: ModuleNode): Set<string> {
  const open = new Set<string>();
  const visit = (module: ModuleNode, depth: number) => {
    if (depth >= INITIAL_OPEN_DEPTH) return;
    for (const child of module.children) {
      open.add(child.path);
      visit(child, depth + 1);
    }
  };
  visit(root, 0);
  return open;
}

/** Module hierarchy of a safetensors file, virtualized so models with 100k+ tensors stay fast. */
export function SafetensorsTreeView({ root }: { root: ModuleNode }) {
  const [open, setOpen] = useState(() => initiallyOpen(root));
  const rows = useMemo(() => flatten(root, open), [root, open]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const total = root.paramCount || 1;

  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="grid grid-cols-[minmax(0,1fr)_160px_80px_96px_120px] gap-4 border-b border-fog bg-paper px-6 py-2.5 text-xs font-medium text-slate"
        role="row"
      >
        <span>이름</span>
        <span>형태</span>
        <span>타입</span>
        <span className="text-right">파라미터</span>
        <span className="text-right">비중</span>
      </div>
      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-auto bg-surface"
        role="tree"
        aria-label="모듈 트리"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            const isModule = row.kind === 'module';
            const params = isModule ? row.module.paramCount : row.tensor.params;
            const share = params / total;
            return (
              <div
                key={row.key}
                role="treeitem"
                aria-selected={false}
                aria-level={row.depth + 1}
                aria-expanded={isModule ? open.has(row.module.path) : undefined}
                className="absolute inset-x-0 grid grid-cols-[minmax(0,1fr)_160px_80px_96px_120px] items-center gap-4 border-b border-fog/60 px-6 text-sm hover:bg-haze/40"
                style={{ height: ROW_HEIGHT, transform: `translateY(${virtualRow.start}px)` }}
              >
                <div
                  className="flex min-w-0 items-center gap-1.5"
                  style={{ paddingLeft: row.depth * INDENT_PX }}
                >
                  {isModule ? (
                    <button
                      type="button"
                      onClick={() => toggle(row.module.path)}
                      className="flex min-w-0 items-center gap-1.5 rounded-md py-1 text-left font-medium hover:text-primary"
                      aria-label={`${row.module.name} ${open.has(row.module.path) ? '접기' : '펼치기'}`}
                    >
                      <ChevronRight
                        className={clsx(
                          'size-4 shrink-0 text-slate transition-transform duration-150',
                          open.has(row.module.path) && 'rotate-90',
                        )}
                      />
                      <span className="truncate">{row.module.name}</span>
                    </button>
                  ) : (
                    <span
                      className="truncate pl-[22px] font-mono text-[13px]"
                      title={row.tensor.name}
                    >
                      {row.tensor.name}
                    </span>
                  )}
                </div>
                <span className="truncate font-mono text-xs text-slate">
                  {isModule ? formatBytes(row.module.byteSize) : formatShape(row.tensor.shape)}
                </span>
                <span className="font-mono text-xs text-slate">
                  {isModule ? '' : row.tensor.dtype}
                </span>
                <span className="tabular text-right text-xs">{formatParams(params)}</span>
                <span className="flex items-center justify-end gap-2">
                  <span
                    className="h-1.5 w-14 overflow-hidden rounded-full bg-fog"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-lilac"
                      style={{ width: `${Math.max(share * 100, 1)}%` }}
                    />
                  </span>
                  <span className="tabular w-11 text-right text-xs text-slate">
                    {(share * 100).toFixed(share < 0.01 ? 2 : 1)}%
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
