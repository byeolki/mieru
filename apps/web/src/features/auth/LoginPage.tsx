import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { PasswordField, TextField } from '../../design/ui/TextField.js';
import { safeNextPath } from '../../lib/safe-next.js';
import { logInRequest } from './api.js';
import { AuthLayout } from './AuthLayout.js';
import { useFormAction } from './useAuthForm.js';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, isSubmitting, onSubmit } = useFormAction(async () => {
    await logInRequest({ email, password });
    void navigate(safeNextPath(searchParams.get('next')), { replace: true });
  });

  return (
    <AuthLayout>
      <h1 className="font-heading text-xl">{t('auth.loginTitle')}</h1>
      <p className="mt-2 text-sm text-slate">{t('auth.loginLead')}</p>
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" size="lg" isLoading={isSubmitting} className="mt-1 w-full">
          {t('auth.loginAction')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-slate">
        {t('auth.toSignup')}{' '}
        <Link to="/signup" className="font-medium text-primary hover:underline">
          {t('auth.toSignupLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}
