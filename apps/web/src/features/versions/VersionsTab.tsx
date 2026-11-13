import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CircleAlert, FileUp, GitCompare, Network, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { hasRoleAtLeast, type VersionListItem } from '@mieru/shared';
import { Avatar } from '../../components/Avatar.js';
import { Badge } from '../../components/Badge.js';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { ConfirmDialog } from '../../design/ui/ConfirmDialog.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { errorMessage } from '../../lib/error-message.js';
import { formatBytes, formatParams, formatRelative } from '../../lib/format.js';
import { modelKeys } from '../models/api.js';
import { FAILURE_REASONS } from '../models/labels.js';
import { useRepo } from '../repo/RepoLayout.js';
import { FILE_SPLIT_ERRORS, splitModelFiles } from '../upload/model-files.js';
import { useModelUpload } from '../upload/useModelUpload.js';
import { createVersion, deleteVersion, listVersions, versionKeys } from './api.js';
import { modelPath } from '../../lib/model-path.js';

const ACCEPTED_EXTENSIONS = { onnx: '.onnx', safetensors: '.safetensors' } as const;

function UsageMeter({ used, limit }: { used: number; limit: number }) {
  const ratio = Math.min(used / limit, 1);
  return (
    <div className="w-56">
      <div className="flex justify-between text-xs text-slate">
        <span>저장소 용량</span>
        <span className="tabular">
          {formatBytes(used)} / {formatBytes(limit)}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fog"
        role="meter"
        aria-label="저장소 용량"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div
          className={clsx('h-full rounded-full', ratio > 0.9 ? 'bg-danger' : 'bg-primary')}
          style={{ width: `${String(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

function NewVersionPanel({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const { model } = useRepo();
  const upload = useModelUpload({ targetModelId: model.id });
  const [note, setNote] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (files: { uploadId: string; dataUploadIds: string[] }) =>
      createVersion(model.id, files, note),
    onSuccess: () => {
      upload.clear();
      setNote('');
      onCreated();
    },
  });
  const state = upload.state;
  const accept = model.format ? ACCEPTED_EXTENSIONS[model.format] : '.onnx,.safetensors';
  return (
    <section
      className="rounded-(--radius-panel) border border-fog bg-surface p-4"
      aria-labelledby="new-version"
    >
      <h2 id="new-version" className="text-sm font-semibold">
        새 버전 올리기
      </h2>
      <p className="mt-1 text-xs text-slate">
        같은 형식({accept}) 파일만 올릴 수 있어요. 외부 데이터 파일이 있으면 같이 골라주세요. 처리가
        끝나면 새 버전이 현재 버전이 돼요.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className="grid gap-1.5 text-sm">
          파일
          {state.phase === 'idle' || state.phase === 'error' ? (
            <input
              type="file"
              multiple
              aria-label="새 버전 파일"
              onChange={(event) => {
                const split = splitModelFiles([...(event.target.files ?? [])]);
                if (!split.ok) {
                  setPickError(FILE_SPLIT_ERRORS[split.reason]);
                  return;
                }
                setPickError(null);
                upload.start(split.model, split.dataFiles);
              }}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-fog file:bg-surface file:px-3 file:py-1.5 file:text-sm"
            />
          ) : (
            <span className="flex h-9 items-center gap-2 text-sm text-slate">
              {state.phase === 'done' ? (
                <>업로드 완료 · {formatBytes(state.total)}</>
              ) : (
                <>
                  <Spinner className="size-4 text-lilac" />
                  {formatBytes(state.sent)} / {formatBytes(state.total)}
                </>
              )}
            </span>
          )}
        </label>
        <label className="grid gap-1.5 text-sm">
          변경 메모 <span className="sr-only">(선택)</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="예) 학습률 낮춰서 다시 학습"
            className="h-9 rounded-md border border-fog bg-surface px-3 text-sm placeholder:text-slate focus:border-primary focus:outline-none"
          />
        </label>
        <Button
          disabled={state.phase !== 'done'}
          isLoading={create.isPending}
          onClick={() =>
            state.phase === 'done' &&
            create.mutate({ uploadId: state.uploadId, dataUploadIds: state.dataUploadIds })
          }
        >
          버전 만들기
        </Button>
      </div>
      {state.phase === 'error' && (
        <div className="mt-3">
          <Alert>{state.message}</Alert>
        </div>
      )}
      {pickError && (
        <div className="mt-3">
          <Alert>{pickError}</Alert>
        </div>
      )}
      {create.isError && (
        <div className="mt-3">
          <Alert>{errorMessage(create.error, t)}</Alert>
        </div>
      )}
    </section>
  );
}

function StatusCell({ version }: { version: VersionListItem }) {
  if (version.status === 'processing') {
    return (
      <Badge tone="progress" icon={<Spinner className="size-3" />}>
        분석 중
      </Badge>
    );
  }
  if (version.status === 'failed') {
    return (
      <span
        title={
          [FAILURE_REASONS[version.failureReason ?? ''], version.failureDetail]
            .filter(Boolean)
            .join(' · ') || undefined
        }
      >
        <Badge tone="danger" icon={<CircleAlert className="size-3" aria-hidden="true" />}>
          분석 실패
        </Badge>
      </span>
    );
  }
  return version.isCurrent ? <Badge tone="pink">현재</Badge> : null;
}

export function VersionsTab() {
  const { t } = useTranslation();
  const { model } = useRepo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const versions = useQuery({
    queryKey: versionKeys.list(model.id),
    queryFn: () => listVersions(model.id),
    refetchInterval: (current) =>
      current.state.data?.items.some((item) => item.status === 'processing') ? 2000 : false,
  });
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: versionKeys.list(model.id) });
    void queryClient.invalidateQueries({ queryKey: modelKeys.detail(model.id) });
  };
  const remove = useMutation({
    mutationFn: (number: number) => deleteVersion(model.id, number),
    onSuccess: () => {
      setPendingDelete(null);
      setSelected([]);
      refresh();
    },
  });

  if (versions.isPending)
    return <Loading className="mx-auto max-w-[1280px] px-4 py-10 text-lilac md:px-6" />;
  if (versions.isError) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 md:px-6">
        <ErrorState
          message="버전 목록을 불러오지 못했어요."
          onRetry={() => void versions.refetch()}
        />
      </div>
    );
  }

  const { items, usedBytes, limitBytes } = versions.data;
  const canEdit = hasRoleAtLeast(model.myAccess.role, 'editor');
  const isOwner = model.myAccess.role === 'owner';
  const toggle = (number: number) =>
    setSelected((current) =>
      current.includes(number)
        ? current.filter((value) => value !== number)
        : [...current.slice(-1), number],
    );
  const [older, newer] = [...selected].sort((a, b) => a - b);

  return (
    <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">버전 {items.length}개</h2>
          <p className="mt-1 text-sm text-slate">
            두 버전을 골라서 그래프와 가중치가 어떻게 달라졌는지 비교할 수 있어요.
          </p>
        </div>
        <div className="flex items-end gap-4">
          <UsageMeter used={usedBytes} limit={limitBytes} />
          <Button
            variant="secondary"
            icon={<GitCompare className="size-4" />}
            disabled={selected.length !== 2}
            onClick={() =>
              older !== undefined &&
              newer !== undefined &&
              void navigate(
                `${modelPath(model)}/versions/compare?from=${String(older)}&to=${String(newer)}`,
              )
            }
          >
            {selected.length === 2
              ? `v${String(older)} ↔ v${String(newer)} 비교`
              : '두 버전 골라서 비교'}
          </Button>
        </div>
      </div>

      {canEdit && <NewVersionPanel onCreated={refresh} />}

      <ul className="divide-y divide-fog overflow-hidden rounded-(--radius-panel) border border-fog bg-surface">
        {items.map((version) => (
          <li
            key={version.number}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5"
          >
            <input
              type="checkbox"
              className="size-4 accent-primary"
              aria-label={`v${String(version.number)} 비교에 넣기`}
              checked={selected.includes(version.number)}
              disabled={version.status !== 'ready'}
              onChange={() => toggle(version.number)}
            />
            <span className="w-10 font-mono text-sm font-medium">v{version.number}</span>
            <StatusCell version={version} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {version.note ?? <span className="text-slate">메모 없음</span>}
              </p>
              <p className="tabular mt-0.5 truncate text-xs text-slate">
                {version.originalName}
                {version.sizeBytes !== null && ` · ${formatBytes(version.sizeBytes)}`}
                {version.totalParams !== null && ` · ${formatParams(version.totalParams)} params`}
              </p>
            </div>
            <span className="flex items-center gap-2 text-xs text-slate">
              {version.createdBy && (
                <Avatar
                  username={version.createdBy.username}
                  displayName={version.createdBy.displayName}
                  avatarKey={version.createdBy.avatarKey}
                  size={20}
                />
              )}
              {formatRelative(version.createdAt)}
            </span>
            <div className="flex items-center gap-1">
              {version.status === 'ready' && (
                <Link
                  to={`${modelPath(model)}/graph${version.isCurrent ? '' : `?version=${String(version.number)}`}`}
                  aria-label={`v${String(version.number)} 그래프 보기`}
                  className="grid size-8 place-items-center rounded-md text-slate hover:bg-haze hover:text-sumi"
                >
                  <Network className="size-4" aria-hidden="true" />
                </Link>
              )}
              {isOwner && items.length > 1 && (
                <button
                  type="button"
                  aria-label={`v${String(version.number)} 삭제`}
                  onClick={() => setPendingDelete(version.number)}
                  className="grid size-8 place-items-center rounded-md text-slate hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {canEdit && items.length === 1 && (
        <p className="flex items-center gap-2 text-sm text-slate">
          <FileUp className="size-4" aria-hidden="true" />새 버전을 올리면 여기서 이전 버전과 비교할
          수 있어요.
        </p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`v${String(pendingDelete ?? '')}을 삭제할까요?`}
        description="이 버전의 파일과 분석 결과가 지워지고 되돌릴 수 없어요. 현재 버전을 지우면 바로 이전 버전이 현재 버전이 돼요."
        confirmLabel="버전 삭제"
        isPending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, t) : null}
        onConfirm={() => pendingDelete !== null && remove.mutate(pendingDelete)}
      />
    </div>
  );
}
