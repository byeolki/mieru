import * as Tabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { ArchitectureStrip } from '../../components/ArchitectureStrip.js';
import { Sparkle } from '../../design/Sparkle.js';
import { OP_COLORS, type OpFamily } from '../../design/op-palette.js';
import { GraphPreview } from './GraphPreview.js';
import { RESNET_STRIP } from './sample-strips.js';

function GraphPanel() {
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_15rem] max-md:grid-cols-1">
      <div className="h-[22rem] p-6">
        <GraphPreview />
      </div>
      <dl className="grid content-start gap-4 border-l border-fog p-5 font-mono text-xs max-md:hidden">
        <div>
          <dt className="font-sans text-sm font-semibold text-sumi">layer1.0.conv2</dt>
          <dd className="mt-0.5 font-sans text-slate">Conv</dd>
        </div>
        {[
          ['입력', '[1,64,56,56]'],
          ['출력', '[1,64,56,56]'],
          ['kernel_shape', '[3,3]'],
          ['pads', '[1,1,1,1]'],
          ['파라미터', '36,864'],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="font-sans text-slate">{label}</dt>
            <dd className="mt-0.5 text-sumi">{value}</dd>
          </div>
        ))}
      </dl>
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
    <ul className="h-[22rem] overflow-hidden p-5 font-mono text-[13px] leading-8">
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
    <div className="grid h-[22rem] content-center gap-4 px-8">
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
    body: 'ONNX 파일은 노드와 연결로 펼쳐져요. 노드를 누르면 입출력 크기와 속성이 나와요.',
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

/** A miniature of the repository page; the tabs switch what the window shows. */
export function ProductWindow() {
  return (
    <Tabs.Root
      defaultValue={TABS[0]?.id}
      orientation="vertical"
      className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <Tabs.List
        aria-label="저장소 화면"
        className="grid content-start gap-1 max-lg:grid-flow-col max-lg:justify-start max-lg:overflow-x-auto"
      >
        {TABS.map((tab) => (
          <Tabs.Trigger
            key={tab.id}
            value={tab.id}
            className="group border-transparent px-4 py-2.5 text-left max-lg:border-b-2 lg:border-l-2 text-slate transition-colors hover:text-sumi data-[state=active]:border-primary data-[state=active]:text-sumi"
          >
            <span className="block font-medium whitespace-nowrap">{tab.label}</span>
            <span className="mt-1 hidden text-sm leading-6 text-slate lg:group-data-[state=active]:block">
              {tab.body}
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <div className="overflow-hidden rounded-xl border border-fog bg-surface shadow-[0_40px_120px_-40px_rgb(222_126_168/0.25)]">
        <div className="flex items-center gap-3 border-b border-fog px-5 py-3.5">
          <span className="text-sm">
            <span className="text-slate">kai / </span>
            <span className="font-semibold">resnet50-v2</span>
          </span>
          <span className="ml-auto flex items-center gap-1 text-xs text-slate">
            <Sparkle className="size-3" color="#DE7EA8" /> 128
          </span>
        </div>
        <ArchitectureStrip segments={RESNET_STRIP} label="resnet50-v2 아키텍처" height={4} />
        {TABS.map((tab) => (
          <Tabs.Content key={tab.id} value={tab.id} className="focus-visible:outline-offset-[-2px]">
            {tab.panel}
          </Tabs.Content>
        ))}
      </div>
    </Tabs.Root>
  );
}
