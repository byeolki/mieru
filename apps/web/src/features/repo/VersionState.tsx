import { CircleAlert } from 'lucide-react';
import type { ModelDetail } from '@mieru/shared';
import { Sparkle } from '../../design/Sparkle.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { FAILURE_REASONS } from '../models/labels.js';

/** Shown instead of a view while the first version is processing or after it failed. */
export function VersionState({ model }: { model: ModelDetail }) {
  const latest = model.latestVersion;
  if (model.currentVersion || !latest) return null;
  if (latest.status === 'processing') {
    return (
      <div
        className="haze-tone relative mx-auto my-10 max-w-xl overflow-hidden rounded-(--radius-sheet) px-8 py-14 text-center"
        role="status"
      >
        <Sparkle className="absolute top-6 left-10 size-5" color="var(--color-mieru-pink)" />
        <Spinner className="mx-auto size-7 text-primary" />
        <h2 className="mt-5 font-semibold">모델을 분석하고 있어요</h2>
        <p className="mt-2 text-sm leading-6 text-slate">
          {latest.originalName} 파일의 구조를 읽는 중이에요. 큰 파일은 1~2분 걸릴 수 있어요. 이
          화면은 끝나면 저절로 바뀌어요.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto my-10 max-w-xl rounded-(--radius-panel) border border-danger/25 bg-surface px-8 py-10">
      <CircleAlert className="size-6 text-danger" aria-hidden="true" />
      <h2 className="mt-4 font-semibold">이 파일은 분석하지 못했어요</h2>
      <p className="mt-2 text-sm leading-6 text-slate">
        {FAILURE_REASONS[latest.failureReason ?? 'internal'] ?? FAILURE_REASONS.internal}
      </p>
      <p className="mt-3 font-mono text-xs text-slate">
        {latest.originalName} · {latest.failureReason}
      </p>
    </div>
  );
}
