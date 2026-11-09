import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AppFrame } from '../../components/AppFrame.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { useAuth } from '../../lib/auth-store.js';
import { rememberLinkToken } from '../../lib/link-store.js';
import { resolveLink } from './api.js';

/**
 * Opens a share link: resolves the token, keeps it in memory for this tab, and moves to the
 * repository URL so the token doesn't linger in the address bar or history.
 */
export function LinkEntryPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { status } = useAuth();
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    let isCurrent = true;
    resolveLink(token)
      .then((resolved) => {
        if (!isCurrent) return;
        rememberLinkToken(resolved.modelId, token);
        void navigate(`/m/${resolved.modelId}`, { replace: true });
      })
      .catch(() => {
        if (isCurrent) setIsInvalid(true);
      });
    return () => {
      isCurrent = false;
    };
  }, [token, status, navigate]);

  if (!isInvalid) {
    return (
      <div
        className="grid min-h-dvh place-items-center text-lilac"
        role="status"
        aria-label="링크 여는 중"
      >
        <Spinner className="size-6" />
      </div>
    );
  }
  return (
    <AppFrame>
      <div className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <h1 className="font-heading text-xl">이 링크로는 볼 수 없어요</h1>
        <p className="mt-3 text-slate">
          링크가 만료됐거나 취소됐을 수 있어요. 공유한 사람에게 새 링크를 요청해주세요.
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
