import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, Copy, Globe, Link2, Lock, Plus, Trash2, Users, X } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GrantableRole, ModelDetail, ShareLink, UserSummary, Visibility } from '@mieru/shared';
import { Avatar } from '../../components/Avatar.js';
import { Badge } from '../../components/Badge.js';
import { Button } from '../../design/ui/Button.js';
import { Dialog } from '../../design/ui/Dialog.js';
import { inputClasses } from '../../design/ui/TextField.js';
import { errorMessage } from '../../lib/error-message.js';
import { formatRelative } from '../../lib/format.js';
import { modelKeys, updateModel } from '../models/api.js';
import {
  createLink,
  listLinks,
  listShares,
  removeShare,
  revokeLink,
  searchUsers,
  sharingKeys,
  updateLink,
  upsertShare,
} from './api.js';

const ACCESS_OPTIONS: { value: Visibility; title: string; body: string; icon: ReactNode }[] = [
  {
    value: 'private',
    title: '비공개',
    body: '나만 볼 수 있어요. 추가한 사람과 링크는 잠시 멈춰요.',
    icon: <Lock className="size-4" />,
  },
  {
    value: 'users',
    title: '지정한 사람',
    body: '아래에 추가한 사람만 볼 수 있어요.',
    icon: <Users className="size-4" />,
  },
  {
    value: 'link',
    title: '링크가 있는 사람',
    body: '추가한 사람과 공유 링크를 가진 사람이 볼 수 있어요.',
    icon: <Link2 className="size-4" />,
  },
  {
    value: 'public',
    title: '공개',
    body: '둘러보기에 올라가고 누구나 볼 수 있어요.',
    icon: <Globe className="size-4" />,
  },
];

const ROLE_LABELS: Record<GrantableRole, string> = { viewer: '보기', editor: '편집' };
const EXPIRY_OPTIONS = [
  { label: '만료 없음', days: null },
  { label: '1일', days: 1 },
  { label: '7일', days: 7 },
  { label: '30일', days: 30 },
] as const;

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{children}</h3>
      {hint && <p className="mt-0.5 text-xs text-slate">{hint}</p>}
    </div>
  );
}

function RoleSelect({
  value,
  onChange,
  label,
}: {
  value: GrantableRole;
  onChange: (role: GrantableRole) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as GrantableRole)}
      className="h-8 rounded-lg border border-fog bg-surface px-2 text-xs hover:border-lilac focus:border-primary focus:outline-none"
    >
      <option value="viewer">보기</option>
      <option value="editor">편집</option>
    </select>
  );
}

function DownloadToggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={clsx(
        'flex items-center gap-1.5 text-xs',
        disabled ? 'text-slate/60' : 'text-slate',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 accent-[#BC3D86]"
        aria-label={label}
      />
      다운로드
    </label>
  );
}

function GeneralAccess({ model }: { model: ModelDetail }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: { visibility?: Visibility; publicAllowDownload?: boolean }) =>
      updateModel(model.id, body),
    onSuccess: (detail) => queryClient.setQueryData(modelKeys.detail(model.id), detail),
  });
  return (
    <section>
      <SectionTitle>누가 볼 수 있나요</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="공개 범위">
        {ACCESS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={model.visibility === option.value}
            onClick={() => mutation.mutate({ visibility: option.value })}
            className={clsx(
              'flex gap-2.5 rounded-xl border p-3 text-left transition-colors',
              model.visibility === option.value
                ? 'border-primary ring-4 ring-primary/10'
                : 'border-fog hover:border-lilac',
            )}
          >
            <span className={model.visibility === option.value ? 'text-primary' : 'text-slate'}>
              {option.icon}
            </span>
            <span>
              <span className="block text-sm font-semibold">{option.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate">{option.body}</span>
            </span>
          </button>
        ))}
      </div>
      {model.visibility === 'public' && (
        <label className="mt-3 flex items-start gap-3 rounded-xl bg-haze px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={model.publicAllowDownload}
            onChange={(event) => mutation.mutate({ publicAllowDownload: event.target.checked })}
            className="mt-0.5 size-4 accent-[#BC3D86]"
          />
          <span>
            <span className="font-medium">누구나 원본 파일 다운로드 허용</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate">
              끄면 보기 전용이에요. 가중치는 지켜지지만 그래프로 구조는 보여요.
            </span>
          </span>
        </label>
      )}
      {mutation.isError && (
        <p className="mt-2 text-xs text-danger">{errorMessage(mutation.error, t)}</p>
      )}
    </section>
  );
}

function PeoplePicker({ onPick }: { onPick: (user: UserSummary) => void }) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim().replace(/^@/, '')), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    queryKey: ['users', 'search', debounced],
    queryFn: () => searchUsers(debounced),
    enabled: debounced.length > 0,
  });
  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        사용자 이름으로 찾기
      </label>
      <input
        id={inputId}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="@사용자이름으로 찾기"
        autoComplete="off"
        className={clsx(inputClasses(false), 'h-10')}
      />
      {debounced && results.data && (
        <ul
          className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-fog bg-surface shadow-(--shadow-lift)"
          role="listbox"
          aria-label="사용자 검색 결과"
        >
          {results.data.length === 0 && (
            <li className="px-3.5 py-2.5 text-sm text-slate">찾는 사용자가 없어요.</li>
          )}
          {results.data.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(user);
                  setQuery('');
                  setDebounced('');
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-haze"
              >
                <Avatar username={user.username} displayName={user.displayName} size={26} />
                <span className="text-sm">
                  <span className="font-medium">{user.displayName}</span>{' '}
                  <span className="text-slate">@{user.username}</span>
                </span>
                <Plus className="ml-auto size-4 text-slate" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function People({ model }: { model: ModelDetail }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const shares = useQuery({
    queryKey: sharingKeys.shares(model.id),
    queryFn: () => listShares(model.id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: sharingKeys.shares(model.id) });
  const upsert = useMutation({
    mutationFn: (input: { username: string; role: GrantableRole; allowDownload: boolean }) =>
      upsertShare(model.id, input.username, input.role, input.allowDownload),
    onSuccess: (saved) => {
      queryClient.setQueryData(sharingKeys.shares(model.id), (current: typeof shares.data) => {
        const list = current ?? [];
        return list.some((share) => share.user.id === saved.user.id)
          ? list.map((share) => (share.user.id === saved.user.id ? saved : share))
          : [...list, saved];
      });
    },
  });
  const remove = useMutation({
    mutationFn: (username: string) => removeShare(model.id, username),
    onSuccess: refresh,
  });
  const isDormant = model.visibility === 'private';
  return (
    <section>
      <SectionTitle
        hint={
          isDormant
            ? '비공개 상태라 아래 사람들은 지금 볼 수 없어요.'
            : '사용자 이름으로 찾아서 권한을 정하세요.'
        }
      >
        사람
      </SectionTitle>
      <PeoplePicker
        onPick={(user) =>
          upsert.mutate({ username: user.username, role: 'viewer', allowDownload: true })
        }
      />
      {upsert.isError && (
        <p className="mt-2 text-xs text-danger">{errorMessage(upsert.error, t)}</p>
      )}
      <ul className={clsx('mt-3 divide-y divide-fog', isDormant && 'opacity-60')}>
        {shares.data?.map((share) => (
          <li key={share.user.id} className="flex items-center gap-3 py-2.5">
            <Avatar username={share.user.username} displayName={share.user.displayName} size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{share.user.displayName}</p>
              <p className="truncate text-xs text-slate">@{share.user.username}</p>
            </div>
            <DownloadToggle
              label={`${share.user.username} 다운로드 허용`}
              checked={share.allowDownload}
              disabled={share.role === 'editor'}
              onChange={(allowDownload) =>
                upsert.mutate({ username: share.user.username, role: share.role, allowDownload })
              }
            />
            <RoleSelect
              label={`${share.user.username} 권한`}
              value={share.role}
              onChange={(role) =>
                upsert.mutate({
                  username: share.user.username,
                  role,
                  allowDownload: share.allowDownload,
                })
              }
            />
            <button
              type="button"
              onClick={() => remove.mutate(share.user.username)}
              className="grid size-8 place-items-center rounded-md text-slate hover:bg-danger-soft hover:text-danger"
              aria-label={`${share.user.username} 빼기`}
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      onClick={() =>
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? '복사했어요' : '링크 복사'}
    </Button>
  );
}

function linkStatus(link: ShareLink): { label: string; tone: 'neutral' | 'danger' } | null {
  if (link.revokedAt) return { label: '취소됨', tone: 'danger' };
  if (link.expiresAt && new Date(link.expiresAt) <= new Date())
    return { label: '만료됨', tone: 'danger' };
  if (link.expiresAt) return { label: `${formatRelative(link.expiresAt)} 만료`, tone: 'neutral' };
  return null;
}

function Links({ model }: { model: ModelDetail }) {
  const queryClient = useQueryClient();
  const links = useQuery({
    queryKey: sharingKeys.links(model.id),
    queryFn: () => listLinks(model.id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: sharingKeys.links(model.id) });
  const [role, setRole] = useState<GrantableRole>('viewer');
  const [expiryDays, setExpiryDays] = useState<number | null>(7);
  const [allowDownload, setAllowDownload] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      createLink(model.id, {
        role,
        allowDownload,
        expiresAt: expiryDays
          ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
          : null,
        label: null,
      }),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (input: { linkId: string; role?: GrantableRole; allowDownload?: boolean }) =>
      updateLink(model.id, input.linkId, { role: input.role, allowDownload: input.allowDownload }),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (linkId: string) => revokeLink(model.id, linkId),
    onSuccess: refresh,
  });
  const linksWork = model.visibility === 'link' || model.visibility === 'public';
  const active = links.data?.filter((link) => !link.revokedAt) ?? [];
  return (
    <section>
      <SectionTitle
        hint={
          linksWork
            ? '로그인 안 한 사람은 링크 권한과 상관없이 보기만 할 수 있어요.'
            : '공개 범위가 "링크가 있는 사람" 이상일 때만 링크가 작동해요.'
        }
      >
        공유 링크
      </SectionTitle>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-fog p-3">
        <RoleSelect label="새 링크 권한" value={role} onChange={setRole} />
        <select
          aria-label="새 링크 만료"
          value={expiryDays ?? ''}
          onChange={(event) =>
            setExpiryDays(event.target.value ? Number(event.target.value) : null)
          }
          className="h-8 rounded-lg border border-fog bg-surface px-2 text-xs hover:border-lilac focus:border-primary focus:outline-none"
        >
          {EXPIRY_OPTIONS.map((option) => (
            <option key={option.label} value={option.days ?? ''}>
              {option.label}
            </option>
          ))}
        </select>
        <DownloadToggle
          label="새 링크 다운로드 허용"
          checked={allowDownload}
          onChange={setAllowDownload}
        />
        <Button
          size="sm"
          className="ml-auto"
          icon={<Link2 className="size-3.5" />}
          isLoading={create.isPending}
          onClick={() => create.mutate()}
        >
          링크 만들기
        </Button>
      </div>
      <ul className={clsx('mt-3 grid gap-2', !linksWork && 'opacity-60')}>
        {active.map((link) => {
          const status = linkStatus(link);
          return (
            <li key={link.id} className="rounded-xl border border-fog p-3">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-paper px-2 py-1 font-mono text-[11px] text-slate">
                  {link.url}
                </code>
                <CopyLink url={link.url} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <RoleSelect
                  label="링크 권한"
                  value={link.role}
                  onChange={(nextRole) => update.mutate({ linkId: link.id, role: nextRole })}
                />
                <DownloadToggle
                  label="링크 다운로드 허용"
                  checked={link.allowDownload}
                  onChange={(value) => update.mutate({ linkId: link.id, allowDownload: value })}
                />
                {status && <Badge tone={status.tone}>{status.label}</Badge>}
                <span className="text-xs text-slate">방문 {link.visitorCount}명</span>
                <button
                  type="button"
                  onClick={() => revoke.mutate(link.id)}
                  className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" /> 링크 취소
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ShareDialog({
  model,
  open,
  onOpenChange,
}: {
  model: ModelDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`"${model.name}" 공유`}
      description={`편집 권한이 있는 사람은 내용을 고칠 수 있지만, 누가 볼 수 있는지는 소유자만 정해요. ${ROLE_LABELS.viewer} 권한은 보기만 할 수 있어요.`}
      size="lg"
    >
      <div className="mt-6 grid gap-8">
        <GeneralAccess model={model} />
        <People model={model} />
        <Links model={model} />
      </div>
    </Dialog>
  );
}
