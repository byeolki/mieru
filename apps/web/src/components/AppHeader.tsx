import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Bell,
  LayoutGrid,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router';
import { Sparkle } from '../design/Sparkle.js';
import { ButtonLink } from '../design/ui/Button.js';
import { signOut, useAuth } from '../lib/auth-store.js';
import { getActivity, issueKeys } from '../features/issues/api.js';
import { Avatar } from './Avatar.js';
import { ThemeToggle } from './ThemeToggle.js';

const NAV_LINK = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'rounded-md px-2.5 py-1.5 text-sm transition-colors',
    isActive ? 'text-sumi font-medium' : 'text-slate hover:text-sumi',
  );

export function useUnreadActivity(isSignedIn: boolean): number {
  const activity = useQuery({
    queryKey: issueKeys.activity,
    queryFn: getActivity,
    enabled: isSignedIn,
    refetchInterval: 60_000,
  });
  return activity.data?.unreadCount ?? 0;
}

/** Global model search; `/` focuses it from anywhere, like GitHub. */
export function HeaderSearch({ variant = 'bar' }: { variant?: 'bar' | 'pill' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  // Follow the URL when another control (the explore page search, back/forward) changes it.
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setQuery(urlQuery);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.closest('input, textarea, [contenteditable="true"]');
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  return (
    <form
      role="search"
      className={clsx(
        'group relative w-full',
        variant === 'bar' ? 'hidden max-w-[22rem] md:block' : 'block',
      )}
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        void navigate(trimmed ? `/explore?q=${encodeURIComponent(trimmed)}` : '/explore');
      }}
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate"
        aria-hidden="true"
      />
      <label htmlFor={inputId} className="sr-only">
        모델 검색
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="모델 검색"
        className={clsx(
          'h-9 w-full pr-9 pl-9 text-sm placeholder:text-slate focus:border-primary focus:bg-surface focus:outline-none',
          variant === 'bar'
            ? 'rounded-lg border border-fog bg-paper'
            : 'rounded-full border border-transparent bg-surface shadow-[inset_0_0_0_1px_var(--color-haze-deep)]',
        )}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-fog px-1.5 font-mono text-[11px] text-slate group-focus-within:hidden">
        /
      </kbd>
    </form>
  );
}

function MenuItem({
  icon,
  children,
  onSelect,
}: {
  icon: ReactNode;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none data-highlighted:bg-haze [&>svg]:size-4 [&>svg]:text-slate"
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

export function UserMenu({ align = 'end' }: { align?: 'start' | 'end' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="rounded-full focus-visible:outline-offset-2"
        aria-label="계정 메뉴"
      >
        <Avatar
          username={user.username}
          displayName={user.displayName}
          avatarKey={user.avatarKey}
          size={30}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={8}
          className="z-50 w-60 rounded-xl border border-fog bg-surface p-1.5 shadow-(--shadow-lift)"
        >
          <div className="px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-sm font-semibold">{user.displayName}</p>
            <p className="truncate text-xs text-slate">@{user.username}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-fog" />
          <MenuItem icon={<UserRound />} onSelect={() => void navigate(`/u/${user.username}`)}>
            내 프로필
          </MenuItem>
          <MenuItem icon={<LayoutGrid />} onSelect={() => void navigate('/dashboard')}>
            내 모델
          </MenuItem>
          <MenuItem icon={<Sparkle />} onSelect={() => void navigate('/stars')}>
            내 스타
          </MenuItem>
          <MenuItem icon={<Plus />} onSelect={() => void navigate('/new')}>
            새 모델 올리기
          </MenuItem>
          <MenuItem icon={<Settings />} onSelect={() => void navigate('/settings')}>
            설정
          </MenuItem>
          {user.role === 'admin' && (
            <MenuItem icon={<ShieldCheck />} onSelect={() => void navigate('/admin/reports')}>
              신고 관리
            </MenuItem>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-fog" />
          <MenuItem
            icon={<LogOut />}
            onSelect={() => void signOut().then(() => navigate('/', { replace: true }))}
          >
            로그아웃
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The top bar on every page except the landing: logo, search, primary links and account. */
export function AppHeader() {
  const { status } = useAuth();
  const isSignedIn = status === 'signed-in';
  const unread = useUnreadActivity(isSignedIn);
  return (
    <header className="sticky top-0 z-30 border-b border-fog bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-4 md:px-6">
        <Link to={isSignedIn ? '/dashboard' : '/'} aria-label="mieru" className="shrink-0">
          <img src="/brand/logo.png" alt="" width={660} height={404} className="h-8 w-auto" />
        </Link>
        <HeaderSearch />
        <nav aria-label="주 메뉴" className="flex items-center gap-0.5">
          <NavLink to="/explore" className={NAV_LINK}>
            둘러보기
          </NavLink>
          {isSignedIn && (
            <>
              <NavLink
                to="/dashboard"
                className={(state) => clsx(NAV_LINK(state), 'max-sm:hidden')}
              >
                내 모델
              </NavLink>
              <NavLink to="/stars" className={(state) => clsx(NAV_LINK(state), 'max-sm:hidden')}>
                스타
              </NavLink>
              <NavLink to="/designs" className={(state) => clsx(NAV_LINK(state), 'max-sm:hidden')}>
                설계
              </NavLink>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {isSignedIn ? (
            <>
              <ButtonLink
                to="/new"
                size="sm"
                icon={<Plus className="size-4" />}
                className="max-sm:hidden"
              >
                새 모델
              </ButtonLink>
              <Link
                to="/activity"
                aria-label={unread > 0 ? `활동, 안 읽은 소식 ${String(unread)}개` : '활동'}
                className="relative grid size-9 place-items-center rounded-lg text-slate hover:bg-haze hover:text-sumi"
              >
                <Bell className="size-[18px]" aria-hidden="true" />
                {unread > 0 && (
                  <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-surface" />
                )}
              </Link>
              <UserMenu />
            </>
          ) : (
            status === 'signed-out' && (
              <>
                <Link
                  to="/login"
                  className="rounded-md px-2.5 py-1.5 text-sm text-slate hover:text-sumi"
                >
                  로그인
                </Link>
                <ButtonLink to="/signup" size="sm">
                  시작하기
                </ButtonLink>
              </>
            )
          )}
        </div>
      </div>
    </header>
  );
}
