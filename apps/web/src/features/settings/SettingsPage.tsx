import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { PASSWORD_MIN_LENGTH, type Me } from '@mieru/shared';
import { Avatar } from '../../components/Avatar.js';
import { Alert } from '../../design/ui/Alert.js';
import { errorMessage } from '../../lib/error-message.js';
import { Button } from '../../design/ui/Button.js';
import { PasswordField, TextField } from '../../design/ui/TextField.js';
import { useAuth } from '../../lib/auth-store.js';
import { useFormAction } from '../auth/useAuthForm.js';
import { ConfirmDialog } from '../../design/ui/ConfirmDialog.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { AppShell } from '../shell/AppShell.js';
import {
  changeEmailRequest,
  changePasswordRequest,
  deleteAccountRequest,
  listSessionsRequest,
  logoutAllRequest,
  removeAvatarRequest,
  revokeSessionRequest,
  updateProfileRequest,
  uploadAvatarRequest,
} from './api.js';
import { toAvatarPng } from './avatar-image.js';

function Panel({
  id,
  title,
  description,
  children,
  tone = 'default',
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-24 gap-6 border-b border-fog py-10 first:pt-0 last:border-b-0 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10"
    >
      <div>
        <h2
          id={`${id}-title`}
          className={tone === 'danger' ? 'font-semibold text-danger' : 'font-semibold'}
        >
          {title}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-slate">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const SECTIONS = [
  { id: 'profile', labelKey: 'settings.profile' },
  { id: 'security', labelKey: 'settings.security' },
  { id: 'sessions', labelKey: 'settings.sessions' },
  { id: 'danger', labelKey: 'settings.dangerZone' },
] as const;

function AvatarPicker({ user }: { user: Me }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    setIsBusy(true);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '사진을 바꾸지 못했어요.');
    } finally {
      setIsBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar
        username={user.username}
        displayName={user.displayName}
        avatarKey={user.avatarKey}
        size={72}
      />
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            isLoading={isBusy}
            onClick={() => inputRef.current?.click()}
          >
            사진 바꾸기
          </Button>
          {user.avatarKey && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() => void run(removeAvatarRequest)}
            >
              기본 이미지로
            </Button>
          )}
        </div>
        <p className="text-xs text-slate">정사각형으로 잘려서 256×256으로 저장돼요.</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="프로필 사진 파일"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void run(async () => uploadAvatarRequest(await toAvatarPng(file)));
        }}
      />
    </div>
  );
}

function ProfileForm({ user }: { user: Me }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio ?? '');
  const [saved, setSaved] = useState(false);
  const { error, isSubmitting, onSubmit } = useFormAction(async () => {
    setSaved(false);
    await updateProfileRequest({
      ...(username !== user.username ? { username } : {}),
      displayName,
      bio: bio || null,
    });
    setSaved(true);
  });
  return (
    <form className="grid gap-5" onSubmit={(event) => void onSubmit(event)}>
      <AvatarPicker user={user} />
      {error && <Alert>{error}</Alert>}
      {saved && <Alert tone="success">{t('settings.saved')}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t('settings.username')}
          hint={t('settings.usernameHint')}
          value={username}
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
          autoComplete="username"
          spellCheck={false}
        />
        <TextField
          label={t('settings.displayName')}
          value={displayName}
          maxLength={100}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>
      <TextField
        label={t('settings.bio')}
        value={bio}
        maxLength={300}
        onChange={(event) => setBio(event.target.value)}
      />
      <div>
        <Button type="submit" isLoading={isSubmitting}>
          {t('settings.save')}
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);
  const { error, isSubmitting, onSubmit } = useFormAction(async () => {
    setDone(false);
    await changePasswordRequest(currentPassword, newPassword);
    setCurrentPassword('');
    setNewPassword('');
    setDone(true);
  });
  return (
    <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
      {error && <Alert>{error}</Alert>}
      {done && <Alert tone="success">{t('settings.passwordChanged')}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField
          label={t('settings.currentPassword')}
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
        <PasswordField
          label={t('settings.newPassword')}
          autoComplete="new-password"
          hint={t('auth.passwordHint')}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </div>
      <div>
        <Button
          type="submit"
          variant="secondary"
          isLoading={isSubmitting}
          disabled={!currentPassword || newPassword.length < PASSWORD_MIN_LENGTH}
        >
          {t('settings.changePassword')}
        </Button>
      </div>
    </form>
  );
}

function EmailForm({ user }: { user: Me }) {
  const { t } = useTranslation();
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [done, setDone] = useState(false);
  const { error, isSubmitting, onSubmit } = useFormAction(async () => {
    setDone(false);
    await changeEmailRequest(currentPassword, newEmail);
    setCurrentPassword('');
    setDone(true);
  });
  return (
    <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
      {error && <Alert>{error}</Alert>}
      {done && <Alert tone="success">{t('settings.emailChanged')}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('settings.newEmail')}
          type="email"
          hint={`지금 이메일: ${user.email}`}
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
        />
        <PasswordField
          label={t('settings.currentPassword')}
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </div>
      <div>
        <Button
          type="submit"
          variant="secondary"
          isLoading={isSubmitting}
          disabled={!newEmail || !currentPassword}
        >
          {t('settings.changeEmail')}
        </Button>
      </div>
    </form>
  );
}

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return '알 수 없는 기기';
  const browser = /Firefox/.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome/.test(userAgent)
        ? 'Chrome'
        : /Safari/.test(userAgent)
          ? 'Safari'
          : '브라우저';
  const os = /Mac OS X/.test(userAgent)
    ? 'macOS'
    : /Windows/.test(userAgent)
      ? 'Windows'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' · ');
}

function SessionsList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isConfirmingLogoutAll, setIsConfirmingLogoutAll] = useState(false);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: listSessionsRequest });
  const revoke = useMutation({
    mutationFn: revokeSessionRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const logoutAll = useMutation({
    mutationFn: logoutAllRequest,
    onSuccess: () => navigate('/login', { replace: true }),
  });
  if (sessions.isPending) return <Loading className="py-4 text-lilac" />;
  if (sessions.isError) {
    return (
      <ErrorState
        message="로그인된 기기를 불러오지 못했어요."
        onRetry={() => void sessions.refetch()}
      />
    );
  }
  return (
    <div>
      {revoke.isError && (
        <div className="mb-3">
          <Alert>{errorMessage(revoke.error, t)}</Alert>
        </div>
      )}
      <ul className="divide-y divide-fog rounded-xl border border-fog bg-surface">
        {sessions.data.map((session) => (
          <li key={session.familyId} className="flex items-center gap-3 px-4 py-3">
            <span className="grid size-9 place-items-center rounded-lg bg-haze text-slate">
              <Monitor className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {describeAgent(session.userAgent)}
                {session.current && (
                  <span className="ml-2 rounded-full bg-sakura/70 px-2 py-0.5 text-xs font-medium text-sumi">
                    {t('settings.sessionCurrent')}
                  </span>
                )}
              </p>
              <p className="tabular text-xs text-slate">
                {t('settings.sessionLastUsed')} {dateFormat.format(new Date(session.lastUsedAt))}
                {session.ip ? ` · ${session.ip}` : ''}
              </p>
            </div>
            {!session.current && (
              <Button
                size="sm"
                variant="ghost"
                isLoading={revoke.isPending && revoke.variables === session.familyId}
                onClick={() => revoke.mutate(session.familyId)}
              >
                {t('settings.sessionRevoke')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button variant="secondary" className="mt-4" onClick={() => setIsConfirmingLogoutAll(true)}>
        {t('settings.logoutAll')}
      </Button>
      <ConfirmDialog
        open={isConfirmingLogoutAll}
        onOpenChange={setIsConfirmingLogoutAll}
        title="모든 기기에서 로그아웃할까요?"
        description="이 기기를 포함해 로그인된 모든 곳에서 로그아웃돼요. 다시 쓰려면 로그인해야 해요."
        confirmLabel="모두 로그아웃"
        isPending={logoutAll.isPending}
        error={logoutAll.isError ? errorMessage(logoutAll.error, t) : null}
        onConfirm={() => logoutAll.mutate()}
      />
    </div>
  );
}

function DeleteAccount({ user }: { user: Me }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmUsername, setConfirmUsername] = useState('');
  const { error, isSubmitting, onSubmit } = useFormAction(async () => {
    await deleteAccountRequest(password, confirmUsername);
    void navigate('/', { replace: true });
  });
  return (
    <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
      <p className="text-sm leading-6 text-slate">{t('settings.deleteBody')}</p>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('settings.deleteConfirmLabel', { username: user.username })}
          value={confirmUsername}
          onChange={(event) => setConfirmUsername(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <PasswordField
          label={t('settings.currentPassword')}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div>
        <Button
          type="submit"
          variant="danger"
          isLoading={isSubmitting}
          disabled={confirmUsername !== user.username || !password}
        >
          {t('settings.deleteAction')}
        </Button>
      </div>
    </form>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <AppShell>
      <div className="grid gap-10 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <h1 className="mb-3 font-heading text-xl">{t('settings.title')}</h1>
          <nav aria-label="설정 메뉴">
            <ul className="flex gap-1 overflow-x-auto lg:grid lg:gap-0.5">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-slate hover:bg-haze hover:text-sumi"
                  >
                    {t(section.labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="max-w-4xl">
          <Panel
            id="profile"
            title={t('settings.profile')}
            description="다른 사람에게 보이는 이름과 소개예요. 사용자 이름은 프로필 주소가 돼요."
          >
            <ProfileForm user={user} />
          </Panel>
          <Panel
            id="security"
            title={t('settings.security')}
            description="비밀번호를 바꾸면 다른 기기의 로그인은 모두 풀려요."
          >
            <div className="grid gap-8">
              <PasswordForm />
              <div className="border-t border-fog pt-8">
                <EmailForm user={user} />
              </div>
            </div>
          </Panel>
          <Panel
            id="sessions"
            title={t('settings.sessions')}
            description="지금 로그인돼 있는 기기예요. 모르는 기기가 있으면 로그아웃시키세요."
          >
            <SessionsList />
          </Panel>
          <Panel
            id="danger"
            title={t('settings.dangerZone')}
            description="계정과 올린 모델이 모두 지워지고 되돌릴 수 없어요."
            tone="danger"
          >
            <DeleteAccount user={user} />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
