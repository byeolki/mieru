import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, Compass, LayoutGrid, LogOut, Plus, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router';
import { Avatar } from '../../components/Avatar.js';
import { Sparkle } from '../../design/Sparkle.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { signOut, useAuth } from '../../lib/auth-store.js';
import { getActivity, issueKeys } from '../issues/api.js';

function SparkleIcon({ className }: { className?: string }) {
  return <Sparkle className={className} />;
}

const NAV_ITEMS = [
  { to: '/dashboard', labelKey: 'nav.dashboard', Icon: LayoutGrid },
  { to: '/explore', labelKey: 'nav.explore', Icon: Compass },
  { to: '/stars', labelKey: 'nav.stars', Icon: SparkleIcon },
  { to: '/activity', labelKey: 'nav.activity', Icon: Bell },
] as const;

function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center gap-3 rounded-(--radius-control) p-2 text-left hover:bg-haze/70">
        <Avatar username={user.username} displayName={user.displayName} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{user.displayName}</span>
          <span className="block truncate text-xs text-slate">@{user.username}</span>
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 min-w-[220px] rounded-(--radius-panel) border border-fog bg-surface p-1.5 shadow-(--shadow-lift)"
        >
          <DropdownMenu.Item
            onSelect={() => void navigate('/settings')}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-haze"
          >
            <Settings className="size-4 text-slate" /> {t('nav.settings')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => {
              void signOut().then(() => navigate('/', { replace: true }));
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-haze"
          >
            <LogOut className="size-4 text-slate" /> {t('nav.signOut')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function useUnreadActivity(): number {
  const { status } = useAuth();
  const activity = useQuery({
    queryKey: issueKeys.activity,
    queryFn: getActivity,
    enabled: status === 'signed-in',
    refetchInterval: 60_000,
  });
  return activity.data?.unreadCount ?? 0;
}

function Sidebar() {
  const { t } = useTranslation();
  const unread = useUnreadActivity();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col border-r border-fog bg-paper px-4 py-5 md:flex">
      <Link to="/dashboard" className="px-2" aria-label="mieru">
        <img src="/brand/logo.png" alt="" className="h-11 w-auto" />
      </Link>
      <ButtonLink to="/new" className="mt-6 w-full" icon={<Plus className="size-4" />}>
        {t('nav.newModel')}
      </ButtonLink>
      <nav className="mt-6 flex flex-col gap-0.5" aria-label="주 메뉴">
        {NAV_ITEMS.map(({ to, labelKey, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-(--radius-control) px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-haze text-sumi' : 'text-slate hover:bg-haze/60 hover:text-sumi',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={clsx('size-[18px]', isActive ? 'text-primary' : 'text-slate')} />
                {t(labelKey)}
                {to === '/activity' && unread > 0 && (
                  <span
                    className="tabular ml-auto rounded-full bg-primary px-1.5 text-xs font-semibold text-white"
                    aria-label={`안 읽은 소식 ${unread}개`}
                  >
                    {unread}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-fog pt-3">
        <UserMenu />
      </div>
    </aside>
  );
}

function MobileTopBar() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-fog bg-paper/90 px-4 backdrop-blur md:hidden">
      <Link to="/dashboard" aria-label="mieru">
        <img src="/brand/logo.png" alt="" className="h-9 w-auto" />
      </Link>
      {user && (
        <Link to="/settings" aria-label="설정">
          <Avatar username={user.username} displayName={user.displayName} size={30} />
        </Link>
      )}
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <MobileTopBar />
        <main className="mx-auto w-full max-w-[1120px] px-5 py-8 md:px-10 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      {actions}
    </div>
  );
}
