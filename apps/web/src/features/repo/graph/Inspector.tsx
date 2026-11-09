import { Check, ChevronRight, Copy, MessageSquarePlus, PanelRightClose } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type {
  AttrValue,
  ModelSummary,
  OnnxGraphPayload,
  OnnxNode,
  OpFamily,
  TensorInfo,
} from '@mieru/shared';
import { Badge } from '../../../components/Badge.js';
import { OP_COLORS, OP_FAMILY_LABELS } from '../../../design/op-palette.js';
import { Button } from '../../../design/ui/Button.js';
import { formatParams, formatShape } from '../../../lib/format.js';
import type { GroupInfo } from './visible-graph.js';

export type Selection =
  | { kind: 'node'; node: OnnxNode }
  | { kind: 'group'; group: GroupInfo }
  | { kind: 'io'; tensor: TensorInfo }
  | null;

function attributeText(value: AttrValue): string {
  switch (value.kind) {
    case 'int':
    case 'float':
      return String(value.value);
    case 'string':
      return value.value;
    case 'ints':
    case 'floats':
      return `[${value.value.join(', ')}${value.truncated ? ', …' : ''}]`;
    case 'strings':
      return value.value.join(', ') + (value.truncated ? ', …' : '');
    case 'tensor':
      return `${value.dtype} ${formatShape(value.shape)}`;
    case 'graph':
      return `하위 그래프 (노드 ${value.nodeCount})`;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-fog px-5 py-4">
      <h3 className="text-xs font-medium text-slate">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function TensorRow({ tensor, href }: { tensor: TensorInfo; href?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1">
      {href ? (
        <Link
          to={href}
          className="truncate font-mono text-xs underline decoration-fog underline-offset-2 hover:text-primary hover:decoration-primary"
          title={`${tensor.name} 가중치 분포 보기`}
        >
          {tensor.name}
        </Link>
      ) : (
        <span className="truncate font-mono text-xs" title={tensor.name}>
          {tensor.name}
        </span>
      )}
      <span className="shrink-0 font-mono text-[11px] text-slate">
        {tensor.dtype ?? '?'} {formatShape(tensor.shape)}
      </span>
    </li>
  );
}

function CopyName({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="grid size-7 place-items-center rounded-md text-slate hover:bg-haze hover:text-sumi"
      aria-label="이름 복사"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function FamilyLegend({ families }: { families: Partial<Record<OpFamily, number>> }) {
  const entries = (Object.entries(families) as [OpFamily, number][]).sort((a, b) => b[1] - a[1]);
  return (
    <ul className="grid gap-1.5">
      {entries.map(([family, count]) => (
        <li key={family} className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ backgroundColor: OP_COLORS[family] }}
            />
            {OP_FAMILY_LABELS[family]}
          </span>
          <span className="tabular text-slate">{count}</span>
        </li>
      ))}
    </ul>
  );
}

interface InspectorProps {
  selection: Selection;
  payload: OnnxGraphPayload;
  summary: ModelSummary;
  onExpandGroup: (path: string) => void;
  onClose: () => void;
  onOpenIssue?: (nodeRef: string) => void;
  /** Where a weight tensor's histogram lives; parameter names become links when given. */
  tensorHref?: (name: string) => string;
}

/** Docked right panel: details of the selected node or group, or the whole-model summary. */
export function Inspector({
  selection,
  payload,
  summary,
  onExpandGroup,
  onClose,
  onOpenIssue,
  tensorHref,
}: InspectorProps) {
  const header = (title: string, subtitle: string, copyValue?: string) => (
    <div className="flex items-start gap-2 px-5 pt-5 pb-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold" title={title}>
          {title}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate">{subtitle}</p>
      </div>
      {copyValue && <CopyName value={copyValue} />}
      <button
        type="button"
        onClick={onClose}
        className="grid size-7 place-items-center rounded-md text-slate hover:bg-haze hover:text-sumi"
        aria-label="정보 패널 닫기"
      >
        <PanelRightClose className="size-4" />
      </button>
    </div>
  );

  if (selection?.kind === 'node') {
    const { node } = selection;
    const tensorsByName = new Map<string, TensorInfo>();
    for (const edge of payload.edges) tensorsByName.set(edge.tensor.name, edge.tensor);
    const lookup = (name: string): TensorInfo =>
      tensorsByName.get(name) ?? { name, dtype: null, shape: null };
    const attributes = Object.entries(node.attributes);
    return (
      <div>
        {header(node.name, `${node.opType}${node.domain ? ` · ${node.domain}` : ''}`, node.name)}
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          <Badge tone="lilac">{OP_FAMILY_LABELS[node.family]}</Badge>
          {node.paramCount > 0 && <Badge>{formatParams(node.paramCount)} params</Badge>}
        </div>
        {attributes.length > 0 && (
          <Section title="속성">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
              {attributes.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-slate">{key}</dt>
                  <dd className="truncate font-mono" title={attributeText(value)}>
                    {attributeText(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        )}
        <Section title="입력">
          <ul>
            {node.inputs.length ? (
              node.inputs.map((name) => <TensorRow key={name} tensor={lookup(name)} />)
            ) : (
              <li className="text-xs text-slate">없음</li>
            )}
          </ul>
        </Section>
        <Section title="출력">
          <ul>
            {node.outputs.map((name) => (
              <TensorRow key={name} tensor={lookup(name)} />
            ))}
          </ul>
        </Section>
        {node.params.length > 0 && (
          <Section title={`파라미터 · ${node.paramCount.toLocaleString('ko-KR')}`}>
            <ul>
              {node.params.map((tensor) => (
                <TensorRow key={tensor.name} tensor={tensor} href={tensorHref?.(tensor.name)} />
              ))}
            </ul>
          </Section>
        )}
        {onOpenIssue && (
          <Section title="관련 이슈">
            <Button
              size="sm"
              variant="secondary"
              icon={<MessageSquarePlus className="size-4" />}
              onClick={() => onOpenIssue(node.name)}
            >
              이 노드로 이슈 열기
            </Button>
          </Section>
        )}
      </div>
    );
  }

  if (selection?.kind === 'group') {
    const { group } = selection;
    return (
      <div>
        {header(group.label, group.path.replaceAll('/', ' / '), group.path)}
        <div className="px-5 pb-4">
          <Button
            size="sm"
            icon={<ChevronRight className="size-4" />}
            onClick={() => onExpandGroup(group.path)}
          >
            펼쳐서 보기
          </Button>
        </div>
        <Section title="요약">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate">노드</dt>
              <dd className="tabular font-semibold">{group.nodeCount.toLocaleString('ko-KR')}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate">파라미터</dt>
              <dd className="tabular font-semibold">{formatParams(group.paramCount)}</dd>
            </div>
          </dl>
        </Section>
        <Section title="연산 구성">
          <FamilyLegend families={group.families} />
        </Section>
      </div>
    );
  }

  if (selection?.kind === 'io') {
    return (
      <div>
        {header(selection.tensor.name, '그래프 입출력', selection.tensor.name)}
        <Section title="텐서">
          <ul>
            <TensorRow tensor={selection.tensor} />
          </ul>
        </Section>
      </div>
    );
  }

  const families: Partial<Record<OpFamily, number>> = {};
  for (const node of payload.nodes) families[node.family] = (families[node.family] ?? 0) + 1;
  return (
    <div>
      <div className="px-5 pt-5 pb-4">
        <p className="font-semibold">모델 전체</p>
        <p className="mt-0.5 text-xs text-slate">노드를 누르면 자세한 정보가 여기에 나와요.</p>
      </div>
      <Section title="요약">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate">노드</dt>
            <dd className="tabular font-semibold">
              {payload.nodes.length.toLocaleString('ko-KR')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate">파라미터</dt>
            <dd className="tabular font-semibold">{formatParams(summary.totalParams)}</dd>
          </div>
        </dl>
      </Section>
      <Section title="입력">
        <ul>
          {payload.inputs.map((tensor) => (
            <TensorRow key={tensor.name} tensor={tensor} />
          ))}
        </ul>
      </Section>
      <Section title="출력">
        <ul>
          {payload.outputs.map((tensor) => (
            <TensorRow key={tensor.name} tensor={tensor} />
          ))}
        </ul>
      </Section>
      <Section title="연산 구성">
        <FamilyLegend families={families} />
      </Section>
    </div>
  );
}
