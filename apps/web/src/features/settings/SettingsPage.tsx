import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { PASSWORD_MIN_LENGTH, type Me } from '@mieru/shared';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { PasswordField, TextField } from '../../design/ui/TextField.js';
import { useAuth } from '../../lib/auth-store.js';
import { useFormAction } from '../auth/useAuthForm.js';
import { AppShell, PageHeader } from '../shell/AppShell.js';
import {
  changeEmailRequest,
  changePasswordRequest,
  deleteAccountRequest,
  listSessionsRequest,
  logoutAllRequest,
  revokeSessionRequest,
  updateProfileRequest,
} from './api.js';

function Panel({
  title,
  children,
  tone = 'default',
}: {
  title: string;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <section
      className={
        tone === 'danger'
          ? 'rounded-(--radius-panel) border border-danger/25 bg-surface p-6'
          : 'rounded-(--radius-panel) border border-fog bg-surface p-6 shadow-(--shadow-soft)'
      }
    >
      <h2 className={tone === 'danger' ? 'font-semibold text-danger' : 'font-semibold'}>{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
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
          placeholder={user.email}
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
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: listSessionsRequest });
  const revoke = useMutation({
    mutationFn: revokeSessionRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const logoutAll = useMutation({
    mutationFn: logoutAllRequest,
    onSuccess: () => navigate('/login', { replace: true }),
  });
  return (
    <div>
      <ul className="divide-y divide-fog rounded-(--radius-control) border border-fog">
        {sessions.data?.map((session) => (
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
      <Button
        variant="secondary"
        className="mt-4"
        isLoading={logoutAll.isPending}
        onClick={() => logoutAll.mutate()}
      >
        {t('settings.logoutAll')}
      </Button>
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
      <PageHeader title={t('settings.title')} />
      <div className="grid max-w-3xl gap-6">
        <Panel title={t('settings.profile')}>
          <ProfileForm user={user} />
        </Panel>
        <Panel title={t('settings.security')}>
          <div className="grid gap-8">
            <PasswordForm />
            <div className="border-t border-fog pt-6">
              <EmailForm user={user} />
            </div>
          </div>
        </Panel>
        <Panel title={t('settings.sessions')}>
          <SessionsList />
        </Panel>
        <Panel title={t('settings.dangerZone')} tone="danger">
          <DeleteAccount user={user} />
        </Panel>
      </div>
    </AppShell>
  );
}
