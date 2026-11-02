import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen, Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type { Issue, Reply, UserRef } from '@mieru/shared';
import { Avatar } from '../../components/Avatar.js';
import { Badge } from '../../components/Badge.js';
import { Markdown } from '../../design/Markdown.js';
import { MarkdownEditor } from '../../design/MarkdownEditor.js';
import { Button, ButtonLink } from '../../design/ui/Button.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { useAuth } from '../../lib/auth-store.js';
import { errorMessage } from '../../lib/error-message.js';
import { formatRelative } from '../../lib/format.js';
import { useRepo } from '../repo/RepoLayout.js';
import {
  createReply,
  deleteIssue,
  deleteReply,
  getIssue,
  issueKeys,
  updateIssue,
  updateReply,
} from './api.js';
import { KindLabel, NodeChip, StateIcon } from './labels.js';

function AuthorName({ author }: { author: UserRef | null }) {
  return <span className="font-semibold">{author ? author.displayName : '탈퇴한 사용자'}</span>;
}

function CommentBox({
  author,
  createdAt,
  actions,
  children,
}: {
  author: UserRef | null;
  createdAt: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="flex gap-3">
      {author ? (
        <Avatar
          username={author.username}
          displayName={author.displayName}
          size={34}
          className="mt-1"
        />
      ) : (
        <span className="mt-1 size-[34px] shrink-0 rounded-full bg-fog" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 overflow-hidden rounded-(--radius-panel) border border-fog bg-surface">
        <header className="flex items-center gap-2 border-b border-fog bg-paper px-4 py-2 text-sm">
          <AuthorName author={author} />
          <span className="text-xs text-slate">{formatRelative(createdAt)}</span>
          <span className="ml-auto flex items-center gap-1">{actions}</span>
        </header>
        <div className="px-4 py-3">{children}</div>
      </div>
    </article>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-md text-slate hover:bg-haze hover:text-sumi"
    >
      {children}
    </button>
  );
}

function ReplyItem({ reply, modelId, number }: { reply: Reply; modelId: string; number: number }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: issueKeys.detail(modelId, number) });
  const save = useMutation({
    mutationFn: () => updateReply(modelId, number, reply.id, draft),
    onSuccess: () => {
      setIsEditing(false);
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteReply(modelId, number, reply.id),
    onSuccess: refresh,
  });
  if (reply.deleted) {
    return (
      <p className="ml-[46px] rounded-xl border border-dashed border-fog px-4 py-2.5 text-sm text-slate">
        삭제된 답글이에요.
      </p>
    );
  }
  return (
    <CommentBox
      author={reply.author}
      createdAt={reply.createdAt}
      actions={
        <>
          {reply.canEdit && (
            <IconAction label="답글 수정" onClick={() => setIsEditing(true)}>
              <Pencil className="size-3.5" />
            </IconAction>
          )}
          {reply.canDelete && (
            <IconAction label="답글 삭제" onClick={() => remove.mutate()}>
              <Trash2 className="size-3.5" />
            </IconAction>
          )}
        </>
      }
    >
      {isEditing ? (
        <div className="grid gap-2">
          <MarkdownEditor label="답글 수정" value={draft} onChange={setDraft} rows={4} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
              취소
            </Button>
            <Button
              size="sm"
              isLoading={save.isPending}
              disabled={!draft.trim()}
              onClick={() => save.mutate()}
            >
              저장
            </Button>
          </div>
        </div>
      ) : (
        <Markdown source={reply.body} className="markdown-body text-[0.95rem]" />
      )}
    </CommentBox>
  );
}

function Composer({ issue, modelId }: { issue: Issue; modelId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const send = useMutation({
    mutationFn: () => createReply(modelId, issue.number, body.trim()),
    onSuccess: (updated) => {
      setBody('');
      queryClient.setQueryData(issueKeys.detail(modelId, issue.number), updated);
      void queryClient.invalidateQueries({ queryKey: issueKeys.all(modelId) });
    },
  });
  return (
    <div className="ml-[46px] rounded-(--radius-panel) border border-fog bg-surface p-4">
      <MarkdownEditor
        label="답글 쓰기"
        value={body}
        onChange={setBody}
        rows={4}
        placeholder="의견을 남겨주세요."
      />
      {send.isError && <p className="mt-2 text-sm text-danger">{errorMessage(send.error, t)}</p>}
      <div className="mt-3 flex justify-end">
        <Button isLoading={send.isPending} disabled={!body.trim()} onClick={() => send.mutate()}>
          답글 달기
        </Button>
      </div>
    </div>
  );
}

export function IssueThreadPage() {
  const { model } = useRepo();
  const { number: numberParam = '' } = useParams();
  const number = Number(numberParam);
  const { status } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const issue = useQuery({
    queryKey: issueKeys.detail(model.id, number),
    queryFn: () => getIssue(model.id, number),
  });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const apply = (updated: Issue) => {
    queryClient.setQueryData(issueKeys.detail(model.id, number), updated);
    void queryClient.invalidateQueries({ queryKey: issueKeys.all(model.id) });
    void queryClient.invalidateQueries({ queryKey: issueKeys.nodeCounts(model.id) });
  };
  const update = useMutation({
    mutationFn: (body: Parameters<typeof updateIssue>[2]) => updateIssue(model.id, number, body),
    onSuccess: apply,
  });
  const remove = useMutation({
    mutationFn: () => deleteIssue(model.id, number),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.all(model.id) });
      void navigate(`/m/${model.id}/issues`, { replace: true });
    },
  });

  if (issue.isPending)
    return (
      <div className="grid place-items-center py-20 text-lilac">
        <Spinner className="size-6" />
      </div>
    );
  if (issue.isError) return <p className="p-10 text-sm text-danger">이슈를 불러오지 못했어요.</p>;
  const data = issue.data;

  return (
    <div className="mx-auto max-w-[860px] px-5 py-8">
      <Link to={`/m/${model.id}/issues`} className="text-sm text-slate hover:text-primary">
        ← 이슈 목록
      </Link>
      <h2 className="mt-3 text-xl leading-snug font-bold">
        {data.title} <span className="font-normal text-slate">#{data.number}</span>
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate">
        <Badge
          tone={data.state === 'open' ? 'pink' : 'neutral'}
          icon={<StateIcon state={data.state} className="size-3" />}
        >
          {data.state === 'open' ? '열림' : '닫힘'}
        </Badge>
        <KindLabel kind={data.kind} />
        {data.locked && <Badge icon={<Lock className="size-3" aria-hidden="true" />}>잠김</Badge>}
        {data.nodeRef && (
          <Link
            to={`/m/${model.id}/graph?node=${encodeURIComponent(data.nodeRef)}`}
            className="hover:opacity-80"
          >
            <NodeChip nodeRef={data.nodeRef} />
          </Link>
        )}
        <span>답글 {data.replyCount}</span>
      </div>

      <div className="mt-8 grid gap-4">
        {data.deleted ? (
          <p className="rounded-xl border border-dashed border-fog px-4 py-3 text-sm text-slate">
            삭제된 이슈예요.
          </p>
        ) : (
          <CommentBox
            author={data.author}
            createdAt={data.createdAt}
            actions={
              <>
                {data.canEdit && (
                  <IconAction
                    label="이슈 수정"
                    onClick={() => {
                      setDraft(data.body);
                      setIsEditing(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </IconAction>
                )}
              </>
            }
          >
            {isEditing ? (
              <div className="grid gap-2">
                <MarkdownEditor label="이슈 내용 수정" value={draft} onChange={setDraft} rows={6} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                    취소
                  </Button>
                  <Button
                    size="sm"
                    isLoading={update.isPending}
                    onClick={() =>
                      update.mutate({ body: draft }, { onSuccess: () => setIsEditing(false) })
                    }
                  >
                    저장
                  </Button>
                </div>
              </div>
            ) : data.body.trim() ? (
              <Markdown source={data.body} className="markdown-body text-[0.95rem]" />
            ) : (
              <p className="text-sm text-slate">내용 없음</p>
            )}
          </CommentBox>
        )}

        {data.replies.map((reply) => (
          <ReplyItem key={reply.id} reply={reply} modelId={model.id} number={number} />
        ))}

        {data.state === 'closed' && data.closedAt && (
          <p className="ml-[46px] flex items-center gap-2 text-sm text-slate">
            <StateIcon state="closed" className="size-4" />
            {data.closedBy?.displayName ?? '누군가'}님이 {formatRelative(data.closedAt)} 닫았어요
          </p>
        )}

        {!data.deleted && (data.canEdit || data.canModerate) && (
          <div className="ml-[46px] flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              isLoading={update.isPending}
              onClick={() => update.mutate({ state: data.state === 'open' ? 'closed' : 'open' })}
            >
              {data.state === 'open' ? '이슈 닫기' : '다시 열기'}
            </Button>
            {data.canModerate && (
              <Button
                variant="ghost"
                size="sm"
                icon={data.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                onClick={() => update.mutate({ locked: !data.locked })}
              >
                {data.locked ? '잠금 풀기' : '대화 잠그기'}
              </Button>
            )}
            {(data.canModerate || (data.canEdit && data.replyCount === 0)) && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-4" />}
                onClick={() => remove.mutate()}
              >
                이슈 삭제
              </Button>
            )}
          </div>
        )}

        {data.canReply ? (
          <Composer issue={data} modelId={model.id} />
        ) : status === 'signed-out' ? (
          <div className="ml-[46px]">
            <ButtonLink
              variant="secondary"
              to={`/login?next=${encodeURIComponent(`/m/${model.id}/issues/${number}`)}`}
            >
              로그인하고 답글 달기
            </ButtonLink>
          </div>
        ) : data.locked ? (
          <p className="ml-[46px] text-sm text-slate">
            대화가 잠겨 있어서 편집 권한이 있는 사람만 답글을 달 수 있어요.
          </p>
        ) : null}
      </div>
    </div>
  );
}
