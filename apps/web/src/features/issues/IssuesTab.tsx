import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { MessageSquare, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { IssueKind, IssueState } from '@mieru/shared';
import { Avatar } from '../../components/Avatar.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { useAuth } from '../../lib/auth-store.js';
import { formatRelative } from '../../lib/format.js';
import { useRepo } from '../repo/RepoLayout.js';
import { issueKeys, listIssues } from './api.js';
import { KIND_LABELS, KindLabel, NodeChip, StateIcon } from './labels.js';
import { modelPath } from '../../lib/model-path.js';

export function IssuesTab() {
  const { model } = useRepo();
  const { status } = useAuth();
  const [state, setState] = useState<IssueState>('open');
  const [kind, setKind] = useState<IssueKind | null>(null);
  const issues = useQuery({
    queryKey: issueKeys.list(model.id, state, kind),
    queryFn: () => listIssues(model.id, state, kind),
  });
  const counts = issues.data?.counts;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div
          className="flex rounded-(--radius-control) border border-fog bg-surface p-0.5"
          role="group"
          aria-label="상태"
        >
          {(['open', 'closed'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={state === value}
              onClick={() => setState(value)}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm',
                state === value ? 'bg-haze font-medium text-sumi' : 'text-slate hover:text-sumi',
              )}
            >
              <StateIcon state={value} className="size-3.5" />
              {value === 'open' ? '열림' : '닫힘'}
              {counts && <span className="tabular text-xs text-slate">{counts[value]}</span>}
            </button>
          ))}
        </div>
        <select
          aria-label="종류"
          value={kind ?? ''}
          onChange={(event) => setKind((event.target.value || null) as IssueKind | null)}
          className="h-9 rounded-(--radius-control) border border-fog bg-surface px-3 text-sm hover:border-lilac focus:border-primary focus:outline-none"
        >
          <option value="">모든 종류</option>
          {(Object.keys(KIND_LABELS) as IssueKind[]).map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          {status === 'signed-in' ? (
            <ButtonLink to={`${modelPath(model)}/issues/new`} icon={<Plus className="size-4" />}>
              이슈 열기
            </ButtonLink>
          ) : (
            <ButtonLink
              to={`/login?next=${encodeURIComponent(`${modelPath(model)}/issues/new`)}`}
              variant="secondary"
            >
              로그인하고 이슈 열기
            </ButtonLink>
          )}
        </div>
      </div>

      {issues.isPending ? (
        <div
          className="grid place-items-center py-16 text-lilac"
          role="status"
          aria-label="불러오는 중"
        >
          <Spinner className="size-6" />
        </div>
      ) : issues.isError ? (
        <p className="text-sm text-danger">이슈를 불러오지 못했어요.</p>
      ) : issues.data.items.length === 0 ? (
        <div className="rounded-(--radius-panel) border border-dashed border-lilac px-8 py-14 text-center">
          <MessageSquare className="mx-auto size-6 text-slate" aria-hidden="true" />
          <p className="mt-3 font-semibold">
            {state === 'open' ? '열린 이슈가 없어요' : '닫힌 이슈가 없어요'}
          </p>
          <p className="mt-1 text-sm text-slate">
            버그나 질문, 피드백이 있으면 이슈로 남겨주세요. 그래프의 노드에 연결할 수도 있어요.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-fog overflow-hidden rounded-(--radius-panel) border border-fog bg-surface">
          {issues.data.items.map((issue) => (
            <li key={issue.number}>
              <Link
                to={`${modelPath(model)}/issues/${issue.number}`}
                className="flex items-start gap-3 px-5 py-3.5 hover:bg-haze/40"
              >
                <StateIcon state={issue.state} className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{issue.title}</span>
                    <KindLabel kind={issue.kind} />
                    {issue.nodeRef && <NodeChip nodeRef={issue.nodeRef} />}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate">
                    #{issue.number} ·
                    {issue.author ? (
                      <>
                        <Avatar
                          username={issue.author.username}
                          displayName={issue.author.displayName}
                          size={16}
                        />
                        {issue.author.displayName}
                      </>
                    ) : (
                      '탈퇴한 사용자'
                    )}
                    · {formatRelative(issue.createdAt)}
                  </p>
                </div>
                {issue.replyCount > 0 && (
                  <span className="tabular flex items-center gap-1 text-xs text-slate">
                    <MessageSquare className="size-3.5" aria-hidden="true" />
                    {issue.replyCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
