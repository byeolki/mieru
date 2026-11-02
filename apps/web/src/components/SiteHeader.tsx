import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ButtonLink } from '../design/ui/Button.js';

export function SiteHeader() {
  const { t } = useTranslation();
  return (
    <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
      <Link to="/" className="flex items-center" aria-label={t('common.appName')}>
        <img src="/brand/logo.png" alt="" className="h-11 w-auto" />
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        <Link to="/explore" className="rounded-md px-3 py-2 text-slate hover:text-sumi">
          {t('common.explore')}
        </Link>
        <Link to="/login" className="rounded-md px-3 py-2 text-slate hover:text-sumi">
          {t('common.login')}
        </Link>
        <ButtonLink to="/signup" size="sm" className="ml-1 h-9 px-4">
          {t('common.signup')}
        </ButtonLink>
      </nav>
    </header>
  );
}
