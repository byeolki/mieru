import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation, useParams } from 'react-router';
import { Loading } from '../../design/ui/Loading.js';
import { modelPath } from '../../lib/model-path.js';
import { getModel, modelKeys } from '../models/api.js';
import { NotFoundPage } from '../NotFoundPage.js';

const LEGACY_TABS = [
  '',
  'graph',
  'stats',
  'demo',
  'weights',
  'versions',
  'versions/compare',
  'issues',
  'issues/new',
  'issues/:number',
  'readme/edit',
];

/** Every old repository route, one per tab, so they outrank the readable `/:username/:slug` ones. */
export const LEGACY_REPO_PATHS = LEGACY_TABS.map((tab) =>
  tab ? `/m/:modelId/${tab}` : '/m/:modelId',
);

/** Sends /m/{id}/rest to /{owner}/{slug}/rest, keeping the tab and query string. */
export function LegacyRepoRedirect() {
  const { modelId = '' } = useParams();
  const { pathname, search, hash } = useLocation();
  const rest = pathname.slice(`/m/${modelId}`.length).replace(/^\//, '');
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
