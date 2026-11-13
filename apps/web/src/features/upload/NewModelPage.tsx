import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2, FileUp, Globe, Link2, Lock, Pause, Play, Users, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  MODEL_DESCRIPTION_MAX,
  README_MAX_BYTES,
  utf8ByteLength,
  type Visibility,
} from '@mieru/shared';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { TextField, inputClasses } from '../../design/ui/TextField.js';
import { errorMessage } from '../../lib/error-message.js';
import { formatBytes } from '../../lib/format.js';
import { createModel } from '../models/api.js';
import { AppShell, PageHeader } from '../shell/AppShell.js';
import { FILE_SPLIT_ERRORS, splitModelFiles } from './model-files.js';
import { useModelUpload, type UploadState } from './useModelUpload.js';
import { useTranslation } from 'react-i18next';
import { modelPath } from '../../lib/model-path.js';

const LICENSES = [
  ['', '선택 안 함'],
  ['apache-2.0', 'Apache 2.0'],
  ['mit', 'MIT'],
  ['bsd-3-clause', 'BSD 3-Clause'],
  ['cc-by-4.0', 'CC BY 4.0'],
  ['cc-by-nc-4.0', 'CC BY-NC 4.0'],
  ['openrail', 'OpenRAIL'],
  ['other', '기타'],
] as const;

const VISIBILITY_OPTIONS: { value: Visibility; title: string; body: string; icon: ReactNode }[] = [
  {
    value: 'private',
    title: '비공개',
    body: '나만 볼 수 있어요.',
    icon: <Lock className="size-4" />,
  },
  {
    value: 'users',
    title: '지정한 사람',
    body: '공유한 사람만 볼 수 있어요.',
    icon: <Users className="size-4" />,
  },
  {
    value: 'link',
    title: '링크가 있는 사람',
    body: '링크를 아는 사람도 볼 수 있어요.',
    icon: <Link2 className="size-4" />,
  },
  {
    value: 'public',
    title: '공개',
    body: '둘러보기에 올라가고 누구나 볼 수 있어요.',
    icon: <Globe className="size-4" />,
  },
];

const UPLOAD_ERRORS: Record<string, string> = {
  file_too_large:
    '파일이 너무 커요. ONNX는 2GB, safetensors와 외부 데이터 파일은 10GB까지 올릴 수 있어요.',
  unsupported_format:
    '.onnx나 .safetensors 파일만 올릴 수 있어요. PyTorch(.pt) 모델은 ONNX로 변환해서 올려주세요.',
  server_storage_low: '지금은 서버 저장 공간이 부족해요. 잠시 뒤에 다시 시도해주세요.',
  network: '연결이 끊겼어요. 다시 이어서 올려볼게요.',
};

function readmeTemplate(name: string) {
  return `# ${name || '모델 이름'}\n\n한 줄로 이 모델을 소개해주세요.\n\n## 용도\n\n## 학습 데이터\n\n## 평가\n\n## 제한 사항\n`;
}

function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsOver(false);
    const files = [...event.dataTransfer.files];
    if (files.length > 0) onFiles(files);
  };
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={onDrop}
      className={clsx(
        'rounded-(--radius-panel) border-[1.5px] border-dashed px-6 py-12 text-center transition-colors',
        isOver ? 'border-primary bg-haze' : 'border-lilac bg-surface hover:bg-haze/40',
      )}
    >
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-haze text-primary">
        <FileUp className="size-5" aria-hidden="true" />
      </div>
      <p className="mt-4 font-semibold">모델 파일을 여기에 끌어다 놓으세요</p>
      <p className="mt-1 text-sm text-slate">.onnx (최대 2GB) · .safetensors (최대 10GB)</p>
      <p className="mt-1 text-xs text-slate">
        ONNX 옆에 <span className="font-mono">.data</span> 같은 외부 데이터 파일이 있으면 같이
        골라주세요.
      </p>
      <Button variant="secondary" className="mt-5" onClick={() => inputRef.current?.click()}>
        파일 고르기
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        aria-label="모델 파일"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length > 0) onFiles(files);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function UploadProgress({
  file,
  dataFiles,
  state,
  onPause,
  onResume,
  onCancel,
}: {
  file: File;
  dataFiles: readonly File[];
  state: UploadState;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const totalBytes = dataFiles.reduce((sum, data) => sum + data.size, file.size);
  const sent =
    state.phase === 'uploading' || state.phase === 'paused'
      ? state.sent
      : state.phase === 'done'
        ? state.total
        : 0;
  const percent = Math.round((sent / Math.max(totalBytes, 1)) * 100);
  return (
    <div className="rounded-(--radius-panel) border border-fog bg-surface p-5 shadow-(--shadow-soft)">
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-haze text-primary">
          {state.phase === 'done' ? (
            <CheckCircle2 className="size-5" aria-hidden="true" />
          ) : (
            <FileUp className="size-5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {file.name}
            {dataFiles.length > 0 && (
              <span className="font-normal text-slate"> + 외부 데이터 {dataFiles.length}개</span>
            )}
          </p>
          <p className="tabular text-xs text-slate">
            {state.phase === 'done'
              ? `${formatBytes(totalBytes)} · 업로드 완료`
              : `${formatBytes(sent)} / ${formatBytes(totalBytes)} · ${percent}%`}
            {state.phase === 'paused' && ' · 일시정지됨'}
            {state.phase === 'uploading' && dataFiles.length > 0 && ` · ${state.currentFile}`}
          </p>
        </div>
        {state.phase === 'uploading' && (
          <Button size="sm" variant="ghost" icon={<Pause className="size-4" />} onClick={onPause}>
            일시정지
          </Button>
        )}
        {state.phase === 'paused' && (
          <Button size="sm" variant="ghost" icon={<Play className="size-4" />} onClick={onResume}>
            이어서 올리기
          </Button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="grid size-8 place-items-center rounded-md text-slate hover:bg-haze hover:text-sumi"
          aria-label="다른 파일 고르기"
        >
          <X className="size-4" />
        </button>
      </div>
      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-fog"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="업로드 진행률"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
      <div>
        <p className="text-xs font-medium text-slate">{step}단계</p>
        <h2 className="mt-0.5 font-semibold">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function NewModelPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const descriptionId = useId();
  const readmeId = useId();
  const licenseId = useId();
  const readmeFileRef = useRef<HTMLInputElement>(null);
  const upload = useModelUpload();
  const [files, setFiles] = useState<{ model: File; dataFiles: File[] } | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [license, setLicense] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [publicAllowDownload, setPublicAllowDownload] = useState(true);
  const [readme, setReadme] = useState('');

  const create = useMutation({
    mutationFn: () => {
      if (upload.state.phase !== 'done') throw new Error('Upload not finished');
      return createModel({
        uploadId: upload.state.uploadId,
        dataUploadIds: upload.state.dataUploadIds,
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(readme.trim() ? { readme } : {}),
        ...(license ? { license } : {}),
        visibility,
        publicAllowDownload,
      });
    },
    onSuccess: (model) => navigate(modelPath(model)),
  });

  const pickFiles = (picked: File[]) => {
    const split = splitModelFiles(picked);
    if (!split.ok) {
      setPickError(FILE_SPLIT_ERRORS[split.reason]);
      return;
    }
    setPickError(null);
    setFiles({ model: split.model, dataFiles: split.dataFiles });
    if (!name) setName(split.model.name.replace(/\.(onnx|safetensors)$/i, ''));
    upload.start(split.model, split.dataFiles);
  };

  const readmeTooLarge = utf8ByteLength(readme) > README_MAX_BYTES;
  const canSubmit = upload.state.phase === 'done' && name.trim().length > 0 && !readmeTooLarge;

  return (
    <AppShell>
      <PageHeader title="새 모델 올리기" />
      <form
        className="grid max-w-4xl gap-10"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) create.mutate();
        }}
      >
        <Section step={1} title="파일">
          {files ? (
            <UploadProgress
              file={files.model}
              dataFiles={files.dataFiles}
              state={upload.state}
              onPause={upload.pause}
              onResume={upload.resume}
              onCancel={() => {
                upload.reset();
                setFiles(null);
              }}
            />
          ) : (
            <Dropzone onFiles={pickFiles} />
          )}
          {pickError && (
            <div className="mt-3">
              <Alert>{pickError}</Alert>
            </div>
          )}
          {upload.state.phase === 'error' && (
            <div className="mt-3">
              <Alert>{UPLOAD_ERRORS[upload.state.code] ?? upload.state.message}</Alert>
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-slate">
            올리는 동안 아래 정보를 채워도 돼요. 업로드가 끊기면 같은 파일을 다시 고르면 이어서
            올라가요.
          </p>
        </Section>

        <Section step={2} title="정보">
          <div className="grid gap-5">
            <TextField
              label="이름"
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <div>
              <label htmlFor={descriptionId} className="mb-1.5 block text-sm font-medium">
                한 줄 소개 <span className="font-normal text-slate">(선택)</span>
              </label>
              <input
                id={descriptionId}
                className={inputClasses(false)}
                value={description}
                maxLength={MODEL_DESCRIPTION_MAX}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="예: ImageNet으로 학습한 ResNet-50"
              />
            </div>
            <div>
              <label htmlFor={licenseId} className="mb-1.5 block text-sm font-medium">
                라이선스 <span className="font-normal text-slate">(선택)</span>
              </label>
              <select
                id={licenseId}
                className={inputClasses(false)}
                value={license}
                onChange={(event) => setLicense(event.target.value)}
              >
                {LICENSES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        <Section step={3} title="공개 범위">
          <fieldset>
            <legend className="sr-only">공개 범위</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {VISIBILITY_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={clsx(
                    'flex cursor-pointer gap-3 rounded-(--radius-panel) border bg-surface p-4 transition-colors',
                    visibility === option.value
                      ? 'border-primary ring-4 ring-primary/10'
                      : 'border-fog hover:border-lilac',
                  )}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={option.value}
                    checked={visibility === option.value}
                    onChange={() => setVisibility(option.value)}
                    className="sr-only"
                  />
                  <span
                    className={clsx(
                      'mt-0.5',
                      visibility === option.value ? 'text-primary' : 'text-slate',
                    )}
                  >
                    {option.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{option.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate">{option.body}</span>
                  </span>
                </label>
              ))}
            </div>
            {visibility === 'public' && (
              <label className="mt-4 flex items-start gap-3 rounded-(--radius-control) bg-haze px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={publicAllowDownload}
                  onChange={(event) => setPublicAllowDownload(event.target.checked)}
                  className="mt-0.5 size-4 accent-[#BC3D86]"
                />
                <span>
                  <span className="font-medium">누구나 원본 파일을 다운로드할 수 있게 하기</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate">
                    끄면 "보기 전용"이 돼요. 학습된 가중치는 지켜지지만, 그래프로 구조는 그대로
                    보여요.
                  </span>
                </span>
              </label>
            )}
          </fieldset>
        </Section>

        <Section step={4} title="README">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={readmeId} className="text-sm font-medium">
              모델 소개 문서 <span className="font-normal text-slate">(Markdown, 선택)</span>
            </label>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setReadme(readmeTemplate(name))}>
                템플릿 넣기
              </Button>
              <Button size="sm" variant="ghost" onClick={() => readmeFileRef.current?.click()}>
                README.md 불러오기
              </Button>
              <input
                ref={readmeFileRef}
                type="file"
                accept=".md,.markdown,text/markdown,text/plain"
                className="sr-only"
                aria-label="README 파일"
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  if (picked) void picked.text().then(setReadme);
                  event.target.value = '';
                }}
              />
            </div>
          </div>
          <textarea
            id={readmeId}
            value={readme}
            onChange={(event) => setReadme(event.target.value)}
            rows={10}
            placeholder="# 모델 이름&#10;&#10;어떤 모델인지, 어떻게 쓰는지 적어주세요."
            className={clsx(
              inputClasses(readmeTooLarge),
              'h-auto py-3 font-mono text-sm leading-6',
            )}
          />
          {readmeTooLarge && (
            <p className="mt-1.5 text-sm text-danger">README는 256KB까지 쓸 수 있어요.</p>
          )}
        </Section>

        <div className="flex items-center justify-end gap-3 border-t border-fog pt-6">
          {create.isError && (
            <p className="mr-auto text-sm text-danger">{errorMessage(create.error, t)}</p>
          )}
          <Button type="submit" size="lg" isLoading={create.isPending} disabled={!canSubmit}>
            {upload.state.phase === 'done' ? '모델 만들기' : '업로드가 끝나면 만들 수 있어요'}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
