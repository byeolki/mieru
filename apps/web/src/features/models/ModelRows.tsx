import { CircleAlert, Lock, Link2, Users } from 'lucide-react';
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

export function ModelRow({ item, showOwner = true }: { item: ModelListItem; showOwner?: boolean }) {
  return (
    <li>
      <Link
        to={`/m/${item.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-haze/40"
      >
        <div className="flex min-w-0 items-center gap-3">
          {showOwner && (
            <Avatar username={item.owner.username} displayName={item.owner.displayName} size={28} />
          )}
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold">
                {showOwner && (
                  <span className="font-normal text-slate">{item.owner.username} / </span>
                )}
                {item.name}
              </span>
              {item.visibility !== 'public' && (
                <Badge icon={VISIBILITY_ICONS[item.visibility]}>
                  {VISIBILITY_LABELS[item.visibility]}
                </Badge>
              )}
              <StatusBadge item={item} />
            </p>
            {item.description && (
              <p className="mt-0.5 truncate text-sm text-slate">{item.description}</p>
            )}
          </div>
        </div>
        <div className="tabular flex items-center gap-4 self-center text-xs text-slate">
          <span className="flex items-center gap-1" title="스타">
            <Sparkle className="size-3.5" color="#DE7EA8" />
            {item.starCount}
          </span>
          <span className="hidden sm:inline">{formatRelative(item.updatedAt)}</span>
        </div>
        <div className="col-span-2 flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-1.5">
            {item.format && <Badge tone="lilac">{FORMAT_LABELS[item.format]}</Badge>}
            {item.totalParams !== null && <Badge>{formatParams(item.totalParams)} params</Badge>}
            {item.sizeBytes !== null && (
              <span className="tabular hidden text-xs text-slate sm:inline">
                {formatBytes(item.sizeBytes)}
              </span>
            )}
          </div>
          {item.strip.length > 0 ? (
            <ArchitectureStrip
              segments={item.strip}
              label={`${item.name} 아키텍처`}
              height={6}
              className="flex-1"
            />
          ) : (
            <div className="h-1.5 flex-1 rounded-full bg-fog" aria-hidden="true" />
          )}
        </div>
      </Link>
    </li>
  );
}

export function ModelRows({ items, showOwner }: { items: ModelListItem[]; showOwner?: boolean }) {
  return (
    <ul className="divide-y divide-fog overflow-hidden rounded-(--radius-panel) border border-fog bg-surface shadow-(--shadow-soft)">
      {items.map((item) => (
        <ModelRow key={item.id} item={item} showOwner={showOwner} />
      ))}
    </ul>
  );
}
