import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ModuleNode, ParsedModel } from '@mieru/shared';
import { OP_COLORS } from '../../design/op-palette.js';
import { formatBytes, formatParams } from '../../lib/format.js';
import { buildGroupTree, initialExpanded } from './graph/visible-graph.js';

const TOP_GROUPS = 20;
const TOP_OPS = 15;

interface Bucket {
  label: string;
  value: number;
  /** Recharts reads a per-bar `fill` straight from each data entry. */
  fill: string;
}

function onnxParamBuckets(parsed: ParsedModel): Bucket[] {
  if (parsed.payload.kind !== 'onnx-graph') return [];
  const tree = buildGroupTree(parsed.payload.nodes);
  const expanded = initialExpanded(tree, 40);
  const buckets: Bucket[] = [];
  for (const group of tree.groups.values()) {
    const parentExpanded = group.parent !== null && expanded.has(group.parent);
    if (group.path && parentExpanded && !expanded.has(group.path) && group.paramCount > 0) {
      buckets.push({ label: group.path, value: group.paramCount, fill: '#C8B6D4' });
    }
  }
  for (const node of parsed.payload.nodes) {
    const path = tree.nodeGroup.get(node.id) ?? '';
    if (expanded.has(path) && node.paramCount > 0)
      buckets.push({ label: node.name, value: node.paramCount, fill: '#C8B6D4' });
  }
  return buckets.sort((a, b) => b.value - a.value).slice(0, TOP_GROUPS);
}

function moduleParamBuckets(root: ModuleNode): Bucket[] {
  let level = root.children;
  // Descend through single-child wrappers like `model` so the chart shows real blocks.
  while (level.length === 1 && level[0] && level[0].children.length > 0) level = level[0].children;
  return level
    .map((module) => ({ label: module.path, value: module.paramCount, fill: '#C8B6D4' }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_GROUPS);
}

function opBuckets(parsed: ParsedModel): Bucket[] {
  if (parsed.payload.kind !== 'onnx-graph') return [];
  const counts = new Map<string, Bucket>();
  for (const node of parsed.payload.nodes) {
    const existing = counts.get(node.opType);
    if (existing) existing.value += 1;
    else counts.set(node.opType, { label: node.opType, value: 1, fill: OP_COLORS[node.family] });
  }
  return [...counts.values()].sort((a, b) => b.value - a.value).slice(0, TOP_OPS);
}

function dtypeBuckets(parsed: ParsedModel): Bucket[] {
  return Object.entries(parsed.summary.dtypeBreakdown)
    .map(([dtype, entry]) => ({ label: dtype, value: entry.bytes, fill: '#C8B6D4' }))
    .sort((a, b) => b.value - a.value);
}

function HorizontalBars({
  title,
  caption,
  data,
  format,
}: {
  title: string;
  caption: string;
  data: Bucket[];
  format: (value: number) => string;
}) {
  const height = Math.max(data.length * 30 + 24, 120);
  return (
    <section className="rounded-(--radius-panel) border border-fog bg-surface p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-slate">{caption}</p>
      {data.length === 0 ? (
        <p className="mt-6 text-sm text-slate">보여줄 데이터가 없어요.</p>
      ) : (
        <div className="mt-4" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 56, bottom: 0, left: 0 }}
              barCategoryGap={6}
            >
              <CartesianGrid horizontal={false} stroke="var(--color-fog)" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={220}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: 'var(--color-slate)' }}
                tickFormatter={(label: string) =>
                  label.length > 30 ? `…${label.slice(-29)}` : label
                }
              />
              <Tooltip
                cursor={{ fill: 'var(--color-mask)' }}
                formatter={(value) => [format(Number(value)), '']}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid var(--color-fog)',
                  background: 'var(--color-surface)',
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="value"
                radius={[0, 6, 6, 0]}
                label={{
                  position: 'right',
                  fontSize: 11,
                  fill: 'var(--color-slate)',
                  formatter: (value: unknown) => format(Number(value)),
                }}
              ></Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function StatsTab({ parsed }: { parsed: ParsedModel }) {
  const paramData =
    parsed.payload.kind === 'onnx-graph'
      ? onnxParamBuckets(parsed)
      : moduleParamBuckets(parsed.payload.root);
  return (
    <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-8 md:px-6 lg:grid-cols-2">
      <HorizontalBars
        title="블록별 파라미터"
        caption={`파라미터가 많은 순서로 최대 ${TOP_GROUPS}개`}
        data={paramData}
        format={formatParams}
      />
      {parsed.payload.kind === 'onnx-graph' ? (
        <HorizontalBars
          title="연산 종류"
          caption="많이 쓰인 연산 순서. 색은 연산 계열이에요."
          data={opBuckets(parsed)}
          format={(value) => `${value}개`}
        />
      ) : (
        <HorizontalBars
          title="데이터 타입별 용량"
          caption="텐서 바이트를 dtype별로 합쳤어요."
          data={dtypeBuckets(parsed)}
          format={formatBytes}
        />
      )}
    </div>
  );
}
