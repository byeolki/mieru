import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import type { IssueKind } from '@mieru/shared';
import { MarkdownEditor } from '../../design/MarkdownEditor.js';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { TextField } from '../../design/ui/TextField.js';
import { ApiError } from '../../lib/api-error.js';
import { useAuth } from '../../lib/auth-store.js';
import { errorMessage } from '../../lib/error-message.js';
import { useRepo } from '../repo/RepoLayout.js';
import { createIssue, issueKeys } from './api.js';
import { KIND_LABELS, NodeChip } from './labels.js';

const KIND_HINTS: Record<IssueKind, string> = {
  bug: '잘못된 동작이나 깨진 부분',
  question: '사용법이나 구조에 대한 질문',
  feedback: '제안이나 감상',
};

export function NewIssuePage() {
  const { t } = useTranslation();
  const { model } = useRepo();
  const { status } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [nodeRef, setNodeRef] = useState<string | null>(searchParams.get('nodeRef'));
  const [kind, setKind] = useState<IssueKind>(nodeRef ? 'bug' : 'question');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const create = useMutation({
    mutationFn: () =>
      createIssue(model.id, { kind, title: title.trim(), body, ...(nodeRef ? { nodeRef } : {}) }),
    onSuccess: (issue) => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.all(model.id) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.nodeCounts(model.id) });
      void navigate(`/m/${model.id}/issues/${issue.number}`, { replace: true });
    },
  });
  if (status === 'signed-out')
    return (
      <Navigate to={`/login?next=${encodeURIComponent(`/m/${model.id}/issues/new`)}`} replace />
    );

  const failure =
    create.error instanceof ApiError && create.error.code === 'unknown_node'
      ? '이 노드는 현재 버전에 없어요. 노드 연결을 빼고 다시 시도해주세요.'
      : create.isError
        ? errorMessage(create.error, t)
        : null;

  return (
    <div className="mx-auto max-w-[760px] px-5 py-8">
      <h2 className="text-lg font-bold">새 이슈</h2>
      <form
        className="mt-6 grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) create.mutate();
        }}
      >
        {failure && <Alert>{failure}</Alert>}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">종류</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(KIND_LABELS) as IssueKind[]).map((value) => (
              <label
                key={value}
                className={clsx(
                  'cursor-pointer rounded-xl border p-3 transition-colors',
                  kind === value
                    ? 'border-primary ring-4 ring-primary/10'
                    : 'border-fog bg-surface hover:border-lilac',
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={value}
                  checked={kind === value}
                  onChange={() => setKind(value)}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold">{KIND_LABELS[value]}</span>
                <span className="mt-0.5 block text-xs text-slate">{KIND_HINTS[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {nodeRef && (
          <div className="flex items-center gap-2 rounded-xl bg-haze px-3.5 py-2.5 text-sm">
            <span className="text-slate">연결된 노드</span>
            <NodeChip nodeRef={nodeRef} />
            <button
              type="button"
              onClick={() => setNodeRef(null)}
              className="ml-auto grid size-7 place-items-center rounded-md text-slate hover:bg-surface"
              aria-label="노드 연결 빼기"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <TextField
          label="제목"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <MarkdownEditor
          label="내용"
          value={body}
          onChange={setBody}
          rows={10}
          placeholder="무엇을 봤고, 무엇을 기대했는지 적어주세요."
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void navigate(-1)}>
            취소
          </Button>
          <Button type="submit" isLoading={create.isPending} disabled={!title.trim()}>
            이슈 열기
          </Button>
        </div>
      </form>
    </div>
  );
}
