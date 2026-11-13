import clsx from 'clsx';
import {
  Bell,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  Layers,
  Plus,
  Search,
  Shapes,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Sparkle } from '../design/Sparkle.js';
import { OP_COLORS } from '../design/op-palette.js';
import { useAuth } from '../lib/auth-store.js';
import { modelPathOf } from '../lib/model-path.js';
import { useRecentModels } from '../lib/recent-models.js';
import { AppHeader, HeaderSearch, UserMenu, useUnreadActivity } from './AppHeader.js';

const COLLAPSE_KEY = 'mieru.sidebarCollapsed';

function StarIcon({ className }: { className?: string }) {
  return <Sparkle className={className} />;
}

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon | typeof StarIcon;
  needsAccount: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/explore', label: '둘러보기', Icon: Compass, needsAccount: false },
  { to: '/dashboard', label: '내 모델', Icon: Layers, needsAccount: true },
  { to: '/stars', label: '스타', Icon: StarIcon, needsAccount: true },
  { to: '/activity', label: '알림', Icon: Bell, needsAccount: true },
  { to: '/designs', label: '설계', Icon: Shapes, needsAccount: true },
];

function readCollapsed(): boolean {
  return localStorage.getItem(COLLAPSE_KEY) === 'true';
}

function NavEntry({
  item,
  isCollapsed,
  badge,
}: {
  item: NavItem;
  isCollapsed: boolean;
  badge: number;
}) {
  const { Icon } = item;
  return (
    <NavLink
      to={item.to}
      aria-label={isCollapsed ? item.label : undefined}
      title={isCollapsed ? item.label : undefined}
      className={({ isActive }) =>
        clsx(
          'relative flex items-center rounded-xl text-[0.95rem] transition-colors',
          isCollapsed ? 'size-10 justify-center' : 'gap-2.5 px-3 py-2',
          isActive
            ? 'bg-surface font-semibold text-sumi'
            : 'text-slate hover:bg-surface/60 hover:text-sumi',
        )
      }
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      {!isCollapsed && item.label}
      {badge > 0 &&
        (isCollapsed ? (
          <span
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-paper"
            aria-label={`안 읽은 소식 ${String(badge)}개`}
          />
        ) : (
          <span
            className="tabular ml-auto rounded-full bg-mieru-pink px-1.5 font-display text-[11px] text-on-accent"
            aria-label={`안 읽은 소식 ${String(badge)}개`}
          >
            {badge}
          </span>
        ))}
    </NavLink>
  );
}

function RecentModels() {
  const recent = useRecentModels();
  if (recent.length === 0) return null;
  return (
    <section aria-labelledby="recent-models">
      <h2 id="recent-models" className="px-3 font-heading text-[13px] text-slate">
        최근 본 모델
      </h2>
      <ul className="mt-1.5 grid">
        {recent.map((model) => (
          <li key={model.id}>
            <Link
              to={model.slug ? modelPathOf(model.ownerUsername, model.slug) : `/m/${model.id}`}
              className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13.5px] text-slate hover:bg-surface/60 hover:text-sumi"
              title={`${model.ownerUsername}/${model.name}`}
            >
              <span
                className="size-3.5 shrink-0 rounded-full border-[3px]"
                style={{
                  borderColor: model.family ? OP_COLORS[model.family] : 'var(--color-lilac)',
                }}
                aria-hidden="true"
              />
              <span className="truncate">{model.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sidebar({ isCollapsed, onToggle }: { isCollapsed: boolean; onToggle: () => void }) {
  const { status } = useAuth();
  const isSignedIn = status === 'signed-in';
  const unread = useUnreadActivity(isSignedIn);
  const items = NAV_ITEMS.filter((item) => isSignedIn || !item.needsAccount);
  return (
    <aside
      className={clsx(
        'sticky top-0 hidden h-dvh shrink-0 flex-col md:flex',
        isCollapsed ? 'w-16 items-center gap-3 px-2 py-4' : 'w-[236px] gap-5 px-4 pt-5 pb-4',
      )}
      aria-label="사이드바"
    >
      <Link to={isSignedIn ? '/dashboard' : '/'} aria-label="mieru" className="shrink-0">
        <img
          src="/brand/logo.png"
          alt=""
          width={660}
          height={404}
          className={clsx('h-auto', isCollapsed ? 'w-12' : 'mx-auto w-40')}
        />
      </Link>
      {isCollapsed ? (
        <Link
          to="/explore"
          aria-label="모델 검색"
          title="모델 검색"
          className="grid size-10 place-items-center rounded-xl text-slate hover:bg-surface/60 hover:text-sumi"
        >
          <Search className="size-[18px]" aria-hidden="true" />
        </Link>
      ) : (
        <HeaderSearch variant="pill" />
      )}
      <nav aria-label="주 메뉴" className={clsx('grid', isCollapsed ? 'gap-1.5' : 'gap-0.5')}>
        {items.map((item) => (
          <NavEntry
            key={item.to}
            item={item}
            isCollapsed={isCollapsed}
            badge={item.to === '/activity' ? unread : 0}
          />
        ))}
      </nav>
      {!isCollapsed && isSignedIn && <RecentModels />}
      <div className={clsx('mt-auto grid', isCollapsed ? 'justify-items-center gap-3' : 'gap-3')}>
        {isSignedIn ? (
          <>
            <Link
              to="/new"
              aria-label={isCollapsed ? '새 모델 올리기' : undefined}
              title={isCollapsed ? '새 모델 올리기' : undefined}
              className={clsx(
                'flex items-center justify-center gap-2 rounded-full bg-primary font-semibold text-on-accent transition-colors hover:bg-primary-hover',
                isCollapsed ? 'size-10' : 'h-11 text-sm',
              )}
            >
              <Plus className="size-4" aria-hidden="true" />
              {!isCollapsed && '새 모델 올리기'}
            </Link>
            <div
              className={clsx(
                'flex items-center',
                isCollapsed ? 'flex-col gap-2' : 'justify-between px-1',
              )}
            >
              <UserMenu align="start" />
              <CollapseButton isCollapsed={isCollapsed} onToggle={onToggle} />
            </div>
          </>
        ) : (
          status === 'signed-out' && (
            <div className={clsx('grid gap-2', isCollapsed && 'justify-items-center')}>
              {!isCollapsed && (
                <>
                  <Link
                    to="/signup"
                    className="flex h-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-accent hover:bg-primary-hover"
                  >
                    시작하기
                  </Link>
                  <Link
                    to="/login"
                    className="flex h-10 items-center justify-center rounded-full text-sm text-slate hover:text-sumi"
                  >
                    로그인
                  </Link>
                </>
              )}
              <CollapseButton isCollapsed={isCollapsed} onToggle={onToggle} />
            </div>
          )
        )}
      </div>
    </aside>
  );
}

function CollapseButton({ isCollapsed, onToggle }: { isCollapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
      title={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
      className="grid size-8 place-items-center rounded-lg text-slate hover:bg-surface/60 hover:text-sumi"
    >
      {isCollapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
    </button>
  );
}

interface AppFrameProps {
  children: ReactNode;
  /** Workspace screens (graph, design) start with the slim rail to leave room for the canvas. */
  isWorkspace?: boolean;
  /** The sheet fills the viewport height and lets the page manage its own scrolling. */
  isFullHeight?: boolean;
}

/**
 * The app's frame: a lilac sidebar (236px, or a 64px rail when collapsed) next to a white
 * sheet that holds the page. Small screens get the top bar instead.
 */
export function AppFrame({ children, isWorkspace = false, isFullHeight = false }: AppFrameProps) {
  const [preference, setPreference] = useState(readCollapsed);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  const isCollapsed = isWorkspace ? !workspaceExpanded : preference;
  const toggle = () => {
    if (isWorkspace) {
      setWorkspaceExpanded((current) => !current);
      return;
    }
    const next = !preference;
    localStorage.setItem(COLLAPSE_KEY, String(next));
    setPreference(next);
  };
  return (
    <div className="min-h-dvh bg-paper md:flex">
      <div className="md:hidden">
        <AppHeader />
      </div>
      <Sidebar isCollapsed={isCollapsed} onToggle={toggle} />
      <main
        className={clsx(
          'relative min-w-0 flex-1 bg-surface md:mt-3 md:rounded-tl-(--radius-sheet)',
          isFullHeight
            ? 'flex h-[calc(100dvh-3.5rem)] flex-col md:h-[calc(100dvh-0.75rem)]'
            : 'md:min-h-[calc(100dvh-0.75rem)]',
        )}
      >
        {children}
      </main>
    </div>
  );
}
