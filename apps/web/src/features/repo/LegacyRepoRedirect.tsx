import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation, useParams } from 'react-router';
import { Loading } from '../../design/ui/Loading.js';
import { modelPath } from '../../lib/model-path.js';
import { getModel, modelKeys } from '../models/api.js';
import { NotFoundPage } from '../NotFoundPage.js';

/** Sends /m/{id}/rest to /{owner}/{slug}/rest, keeping the tab and query string. */
export function LegacyRepoRedirect() {
  const { modelId = '', '*': rest = '' } = useParams();
  const { search, hash } = useLocation();
  const queryClient = useQueryClient();
  const model = useQuery({ queryKey: modelKeys.detail(modelId), queryFn: () => getModel(modelId) });
  if (model.isPending) return <Loading className="grid min-h-dvh place-items-center text-lilac" />;
  if (model.isError) return <NotFoundPage />;
  // The id is already known, so the readable page needn't look it up. Share-link visitors
  // depend on this: their token only travels with id-based requests.
  queryClient.setQueryData(modelKeys.resolve(model.data.owner.username, model.data.slug), {
    id: model.data.id,
  });
  const tail = rest ? `/${rest}` : '';
  return <Navigate to={`${modelPath(model.data)}${tail}${search}${hash}`} replace />;
}
