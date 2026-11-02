import { Link } from 'react-router';
import { SiteHeader } from '../components/SiteHeader.js';

export function NotFoundPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-24">
        <h1 className="text-xl font-bold">페이지를 찾을 수 없어요</h1>
        <p className="mt-3 text-slate">
          주소가 바뀌었거나, 볼 수 있는 권한이 없는 모델일 수 있어요.
        </p>
        <Link to="/" className="mt-6 inline-block font-medium text-primary hover:underline">
          처음으로 돌아가기
        </Link>
      </main>
    </div>
  );
}

/** Shown when a route throws while rendering, instead of React Router's developer screen. */
export function RouteErrorPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-24">
        <h1 className="text-xl font-bold">화면을 그리다가 문제가 생겼어요</h1>
        <p className="mt-3 text-slate">새로고침해도 계속되면 잠시 뒤에 다시 시도해주세요.</p>
        <Link to="/" className="mt-6 inline-block font-medium text-primary hover:underline">
          처음으로 돌아가기
        </Link>
      </main>
    </div>
  );
}
