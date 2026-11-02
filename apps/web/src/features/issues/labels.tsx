import {
  Bug,
  CircleCheck,
  CircleDot,
  Crosshair,
  Lightbulb,
  MessageCircleQuestion,
} from 'lucide-react';
import type { IssueKind, IssueState } from '@mieru/shared';
import { Badge } from '../../components/Badge.js';

export const KIND_LABELS: Record<IssueKind, string> = {
  bug: '버그',
  question: '질문',
  feedback: '피드백',
};

const KIND_ICONS = {
  bug: <Bug className="size-3" aria-hidden="true" />,
  question: <MessageCircleQuestion className="size-3" aria-hidden="true" />,
  feedback: <Lightbulb className="size-3" aria-hidden="true" />,
} satisfies Record<IssueKind, React.ReactNode>;

export function KindLabel({ kind }: { kind: IssueKind }) {
  return (
    <Badge
      tone={kind === 'bug' ? 'pink' : kind === 'question' ? 'lilac' : 'neutral'}
      icon={KIND_ICONS[kind]}
    >
      {KIND_LABELS[kind]}
    </Badge>
  );
}

export function StateIcon({
  state,
  className = 'size-4',
}: {
  state: IssueState;
  className?: string;
}) {
  return state === 'open' ? (
    <CircleDot className={`${className} text-primary`} aria-label="열림" />
  ) : (
    <CircleCheck className={`${className} text-slate`} aria-label="닫힘" />
  );
}

export function NodeChip({ nodeRef }: { nodeRef: string }) {
  const short = nodeRef.length > 36 ? `…${nodeRef.slice(-35)}` : nodeRef;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-paper px-1.5 py-0.5 font-mono text-[11px] text-slate"
      title={nodeRef}
    >
      <Crosshair className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{short}</span>
    </span>
  );
}
