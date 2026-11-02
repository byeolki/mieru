import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { PASSWORD_MIN_LENGTH, type SessionResponse } from '@mieru/shared';
import { Sparkle } from '../../design/Sparkle.js';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { Dialog } from '../../design/ui/Dialog.js';
import { PasswordField, TextField } from '../../design/ui/TextField.js';
import { applySession } from '../../lib/auth-store.js';
import { signUpRequest } from './api.js';
import { AuthLayout } from './AuthLayout.js';
import { useFormAction } from './useAuthForm.js';

export function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<SessionResponse | null>(null);
  const isPasswordTooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const { error, isSubmitting, onSubmit } = useFormAction(async () => {
    setSession(await signUpRequest({ email, password }));
  });
  // Applying the session flips the "signed in" guard, so it waits until the welcome step ends.
  const finishWelcome = (destination: string) => {
    if (session) applySession(session);
    void navigate(destination, { replace: true });
  };

  return (
    <AuthLayout>
      <h1 className="text-xl font-bold tracking-tight">{t('auth.signupTitle')}</h1>
      <p className="mt-2 text-sm text-slate">{t('auth.signupLead')}</p>
      <form
        className="mt-8 flex flex-col gap-5"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        {error && <Alert>{error}</Alert>}
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordField
          label={t('auth.password')}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          hint={t('auth.passwordHint')}
          error={isPasswordTooShort ? t('auth.passwordHint') : null}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="rounded-(--radius-control) bg-haze px-3.5 py-3 text-xs leading-5 text-slate">
          {t('auth.noRecovery')}
        </p>
        <Button
          type="submit"
          size="lg"
          isLoading={isSubmitting}
          disabled={password.length < PASSWORD_MIN_LENGTH || !email}
          className="w-full"
        >
          {t('auth.signupAction')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-slate">
        {t('auth.toLogin')}{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('auth.toLoginLink')}
        </Link>
      </p>

      <Dialog
        open={session !== null}
        onOpenChange={(open) => {
          if (!open) finishWelcome('/dashboard');
        }}
        title={t('auth.welcomeTitle')}
        decoration={
          <div className="mb-4 flex gap-1.5" aria-hidden="true">
            <Sparkle className="size-6" color="var(--color-mieru-pink)" />
            <Sparkle className="mt-3 size-4" color="#C8B6D4" />
          </div>
        }
        description={
          <Trans
            i18nKey="auth.welcomeBody"
            values={{ username: `@${session?.user.username ?? ''}` }}
            components={{ strong: <strong /> }}
          />
        }
      >
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => finishWelcome('/settings')}>
            {t('auth.welcomeChange')}
          </Button>
          <Button onClick={() => finishWelcome('/dashboard')}>{t('auth.welcomeContinue')}</Button>
        </div>
      </Dialog>
    </AuthLayout>
  );
}
