import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronDown, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { ExploreSort, ModelFormat } from '@mieru/shared';
import { Button } from '../../design/ui/Button.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { FORMAT_LABELS } from '../models/labels.js';
import { FeaturedCard } from '../models/FeaturedCard.js';
import { ModelRows } from '../models/ModelRows.js';
import { AppShell } from '../shell/AppShell.js';
import { exploreKeys, getExplore, searchModels, type SearchFilters } from './api.js';

const SORT_LABELS: Record<ExploreSort, string> = {
  trending: '화제순',
  stars: '스타순',
  recent: '최신순',
};
const FORMATS: ModelFormat[] = ['onnx', 'safetensors'];

function Featured() {
  const sections = useQuery({ queryKey: exploreKeys.sections, queryFn: getExplore });
  if (!sections.data || sections.data.trending.length === 0) return null;
  return (
    <section className="mb-10" aria-labelledby="featured-title">
      <h2 id="featured-title" className="mb-3 text-sm font-semibold">
        {sections.data.trendingIsFallback ? '스타를 많이 받은 모델' : '이번 주 화제'}
      </h2>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.data.trending.slice(0, 3).map((item, index) => (
          <FeaturedCard key={item.id} item={item} rank={index + 1} />
        ))}
      </ol>
    </section>
  );
}

function SearchResults({ filters }: { filters: SearchFilters }) {
  const results = useInfiniteQuery({
    queryKey: exploreKeys.search(filters),
    queryFn: ({ pageParam }) => searchModels(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, _pages, page) => (last.hasMore ? page + 1 : undefined),
  });
  if (results.isPending) return <Loading />;
  if (results.isError) {
    return (
      <ErrorState message="모델을 불러오지 못했어요." onRetry={() => void results.refetch()} />
    );
  }
  const items = results.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-fog px-6 py-14 text-center">
        <p className="font-medium">맞는 모델이 없어요</p>
        <p className="mt-1 text-sm text-slate">다른 단어로 찾거나 필터를 풀어보세요.</p>
      </div>
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

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-fog pb-5 last:border-b-0">
      <legend className="mb-2.5 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

const CHIP = 'rounded-md border px-2.5 py-1 text-sm transition-colors';

interface FiltersProps {
  filters: SearchFilters;
  update: (changes: Record<string, string | null>) => void;
  radioName: string;
}

function Filters({ filters, update, radioName }: FiltersProps) {
  return (
    <>
      <FilterGroup title="형식">
        <div className="flex flex-wrap gap-1.5">
          {FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              aria-pressed={filters.format === format}
              onClick={() => update({ format: filters.format === format ? null : format })}
              className={clsx(
                CHIP,
                filters.format === format
                  ? 'border-primary bg-haze font-medium text-sumi'
                  : 'border-fog bg-surface text-slate hover:border-lilac hover:text-sumi',
              )}
            >
              {FORMAT_LABELS[format]}
            </button>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="다운로드">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.downloadableOnly}
            onChange={() => update({ downloadable: filters.downloadableOnly ? null : 'true' })}
            className="size-4 accent-primary"
          />
          다운로드 가능만
        </label>
      </FilterGroup>
      <FilterGroup title="정렬">
        <div className="grid gap-0.5">
          {(Object.keys(SORT_LABELS) as ExploreSort[]).map((sort) => (
            <label
              key={sort}
              className={clsx(
                'flex cursor-pointer items-center rounded-md px-2.5 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
                filters.sort === sort ? 'bg-haze font-medium' : 'text-slate hover:text-sumi',
              )}
            >
              <input
                type="radio"
                name={radioName}
                value={sort}
                checked={filters.sort === sort}
                onChange={() => update({ sort: sort === 'trending' ? null : sort })}
                className="sr-only"
              />
              {SORT_LABELS[sort]}
            </label>
          ))}
        </div>
      </FilterGroup>
    </>
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
  const isFiltered = filters.q !== '' || filters.format !== null || filters.downloadableOnly;
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next);
  };

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl">모델 둘러보기</h1>
          <p className="mt-1.5 text-sm text-slate">
            {filters.q
              ? `‘${filters.q}’ 검색 결과예요.`
              : '다른 사람들이 공개한 모델을 그래프로 살펴보세요.'}
          </p>
        </div>
        <form
          role="search"
          className="relative w-full max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: draft.trim() });
          }}
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate"
            aria-hidden="true"
          />
          <label htmlFor="explore-search" className="sr-only">
            이름, 설명, README에서 찾기
          </label>
          <input
            id="explore-search"
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="이름, 설명, README에서 찾기"
            className="h-10 w-full rounded-lg border border-fog bg-surface pr-3 pl-9 text-sm placeholder:text-slate focus:border-primary focus:outline-none"
          />
        </form>
      </div>
      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <details className="group rounded-xl border border-fog bg-surface lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
            필터와 정렬
            <ChevronDown
              className="size-4 text-slate transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="grid gap-5 border-t border-fog px-4 py-4">
            <Filters filters={filters} update={update} radioName="sort-mobile" />
          </div>
        </details>
        <aside className="hidden content-start gap-5 lg:sticky lg:top-20 lg:grid lg:self-start">
          <Filters filters={filters} update={update} radioName="sort" />
        </aside>

        <div className="min-w-0">
          {!isFiltered && filters.sort === 'trending' && <Featured />}
          <h2 className="mb-3 text-sm font-semibold">
            {isFiltered ? '결과' : `모든 모델 · ${SORT_LABELS[filters.sort]}`}
          </h2>
          <SearchResults filters={filters} />
        </div>
      </div>
    </AppShell>
  );
}
