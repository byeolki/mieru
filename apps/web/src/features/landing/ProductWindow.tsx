import * as Tabs from '@radix-ui/react-tabs';
import { useState, type ReactNode } from 'react';
import { ArchitectureStrip } from '../../components/ArchitectureStrip.js';
import { Avatar } from '../../components/Avatar.js';
import { Sparkle } from '../../design/Sparkle.js';
import { OP_COLORS, type OpFamily } from '../../design/op-palette.js';
import { GraphPreview, PREVIEW_NODES, PreviewInspector } from './GraphPreview.js';
import { RESNET_STRIP } from './sample-strips.js';

const INITIAL_NODE = 'main';

function GraphPanel() {
  const [selectedId, setSelectedId] = useState(INITIAL_NODE);
  const selected = PREVIEW_NODES.find((node) => node.id === selectedId) ?? PREVIEW_NODES[0];
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_13rem] max-sm:grid-cols-1">
      <div className="h-[26rem] bg-[radial-gradient(var(--color-dots)_1px,transparent_1px)] bg-size-[16px_16px] px-5 py-4">
        <GraphPreview selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div
        className="border-fog p-5 max-sm:border-t sm:border-l motion-safe:hero-inspector-in"
        aria-live="polite"
      >
        {selected && <PreviewInspector node={selected} />}
      </div>
    </div>
  );
}

const TREE_ROWS: { depth: number; name: string; detail?: string }[] = [
  { depth: 0, name: 'model' },
  { depth: 1, name: 'embed_tokens.weight', detail: 'BF16 [32000, 4096]' },
  { depth: 1, name: 'layers · 32' },
  { depth: 2, name: '0' },
  { depth: 3, name: 'self_attn' },
  { depth: 4, name: 'q_proj.weight', detail: 'BF16 [4096, 4096]' },
  { depth: 4, name: 'k_proj.weight', detail: 'BF16 [1024, 4096]' },
  { depth: 4, name: 'v_proj.weight', detail: 'BF16 [1024, 4096]' },
  { depth: 3, name: 'mlp' },
  { depth: 4, name: 'gate_proj.weight', detail: 'BF16 [14336, 4096]' },
  { depth: 1, name: 'norm.weight', detail: 'BF16 [4096]' },
];

function TreePanel() {
  return (
    <ul className="h-[26rem] overflow-hidden p-5 font-mono text-[13px] leading-8">
      {TREE_ROWS.map((row) => (
        <li
          key={`${String(row.depth)}-${row.name}`}
          className="flex justify-between gap-6"
          style={{ paddingLeft: `${String(row.depth * 1.25)}rem` }}
        >
          <span className={row.detail ? 'text-sumi' : 'text-slate'}>{row.name}</span>
          {row.detail && <span className="text-slate">{row.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

const STATS: { family: OpFamily; label: string; count: number }[] = [
  { family: 'compute', label: '연산', count: 54 },
  { family: 'normalization', label: '정규화', count: 53 },
  { family: 'activation', label: '활성화', count: 49 },
  { family: 'other', label: '기타', count: 16 },
  { family: 'shape', label: '형태 · 풀링', count: 4 },
];
const STATS_MAX = Math.max(...STATS.map((stat) => stat.count));

function StatsPanel() {
  return (
    <div className="grid h-[26rem] content-center gap-4 px-8">
      {STATS.map((stat) => (
        <div
          key={stat.family}
          className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-4 text-sm"
        >
          <span className="text-slate">{stat.label}</span>
          <span
            className="h-2.5 rounded-full"
            style={{
              width: `${String((stat.count / STATS_MAX) * 100)}%`,
              backgroundColor: OP_COLORS[stat.family],
            }}
          />
          <span className="tabular text-right text-sumi">{stat.count}</span>
        </div>
      ))}
    </div>
  );
}

const TABS: { id: string; label: string; body: string; panel: ReactNode }[] = [
  {
    id: 'graph',
    label: '계산 그래프',
    body: 'ONNX 파일은 노드와 연결로 펼쳐져요. 노드를 눌러 보세요.',
    panel: <GraphPanel />,
  },
  {
    id: 'tree',
    label: '모듈 트리',
    body: 'safetensors 파일은 텐서 이름을 따라 계층으로 묶여요.',
    panel: <TreePanel />,
  },
  {
    id: 'stats',
    label: '통계',
    body: '연산 종류별 개수와 파라미터가 어디에 몰렸는지 보여줘요.',
    panel: <StatsPanel />,
  },
];

/** A miniature repository page for the hero; its tabs switch what the window shows. */
export function ProductWindow() {
  return (
    <Tabs.Root
      defaultValue={TABS[0]?.id}
      className="overflow-hidden rounded-2xl border border-fog bg-surface shadow-(--shadow-lift)"
    >
      <div className="px-5 pt-4">
        <div className="flex items-center gap-2 text-sm">
          <Avatar username="kai" displayName="Kai" size={20} />
          <span className="text-slate">kai /</span>
          <span className="font-semibold">resnet50-v2</span>
          <span className="ml-auto flex items-center gap-1 text-xs text-slate">
            <Sparkle className="size-3.5" color="var(--color-mieru-pink)" />
            <span className="sr-only">스타</span> 128
          </span>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5 text-xs" aria-label="모델 정보">
          <li className="rounded-md bg-haze-deep px-2 py-0.5 font-semibold">ONNX</li>
          <li className="rounded-md border border-fog px-2 py-0.5">25.6M 파라미터</li>
          <li className="rounded-md border border-fog px-2 py-0.5">97.8 MB</li>
          <li className="rounded-md border border-fog px-2 py-0.5">opset 17</li>
        </ul>
        <Tabs.List aria-label="저장소 화면" className="mt-3 -mb-px flex gap-1">
          {TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              className="border-b-2 border-transparent px-2.5 pb-2.5 text-sm text-slate hover:text-sumi data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-sumi"
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>
      <ArchitectureStrip
        segments={RESNET_STRIP}
        label="resnet50-v2 아키텍처"
        height={3}
        className="origin-left rounded-none motion-safe:hero-strip-in"
      />
      {TABS.map((tab) => (
        <Tabs.Content key={tab.id} value={tab.id} className="focus-visible:outline-offset-[-2px]">
          <p className="border-b border-fog px-5 py-2.5 text-xs text-slate">{tab.body}</p>
          {tab.panel}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
