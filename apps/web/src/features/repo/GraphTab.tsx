import { useQuery } from '@tanstack/react-query';
import { Spinner } from '../../design/ui/Spinner.js';
import { getGraph, modelKeys } from '../models/api.js';
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
  if (!model.currentVersion) return <VersionState model={model} />;
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <p className="p-10 text-sm text-danger">
        그래프를 불러오지 못했어요. 잠시 뒤에 다시 시도해주세요.
      </p>
    );
  const { payload, summary } = query.data;
  if (payload.kind === 'safetensors-tree') return <SafetensorsTreeView root={payload.root} />;
  return <OnnxGraphView payload={payload} summary={summary} />;
}

export function StatsRoute() {
  const { model, query } = useParsedModel();
  if (!model.currentVersion) return <VersionState model={model} />;
  if (query.isPending) return <Loading />;
  if (query.isError) return <p className="p-10 text-sm text-danger">통계를 불러오지 못했어요.</p>;
  return <StatsTab parsed={query.data} />;
}
