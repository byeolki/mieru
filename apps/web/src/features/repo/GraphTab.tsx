import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { issueKeys, nodeIssueCounts } from '../issues/api.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { getGraph, modelKeys } from '../models/api.js';
import { ActivationModelContext } from '../demo/activation-store.js';
import { OnnxGraphView } from './graph/OnnxGraphView.js';
import { useRepo } from './RepoLayout.js';
import { SafetensorsTreeView } from './SafetensorsTreeView.js';
import { StatsTab } from './StatsTab.js';
import { VersionState } from './VersionState.js';

function useParsedModel() {
  const { model } = useRepo();
  const query = useQuery({
    queryKey: modelKeys.graph(model.id, null),
    queryFn: () => getGraph(model.id, null),
    enabled: model.currentVersion !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: (count, error) => count < 5 && 'code' in error && error.code === 'not_ready',
    retryDelay: 2000,
  });
  return { model, query };
}

function Loading() {
  return (
    <div
      className="grid h-full place-items-center text-lilac"
      role="status"
      aria-label="그래프 불러오는 중"
    >
      <Spinner className="size-6" />
    </div>
  );
}

export function GraphTab() {
  const { model, query } = useParsedModel();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusNode = searchParams.get('node');
  const counts = useQuery({
    queryKey: issueKeys.nodeCounts(model.id),
    queryFn: () => nodeIssueCounts(model.id),
    enabled: model.currentVersion !== null,
  });
  if (!model.currentVersion) return <VersionState model={model} />;
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <p className="p-10 text-sm text-danger">
        그래프를 불러오지 못했어요. 잠시 뒤에 다시 시도해주세요.
      </p>
    );
  const { payload, summary } = query.data;
  if (payload.kind === 'safetensors-tree') {
    return (
      <div className="mx-auto flex h-full max-w-[1280px] flex-col px-4 py-6 md:px-6">
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-fog">
          <SafetensorsTreeView root={payload.root} />
        </div>
      </div>
    );
  }
  return (
    <ActivationModelContext value={model.id}>
      <OnnxGraphView
        key={focusNode ?? 'graph'}
        payload={payload}
        summary={summary}
        initialFocusName={focusNode}
        issueCounts={counts.data ? new Map(Object.entries(counts.data)) : undefined}
        onOpenIssue={(nodeRef) =>
          void navigate(`/m/${model.id}/issues/new?nodeRef=${encodeURIComponent(nodeRef)}`)
        }
      />
    </ActivationModelContext>
  );
}

export function StatsRoute() {
  const { model, query } = useParsedModel();
  if (!model.currentVersion) return <VersionState model={model} />;
  if (query.isPending) return <Loading />;
  if (query.isError) return <p className="p-10 text-sm text-danger">통계를 불러오지 못했어요.</p>;
  return <StatsTab parsed={query.data} />;
}
