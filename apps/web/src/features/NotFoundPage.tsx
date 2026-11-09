import { Link } from 'react-router';
import { AppFrame } from '../components/AppFrame.js';

export function NotFoundPage() {
  return (
    <AppFrame>
      <div className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <h1 className="font-heading text-xl">페이지를 찾을 수 없어요</h1>
        <p className="mt-3 text-slate">
          주소가 바뀌었거나, 볼 수 있는 권한이 없는 모델일 수 있어요.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-accent hover:bg-primary-hover"
        >
          처음으로 돌아가기
        </Link>
      </div>
    </AppFrame>
  );
}

/** Shown when a route throws while rendering, instead of React Router's developer screen. */
export function RouteErrorPage() {
  return (
    <AppFrame>
      <div className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <h1 className="font-heading text-xl">화면을 그리다가 문제가 생겼어요</h1>
        <p className="mt-3 text-slate">새로고침해도 계속되면 잠시 뒤에 다시 시도해주세요.</p>
        <Link
          to="/"
          className="mt-8 inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-accent hover:bg-primary-hover"
        >
          처음으로 돌아가기
        </Link>
      </div>
    </AppFrame>
  );
}
