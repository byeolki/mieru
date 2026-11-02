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
