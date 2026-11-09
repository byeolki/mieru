import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useNavigate } from 'react-router';
import type { ModelDetail } from '@mieru/shared';
import { Sparkle } from '../../design/Sparkle.js';
import { useAuth } from '../../lib/auth-store.js';
import { issueKeys, setStar } from '../issues/api.js';
import { modelKeys } from '../models/api.js';

/** Split "스타 | 128" button; the sparkle pops once when you star. */
export function StarButton({ model }: { model: ModelDetail }) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => setStar(model.id, !model.starredByMe),
    onSuccess: (result) => {
      queryClient.setQueryData(modelKeys.detail(model.id), {
        ...model,
        starredByMe: result.starred,
        starCount: result.starCount,
      });
      void queryClient.invalidateQueries({ queryKey: issueKeys.stars });
    },
  });
  return (
    <button
      type="button"
      aria-pressed={model.starredByMe}
      onClick={() => {
        if (status !== 'signed-in') {
          void navigate(`/login?next=${encodeURIComponent(`/m/${model.id}`)}`);
          return;
        }
        toggle.mutate();
      }}
      className={clsx(
        'flex h-10 items-stretch overflow-hidden rounded-full text-sm transition-colors',
        model.starredByMe ? 'bg-sakura' : 'bg-haze hover:bg-haze-deep',
      )}
    >
      <span className="flex items-center gap-1.5 pr-1.5 pl-4 font-semibold">
        <Sparkle
          className={clsx(
            'size-4 transition-transform duration-200',
            model.starredByMe && 'motion-safe:animate-[star-pop_320ms_ease-out]',
          )}
          color={model.starredByMe ? '#DE7EA8' : '#9C8CB0'}
        />
        {model.starredByMe ? '스타함' : '스타'}
      </span>
      <span className="tabular flex items-center pr-4 pl-1.5 font-display text-xs text-slate">
        {model.starCount}
      </span>
    </button>
  );
}
