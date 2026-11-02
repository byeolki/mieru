import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

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
        <Link
          to="/signup"
          className="ml-1 rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover"
        >
          {t('common.signup')}
        </Link>
      </nav>
    </header>
  );
}
