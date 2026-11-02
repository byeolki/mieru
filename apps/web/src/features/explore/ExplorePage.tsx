import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ExploreSort, ModelFormat, ModelListItem } from '@mieru/shared';
import { ArchitectureStrip } from '../../components/ArchitectureStrip.js';
import { Avatar } from '../../components/Avatar.js';
import { Badge } from '../../components/Badge.js';
import { Sparkle } from '../../design/Sparkle.js';
import { Button } from '../../design/ui/Button.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { formatParams, formatRelative } from '../../lib/format.js';
import { FORMAT_LABELS } from '../models/labels.js';
import { ModelRows } from '../models/ModelRows.js';
import { PublicShell } from '../shell/PublicShell.js';
import { exploreKeys, getExplore, searchModels, type SearchFilters } from './api.js';

function TrendingRow({ item, rank }: { item: ModelListItem; rank: number }) {
  return (
    <li>
      <Link
        to={`/m/${item.id}`}
        className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-haze/40"
      >
        <span className="tabular text-center text-lg font-bold text-lilac">{rank}</span>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar username={item.owner.username} displayName={item.owner.displayName} size={30} />
          <div className="min-w-0">
            <p className="truncate font-semibold">
              <span className="font-normal text-slate">{item.owner.username} / </span>
              {item.name}
            </p>
            {item.description && <p className="truncate text-sm text-slate">{item.description}</p>}
          </div>
        </div>
        <span className="tabular flex items-center gap-1 text-sm">
          <Sparkle className="size-4" color="#DE7EA8" />
          {item.starCount}
        </span>
        <span aria-hidden="true" />
        <div className="col-span-2 flex items-center gap-3">
          <div className="flex shrink-0 gap-1.5">
            {item.format && <Badge tone="lilac">{FORMAT_LABELS[item.format]}</Badge>}
            {item.totalParams !== null && <Badge>{formatParams(item.totalParams)} params</Badge>}
            {!item.publicAllowDownload && <Badge>보기 전용</Badge>}
          </div>
          <ArchitectureStrip
            segments={item.strip}
            label={`${item.name} 아키텍처`}
            height={6}
            className="flex-1"
          />
        </div>
      </Link>
    </li>
  );
}

function CompactList({ title, items }: { title: string; items: ModelListItem[] }) {
  return (
    <section>
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ul className="divide-y divide-fog overflow-hidden rounded-(--radius-panel) border border-fog bg-surface shadow-(--shadow-soft)">
        {items.slice(0, 6).map((item) => (
          <li key={item.id}>
            <Link to={`/m/${item.id}`} className="block px-4 py-3 hover:bg-haze/40">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-semibold">
                  <span className="font-normal text-slate">{item.owner.username} / </span>
                  {item.name}
                </p>
                <span className="tabular shrink-0 text-xs text-slate">
                  {formatRelative(item.updatedAt)}
                </span>
              </div>
              <ArchitectureStrip
                segments={item.strip}
                label={`${item.name} 아키텍처`}
                height={5}
                className="mt-2"
              />
            </Link>
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate">아직 없어요</li>
        )}
      </ul>
    </section>
  );
}

const SORT_LABELS: Record<ExploreSort, string> = {
  trending: '화제순',
  stars: '스타순',
  recent: '최신순',
};

function SearchResults({ filters }: { filters: SearchFilters }) {
  const results = useInfiniteQuery({
    queryKey: exploreKeys.search(filters),
    queryFn: ({ pageParam }) => searchModels(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, _pages, page) => (last.hasMore ? page + 1 : undefined),
  });
  if (results.isPending) return <Spinner className="size-6 text-lilac" />;
  if (results.isError) return <p className="text-sm text-danger">검색하지 못했어요.</p>;
  const items = results.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <p className="rounded-(--radius-panel) border border-dashed border-lilac px-6 py-12 text-center text-sm text-slate">
        찾는 모델이 없어요. 다른 단어로 찾아보세요.
      </p>
    );
  }
  return (
    <div className="grid gap-4">
      <ModelRows items={items} showOwner />
      {results.hasNextPage && (
        <Button
          variant="secondary"
          className="justify-self-center"
          disabled={results.isFetchingNextPage}
          onClick={() => void results.fetchNextPage()}
        >
          {results.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
        </Button>
      )}
    </div>
  );
}

export function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(params.get('q') ?? '');
  const filters: SearchFilters = {
    q: params.get('q') ?? '',
    format: (params.get('format') as ModelFormat | null) ?? null,
    downloadableOnly: params.get('downloadable') === 'true',
    sort: (params.get('sort') as ExploreSort | null) ?? 'trending',
  };
  const isSearching =
    filters.q !== '' || filters.format !== null || filters.downloadableOnly || params.has('sort');
  const sections = useQuery({
    queryKey: exploreKeys.sections,
    queryFn: getExplore,
    enabled: !isSearching,
  });
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next);
  };

  return (
    <PublicShell>
      <section className="haze-tone relative mb-8 overflow-hidden rounded-(--radius-sheet) px-6 py-8 md:px-10">
        <Sparkle className="absolute top-6 right-10 size-6" color="#DE7EA8" />
        <Sparkle className="absolute right-24 bottom-8 size-4" color="#C8B6D4" />
        <h1 className="text-xl font-bold tracking-tight">모델 둘러보기</h1>
        <p className="mt-1 text-sm text-slate">다른 사람들이 공개한 모델을 그래프로 살펴보세요.</p>
        <form
          className="mt-5 flex max-w-xl items-center gap-2 rounded-full border border-fog bg-surface px-4 shadow-(--shadow-soft) focus-within:border-primary"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: draft.trim() });
          }}
          role="search"
        >
          <Search className="size-4 text-slate" aria-hidden="true" />
          <label htmlFor="explore-search" className="sr-only">
            모델 검색
          </label>
          <input
            id="explore-search"
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="이름, 설명, README에서 찾기"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate/70"
          />
        </form>
      </section>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(['onnx', 'safetensors'] as const).map((format) => (
          <button
            key={format}
            type="button"
            aria-pressed={filters.format === format}
            onClick={() => update({ format: filters.format === format ? null : format })}
            className={clsx(
              'rounded-full border px-3 py-1.5 text-sm',
              filters.format === format
                ? 'border-primary bg-haze text-sumi'
                : 'border-fog bg-surface text-slate hover:border-lilac',
            )}
          >
            {FORMAT_LABELS[format]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={filters.downloadableOnly}
          onClick={() => update({ downloadable: filters.downloadableOnly ? null : 'true' })}
          className={clsx(
            'rounded-full border px-3 py-1.5 text-sm',
            filters.downloadableOnly
              ? 'border-primary bg-haze text-sumi'
              : 'border-fog bg-surface text-slate hover:border-lilac',
          )}
        >
          다운로드 가능만
        </button>
        <select
          aria-label="정렬"
          value={filters.sort}
          onChange={(event) => update({ sort: event.target.value })}
          className="ml-auto h-9 rounded-full border border-fog bg-surface px-3 text-sm hover:border-lilac focus:border-primary focus:outline-none"
        >
          {(Object.keys(SORT_LABELS) as ExploreSort[]).map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </div>

      {isSearching ? (
        <SearchResults filters={filters} />
      ) : sections.isPending ? (
        <Spinner className="size-6 text-lilac" />
      ) : sections.isError ? (
        <p className="text-sm text-danger">둘러보기를 불러오지 못했어요.</p>
      ) : (
        <div className="grid gap-10">
          <section>
            <h2 className="mb-3 font-semibold">
              {sections.data.trendingIsFallback ? '스타 많은 모델' : '이번 주 화제'}
            </h2>
            {sections.data.trending.length === 0 ? (
              <p className="rounded-(--radius-panel) border border-dashed border-lilac px-6 py-12 text-center text-sm text-slate">
                아직 공개된 모델이 없어요. 첫 번째로 올려보세요!
              </p>
            ) : (
              <ol className="divide-y divide-fog overflow-hidden rounded-(--radius-panel) border border-fog bg-surface shadow-(--shadow-soft)">
                {sections.data.trending.map((item, index) => (
                  <TrendingRow key={item.id} item={item} rank={index + 1} />
                ))}
              </ol>
            )}
          </section>
          {/* The fallback trending list is already ordered by stars, so a second star list would repeat it. */}
          <div
            className={clsx('grid gap-8', !sections.data.trendingIsFallback && 'md:grid-cols-2')}
          >
            <CompactList title="새로 올라온 모델" items={sections.data.newest} />
            {!sections.data.trendingIsFallback && (
              <CompactList title="스타 많은 모델" items={sections.data.mostStarred} />
            )}
          </div>
        </div>
      )}
    </PublicShell>
  );
}
