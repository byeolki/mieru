import { Boxes, CircleAlert, CircleDot, Clock3, HardDrive, Link2, Lock, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { ModelListItem, Visibility } from '@mieru/shared';
import { ArchitectureStrip } from '../../components/ArchitectureStrip.js';
import { Avatar } from '../../components/Avatar.js';
import { Badge } from '../../components/Badge.js';
import { Sparkle } from '../../design/Sparkle.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { formatBytes, formatParams, formatRelative } from '../../lib/format.js';
import { FORMAT_LABELS, VISIBILITY_LABELS } from './labels.js';

const VISIBILITY_ICONS: Record<Visibility, ReactNode> = {
  private: <Lock className="size-3" aria-hidden="true" />,
  users: <Users className="size-3" aria-hidden="true" />,
  link: <Link2 className="size-3" aria-hidden="true" />,
  public: null,
};

function StatusBadge({ item }: { item: ModelListItem }) {
  if (item.status === 'processing') {
    return (
      <Badge tone="progress" icon={<Spinner className="size-3" />}>
        분석 중
      </Badge>
    );
  }
  if (item.status === 'failed') {
    return (
      <Badge tone="danger" icon={<CircleAlert className="size-3" aria-hidden="true" />}>
        분석 실패
      </Badge>
    );
  }
  return null;
}

function Meta({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1" title={label}>
      <span className="text-slate/70 [&>svg]:size-3.5" aria-hidden="true">
        {icon}
      </span>
      <span className="sr-only">{label} </span>
      {children}
    </span>
  );
}

/** One repository in a list: id, a meta line of facts, and its architecture strip. */
export function ModelRow({ item, showOwner = true }: { item: ModelListItem; showOwner?: boolean }) {
  return (
    <li>
      <Link
        to={`/m/${item.id}`}
        className="group block rounded-(--radius-panel) border border-fog bg-surface px-4 pt-3.5 pb-3 transition-[border-color,box-shadow] hover:border-lilac/70 hover:shadow-(--shadow-soft)"
      >
        <div className="flex min-w-0 items-center gap-2">
          {showOwner && (
            <Avatar username={item.owner.username} displayName={item.owner.displayName} size={20} />
          )}
          <p className="min-w-0 truncate font-mono text-[0.9375rem]">
            {showOwner && <span className="text-slate">{item.owner.username}/</span>}
            <span className="font-medium text-sumi group-hover:text-primary">{item.name}</span>
          </p>
          {item.visibility !== 'public' && (
            <Badge icon={VISIBILITY_ICONS[item.visibility]}>
              {VISIBILITY_LABELS[item.visibility]}
            </Badge>
          )}
          <StatusBadge item={item} />
        </div>
        {item.description && <p className="mt-1 truncate text-sm text-slate">{item.description}</p>}
        <div className="tabular mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-slate">
          {item.format && (
            <span className="rounded bg-haze px-1.5 py-0.5 font-medium text-sumi">
              {FORMAT_LABELS[item.format]}
            </span>
          )}
          {item.totalParams !== null && (
            <Meta icon={<Boxes />} label="파라미터">
              {formatParams(item.totalParams)}
            </Meta>
          )}
          {item.sizeBytes !== null && (
            <Meta icon={<HardDrive />} label="크기">
              {formatBytes(item.sizeBytes)}
            </Meta>
          )}
          <Meta icon={<Clock3 />} label="업데이트">
            {formatRelative(item.updatedAt)}
          </Meta>
          <Meta icon={<Sparkle color="var(--color-mieru-pink)" />} label="스타">
            {item.starCount}
          </Meta>
          {item.openIssueCount > 0 && (
            <Meta icon={<CircleDot />} label="열린 이슈">
              {item.openIssueCount}
            </Meta>
          )}
        </div>
        {item.strip.length > 0 ? (
          <ArchitectureStrip
            segments={item.strip}
            label={`${item.name} 아키텍처`}
            height={3}
            className="mt-3 opacity-80 transition-opacity group-hover:opacity-100"
          />
        ) : (
          <div className="mt-3 h-[3px] rounded-full bg-fog" aria-hidden="true" />
        )}
      </Link>
    </li>
  );
}

export function ModelRows({ items, showOwner }: { items: ModelListItem[]; showOwner?: boolean }) {
  return (
    <ul className="grid gap-2.5">
      {items.map((item) => (
        <ModelRow key={item.id} item={item} showOwner={showOwner} />
      ))}
    </ul>
  );
}
