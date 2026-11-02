import { Link } from 'react-router';
import type { ModelListItem } from '@mieru/shared';
import { Avatar } from '../../components/Avatar.js';
import { Sparkle } from '../../design/Sparkle.js';
import { OP_COLORS } from '../../design/op-palette.js';
import { formatParams } from '../../lib/format.js';
import { FORMAT_LABELS } from './labels.js';

/** The strip drawn as a tall cover, so each featured model reads as its own architecture. */
function StripCover({ item }: { item: ModelListItem }) {
  const total = item.strip.reduce((sum, segment) => sum + segment.weight, 0) || 1;
  return (
    <div className="flex h-24 overflow-hidden rounded-lg bg-fog" aria-hidden="true">
      {item.strip.map((segment, index) => (
        <span
          // Segments are an ordered sequence, so position is their identity.
          key={index}
          style={{
            width: `${String((segment.weight / total) * 100)}%`,
            backgroundColor: OP_COLORS[segment.family],
          }}
        />
      ))}
    </div>
  );
}

export function FeaturedCard({ item, rank }: { item: ModelListItem; rank: number }) {
  return (
    <li>
      <Link
        to={`/m/${item.id}`}
        className="group flex h-full flex-col rounded-xl border border-fog bg-surface p-3 transition-[border-color,box-shadow] hover:border-lilac/70 hover:shadow-(--shadow-soft)"
      >
        <StripCover item={item} />
        <div className="flex flex-1 flex-col px-1 pt-3.5 pb-1">
          <div className="flex items-center gap-2">
            <span className="tabular text-sm font-semibold text-slate">{rank}</span>
            <Avatar username={item.owner.username} displayName={item.owner.displayName} size={18} />
            <span className="min-w-0 truncate font-mono text-sm">
              <span className="text-slate">{item.owner.username}/</span>
              <span className="font-medium group-hover:text-primary">{item.name}</span>
            </span>
          </div>
          <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate">
            {item.description ?? '설명이 아직 없어요.'}
          </p>
          <div className="tabular mt-auto flex items-center gap-3 pt-3 text-xs text-slate">
            {item.format && (
              <span className="rounded bg-haze px-1.5 py-0.5 font-medium text-sumi">
                {FORMAT_LABELS[item.format]}
              </span>
            )}
            {item.totalParams !== null && <span>{formatParams(item.totalParams)}</span>}
            <span className="ml-auto flex items-center gap-1">
              <Sparkle className="size-3.5" color="var(--color-mieru-pink)" />
              <span className="sr-only">스타</span>
              {item.starCount}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
