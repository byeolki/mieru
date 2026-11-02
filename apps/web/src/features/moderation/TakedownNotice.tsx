import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import type { ModelDetail } from '@mieru/shared';
import { Button } from '../../design/ui/Button.js';
import { useAuth } from '../../lib/auth-store.js';
import { modelKeys } from '../models/api.js';
import { restoreModel } from './api.js';

/** Shown to the owner and admins, the only people who can still open a taken-down repository. */
export function TakedownNotice({ model }: { model: ModelDetail }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const restore = useMutation({
    mutationFn: () => restoreModel(model.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modelKeys.detail(model.id) }),
  });
  if (!model.takenDown) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger md:px-6"
    >
      <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">운영 정책에 따라 내려간 저장소예요.</span>{' '}
        {model.takenDownReason}{' '}
        <span className="text-danger/80">
          소유자와 운영자만 볼 수 있고, 편집과 다운로드는 막혀 있어요.
        </span>
      </p>
      {user?.role === 'admin' && (
        <Button
          size="sm"
          variant="secondary"
          isLoading={restore.isPending}
          onClick={() => restore.mutate()}
        >
          복구하기
        </Button>
      )}
    </div>
  );
}
